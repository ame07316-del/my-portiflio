# Sovereign Server — المراحل 2 → 6

الخادم المضاد للهشاشة (Anti-Fragile) المعتمد في قرار **النشر الهجين**:
الواجهة على Vercel، وهذا الخادم على الخادم المستقل (Docker). صفر
اعتماديات وقت تشغيل؛ `@electric-sql/pglite` أداة تطوير فقط (محرك
PostgreSQL حقيقي مدمج للاختبارات — نفس SQL الإنتاج دون تعديل).

```
                    ┌────────── الخادم المستقل (هذا المستودع) ──────────┐
  المتصفح/الواجهة ──► control-plane (HTTP)                                │
  (Vercel)           │  /healthz · /metrics · /transfer · /ops · /seal   │
        │            │      ABAC → validate → OCC ledger → outbox        │
        │ HTTP/ops   │                                                   │
        └───────────►│  PgliteStore ── PostgreSQL (RLS + FORCE)          │
                     │     │            دور غير مميز: sovereign_app      │
  خوادم/خدمات ──────►│  UdpGateway (بوابة C10M)                          │
   (UDP datagrams)   │     magic → token bucket → طابور محدود → معالج   │
                     │  WorkerPool (عزل CPU) · Tracer · HealthProbe      │
                     └───────────────────────────────────────────────────┘
```

## المراحل وتطابقها مع الكود

### المرحلة 2 — C10M Anti-Fragile (النقل والضغط)
| الملف | الآلية | التعقيد |
|---|---|---|
| `transport/udp-gateway.ts` | بوابة UDP بلا مصافحات: `[magic][seq][payload]`؛ القبول سلسلة قرارات O(1): سحر → دلو رموز لكل عميل → طابور محدود؛ الضغط الخلفي ينبثق طبيعيًا من بطء المعالج | لكل حزمة: O(1) + O(payload) |
| `transport/token-bucket.ts` | إعادة تعبئة كسولة (بلا مؤقتات): العميل الخامل يكلف صفر | O(1)/محاولة |
| `transport/bounded-queue.ts` | طابور سعة ثابتة؛ الفائض يُسقط فورًا مع عداد إسقاط | O(1) |
| `transport/worker-pool.ts` + `pool-worker.ts` | عزل الحساب الثقيل عن حلقة الأحداث بسجل أنوية مغلق (بلا eval) وغرفة انتظار محدودة | O(1) تقديم |

> صدق هندسي: النسخة الصفرية من النواة إلى الذاكرة (true kernel
> zero-copy) غير متاحة في JS بلا إضافات أصلية؛ الانضباط المطبق هو صفر
> نسخ **بعد** الاستلام (عروض `subarray` فقط، لا إعادة نسخ ولا سلاسل
> وسيطة على المسار الساخن)، والإسقاط يحمي الذاكرة مهما كان الحمل.

### المرحلة 3 — معاملات حتمية واتساق مطلق
| الملف | الآلية | التعقيد |
|---|---|---|
| `adapters/pglite-store.ts` | Prepared Statements حصريًا؛ نقود BIGINT سنتات؛ معاملة واحدة تجمع التحويل + الـ outbox + الأحداث | O(log n) فهارس |
| (داخله) **OCC** | أعمدة `version`؛ `UPDATE … WHERE version = $`؛ rowCount=0 ⇒ نزاع ⇒ إعادة محاولة | صفر أقفال ممسوكة عبر كود التطبيق |
| (داخله) **Idempotency** | مفتاح فريد `(tenant, idempotency_key)`؛ الإعادة ترجع النتيجة الأصلية `replayed: true` | O(1) فهرس |
| (داخله) **Event Sourcing** | `event_log` بترتيب أحادي `(stream, seq)` فريد؛ الإسناد كاملًا قابل لإعادة البناء | تسلسل: O(log n) |
| `domain/ledger.ts` | سياسة إعادة المحاولة بتراجع أسي + خلخلة حتمية؛ تحقق تجاري قبل أي رحلة | O(محاولات) |
| `domain/outbox-relay.ts` | نمط Outbox: لا حدث بلا تحويل ولا تحويل بلا حدث (معاملة واحدة)؛ تسليم at-least-once والفشل يُبقي الصف معلقًا | O(صفوف) |
| `adapters/lru-read-store.ts` | جانب القراءة CQRS: LRU محدود + stale-while-revalidate + منع Cache Stampede — بلا أي بنية خارجية وفق قرار التخزين المؤقت | O(1) قراءة |

### المرحلة 4 — عقود صارمة وهيكلة سداسية
- `ports/store.ts` هو العقد؛ النطاق (`domain/`) لا يستورد أي محرك —
  القلب معزول عن البوابات بالتبعية المعكوسة حرفيًا.
- `app/container.ts` جذر تركيب واحد: حقن بالبنّاء، لا محدد خدمات ولا
  عموميّات، وإيقاف بترتيب عكسي.
- أمان الذاكرة: الطوابير تُفرغ خاناتها عند الـ pop، الجلسات `WeakMap`
  (`security/sessions.ts`)، متتبع بحلقة محدودة — لا مسارات احتفاظ.

