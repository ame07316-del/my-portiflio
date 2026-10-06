/**
 * Database failure diagnostics for the public setup page.
 *
 * Goals:
 *  - Turn any thrown connection/bootstrap error into a classified diagnosis
 *    with bilingual (EN + AR) fix steps.
 *  - NEVER expose secrets: passwords, the full connection string, usernames
 *    or raw hostnames are stripped before anything reaches the UI.
 *
 * This module uses only Node built-ins and can be unit-tested in isolation
 * (see scripts/test-diagnose.ts).
 */
import { isIP } from "node:net";

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
  | "tls-certificate"
  | "ssl-config"
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
const IPV6_TOKEN_PATTERN = /\[?[a-f0-9:]{2,}(?:%[a-z0-9_.-]+)?\]?/gi;

function isIpv6Token(token: string) {
  const address = token.startsWith("[") && token.endsWith("]")
    ? token.slice(1, -1)
    : token;
  return isIP(address.split("%")[0]) === 6;
}

function maskIpv6Hosts(input: string): string {
  return input.replace(new RegExp(IPV6_TOKEN_PATTERN.source, "gi"), (token) =>
    isIpv6Token(token) ? "[host]" : token,
  );
}

function hasIpv6Host(input: string): boolean {
  let found = false;
  input.replace(new RegExp(IPV6_TOKEN_PATTERN.source, "gi"), (token) => {
    if (isIpv6Token(token)) found = true;
    return token;
  });
  return found;
}

/**
 * Removes credentials, connection strings, usernames and raw hosts from a
 * driver message so it is safe to show on a public page.
 *
 * Applied defensively (repeatedly) — anything that still looks like a
 * connection string must not survive.
 */
