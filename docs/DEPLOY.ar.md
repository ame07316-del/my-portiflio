# نشر الموقع على Vercel مع PostgreSQL

هذا الدليل يضبط اتصال قاعدة البيانات بأمان. ملفات المشروع توثّق Supabase، لكن
وجود المثال لا يثبت أن Vercel يستخدمه فعليًا؛ افحص مزوّد ورابط البيئة من لوحتي
Vercel وقاعدة البيانات، ولا ترسل القيم السرية في الشات.

## 1) انسخ رابط PostgreSQL من المزوّد

1. من لوحة المزوّد افتح المشروع والقاعدة المقصودة، ثم صفحة **Connect / Database
   connection / Connection string** وانسخ **PostgreSQL URI** كاملًا.
2. لو تستخدم Supabase: **Connect → Connection string → URI**. اختر
   **Transaction Pooler** عند النشر على Vercel/serverless (غالبًا port `6543`).
   الاتصال المباشر أو Session Pooler غالبًا port `5432` ومناسب أكثر لسيرفر
   طويل العمر؛ اتبع توثيق مزوّدك.
3. الرابط الذي يخص PostgreSQL يبدأ عادةً بـ `postgresql://` أو `postgres://`،
   ويحتوي host وport وdatabase وcredentials. رابط `https://...supabase.co` هو
   رابط REST/API وليس `DATABASE_URL`.
4. أبقِ إعداد TLS الذي يقدمه المزوّد. لا تضف `sslmode=require` عشوائيًا لحل خطأ
   شهادة؛ الكود يفعّل TLS والتحقق من الشهادة واسم المضيف تلقائيًا للاتصال البعيد.

مثال وهمي للتوضيح فقط:

```text
postgresql://postgres.fakeproject:FAKE_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full
```

لو كلمة المرور فيها رموز خاصة، استخدم URI الذي نسخته أو اعمل URL-encode لها؛ لا
تضعها في screenshots أو Git.

### شهادة CA عند الحاجة فقط

لو مزوّد قاعدة البيانات يطلب CA خاصة أو ظهر خطأ مثل
`self-signed certificate in certificate chain`:

- احصل على **حزمة CA الموثوقة** من لوحة المزوّد الرسمية أو توثيق TLS/SSL الخاص به.
  لا تنسخ شهادة leaf/server من اتصال فاشل، ولا تثق في شهادة عشوائية.
- أضفها في Vercel باسم `DATABASE_SSL_CA` كنص PEM. القيمة تدعم PEM متعدد الأسطر
  أو سطرًا واحدًا فيه `\n` حرفيًا. لا تضع مسار ملف أو مفتاحًا خاصًا.
- `DATABASE_SSL_CA` خاص باتصال قاعدة البيانات فقط؛ لا يغيّر TLS العام في Node.
  يظل `rejectUnauthorized=true` وفحص اسم المضيف مفعّلين. عند تعيين CA مخصصة
  يستخدم Node تلك الحزمة لهذه الوصلة بدل مخزن الجذور الافتراضي، لذلك استخدم
  الحزمة الكاملة التي وثّقها المزوّد.
- `sslmode=no-verify` و`rejectUnauthorized=false` و`NODE_TLS_REJECT_UNAUTHORIZED=0`
  ليست حلولًا. احذف الإعداد الذي يعطّل التحقق؛ إعداد `uselibpqcompat=true` مع
  `require` أو `prefer` أو `verify-ca` يُرفض لأنه قد يقلل التحقق. `sslmode=disable`
  يسمح به الكود فقط لمضيف محلي، لا لقاعدة بعيدة.

---

## 2) أضف المتغيرات في Vercel

افتح **Project → Settings → Environment Variables** وأضف:

