# رفع الموقع على Vercel (مع Supabase)

## 1) جهّز قاعدة البيانات (٣ دقائق)

1. <https://supabase.com> → **New project** → اختار **Frankfurt (eu-central-1)** واحفظ الباسورد.
2. زرار **Connect** فوق → تبويب **Connection string** → **URI**.
3. اختار **Transaction pooler** (بورت `6543`) — دي المناسبة للـ serverless.
4. بدّل `[YOUR-PASSWORD]` بالباسورد، وضيف `?sslmode=require` في الآخر:

```
postgresql://postgres.xxxxxxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
```

## 2) ارفع المشروع على Vercel

1. <https://vercel.com/new> → **Import Git Repository** → اختار `my-portiflio`.
2. Framework: **Next.js** (بيتظبط لوحده) — مفيش أي إعدادات build تتغيّر.
3. **قبل ما تضغط Deploy** افتح **Environment Variables** وحط دول:

| Name | Value | ملاحظات |
|---|---|---|
| `DATABASE_URL` | رابط الـ Transaction pooler | **إجباري** |
| `AUTH_SECRET` | نص عشوائي طويل | `openssl rand -base64 32` |
| `ADMIN_TOKEN` | توكن قوي من اختيارك | **مفتاح الدخول الوحيد للوحة التحكم** — صفحة الدخول مش بتعرضه |
| `ADMIN_EMAIL` | `ame07316@gmail.com` | بيانات حساب الأدمن (مش للدخول) |
| `ADMIN_PASSWORD` | باسورد قوي | بيتعمل مرة واحدة عند أول تشغيل |
| `DATABASE_POOL_MAX` | `1` | مهم جدًا على serverless |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` | للـ SEO وصور المشاركة |

4. **Deploy**.

> الجداول والمحتوى المبدئي بيتعملوا **تلقائيًا** أول ما حد يفتح الموقع.
> لو `DATABASE_URL` ناقصة هتظهر صفحة واضحة بتقولك تضيفها بدل ما الموقع يقع.

## 3) الفرع (Branch)

الشغل كله على فرع `arena/01a08136-my-portiflio`. عندك اختيارين:

- **الأسهل:** اعمل Merge للـ Pull Request على `main`، وVercel هيرفع `main`.
- أو من **Settings → Git → Production Branch** غيّرها لـ `arena/01a08136-my-portiflio`.

## 4) بعد أول ديبلوي

1. افتح `https://your-app.vercel.app/admin` وسجّل دخول بالإيميل والباسورد اللي حطيتهم.
2. ادخل **Admin → Database** واتأكد إنها بتقول:
   `PostgreSQL — connected · SSL`
3. غيّر الباسورد من **Admin → Account**.

## 5) لو عايز تنقل شغلك المحلي بدل المحتوى الافتراضي

على جهازك:

```bash
echo 'DATABASE_URL="نفس الرابط بتاع Supabase"' >> .env.local
npm run db:copy-local
```

أو من غير terminal: **Admin → Database → Download backup** محليًا، وبعدين
**Restore** على الموقع المرفوع.

## 6) الدومين

**Settings → Domains** → ضيف دومينك → غيّر `NEXT_PUBLIC_SITE_URL` للدومين الجديد.

---

## نصايح أداء

- خلّي **Region** بتاع Vercel قريب من Supabase (Frankfurt) من
  **Settings → Functions → Region**.
- سيب `DATABASE_POOL_MAX=1` واستخدم الـ Transaction pooler علشان متوصلش لحد
  الاتصالات في الخطة المجانية.

## مشاكل شائعة

| المشكلة | الحل |
|---|---|
| صفحة "Connect a database" | `DATABASE_URL` مش متسجلة أو الديبلوي قديم — ضيفها واعمل Redeploy |
| `password authentication failed` | اعمل URL-encode للرموز في الباسورد (`@` → `%40`) |
| `too many connections` | استخدم Transaction pooler + `DATABASE_POOL_MAX=1` |
| `ETIMEDOUT` | استخدم رابط الـ pooler مش الـ Direct connection |
| الصور مش ظاهرة | ارفع ملفاتك في `public/` أو استخدم روابط كاملة |
