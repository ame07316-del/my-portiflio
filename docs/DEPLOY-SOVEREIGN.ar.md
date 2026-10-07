# دليل النشر السيادي (النشر الهجين المعتمد)

الواجهة العامة على **Vercel**، والخدمات الحرجة على **خادمك المستقل**
(أي مضيف يدعم Docker). لا توجد أي خدمة وسيطة أخرى — قرار التخزين
المؤقت بلا بنى خارجية يعني أن كل ما تحتاجه هو وعاءان.

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
| `DB_DIR` | مسار بيانات المحرك المدمج — اربطه بمجلد دائم؛ `:memory:` للاختبار |
| `SEED_DEMO` | `1` يزرع حسابات تجريبية (اطفئه في الإنتاج) |
| `HTTP_PORT` / `UDP_PORT` | منافذ مستوى التحكم وبوابة الحافة |

الصورة تبني على مرحلتين (أدوات البناء لا تصل إلى صورة التشغيل)، تعمل
بمستخدم `node` غير الجذر، وتحمل `HEALTHCHECK` يضرب `/healthz`.

**اختبار ما بعد النشر:**
```bash
curl -s https://sovereign.example.com/healthz          # status: ok
curl -s https://sovereign.example.com/metrics          # Prometheus
curl -s -X POST https://sovereign.example.com/transfer \
     -d '{"tenant":"demo","from":"alice","to":"bob","amount":100}'
```

ضع الخادم خلف وكيل حافة ينهي TLS (وإن شئت QUIC الحقيقي) — آليات
القبول/الطوابير/الإسقاط في البوابة مستقلة عن النقل بالتصميم.

---

## 3) ترقية المحرك إلى PostgreSQL خارجي / ScyllaDB

عقد المنفذ جاهزان في `server/src/ports/store.ts`:
- استبدل `PgliteStore` بمحول PostgreSQL حقيقي (نفس SQL حرفيًا — راجع
  تعليقات `pglite-store.ts`) وحقنه في `app/container.ts`.
- فتحة القراءات الساخنة (`ReadStore`) تستقبل محول ScyllaDB مكان
  `LruReadStore` عندما تتجاوز حركة القراءة سعة الذاكرة.