| Name | Value | الملاحظات |
|---|---|---|
| `DATABASE_URL` | PostgreSQL URI من خطوة 1 | مطلوب للإنتاج؛ Transaction Pooler على Vercel عند توفره |
| `DATABASE_SSL_CA` | PEM CA من المزوّد | اختياري فقط عند الحاجة لشهادة CA خاصة/غير موجودة في مخزن Node |
| `DATABASE_POOL_MAX` | `1` أو `2` أو `3` | قيمة صغيرة مناسبة لـ serverless |
| `AUTH_SECRET` | سر عشوائي طويل | أنشئه محليًا مثل `openssl rand -base64 32`، ثم أدخله في لوحة Vercel |
| `ADMIN_TOKEN` | رمز قوي تختاره | مفتاح دخول لوحة الإدارة إذا ضبطته؛ لا تضعه في الشات |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | بيانات أول seed | بيانات مستخدم أولية؛ تسجيل الإدارة يعتمد على access token |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.vercel.app` | للروابط والـ metadata |

لكل متغير اختر نطاق النشر المقصود قبل الحفظ:

- **Production** للدومين المنشور.
- **Preview** لمعاينات pull requests/الفروع. افحص أيضًا أي تخصيص لفرع Preview.
- لا تفترض أن `Preview` و`Production` يستخدمان نفس القاعدة. يمكن ربط كل بيئة
  بقاعدة مختلفة.

بعد **Save** أعد نشر deployment المقصود؛ تعديل Environment Variable لا يغيّر
نسخة منشورة مسبقًا. لا ترسل `DATABASE_URL` أو كلمة المرور أو شهادة CA هنا؛ أدخلها
مباشرةً في لوحة Vercel أو قناة الأسرار المتاحة لك.

## 3) انشر الكود

استخدم Pull Request إلى **Production Branch** المضبوط في Vercel (غالبًا `main`)،
ثم انشر commit الإصلاح على البيئة المطلوبة. لا يلزم تغيير Production Branch لمجرد
اختبار الاتصال. افحص من صفحة deployment أنه بنى commit الذي يحتوي الإصلاح وأن
متغيرات البيئة مضافة إلى النطاق نفسه.

> أول طلب ناجح إلى قاعدة جديدة قد ينفّذ migrations وseed ويكتب الجداول والمحتوى
> المبدئي داخل transaction. تشغيل التطبيق على قاعدة الإنتاج **ليس** فحصًا
> read-only. لا تستخدم قاعدة الإنتاج لاختبارات TLS أو rollback.

---

## 4) تحقق بعد النشر — المحتوى، وليس status فقط

بعد إعادة النشر:

1. افتح الدومين العام وتأكد أن محتوى الـ portfolio المحمّل من قاعدة البيانات ظهر
   (الاسم، الدور، الأقسام والمشاريع الفعلية)، وأن شاشة `SetupNotice` لا تعرض
   `Database connection failed` أو `Unclassified error` أو رسالة TLS.
2. HTTP `200` وحده ليس نجاحًا؛ الصفحة قد ترجع `200` وهي تعرض شاشة فشل قاعدة
   البيانات. تحقق من المحتوى الفعلي ومن غياب نصوص الفشل، وراجع Function Logs
   للـ deployment الجديد بحثًا عن أخطاء TLS/قاعدة البيانات.
3. `/admin/login` قد يعرض نموذج الدخول حتى لو قاعدة البيانات متوقفة؛ ظهوره وحده
   لا يثبت الاتصال. `/admin` غير المسجّل يعيد التوجيه لصفحة الدخول. بعد تسجيل
   الدخول، يجب أن تظهر لوحة الإدارة وشاشة Database بحالة اتصال PostgreSQL/SSL.
4. عند فشل TLS، راجع أن `DATABASE_URL` هو رابط PostgreSQL الصحيح، وأن `DATABASE_SSL_CA`
   (إن احتجته) من المصدر الرسمي، وأن الـ host يطابق الشهادة. تحقق من نطاق
   Production/Preview ثم احفظ وأعد نشر نفس البيئة.

`npm run db:check` على جهازك يستعلم قراءة فقط (`SELECT version()` وعدّ الصفوف)،
لكن نجاحه من جهازك لا يثبت أن Vercel يصل إلى نفس القاعدة أو يملك نفس متغيرات
البيئة. لا تشغّل `db:push` أو `db:import` أو `db:copy-local` على قاعدة حقيقية
لمجرد اختبار الاتصال؛ هذه أوامر كتابة. ولا تفتح التطبيق على قاعدة جديدة كاختبار
read-only لأن bootstrap قد ينشئ schema وseed.

قاعدة بيانات جديدة لا تنقل محتوى القاعدة القديمة تلقائيًا. لا تحذف أو تعِد إنشاء
القاعدة القديمة لمعالجة الشهادة؛ احتفظ بها وانقل البيانات فقط بخطة منفصلة ونسخة
احتياطية.

---

## 5) اختبارات محلية قبل النشر

```bash
npm run test:db
npm run test:diagnose
npm run test:db-connection
npm run lint
npx tsc --noEmit
npm run build
```

اختبار `test:db-connection` يستخدم PostgreSQL config مشتركة بين التطبيق والـ CLI،
ويولّد CA وشهادة اختبار مؤقتتين محليًا. يثبت handshake مع CA الموثوقة ورفض سلسلة
غير موثوقة ورفض hostname غير مطابق؛ لا يتصل بقاعدة الإنتاج ولا يثبت حالة
الشهادة المنشورة.