### المرحلة 5 — صفر ثقة
| الملف | الآلية | التعقيد |
|---|---|---|
| `security/envelope.ts` | تشفير مغلف: DEK عشوائي لكل حمولة (AES-256-GCM) مغلف بـ AES-KW تحت المفتاح الرئيس؛ مسح المفاتيح بعد الاستخدام؛ كل المقارنات ثابتة الزمن | O(حمولة) |
| `security/idempotency.ts` | مفاتيح الختم = HMAC-SHA256(secret, tenant∥intent∥digest): حتمية لإعادة المحاولة الآمنة، وأي تحريف يولّد مفتاحًا مختلفًا | O(payload) |
| `security/abac.ts` | محرك ABAC تقريري (بلا كود داخل السياسات): deny-overrides ثم افتراض الرفض | O(قواعد) |
| `adapters/pglite-store.ts` | **RLS + FORCE** ودور غير مميز `sovereign_app`: تجاوز الـ API بلا سياق مستأجر يعيد **صفر صفوف** (مختبر)، والكتابات عبر المستأجرين تُرفض بـ WITH CHECK | داخل المحرك |
| `security/auth.ts` | مصادقة إدارية إلزامية: فحص السر بوقت ثابت (≥ 32 محرفًا)، جلسات 12 ساعة من 32 بايت عشوائية مخزنة كـ SHA-256 فقط وقابلة للإلغاء | O(1) |
| `security/http-guard.ts` | جرادل قبول لكل IP: عام 200/ث (burst 100) وباب دخول 2/دقيقة (burst 5) — ثمانية تخمينات متتالية تضمن 429 | O(1) |
| `adapters/pg-store.ts` | **PostgreSQL حقيقي** (node-postgres) بمفتاح `PG_URL` واحد: نفس المخطط وRLS وOCC وقناة NOTIFY، ويرفض النص الصريح و`no-verify` للمضيف البعيد | رحلة اتصال |

### المرحلة 6 — مراقبة لحظية ونشر ذاتي
| الملف | الآلية | التعقيد |
|---|---|---|
| `obs/tracer.ts` | عينات حتمية بـ fnv1a32 (نفس الأثر موزعًا يبقى كاملًا أو يغيب)؛ غير المُسام يكلّف مقارنة واحدة وصفر تخصيصات؛ حلقة محدودة تسقط الأقدم | O(1)/مدى |
| `obs/health.ts` | زمن حلقة الأحداث بانحراف مؤقت منخفض التردد، كومة الذاكرة، وأعماق الطوابير/العمال عند الطلب فقط؛ إخراج Prometheus | O(مكونات) |
| `obs/realtime.ts` | نواة بث لحظي (SSE): نطاق مستأجرين، إسقاط المستهلك البطيء بعداد، وقناة NOTIFY بين النسخ (`sovereign_events`) | O(مشتركين) |
| `control-plane.ts` | **باب صفر الثقة**: كل مسارات إداري خلف 401، `POST /auth/login` الوحيد المفتوح بخنقته الخاصة (429 `login_rate_limited`)، `GET /events` SSE و`GET /ops/since` للتعويض، وأجسام الطلبات **مقيدة بـ 64KiB قبل أي تحليل** | توجيه O(1) |

## التشغيل

```bash
cd server
npm install
npm run build
npm test             # 42 اختبارًا: محرك مدمج + PostgreSQL حقيقي (PG_URL)،
                     #   عزل RLS بدور غير مميز، ABAC، باب 401 وخنق 429،
                     #   بث SSE، تكامل كامل عبر HTTP + UDP
```

الإقلاع يتطلب **ثلاثة أسرار** (كلها ≥ 32 محرفًا — يرفض الإقلاع بدونها
ويعرض تلميح `openssl rand -base64 48`):
`MASTER_SECRET`، `IDEMPOTENCY_SECRET`، `ADMIN_SECRET` —
و`PG_URL` اختياريًا للمحرك الخارجي (بدونه المحرك المدمج):

```bash
MASTER_SECRET="$(openssl rand -base64 48)" \
IDEMPOTENCY_SECRET="$(openssl rand -base64 48)" \
ADMIN_SECRET="$(openssl rand -base64 48)" \
SEED_DEMO=1 node dist/server/src/control-plane.js
# HTTP :8081 (باب صفر الثقة) + UDP :9443
```

أمثلة حية (دخول مسجَّل أولًا):
```bash
TOKEN=$(curl -s -X POST localhost:8081/auth/login \
     -d "{\"secret\":\"$ADMIN_SECRET\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
curl -s localhost:8081/healthz                                   # مفتوح
curl -s localhost:8081/metrics                                   # مفتوح
curl -s -H "Authorization: Bearer $TOKEN" localhost:8081/account/demo/alice
curl -s -X POST localhost:8081/transfer -H "Authorization: Bearer $TOKEN" \
     -d '{"tenant":"demo","from":"alice","to":"bob","amount":2500}'
curl -s -N -H "Authorization: Bearer $TOKEN" 'localhost:8081/events?tenant=web1'   # SSE
```

عاصفة الحمل (صفر اعتماديات — تحفظ قانون المال 100000):
```bash
ADMIN_SECRET="$ADMIN_SECRET" node scripts/load-test.mjs   # → LOAD TEST PASSED ✅
```

## حدود الصدق (ما يحتاج الخادم الفعلي)
- `PgliteStore` هو محول الاختبار/المحلي؛ الإنتاج يستبدله بمحول
  PostgreSQL حقيقي خلف Pooler — **نفس SQL حرفيًا** (المنفذ `LedgerStore`
  هو العقد). فتحة `ScyllaDB` للقراءات الساخنة جاهزة في منفذ `ReadStore`.
- بروتوكول QUIC الحقيقي يُنهى عند وكيل حافة على الخادم المستقل؛ آليات
  القبول/الطوابير/الإسقاط هنا مستقلة عن النقل بالتصميم.