export function sanitizeDbMessage(input: unknown): string {
  let s = typeof input === "string" ? input : String(input ?? "");

  // Hide PEM blocks before normalizing whitespace. This covers certificates,
  // private/public keys and PEM text containing either literal or real newlines.
  s = s.replace(
    /-----BEGIN ([A-Z0-9 ]*(?:CERTIFICATE|PRIVATE KEY|PUBLIC KEY))-----[\s\S]*?-----END \1-----/gi,
    "[certificate data]",
  );

  // Full connection strings: postgresql://user:pass@host:port/db?params
  s = s.replace(/\b(?:postgres|postgresql|postgresqls?):\/\/\S+/gi, "[connection-url]");

  // Bare userinfo blocks and common key/value forms.
  s = s.replace(/\b[\w.-]+:[^\s@"']+@/g, "[credentials]@");
  s = s.replace(/\b(password|passwd|pwd)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]");
  s = s.replace(/\b(username|user|role)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=…");

  // "password authentication failed for user \"x\"" / "role \"x\" does not exist"
  s = s.replace(/\b(for user|user|role)\s+"[^"]*"/gi, '$1 "…"');
  s = s.replace(/\b(for user|user|role)\s+'[^']*'/gi, "$1 '…'");

  // Absolute paths can expose deployment layout or certificate locations.
  s = s.replace(
    /(\b(?:open|read|load|file|path|at)\s+)["']?(?:[a-z]:\\|\/|~\/|\.{1,2}[\\/]|[a-z0-9_.-]+[\\/]|[a-z0-9_.-]+\.(?:pem|crt|cer|key|p12|pfx|conf|cnf)\b)[^"'\s,;)]*["']?/gi,
    "$1[path]",
  );
  s = s.replace(
    /(^|[\s=:'"])(?:[a-z]:\\(?:[^\\\s]+\\)*[^\\\s,;)]*|\/(?:[^/\s]+\/)*[^/\s,;)]*)/gi,
    "$1[path]",
  );

  // IP addresses (may reveal infra) — a following port stays visible.
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[host]");
  s = maskIpv6Hosts(s);

  // Hostnames (including private/non-standard suffixes) — preserve only the
  // generic TLD, except for Supabase's public suffixes used in safe hints.
  s = s.replace(/\b(?:[a-z0-9-]+\.)+[a-z0-9-]+\b/gi, (m) => {
    const hostname = m.toLowerCase();
    const safeSuffix = ["supabase.co", "supabase.com"].find((suffix) =>
      hostname.endsWith(`.${suffix}`),
    );
    return `*.${safeSuffix ?? hostname.split(".").at(-1)}`;
  });

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
    /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(text) ||
    hasIpv6Host(text) ||
    /(?<!\*\.)\b(?:[a-z0-9-]+\.)+[a-z0-9-]+\b/i.test(text) ||
    /-----BEGIN [A-Z0-9 ]*(?:CERTIFICATE|PRIVATE KEY|PUBLIC KEY)-----/i.test(text) ||
    /\b(?:open|read|load|file|path|at)\s+["']?(?:[a-z]:\\|\/|~\/|\.{1,2}[\\/]|[a-z0-9_.-]+[\\/]|[a-z0-9_.-]+\.(?:pem|crt|cer|key|p12|pfx|conf|cnf)\b)/i.test(text)
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
      isLocal: host === "localhost" || host === "127.0.0.1" || host === "[::1]",
    };
  } catch {
    return { port: null, isSupabase: false, isPoolerHost: false, userHasProjectRef: false, isLocal: false };
  }
}

/* ------------------------------------------------------------------ */
/*  Classification                                                     */
/* ------------------------------------------------------------------ */

const TLS_CERTIFICATE_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);
const SAFE_SYSTEM_CODES = new Set([
  "ERR_INVALID_URL",
  "DATABASE_SSL_CONFIG",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  ...TLS_CERTIFICATE_CODES,
]);

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
  {
    code: "ssl-config",
    test: ({ name, message, sysCode }) =>
      name === "PostgresConnectionConfigError" ||
      sysCode === "DATABASE_SSL_CONFIG" ||
      /DATABASE_SSL_CA|NODE_TLS_REJECT_UNAUTHORIZED|sslmode=no-verify|certificate-file options|explicitly disables SSL/i.test(message),
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
    code: "tls-certificate",
    test: ({ sysCode, message }) =>
      TLS_CERTIFICATE_CODES.has(sysCode.toUpperCase()) ||
      /\b(?:SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID)\b/i.test(message) ||
      /(?:self[- ]signed certificate(?: in certificate chain)?|certificate verify failed|unable to verify (?:the )?(?:leaf )?signature|unable to get (?:local )?issuer certificate|certificate has expired|expired certificate|certificate (?:subject )?(?:altname|hostname).{0,40}(?:invalid|mismatch)|(?:altname|hostname).{0,40}(?:certificate )?(?:invalid|mismatch)|(?:hostname|ip).{0,40}(?:does not match|mismatch).{0,40}certificate|certificate.{0,40}altname.{0,40}invalid)/i.test(
        message,
      ),
  },
  {
    code: "ssl",
    test: ({ message, sysCode }) =>
      /^ERR_TLS_/i.test(sysCode) ||
      (/ssl|tls/i.test(message) &&
        /(?:not support|unsupported|required|failed|error|mode|handshake)/i.test(message)),
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
        en: "Open the database provider's official connection page and copy its PostgreSQL URI. For Vercel, choose the provider's Transaction Pooler when available; do not use an HTTPS API URL.",
        ar: "افتح صفحة الاتصال الرسمية عند مزوّد قاعدة البيانات وانسخ رابط PostgreSQL. على Vercel اختار Transaction Pooler لو متاح؛ ما تستخدمش رابط API اللي بيبدأ بـ HTTPS.",
      },
      {
        en: "Add DATABASE_URL in Vercel → Project → Settings → Environment Variables, and select the deployment environment you intend to update.",
        ar: "أضف DATABASE_URL في Vercel ← المشروع ← Settings ← Environment Variables، واختار بيئة النشر المقصودة.",
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
        en: "Example shape only: postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=verify-full (use the provider's actual host and documented options).",
        ar: "شكل توضيحي فقط: postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=verify-full (استخدم الهوست والإعدادات الموثّقة من المزوّد).",
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
    technical: () => "TLS · protocol configuration",
    title: { en: "SSL/TLS configuration mismatch", ar: "إعداد SSL/TLS غير متوافق" },
    summary: {
      en: "The database and client could not agree on the TLS protocol settings. This is different from an untrusted certificate; do not disable verification to work around it.",
      ar: "إعدادات TLS بين الموقع وقاعدة البيانات مش متوافقة. ده مختلف عن شهادة غير موثوقة؛ ما توقفش التحقق من الشهادة كحل بديل.",
    },
    fixes: [
      {
        en: "Copy the PostgreSQL URI and its documented TLS settings from the provider's database connection page; do not use its HTTPS API URL.",
        ar: "انسخ رابط PostgreSQL وإعداد TLS الموثّق من صفحة اتصال قاعدة البيانات عند المزوّد؛ ما تستخدمش رابط API اللي بيبدأ بـ HTTPS.",
      },
      {
        en: "Keep certificate and hostname verification enabled. A TLS protocol mismatch is not fixed by adding sslmode=require blindly.",
        ar: "سيب التحقق من الشهادة واسم الخادم مفعّل. إضافة sslmode=require عشوائيًا مش حل لتعارض بروتوكول TLS.",
      },
      {
        en: "Check the deployment logs for the provider's TLS requirements, then update the correct Vercel environment and redeploy.",
        ar: "راجع متطلبات TLS عند المزوّد، وبعدها حدّث بيئة Vercel الصحيحة واعمل Redeploy.",
      },
    ],
  },
  "tls-certificate": {
    technical: ({ sysCode }) => {
      const safeCode = sysCode && TLS_CERTIFICATE_CODES.has(sysCode.toUpperCase())
        ? sysCode.toUpperCase()
        : "certificate verification";
      return `TLS · ${safeCode}`;
    },
    title: { en: "Database certificate could not be verified", ar: "تعذّر التحقق من شهادة قاعدة البيانات" },
    summary: {
      en: "TLS is enabled, but the certificate chain or hostname could not be trusted. The app keeps certificate verification on; it will not retry with verification disabled.",
      ar: "تشفير TLS شغال، لكن سلسلة الشهادات أو اسم الخادم ما اتوثقوش. الموقع بيحافظ على التحقق من الشهادة ومش هيعيد الاتصال من غير تحقق.",
    },
    fixes: [
      {
        en: "From the database provider's official dashboard or TLS documentation, obtain the trusted CA bundle. Do not trust a leaf/server certificate copied from a failed connection.",
        ar: "هات حزمة CA موثوقة من لوحة المزوّد الرسمية أو توثيق TLS. ما تثقش في شهادة الخادم/الشهادة الطرفية اللي تنسخت من اتصال فاشل.",
      },
      {
        en: "Add DATABASE_SSL_CA to the matching Vercel environment as PEM CA certificate text (real newlines or literal \n escapes). Keep rejectUnauthorized verification enabled.",
        ar: "أضف DATABASE_SSL_CA في بيئة Vercel المطابقة كنص شهادة CA بصيغة PEM (أسطر فعلية أو \n مكتوبة حرفيًا). سيب التحقق من الشهادة مفعّل.",
      },
      {
        en: "Check that DATABASE_URL is the provider's PostgreSQL URI and its host matches the certificate. Save the correct Production/Preview scope and redeploy.",
        ar: "اتأكد إن DATABASE_URL رابط PostgreSQL من المزوّد وإن الهوست مطابق للشهادة. اختار Production أو Preview الصح، احفظ، وبعدها اعمل Redeploy.",
      },
    ],
  },
  "ssl-config": {
    technical: () => "TLS · invalid database SSL configuration",
    title: { en: "Database SSL settings need attention", ar: "إعدادات SSL لقاعدة البيانات محتاجة مراجعة" },
    summary: {
      en: "The configured PostgreSQL SSL options are invalid or conflict. No insecure fallback was attempted.",
      ar: "خيارات SSL المضافة لرابط PostgreSQL غير صالحة أو متعارضة. ما حصلش أي تحويل تلقائي لاتصال غير آمن.",
    },
    fixes: [
      {
        en: "Remove NODE_TLS_REJECT_UNAUTHORIZED=0, sslmode=no-verify, remote ssl=false/sslmode=disable, or uselibpqcompat=true combined with require/prefer/verify-ca. Use verified TLS (prefer verify-full) instead.",
        ar: "احذف NODE_TLS_REJECT_UNAUTHORIZED=0 وsslmode=no-verify وتعطيل SSL لقاعدة بعيدة وuselibpqcompat=true مع require/prefer/verify-ca. استخدم TLS موثوقًا، ويفضل verify-full.",
      },
      {
        en: "If the provider requires a private CA, add its official PEM CA bundle using DATABASE_SSL_CA; do not put certificate paths or private keys in DATABASE_URL.",
        ar: "لو المزوّد محتاج CA خاصة، أضف حزمة PEM الرسمية في DATABASE_SSL_CA؛ ما تحطش مسارات ملفات أو مفاتيح خاصة داخل DATABASE_URL.",
      },
      {
        en: "If you intentionally use local PostgreSQL without TLS, keep the host local and set sslmode=disable explicitly. Redeploy after changing Vercel variables.",
        ar: "لو قاصد تشغّل PostgreSQL محلي من غير TLS، خلي الهوست محلي واكتب sslmode=disable صراحةً. بعد تعديل متغيرات Vercel اعمل Redeploy.",
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
      { en: "Keep the provider's documented verified TLS mode; never use sslmode=no-verify as a workaround.", ar: "التزم بوضع TLS الموثّق واللي بيتحقق من الشهادة؛ ما تستخدمش sslmode=no-verify كحل بديل." },
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
        en: "Compare DATABASE_URL in Vercel with the provider's PostgreSQL URI (host, pooler/direct port, and documented TLS settings). Do not replace a PostgreSQL URI with an HTTPS API URL.",
        ar: "قارن DATABASE_URL في Vercel برابط PostgreSQL من المزوّد (الهوست، بورت البولر/المباشر، وإعداد TLS الموثّق). ما تستبدلش رابط PostgreSQL برابط API يبدأ بـ HTTPS.",
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

type ErrorFacts = {
  name: string;
  message: string;
  pgCode: string;
  sysCode: string;
};

const MAX_CAUSE_DEPTH = 8;

/** Read a bounded cause chain without serializing Error objects or stack traces. */
function extractErrorChain(error: unknown): ErrorFacts[] {
  const parts: ErrorFacts[] = [];
  const seen = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth++) {
    if (typeof current === "string") {
      parts.push({ name: "", message: current, pgCode: "", sysCode: "" });
      break;
    }
    if ((typeof current !== "object" && typeof current !== "function") || current === null) {
      break;
    }

    const object = current as Record<string, unknown>;
    if (seen.has(object)) break;
    seen.add(object);

    let name = "";
    let message = "";
    let rawCode = "";
    let cause: unknown;
    try {
      name = typeof object.name === "string" ? object.name : "";
      message = typeof object.message === "string" ? object.message : "";
      rawCode =
        typeof object.code === "string"
          ? object.code
          : typeof object.errno === "string"
            ? object.errno
            : "";
      cause = object.cause;
    } catch {
      // Hostile/custom getters do not prevent a safe generic diagnosis.
    }

    const pgCode = /^[0-9A-Z]{5}$/.test(rawCode) ? rawCode : "";
    const sysCode = rawCode && !pgCode ? rawCode : "";
    parts.push({ name, message, pgCode, sysCode });
    current = cause;
  }

  return parts.length
    ? parts
    : [{ name: "", message: "", pgCode: "", sysCode: "" }];
}

/** Extra fixes derived from the (never displayed) DATABASE_URL shape. */
function urlShapeFixes(shape: UrlShape | null, code: DbIssueCode): DiagnosisFix[] {
  if (
    !shape ||
    shape.isLocal ||
    code === "missing-url" ||
    code === "malformed-url" ||
    code === "tls-certificate" ||
    code === "ssl" ||
    code === "ssl-config"
  ) {
    return [];
  }

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

  return fixes;
}

/**
 * Classify a database failure into a safe, bilingual diagnosis.
 * Never throws and never returns secrets. Cause traversal is bounded and cycle-safe.
 */
export function diagnoseDbError(error: unknown, databaseUrl?: string): DbDiagnosis {
  const parts = extractErrorChain(error);
  let matchedRule: Rule | undefined;
  let matchedPart: ErrorFacts | undefined;

  for (const rule of RULES) {
    for (const part of parts) {
      if (rule.test(part)) {
        matchedRule = rule;
        matchedPart = part;
        break;
      }
    }
    if (matchedRule) break;
  }

  const code = matchedRule?.code ?? "unknown";
  const displayPart =
    matchedPart ??
    parts.find((part) => part.message || part.sysCode || part.pgCode || part.name) ??
    parts[0];
  const raw =
    displayPart.message ||
    displayPart.sysCode ||
    displayPart.pgCode ||
    displayPart.name ||
    (error == null ? "" : "unknown error");

  const content = CONTENT[code] ?? CONTENT.unknown;
  const detail = sanitizeDbMessage(raw);
  const url =
    databaseUrl ?? (typeof process !== "undefined" ? process.env?.DATABASE_URL : undefined);
  const shape = readUrlShape(url);
  const fixes = [...content.fixes, ...urlShapeFixes(shape, code)];

  const safeSystemCode = SAFE_SYSTEM_CODES.has(displayPart.sysCode.toUpperCase())
    ? displayPart.sysCode.toUpperCase()
    : "";

  return {
    code,
    technical: content.technical({
      pgCode: displayPart.pgCode,
      sysCode: safeSystemCode,
    }),
    title: content.title,
    summary: content.summary,
    fixes,
    detail,
  };
}
