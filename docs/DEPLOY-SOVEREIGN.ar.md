# دليل النشر السيادي (النشر الهجين المعتمد)

الواجهة العامة على **Vercel**، والخدمات الحرجة على **خادمك المستقل**
(أي مضيف يدعم Docker). لا توجد أي خدمة وسيطة أخرى — قرار التخزين
المؤقت بلا بنى خارجية يعني أن كل ما تحتاجه هو وعاءان.

> ### تحديث التقوية (المرحلة 7)
> - **`ADMIN_SECRET` إلزامي** (≥ 32 محرفًا) — بدون يرفض الخادم الإقلاع.
> - **كل المسارات الإدارية خلف 401**: التحويلة الوحيدة المفتوحة هي
>   `POST /auth/login` (بسر ≥ 32) مع جلسات **12 ساعة** مخزنة كـ SHA-256
>   فقط وقابلة للإلغاء، وخنق محاولات الدخول **2/دقيقة** (burst 5) → 429.
> - **بث لحظي**: `GET /events` عبر SSE (تبعي للمستأجر، مع إسقاط البطيء)
>   و`GET /ops/since` للتعويض، وقناة NOTIFY بين النسخ `sovereign_events`.
> - **PostgreSQL خارجي بمفتاح واحد**: متغير `PG_URL` يكفي — المحول
>   `PgStore` بنفس SQL حرفيًا (انظر القسم 3).
> - **الواجهة ثنائية اللغة (EN/AR)**: هجرة محتوى الموقع القديم 1:1
>   (منيو المطعم، منصة الجيم، منصة العقارات) مع زر تبديل وRTL كامل.

---

## 1) الواجهة — `web/` → Vercel

1. في لوحة Vercel: **Add New → Project → Import** مستودع `my-portiflio`.
2. عند سؤال الإعدادات: **Root Directory = `web`** (توجد `vercel.json`
   هناك وتضبط الباقي تلقائيًا):
   - `buildCommand: npm run build` (يجمع WASM ويترجم TypeScript).
   - `outputDirectory: .` (موقع ثابت بلا إطار عمل).
   - الترويسات: **COOP/COEP** مفعّلة على كل المسارات — بدونها لا يعمل
     `SharedArrayBuffer` (حلقة القياس ومنصة الـ bench).
   - `/sw.js` يعاد كتابته إلى `/dist/sw.js` بنطاق جذر كامل مع `no-store`.
3. اربط النطاق وأتمّ النشر. لا توجد متغيرات بيئة إلزامية للواجهة.

**اختبار ما بعد النشر:**
- افتح الصفحة وتحقق أن حالة الواجهة تصل إلى `ready`.
- فعّل منصة الـ WASM bench — يجب أن يظهر `worker compute` في الـ HUD
  (دليل عمل SharedArrayBuffer عبر ترويسات العزل).

**ربط الواجهة بالخادم (اختياري):** عرّف قبل إقلاع العامل:
```html
<script>globalThis.SYNC_URL = "https://sovereign.example.com/ops";</script>
```
فيرحّل كل تعديل تفاؤلي إلى نقطة `/ops` في مستوى التحكم (وإلا يعمل
المحاكي المحلي بزمن استجابة وفشل مُحاكى).

---

## 2) الخادم — `server/` → Docker على الخادم المستقل

من جذر المستودع (سياق البناء يجب أن يشمل `web/` لأن الخادم يترجم
وحدات مشتركة منها):

```bash
docker build -f server/Dockerfile -t sovereign-server .

docker run -d --name sovereign \
  --restart unless-stopped \
  -p 8081:8081 -p 9443:9443/udp \
  -e MASTER_SECRET="$(openssl rand -base64 48)" \
  -e IDEMPOTENCY_SECRET="$(openssl rand -base64 48)" \
  -e ADMIN_SECRET="$(openssl rand -base64 48)" \
  -e HTTP_PORT=8081 -e UDP_PORT=9443 \
  -e DB_DIR=/data/pg \
  -e SEED_DEMO=0 \
  -v sovereign-data:/data \
  sovereign-server
```

