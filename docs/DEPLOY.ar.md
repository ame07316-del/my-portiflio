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
| `NOTIFY_WEBHOOK_URL` | رابط webhook (اختياري) | تنبيه فوري عند وصول رسالة جديدة |
| `RESEND_API_KEY` + `RESEND_FROM` + `NOTIFY_EMAIL` | بيانات Resend (اختياري) | إرسال الرسالة على إيميلك |

4. **Deploy**.

> الجداول والمحتوى المبدئي بيتعملوا **تلقائيًا** أول ما حد يفتح الموقع.
> لو `DATABASE_URL` ناقصة هتظهر صفحة واضحة بتقولك تضيفها بدل ما الموقع يقع.

## 3) الفرع (Branch)

**Vercel بيرفع الفرع الأساسي (`main`) افتراضيًا.** فالأسهل إنك تفتح Pull Request من
فرع الشغل وتعمله Merge على `main` — الـ CI هيشتغل أول ما ترفع (`.github/workflows/ci.yml`:
lint + typecheck + build)، ولو أخضر ادمج والديبلوي هيتم تلقائيًا.

بديل وقت الشغل: من **Settings → Git → Production Branch** اختر فرعك الحالي،
أو ارفع **Preview Deployment** من الـ Pull Request نفسه وتجرّبه قبل الدمج.

> لو الديبلوي القديم بيرجع `404 DEPLOYMENT_NOT_FOUND` (زي `my-portiflio-delta.vercel.app`)
> يبقى المشروع اتحذف أو اتوقف على Vercel — اعمل Import من جديد من
> <https://vercel.com/new> بدل ما تحاول تعمل Redeploy لحاجة مش موجودة.

## 4) بعد أول ديبلوي

1. افتح `https://your-app.vercel.app/admin` — الدخول **بالتوكن فقط** (`ADMIN_TOKEN`)،
   مش بالإيميل والباسورد. لو ما حطّيتش `ADMIN_TOKEN`، الموقع بيولّد توكن عشوائي
   ويطبعه في اللوجز: **Deployments → أول Request → Logs** (دوّر على
   `Fresh admin token generated`).
2. ادخل **Admin → Database** واتأكد إنها بتقول:
   `PostgreSQL — connected · SSL`
3. غيّر التوكن من **Admin → Access token** لو مشيت على التوكن اللي في اللوجز.
4. املأ المحتوى الحقيقي من **Admin → Settings** (الاسم، الإيميل، LinkedIn/X،
   صورة البروفايل) و**Admin → Projects** (الصور واللينكات).

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
