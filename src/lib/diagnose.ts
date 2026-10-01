/**
 * Database failure diagnostics for the public setup page.
 *
 * Goals:
 *  - Turn any thrown connection/bootstrap error into a classified diagnosis
 *    with bilingual (EN + AR) fix steps.
 *  - NEVER expose secrets: passwords, the full connection string, usernames
 *    or raw hostnames are stripped before anything reaches the UI.
 *
 * This module is intentionally dependency-free so it can be unit-tested
 * in isolation (see scripts/test-diagnose.ts).
 */

export type DbIssueCode =
  | "missing-url"
  | "malformed-url"
  | "wrong-password"
  | "auth-failed"
  | "database-missing"
  | "dns"
  | "connection-refused"
  | "timeout"
  | "ssl"
  | "connection-reset"
  | "project-paused"
  | "too-many-connections"
  | "permission"
  | "schema"
  | "unknown";

export type DiagnosisFix = { en: string; ar: string };

export type DbDiagnosis = {
  code: DbIssueCode;
  /** Safe technical identifier, e.g. "Postgres 28P01" or "Network ENOTFOUND". */
  technical: string;
  title: { en: string; ar: string };
  summary: { en: string; ar: string };
  fixes: DiagnosisFix[];
  /** Sanitized driver detail — safe to render, never contains secrets. */
  detail: string;
};

/* ------------------------------------------------------------------ */
/*  Sanitizing                                                         */
/* ------------------------------------------------------------------ */

const MAX_DETAIL = 240;

/**
 * Removes credentials, connection strings, usernames and raw hosts from a
 * driver message so it is safe to show on a public page.
 *
 * Applied defensively (repeatedly) — anything that still looks like a
 * connection string must not survive.
 */
export function sanitizeDbMessage(input: unknown): string {
  let s = typeof input === "string" ? input : String(input ?? "");

  // Full connection strings: postgresql://user:pass@host:port/db?params
  s = s.replace(/\b(?:postgres|postgresql|postgresqls?):\/\/\S+/gi, "[connection-url]");

  // Bare userinfo blocks that may appear outside a recognised scheme.
  s = s.replace(/\b[\w.-]+:[^\s@"']+@/g, "[credentials]@");

  // "password authentication failed for user "x"" / "role "x" does not exist"
  s = s.replace(/\b(for user|user|role)\s+"[^"]*"/gi, '$1 "…"');
  s = s.replace(/\b(for user|user|role)\s+'[^']*'/gi, "$1 '…'");

  // IPv4 addresses (may reveal infra) — the ":port" after them stays visible.
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[host]");

  // Hostnames (Supabase/anything) — keep only a masked shape like *.supabase.com.
  s = s.replace(
    /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|in|dev|app|tech|cloud)\b/gi,
    (m) => `*.${m.split(".").slice(-2).join(".")}`,
  );

  // Strip anything left that smells like a query string with params.
  s = s.replace(/\?\S*sslmode=\S*/gi, "?…");

  s = s.replace(/\s+/g, " ").trim();
  if (s.length > MAX_DETAIL) s = `${s.slice(0, MAX_DETAIL - 1)}…`;
  return s;
}

/** True when the (already sanitized) text still contains something leaky. */
export function looksLeaky(text: string): boolean {
  return (
    /postgres(ql)?:\/\//i.test(text) ||
    /\b[\w.-]+:[^\s@"']+@/.test(text) ||
    /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(text)
  );
}

/* ------------------------------------------------------------------ */
/*  Connection string shape (used for hints only — never rendered raw) */
/* ------------------------------------------------------------------ */

type UrlShape = {
  port: number | null;
  isSupabase: boolean;
  isPoolerHost: boolean;
  userHasProjectRef: boolean;
  sslmode: string | null;
  isLocal: boolean;
};

function readUrlShape(raw: string | undefined): UrlShape | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const port = u.port ? Number(u.port) : 5432;
    const isSupabase = host.includes("supabase");
    const isPoolerHost = host.includes("pooler");
    return {
      port: Number.isFinite(port) ? port : null,
      isSupabase,
      isPoolerHost,
      userHasProjectRef: u.username.includes("."),
      sslmode: u.searchParams.get("sslmode"),
      isLocal: host === "localhost" || host === "127.0.0.1",
    };
  } catch {
    return { port: null, isSupabase: false, isPoolerHost: false, userHasProjectRef: false, sslmode: null, isLocal: false };
  }
}