| المتغير | المعنى |
|---|---|
| `MASTER_SECRET` | مفتاح التشفير المغلف (≥ 32 محرفًا). **دوّره خارج الكود** |
| `IDEMPOTENCY_SECRET` | سر اشتقاق مفاتيح الختم (≥ 32 محرفًا) |
| `ADMIN_SECRET` | سر باب الدخول الإلزامي (≥ 32 محرفًا) — الجلسات 12 ساعة، الخنق 2/دقيقة |
| `PG_URL` | اختياري: سلسلة اتصال PostgreSQL حقيقي — عند ضبطها يفتح الخادم على `PgStore` بنفس المخطط (انظر القسم 3) |
| `DB_DIR` | مسار بيانات المحرك المدمج — اربطه بمجلد دائم؛ `:memory:` للاختبار (يُتجاهل عند ضبط `PG_URL`) |
| `SEED_DEMO` | `1` يزرع حسابات تجريبية (اطفئه في الإنتاج) |
| `HTTP_PORT` / `UDP_PORT` | منافذ مستوى التحكم وبوابة الحافة |

الصورة تبني على مرحلتين (أدوات البناء لا تصل إلى صورة التشغيل)، تعمل
بمستخدم `node` غير الجذر، وتحمل `HEALTHCHECK` يضرب `/healthz`.

**اختبار ما بعد النشر (دخول مسجَّل أولًا — كل ما عدا healthz/metrics login 401):**
```bash
TOKEN=$(curl -s -X POST https://sovereign.example.com/auth/login \
     -d "{\"secret\":\"$ADMIN_SECRET\"}" | jq -r .token)
curl -s https://sovereign.example.com/healthz          # status: ok (مفتوح)
curl -s https://sovereign.example.com/metrics          # Prometheus (مفتوح)
curl -s -X POST https://sovereign.example.com/transfer \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"tenant":"demo","from":"alice","to":"bob","amount":100}'
```

ضع الخادم خلف وكيل حافة ينهي TLS (وإن شئت QUIC الحقيقي) — آليات
القبول/الطوابير/الإسقاط في البوابة مستقلة عن النقل بالتصميم.

---

## 3) ترقية المحرك إلى PostgreSQL خارجي (جاهز — المرحلة 7)

محول `PgStore` (`server/src/adapters/pg-store.ts`) **جاهز ومختبر**:
ضبط `PG_URL` وحده يكفي — يختاره جذر التركيب تلقائيًا مكان
`PgliteStore` **بنفس المخطط حرفيًا** (جداول، RLS بدور `sovereign_app`،
OCC، outbox، LISTEN/NOTIFY)، ويرفض الاتصال النصي أو
`sslmode=no-verify` لأي مضيف بعيد.

ما عليك سوى منح الدور تطبيقك مرة واحدة في قاعدة البيانات:
```sql
GRANT sovereign_app TO app;
```
والتوصيل الكامل بالتحقق:
```
PG_URL=postgresql://app:****@db.internal:5432/sovereign?sslmode=verify-full
```
قناة `sovereign_events` (NOTIFY بين النسخ) موصولة داخل الخادم — لا عمل
إضافي لتفعيل البث المتقاطع.

فتحة القراءات الساخنة (`ReadStore`) ما زالت تستقبل محول ScyllaDB مكان
`LruReadStore` عندما تتجاوز حركة القراءة سعة الذاكرة.

---

## 4) حافة Caddy — TLS/HTTP3 وخنق الحافة

ملف `deploy/Caddyfile` جاهز: شهادات ACME تلقائية وHTTP/3 (QUIC) على
443، ترويسات COOP/COEP على الواجهة، ونطاق فرعي `api.<domain>`
للخادم مع خنق حافة 300/دقيقة لكل IP (طبقة فوق خنق التطبيق نفسه على
باب الدخول). منفذ UDP 9443 لا يمر عبر Caddy — يُفتح مباشرة في جدار
الحماية (`ufw allow 9443/udp`).

---

## 5) جدول اختبارات ما قبل الإطلاق

| الاختبار | الأمر | المتوقع |
|---|---|---|
| وحدات الويب | `cd web && node --test dist/tests/*.test.js` | **60** ناجحًا |
| وحدات الخادم | `cd server && node --test dist/server/src/tests/*.test.js` | **42** ناجحًا (مع `PG_URL`) |
| PostgreSQL حقيقي | ضبط `PG_URL` قبل اختبار الخادم | يعمل اختبار `pg-store` (لا يُتخطى) |
| عاصفة الحمل | `cd server && node scripts/load-test.mjs` | `LOAD TEST PASSED ✅` وحفظ المال = 100000 |
| التكامل E2E | `cd web && npx playwright test` | 4/4 ناجحًا |

كل ما سبق يعمل تلقائيًا في `.github/workflows/ci.yml`.
