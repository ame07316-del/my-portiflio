# ربط الموقع بقاعدة بيانات Supabase

الموقع بيشتغل على PostgreSQL. محليًا في قاعدة بيانات مدمجة (PGlite) بتتعمل لوحدها،
وفي الإنتاج بتوصّل Supabase عن طريق متغيّر واحد اسمه `DATABASE_URL`.
**نفس الـ SQL بيشتغل في الحالتين** — مفيش أي تغيير في الكود.

---

## 1) اعمل مشروع على Supabase

1. ادخل <https://supabase.com> واعمل حساب (مجاني).
2. **New project** → اختار اسم، وحدّد **Database password** قوية واحفظها.
3. اختار أقرب Region (مثلاً `Frankfurt (eu-central-1)` قريبة من مصر).
4. استنى دقيقة لحد ما المشروع يجهز.

## 2) هات الـ Connection String

من داخل المشروع اضغط زرار **Connect** (فوق) → تبويب **Connection string** → **URI**:

| الاستخدام | النوع | البورت |
|---|---|---|
| Vercel / أي استضافة serverless | **Transaction pooler** | `6543` |
| سيرفر عادي أو تشغيل محلي | **Session pooler** أو Direct | `5432` |

الشكل بيبقى كده:

```
postgresql://postgres.xxxxxxxxxxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

- بدّل `PASSWORD` بالباسورد اللي حفظتها (لو فيها رموز خاصة اعملها URL-encode).
- ضيف `?sslmode=require` في الآخر.

## 3) حطّها في المشروع

```bash
cp .env.example .env.local
```

وبعدين في `.env.local`:

```env
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require"
AUTH_SECRET="اكتب هنا نص عشوائي طويل"   # openssl rand -base64 32
ADMIN_EMAIL="ame07316@gmail.com"
ADMIN_PASSWORD="باسورد قوي"
```

## 4) جهّز الجداول وانقل البيانات

```bash
npm run db:check        # يتأكد إن الاتصال شغال ويعرض الجداول
npm run db:push         # ينشئ كل الجداول (آمن تكرّره في أي وقت)
npm run db:copy-local   # ينقل كل المحتوى اللي عدّلته محليًا إلى Supabase
```

`db:copy-local` بينقل: حساب الأدمن، الإعدادات، المشاريع، المهارات، الخدمات،
الخبرات، نقاط الكوكب، والرسايل.

## 5) شغّل وتأكد

```bash
npm run dev
```

افتح **`/admin/database`** — المفروض تلاقي:

```
PostgreSQL — connected
aws-0-eu-central-1.pooler.supabase.com / postgres · SSL
```

## 6) على Vercel

في **Project → Settings → Environment Variables** ضيف:

| المتغيّر | القيمة |
|---|---|
| `DATABASE_URL` | رابط الـ **Transaction pooler** (بورت 6543) + `?sslmode=require` |
| `AUTH_SECRET` | نص عشوائي طويل |
| `ADMIN_TOKEN` | التوكن اللي بيفتح `/admin` — **غيّره**، متسيبش الافتراضي |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | بيانات حساب الأدمن (مش بتُستخدم في الدخول) |
| `NEXT_PUBLIC_SITE_URL` | دومين الموقع |
| `DATABASE_POOL_MAX` | `1` أو `2` (مهم على serverless) |

> ⚠️ من غير `DATABASE_URL` الموقع مش هيشتغل على Vercel، لأن نظام الملفات هناك
> للقراءة فقط فمش هينفع قاعدة بيانات مدمجة.

---

## أوامر مفيدة

| الأمر | بيعمل إيه |
|---|---|
| `npm run db:check` | اختبار الاتصال + عدد صفوف كل جدول |
| `npm run db:push` | إنشاء/تحديث الجداول |
| `npm run db:export -- backup.json` | تصدير كل المحتوى JSON |
| `npm run db:import -- backup.json` | استرجاع من ملف |
| `npm run db:copy-local` | نسخ القاعدة المحلية إلى `DATABASE_URL` |
| `npm run db:serve-local` | تشغيل القاعدة المحلية كسيرفر Postgres حقيقي على 5432 |

ومن غير terminal خالص: **Admin → Database** فيه تحميل نسخة احتياطية، استرجاع ملف،
وتشغيل الـ migrations بضغطة زرار.

> ⚠️ **القاعدة المدمجة (PGlite) بتشتغل من عملية واحدة بس.** وقّف `npm run dev`
> قبل ما تشغّل أي أمر `db:*` على القاعدة المحلية — لو عمليتين فتحوا `.data/pgdata`
> في نفس الوقت، اتصال السيرفر هيقفل وهتلاقي `⨯ Error: Connection closed`،
> والحل إنك تعمل restart لـ `npm run dev`. على الإنتاج (Postgres حقيقي) مفيش المشكلة دي.

---

## مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `ENOTFOUND` أو `ETIMEDOUT` | الهوست غلط، أو الشبكة IPv6 فقط — استخدم الـ **pooler** مش الـ direct connection |
| `password authentication failed` | الباسورد فيها رموز محتاجة URL-encode (`@` → `%40`) |
| `self signed certificate` | تأكد إن `?sslmode=require` موجودة |
| `too many connections` | نزّل `DATABASE_POOL_MAX` لـ `1` واستخدم Transaction pooler |
| `Connection closed` في التطوير | أمر `db:*` اشتغل و`npm run dev` شغّال — اقفله وشغّل الأمر تاني وبعدين ارفع السيرفر |
| صفحة "Connect a database" تظهر في التطوير | السيرفر اتقفل بقوة فساب قفل قديم — وقّف `npm run dev`، احذف `.data/pgdata/postmaster.pid` (أو `.data/pgdata` كلها لو عايز تعيد المحتوى المبدئي)، وشغّل تاني |