/* ------------------------------------------------------------------ */
/*  Classification                                                     */
/* ------------------------------------------------------------------ */

type Rule = {
  code: DbIssueCode;
  test: (ctx: { name: string; message: string; pgCode: string; sysCode: string }) => boolean;
};

const RULES: Rule[] = [
  {
    code: "missing-url",
    test: ({ name, message }) =>
      name === "MissingDatabaseUrlError" ||
      /DATABASE_URL is not set/i.test(message) ||
      /DATABASE_URL.*not set|no DATABASE_URL/i.test(message),
  },
  {
    code: "malformed-url",
    test: ({ message, sysCode }) => sysCode === "ERR_INVALID_URL" || /Invalid URL/i.test(message),
  },
  { code: "project-paused", test: ({ message }) => /\b(paused|is paused|suspend(?:ed)?)\b/i.test(message) },
  { code: "wrong-password", test: ({ pgCode }) => pgCode === "28P01" },
  {
    code: "auth-failed",
    test: ({ pgCode, message }) =>
      pgCode === "28000" ||
      pgCode === "28P00" ||
      /no pg_hba\.conf entry/i.test(message) ||
      /authentication failed/i.test(message) ||
      /role .* (?:is not permitted|does not exist)/i.test(message),
  },
  { code: "database-missing", test: ({ pgCode }) => pgCode === "3D000" },
  {
    code: "dns",
    test: ({ sysCode, message }) =>
      sysCode === "ENOTFOUND" || sysCode === "EAI_AGAIN" || /getaddrinfo/i.test(message),
  },
  { code: "connection-refused", test: ({ sysCode, message }) => sysCode === "ECONNREFUSED" || /ECONNREFUSED/i.test(message) },
  {
    code: "timeout",
    test: ({ sysCode, message }) =>
      sysCode === "ETIMEDOUT" ||
      /timeout exceeded when trying to connect/i.test(message) ||
      /connect timeout/i.test(message) ||
      /Connection terminated unexpectedly due to timeout/i.test(message),
  },
  {
    code: "ssl",
    test: ({ message }) =>
      /ssl/i.test(message) &&
      /(?:not support|unsupported|required|failed|error|mode)/i.test(message),
  },
  {
    code: "connection-reset",
    test: ({ sysCode, message }) =>
      sysCode === "ECONNRESET" ||
      sysCode === "EPIPE" ||
      /connection terminated|connection reset|server closed the connection|unexpectedly closed/i.test(
        message,
      ),
  },
  { code: "too-many-connections", test: ({ pgCode, message }) => pgCode === "53300" || /too many connections|remaining connection slots/i.test(message) },
  { code: "permission", test: ({ pgCode, message }) => pgCode === "42501" || /permission denied/i.test(message) },
  {
    code: "schema",
    test: ({ pgCode, message }) =>
      pgCode === "42P01" ||
      pgCode === "42703" ||
      pgCode === "42P10" ||
      /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(message),
  },
];

/* ------------------------------------------------------------------ */
/*  Content (bilingual)                                                */
/* ------------------------------------------------------------------ */

type Content = {
  technical: (codes: { pgCode?: string; sysCode?: string }) => string;
  title: { en: string; ar: string };
  summary: { en: string; ar: string };
  fixes: DiagnosisFix[];
};

const CONTENT: Record<DbIssueCode, Content> = {
  "missing-url": {
    technical: () => "Config · DATABASE_URL missing",
    title: { en: "DATABASE_URL is not set", ar: "متغيّر DATABASE_URL غير موجود" },
    summary: {
      en: "The site is deployed but has no database connection string configured on this deployment.",
      ar: "الموقع اتنشر بس متغيّر الاتصال بقاعدة البيانات مش متضاف في بيئة التشغيل.",
    },
    fixes: [
      {
        en: "Supabase → your project → Connect → Connection string → URI, and choose the Transaction pooler (port 6543).",
        ar: "افتح Supabase ← مشروعك ← Connect ← Connection string ← URI واختار Transaction pooler (بورت 6543).",
      },
      {
        en: "Vercel → Project → Settings → Environment Variables → add DATABASE_URL (with ?sslmode=require), then press Save.",
        ar: "افتح Vercel ← المشروع ← Settings ← Environment Variables ←ضيف DATABASE_URL (مع ?sslmode=require) واضغط Save.",
      },
      {
        en: "Redeploy after saving — environment variables are only picked up by new deployments.",
        ar: "اعمل Redeploy بعد الحفظ — المتغيّرات بتتقرأ في الديبلويمنتات الجديدة بس.",
      },
    ],
  },
  "malformed-url": {
    technical: ({ sysCode }) => `URL ${sysCode || "invalid"}`,
    title: { en: "DATABASE_URL is not a valid URL", ar: "DATABASE_URL غير صالح كرابط" },
    summary: {
      en: "The connection string could not be parsed — it was probably pasted partially or lost its scheme/user while editing.",
      ar: "مقدرناش نقرأ رابط الاتصال — غالباً اتنسخ ناقص أو اتغيّر عليه أثناء التعديل.",
    },
    fixes: [
      {
        en: "Copy the full URI again from Supabase → Connect → Connection string → URI (it must start with postgresql://).",
        ar: "انسخ الـ URI كامل تاني من Supabase ← Connect ← Connection string ← URI (لازم يبدأ بـ postgresql://).",
      },
      {
        en: "Expected shape: postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=require",
        ar: "الشكل الصح: postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=require",
      },
      {
        en: "Replace the whole value in Vercel → Save → Redeploy.",
        ar: "استبدل القيمة كلها في Vercel ← Save ← Redeploy.",
      },
    ],
  },
  "project-paused": {
    technical: () => "Supabase · project paused",
    title: { en: "Supabase project is paused", ar: "مشروع Supabase متوقف (Paused)" },
    summary: {
      en: "The database is reachable but refusing work because the project is suspended — Supabase pauses free projects after inactivity.",
      ar: "قاعدة البيانات موجودة بس رافضة الشغل لأن المشروع متوقف — Supabase بوقّف مشاريع الـ Free بعد فترة عدم نشاط.",
    },
    fixes: [
      {
        en: "Open Supabase Dashboard → select the project → press Restore.",
        ar: "افتح لوحة Supabase ← اختر المشروع ← اضغط Restore.",
      },
      { en: "Wait 1–2 minutes for the project to come back online.", ar: "استنى دقيقة إلى دقيتين لحد ما المشروع يرجع شغال." },
      {
        en: "Retry the site — no code change is needed if the URL was already correct.",
        ar: "جرّب الموقع تاني — مفيش تعديل مطلوب لو الرابط كان مظبوط.",
      },
    ],
  },
  "wrong-password": {
    technical: ({ pgCode }) => `Postgres ${pgCode || "28P01"}`,
    title: { en: "Wrong database password", ar: "باسورد قاعدة البيانات غلط" },
    summary: {
      en: "The server answered but rejected the password. This usually happens after the Supabase database password was reset — the old password saved in Vercel no longer works.",
      ar: "السيرفر ردّ بس رفض الباسورد. ده بيحصل عادة بعدعمل Reset لباسورد الداتابيس في Supabase — الباسورد القديم المحفوظ في Vercel بقى غير صالح.",
    },
    fixes: [
      {
        en: "Supabase → Project Settings → Database → Reset database password, then copy the new password.",
        ar: "Supabase ← Project Settings ← Database ← Reset database password، وانسخ الباسورد الجديد.",
      },
      {
        en: "Vercel → Settings → Environment Variables → update DATABASE_URL with the new password (keep the same host and port 6543) → Save.",
        ar: "Vercel ← Settings ← Environment Variables ← حدّث DATABASE_URL بالباسورد الجديد (سيب نفس الهوست والبورت 6543) ← Save.",
      },
      { en: "Redeploy the project and open the new deployment.", ar: "اعمل Redeploy وافتح الديبلويمنت الجديد." },
    ],
  },
  "auth-failed": {
    technical: ({ pgCode }) => `Postgres ${pgCode || "28000"}`,
    title: { en: "Login rejected by the database", ar: "قاعدة البيانات رفضت تسجيل الدخول" },
    summary: {
      en: "The host answered, but the role/user in DATABASE_URL is not allowed to log in (wrong user, or the host doesn't accept this user).",
      ar: "الهوست ردّ بس اليوزر/الرول اللي في DATABASE_URL مش مسموح له بالدخول (يوزر غلط، أو الهوست مبيستقبلش اليوزر ده).",
    },
    fixes: [
      {
        en: "For the pooler (port 6543) the user must be postgres.PROJECT_REF — copy the URI straight from Supabase → Connect instead of typing it.",
        ar: "يوزر البولر (بورت 6543) لازم يكون postgres.PROJECT_REF — انسخ الـ URI مباشرة من Supabase ← Connect بدل ما تكتبه.",
      },
      {
        en: "If you reset the database password recently, update DATABASE_URL in Vercel with the new credentials → Save → Redeploy.",
        ar: "لو عملت Reset لباسورد الداتابيس قريب، حدّث DATABASE_URL في Vercel ببيانات جديدة ← Save ← Redeploy.",
      },
      {
        en: "Make sure you didn't mix the direct-connection URI (host db.…, port 5432) with the pooler URI (host ….pooler.…, port 6543).",
        ar: "اتأكد إنك مخلطتش بين URI الاتصال المباشر (هوست db.…، بورت 5432) و URI البولر (هوست ….pooler.…، بورت 6543).",
      },
    ],
  },
  "database-missing": {
    technical: ({ pgCode }) => `Postgres ${pgCode || "3D000"}`,
    title: { en: "Database does not exist", ar: "قاعدة البيانات غير موجودة" },
    summary: {
      en: "Authentication worked, but the database name in the URL doesn't exist on this server.",
      ar: "الدخول تمّ بس اسم الداتابيس اللي في الرابط مش موجود على السيرفر ده.",
    },
    fixes: [
      {
        en: "In the copied URI the database name must be `postgres` (Supabase's default).",
        ar: "في الـ URI المنسوخ لازم يكون اسم الداتابيس هو `postgres` (الافتراضي بتاع Supabase).",
      },
      {
        en: "Re-copy the URI from Supabase → Connect and replace DATABASE_URL entirely → Save → Redeploy.",
        ar: "انسخ الـ URI تاني من Supabase ← Connect واستبدل DATABASE_URL بالكامل ← Save ← Redeploy.",
      },
    ],
  },
  dns: {
    technical: ({ sysCode }) => `Network ${sysCode || "ENOTFOUND"}`,
    title: { en: "Database host not found", ar: "مفيش هوست بالاسم ده" },
    summary: {
      en: "DNS could not resolve the hostname inside DATABASE_URL — usually a typo, a wrong project reference, or a truncated copy.",
      ar: "مقدرناش نلاقي الهوست المكتوب في DATABASE_URL — عادة غلط في الكتابة أو مرجع مشروع غلط أو نسخ ناقص.",
    },
    fixes: [
      {
        en: "Supabase → Connect → Connection string → URI and copy the host exactly (pooler host ends with .pooler.supabase.com).",
        ar: "Supabase ← Connect ← Connection string ← URI وانسخ الهوست بالظبط (هوست البولر بينتهي بـ .pooler.supabase.com).",
      },
      {
        en: "If you use port 6543, the host must be the pooler host — and for the pooler the user is postgres.PROJECT_REF.",
        ar: "لو بتستعمل بورت 6543 لازم الهوست يكون هوست البولر — واليوزر بتاع البولر هو postgres.PROJECT_REF.",
      },
      {
        en: "Update DATABASE_URL in Vercel → Save → Redeploy. If it was EAI_AGAIN the DNS hiccup may be temporary — retry.",
        ar: "حدّث DATABASE_URL في Vercel ← Save ← Redeploy. ولو الخطأ EAI_AGAIN فممكن يكون مؤقت — جرّب تاني.",
      },
    ],
  },
  "connection-refused": {
    technical: ({ sysCode }) => `Network ${sysCode || "ECONNREFUSED"}`,
    title: { en: "Connection refused", ar: "الاتصال اترفض" },
    summary: {
      en: "The server actively refused the TCP connection — wrong port, a deleted project, or a service that isn't listening there.",
      ar: "السيرفر رفض الاتصال مباشرة — بورت غلط، أو مشروع اتمسح، أو الخدمة مش شغالة على البورت ده.",
    },
    fixes: [
      {
        en: "Match host and port: pooler host (….pooler.supabase.com) → port 6543; direct host (db.…) → port 5432. On Vercel use the pooler on 6543.",
        ar: "طابق الهوست والبورت: هوست البولر (….pooler.supabase.com) ← بورت 6543؛ هوست مباشر (db.…) ← بورت 5432. على Vercel استخدم البولر على 6543.",
      },
      {
        en: "Confirm the Supabase project still exists (Dashboard → Projects) and wasn't deleted.",
        ar: "اتأكد إن مشروع Supabase لسه موجود (Dashboard ← Projects) ومش اتمسح.",
      },
      { en: "Update DATABASE_URL if needed → Save → Redeploy.", ar: "حدّث DATABASE_URL لو محتاج ← Save ← Redeploy." },
    ],
  },
  timeout: {
    technical: () => "Network · connect timeout",
    title: { en: "Connection timed out", ar: "الاتصال خلص وقته (Timeout)" },
    summary: {
      en: "No answer within 15 seconds. Typical causes: the Supabase project is paused, the wrong port is used, or the host drops packets.",
      ar: "مفيش ردّ خلال ١٥ ثانية. أسباب شائعة: المشروع متوقف (Paused)، أو بورت غلط، أو الهوست بيرمي الباكتات.",
    },
    fixes: [
      {
        en: "Supabase Dashboard → if the project shows Paused, press Restore and wait 1–2 minutes.",
        ar: "لوحة Supabase ← لو المشروع مكتوب عليه Paused اضغط Restore واستنى دقيقة–دقيتين.",
      },
      {
        en: "Verify the port: Vercel/Serverless must use the Transaction pooler on port 6543 (Direct 5432 often times out from serverless).",
        ar: "راجع البورت: Vercel لازم يستخدم Transaction pooler على بورت 6543 (المباشر 5432 غالبًا بيعمل timeout من السيرفرلس).",
      },
      { en: "Save the variable and Redeploy, then retry.", ar: "احفظ المتغيّر واعمل Redeploy وجرب تاني." },
    ],
  },
  ssl: {
    technical: () => "TLS · sslmode",
    title: { en: "SSL/TLS mismatch", ar: "مشكلة في تشفير الاتصال (SSL)" },
    summary: {
      en: "The TLS setting in DATABASE_URL doesn't match what the server expects.",
      ar: "إعداد SSL في DATABASE_URL مش متطابق مع اللي السيرفر متوقعه.",
    },
    fixes: [
      {
        en: "Append ?sslmode=require to DATABASE_URL (Supabase requires it).",
        ar: "ضيف ?sslmode=require لنهاية DATABASE_URL (Supabase محتاجاه).",
      },
      {
        en: "Easiest: re-copy the whole URI from Supabase → Connect → URI → replace in Vercel → Save → Redeploy.",
        ar: "الأسهل: انسخ الـ URI كله من Supabase ← Connect ← URI واستبدله في Vercel ← Save ← Redeploy.",
      },
    ],
  },
  "connection-reset": {
    technical: ({ sysCode }) => `Network ${sysCode || "ECONNRESET"}`,
    title: { en: "Connection dropped", ar: "الاتصال اتقفل فجأة" },
    summary: {
      en: "The TCP connection opened and then the server closed it — common with the direct connection or an idle pooler session.",
      ar: "الاتصال اتفتح وبعدين السيرفر قفله — ده شائع مع الاتصال المباشر أو جلسات البولر الخاملة.",
    },
    fixes: [
      {
        en: "Use the Transaction pooler (host ….pooler.supabase.com, port 6543) from Vercel instead of the direct connection.",
        ar: "استخدم Transaction pooler (هوست ….pooler.supabase.com، بورت 6543) من Vercel بدل الاتصال المباشر.",
      },
      { en: "Keep ?sslmode=require at the end of DATABASE_URL.", ar: "سيب ?sslmode=require في نهاية DATABASE_URL." },
      {
        en: "It can also be transient — Redeploy / retry once, and check status.supabase.com if it persists.",
        ar: "ممكن يكون مؤقت — اعمل Redeploy/جرب تاني، ولو استمر راجع status.supabase.com.",
      },
    ],
  },
  "too-many-connections": {
    technical: ({ pgCode }) => `Postgres ${pgCode || "53300"}`,
    title: { en: "Too many connections", ar: "عدد الاتصالات كبير أوي" },
    summary: {
      en: "The database hit its connection limit — usually too many serverless instances or a direct connection instead of the pooler.",
      ar: "قاعدة البيانات وصلت لحد أقصى للاتصالات — عادة عدد كبير من الـ serverless أو اتصال مباشر بدل البولر.",
    },
    fixes: [
      {
        en: "Make sure DATABASE_URL uses the Transaction pooler (port 6543), which multiplexes many clients into few connections.",
        ar: "اتأكد DATABASE_URL بيستخدم Transaction pooler (بورت 6543) اللي بيجمع عملاء كتير في اتصالات قليلة.",
      },
      {
        en: "Keep DATABASE_POOL_MAX at 3 or less in Vercel environment variables.",
        ar: "سيب DATABASE_POOL_MAX = 3 أو أقل في متغيّرات Vercel.",
      },
      { en: "Close unused DB clients/dashboards connected to this project, then retry.", ar: "قفل أي كلاينتات/أدوات مفتوحة على المشروع وجرب تاني." },
    ],
  },
  permission: {
    technical: ({ pgCode }) => `Postgres ${pgCode || "42501"}`,
    title: { en: "Not enough database permissions", ar: "صلاحيات الداتابيس غير كافية" },
    summary: {
      en: "Login succeeded but the role isn't allowed to read/write the tables — usually the wrong user or a restricted role.",
      ar: "الدخول تمّ بس الرول ممنوع يقرأ/يكتب الجداول — عادة يوزر غلط أو رول مقيّد.",
    },
    fixes: [
      {
        en: "Re-copy the URI from Supabase → Connect so DATABASE_URL uses the right user (postgres.PROJECT_REF for the pooler).",
        ar: "انسخ الـ URI من Supabase ← Connect عشان DATABASE_URL يستخدم اليوزر الصح (postgres.PROJECT_REF للبولر).",
      },
      {
        en: "Never connect with the anon/authenticated API roles — those can't run migrations.",
        ar: "متتصلش بأدوار الـ anon/authenticated بتوع الـ API — دول مش بيقدروا يعملوا مهاجريشن.",
      },
      { en: "If the password changed recently, update it in Vercel → Save → Redeploy.", ar: "لو الباسورد اتغيّر قريب، حدّثه في Vercel ← Save ← Redeploy." },
    ],
  },
  schema: {
    technical: ({ pgCode }) => `Postgres ${pgCode || "42P01"}`,
    title: { en: "Connected, but the schema is incomplete", ar: "الاتصال تمام بس السكيما ناقصة" },
    summary: {
      en: "The database answered, yet a table/column is missing — the first-run migration didn't finish (it normally runs automatically on the first request).",
      ar: "الداتابيس ردّ بس في جدول/عمود ناقص —عملية المهاجريشن الأولانية مش خلصت (بتتم أوتوماتيك في أول طلب عادة).",
    },
    fixes: [
      { en: "Open the site again — bootstrap/migrations are idempotent and re-run on the next request.", ar: "افتح الموقع تاني — المهاجريشن بيرجع يشتغل تلقائي في الطلب الجاي." },
      {
        en: "Check Vercel → Deployments → select latest → Functions logs for the exact SQL error.",
        ar: "راجع سجلات التشغيل: Vercel ← Deployments ← آخر نشر ← Functions logs عشان تشوف خطأ SQL الحقيقي.",
      },
      {
        en: "If it persists, the admin Database screen can show table counts once the connection works.",
        ar: "لو استمر، شاشة Database في لوحة التحكم هتوريك عدد الجداول أول ما الاتصال يشتغل.",
      },
    ],
  },
  unknown: {
    technical: () => "Unclassified error",
    title: { en: "Database connection failed", ar: "فشل الاتصال بقاعدة البيانات" },
    summary: {
      en: "The app couldn't reach the database, but the error didn't match a known pattern. The sanitized technical detail is shown below.",
      ar: "الموقع مقدرش يوصل للداتابيس، بس الخطأ مش مطابق لأي نمط معروف. التفاصيل التقنية المُنقّاة موجودة تحت.",
    },
    fixes: [
      {
        en: "Compare DATABASE_URL in Vercel with the URI from Supabase → Connect (host, port 6543, ?sslmode=require).",
        ar: "قارن DATABASE_URL في Vercel مع الـ URI من Supabase ← Connect (الهوست، بورت 6543، ?sslmode=require).",
      },
      {
        en: "Test the same URL from your machine: set DATABASE_URL locally and run `npm run db:check`.",
        ar: "جرّب نفس الرابط من جهازك: حط DATABASE_URL محليًا وشغّل `npm run db:check`.",
      },
      { en: "Check Vercel → Deployments → Functions logs, then Save → Redeploy after any change.", ar: "راجع سجلات Vercel Functions، وبعد أي تعديل اعمل Save ← Redeploy." },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

function extract(err: unknown): { name: string; message: string; pgCode: string; sysCode: string } {
  if (err instanceof Error) {
    const anyErr = err as Error & { code?: unknown; errno?: unknown };
    const code = typeof anyErr.code === "string" ? anyErr.code : "";
    // SQLSTATE is 5 chars of digits/uppercase letters (e.g. 28P01, 42501).
    const pgCode = /^[0-9A-Z]{5}$/.test(code) ? code : "";
    const sysCode = code && !pgCode ? code : "";
    return { name: err.name ?? "", message: err.message ?? "", pgCode, sysCode };
  }
  if (typeof err === "string") return { name: "", message: err, pgCode: "", sysCode: "" };
  return { name: "", message: "", pgCode: "", sysCode: "" };
}

/** Extra fixes derived from the (never displayed) DATABASE_URL shape. */
function urlShapeFixes(shape: UrlShape | null, code: DbIssueCode): DiagnosisFix[] {
  if (!shape || shape.isLocal) return [];
  const fixes: DiagnosisFix[] = [];

  if (shape.isSupabase && shape.port === 5432 && !shape.isPoolerHost) {
    fixes.push({
      en: "DATABASE_URL currently uses the direct connection (port 5432). From Vercel use the Transaction pooler instead: host ….pooler.supabase.com on port 6543.",
      ar: "DATABASE الحالي بيستخدم الاتصال المباشر (بورت 5432). من Vercel استخدم Transaction pooler: هوست ….pooler.supabase.com على بورت 6543.",
    });
  }

  if (shape.isSupabase && shape.port === 6543 && !shape.userHasProjectRef) {
    fixes.push({
      en: "Port 6543 (transaction pooler) requires the user to be postgres.PROJECT_REF — re-copy the pooler URI from Supabase → Connect.",
      ar: "بورت 6543 (ترانزكشن بولر) محتاج اليوزر يكون postgres.PROJECT_REF — انسخ الـ URI بتاع البولر تاني من Supabase ← Connect.",
    });
  }

  if (!shape.sslmode || shape.sslmode !== "require") {
    fixes.push({
      en: "DATABASE_URL is missing ?sslmode=require — append it before saving.",
      ar: "DATABASE_URL ناقص ?sslmode=require — ضيفه قبل الحفظ.",
    });
  }

  // Avoid flooding the list when the category already explains it.
  if (code === "missing-url" || code === "malformed-url") return [];
  return fixes;
}

/**
 * Classify a database failure into a safe, bilingual diagnosis.
 * Never throws and never returns secrets.
 */
export function diagnoseDbError(error: unknown, databaseUrl?: string): DbDiagnosis {
  const { name, message, pgCode, sysCode } = extract(error);
  const raw = message || name || (error == null ? "" : "unknown error");

  let code: DbIssueCode = "unknown";
  for (const rule of RULES) {
    if (rule.test({ name, message: raw, pgCode, sysCode })) {
      code = rule.code;
      break;
    }
  }

  const content = CONTENT[code] ?? CONTENT.unknown;
  const detail = sanitizeDbMessage(raw);

  const url =
    databaseUrl ?? (typeof process !== "undefined" ? process.env?.DATABASE_URL : undefined);
  const shape = readUrlShape(url);

  const fixes = [...content.fixes, ...urlShapeFixes(shape, code)];

  return {
    code,
    technical: content.technical({ pgCode, sysCode }),
    title: content.title,
    summary: content.summary,
    fixes,
    detail,
  };
}
