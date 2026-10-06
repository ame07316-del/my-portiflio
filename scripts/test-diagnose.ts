/**
 * Unit tests for src/lib/diagnose.ts (+ a render pass over SetupNotice).
 *
 * Run:  npx tsx scripts/test-diagnose.ts
 *
 * Asserts two things for every failure class:
 *   1. the error is classified under the expected code, and
 *   2. no password / connection URL / username / raw host leaks into the
 *      diagnosis that the public setup page renders.
 */
import { diagnoseDbError, sanitizeDbMessage, looksLeaky, type DbIssueCode } from "../src/lib/diagnose";

type Case = {
  label: string;
  error: unknown;
  expect: DbIssueCode;
  /** Extra strings that must NOT appear anywhere in the rendered diagnosis. */
  forbidden?: string[];
  /** Pass a URL to exercise the shape-based hints. */
  url?: string;
  /** Substrings that SHOULD appear (e.g. a port hint). */
  required?: string[];
};

const SECRET = "s3cr3t-PaSsW0rd!123";
const POOLER_URL = `postgresql://postgres.abcdefghijkl:${SECRET}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require`;

function pgError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
function sysError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const CASES: Case[] = [
  {
    label: "missing DATABASE_URL",
    error: Object.assign(
      new Error(
        "DATABASE_URL is not set. Serverless hosting has a read-only filesystem, " +
          "so the embedded database cannot be used in production.",
      ),
      { name: "MissingDatabaseUrlError" },
    ),
    expect: "missing-url",
  },
  {
    label: "malformed DATABASE_URL",
    error: sysError("ERR_INVALID_URL", "Invalid URL"),
    expect: "malformed-url",
  },
  {
    label: "wrong password (28P01) — full leak attempt",
    error: pgError(
      "28P01",
      `password authentication failed for user "postgres.abcdefghijkl" — ` +
        `connection string ${POOLER_URL} from host 3.12.45.67:6543`,
    ),
    expect: "wrong-password",
    forbidden: [SECRET, "postgres.abcdefghijkl", "postgresql://", "3.12.45.67", "aws-0-eu-central-1"],
    required: ['user "…"'],
  },
  {
    label: "auth rejected (28000 / pg_hba)",
    error: pgError(
      "28000",
      'no pg_hba.conf entry for host "3.12.45.67" on port 6543 user "postgres.x" — GSSAPI continuation failed',
    ),
    expect: "auth-failed",
    forbidden: ["3.12.45.67", "postgres.x"],
  },
  {
    label: "database does not exist (3D000)",
    error: pgError("3D000", 'database "postgres" does not exist'),
    expect: "database-missing",
  },
  {
    label: "DNS failure (ENOTFOUND)",
    error: sysError("ENOTFOUND", "getaddrinfo ENOTFOUND db.abcdefghijkl.supabase.co"),
    expect: "dns",
    forbidden: ["db.abcdefghijkl.supabase.co", "abcdefghijkl"],
    required: ["*.supabase.co"],
  },
  {
    label: "connection refused (ECONNREFUSED)",
    error: sysError("ECONNREFUSED", "connect ECONNREFUSED 35.12.34.56:5432"),
    expect: "connection-refused",
    forbidden: ["35.12.34.56"],
    required: ["5432"],
  },
  {
    label: "connect timeout",
    error: new Error("timeout exceeded when trying to connect"),
    expect: "timeout",
  },
  {
    label: "ssl mismatch",
    error: new Error("The server does not support SSL connections"),
    expect: "ssl",
  },
  {
    label: "self-signed certificate message only",
    error: new Error("self-signed certificate in certificate chain"),
    expect: "tls-certificate",
    required: ["TLS · certificate verification", "DATABASE_SSL_CA"],
    forbidden: ["sslmode=require"],
  },
  {
    label: "certificate hostname mismatch message only",
    error: new Error("Hostname/IP does not match certificate's altnames"),
    expect: "tls-certificate",
    required: ["DATABASE_SSL_CA"],
    forbidden: ["sslmode=require"],
  },
  {
    label: "TLS error code embedded in message only",
    error: new Error("TLS handshake failed: UNABLE_TO_GET_ISSUER_CERT_LOCALLY"),
    expect: "tls-certificate",
    required: ["DATABASE_SSL_CA"],
    forbidden: ["sslmode=require"],
  },
  {
    label: "unsafe legacy SSL configuration",
    error: Object.assign(
      new Error("NODE_TLS_REJECT_UNAUTHORIZED=0 is unsupported; DATABASE_URL uses sslmode=no-verify"),
      { name: "PostgresConnectionConfigError", code: "DATABASE_SSL_CONFIG" },
    ),
    expect: "ssl-config",
    required: ["uselibpqcompat=true", "verify-full"],
    forbidden: ["sslmode=require"],
  },
  ...[
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ].map((tlsCode) => ({
    label: `TLS certificate code only: ${tlsCode}`,
    error: Object.assign(new Error(""), { code: tlsCode }),
    expect: "tls-certificate" as const,
    required: [tlsCode, "DATABASE_SSL_CA"],
    forbidden: ["sslmode=require"],
  })),
  {
    label: "nested TLS cause and sensitive certificate/path details",
    error: Object.assign(
      new Error("database connection failed"),
      {
        cause: Object.assign(
          new Error(
            `self-signed certificate in certificate chain; ` +
              `user "postgres.abcdefghijkl" password=${SECRET} ${POOLER_URL} ` +
              `open '/vercel/private/db-ca.pem' -----BEGIN CERTIFICATE-----\\nCA_PRIVATE_CONTENT\\n-----END CERTIFICATE-----`,
          ),
          { code: "SELF_SIGNED_CERT_IN_CHAIN" },
        ),
      },
    ),
    expect: "tls-certificate",
    forbidden: [SECRET, "postgres.abcdefghijkl", "postgresql://", "CA_PRIVATE_CONTENT", "/vercel/private", "-----BEGIN CERTIFICATE-----", "sslmode=require"],
    required: ["TLS · SELF_SIGNED_CERT_IN_CHAIN", "DATABASE_SSL_CA"],
  },
  {
    label: "connection reset",
    error: sysError("ECONNRESET", "read ECONNRESET — connection terminated unexpectedly"),
    expect: "connection-reset",
  },
  {
    label: "supabase project paused",
    error: new Error("Please restore the project: database is paused"),
    expect: "project-paused",
  },
  {
    label: "too many connections (53300)",
    error: pgError("53300", "too many connections already"),
    expect: "too-many-connections",
  },
  {
    label: "permission denied (42501)",
    error: pgError("42501", 'permission denied for table users'),
    expect: "permission",
  },
  {
    label: "missing table after bootstrap (42P01)",
    error: pgError("42P01", 'relation "users" does not exist'),
    expect: "schema",
  },
  {
    label: "unclassified error",
    error: new Error("something exploded in a brand new way"),
    expect: "unknown",
  },
  {
    label: "untrusted error code cannot leak a URL or credential",
    error: Object.assign(new Error("socket failure"), {
      code: `postgresql://user:${SECRET}@db.private.internal:5432/postgres`,
    }),
    expect: "unknown",
    forbidden: [SECRET, "postgresql://", "db.private.internal"],
  },
  {
    label: "direct connection URL shape → 6543 hint",
    error: pgError("28P01", 'password authentication failed for user "postgres.abcdefghijkl"'),
    expect: "wrong-password",
    url: `postgresql://postgres.abcdefghijkl:${SECRET}@db.abcdefghijkl.supabase.co:5432/postgres?sslmode=require`,
    forbidden: [SECRET, "abcdefghijkl", "postgresql://", "db.abcdefghijkl"],
    required: ["6543"],
  },
  {
    label: "missing sslmode hint",
    error: sysError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432"),
    expect: "connection-refused",
    url: `postgresql://postgres.abcdefghijkl:${SECRET}@db.abcdefghijkl.supabase.co:5432/postgres`,
    forbidden: [SECRET, "postgresql://"],
    required: ["6543"],
  },
  {
    label: "pooler port with non-pooler user → user hint",
    error: sysError("ECONNRESET", "read ECONNRESET"),
    expect: "connection-reset",
    url: `postgresql://postgres:${SECRET}@aws-0.pooler.supabase.com:6543/postgres`,
    forbidden: [SECRET, "postgresql://"],
    required: ["postgres.PROJECT_REF"],
  },
];

/* ------------------------------------------------------------------ */

let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
};

console.log(`Running ${CASES.length} diagnose() cases…\n`);

for (const c of CASES) {
  const d = diagnoseDbError(c.error, c.url);
  // Flatten every user-visible string (no JSON escaping) for leak checks.
  const haystack = [
    d.technical,
    d.detail,
    d.title.en,
    d.title.ar,
    d.summary.en,
    d.summary.ar,
    ...d.fixes.flatMap((f) => [f.en, f.ar]),
  ].join(" \n ");

  check(d.code === c.expect, `[${c.label}] expected "${c.expect}", got "${d.code}"`);
  check(d.title.en.length > 0 && d.title.ar.length > 0, `[${c.label}] missing bilingual title`);
  check(d.summary.en.length > 0 && d.summary.ar.length > 0, `[${c.label}] missing bilingual summary`);
  check(
    d.fixes.length > 0 && d.fixes.every((f) => f.en.length > 0 && f.ar.length > 0),
    `[${c.label}] fixes must be bilingual`,
  );

  for (const bad of c.forbidden ?? []) {
    check(!haystack.includes(bad), `[${c.label}] LEAK: "${bad}" found in diagnosis`);
  }
  for (const good of c.required ?? []) {
    check(haystack.includes(good), `[${c.label}] expected to find "${good}"`);
  }
  check(!looksLeaky(d.detail), `[${c.label}] detail still looks leaky: ${d.detail}`);
  check(d.detail.length <= 250, `[${c.label}] detail too long (${d.detail.length})`);

  console.log(`  ✓ ${c.label} → ${d.code} (${d.technical})`);
}

/* Extra sanitizer unit checks ------------------------------------- */

const cyclicError = new Error("cyclic error cause");
Object.defineProperty(cyclicError, "cause", { value: cyclicError });
check(
  diagnoseDbError(cyclicError).code === "unknown",
  "cyclic causes should stop safely without looping",
);

console.log("\nSanitizer checks…");
const sanitizers: Array<[string, string]> = [
  ["plain url", `failed: ${POOLER_URL}`],
  ["user", 'authentication failed for user "postgres.abcdefghijkl"'],
  ["ip", "connect ECONNREFUSED 10.1.2.3:6543"],
  ["ipv6", "connect ECONNREFUSED [2001:db8::7]:6543"],
  ["host", "getaddrinfo ENOTFOUND my-db.prod.supabase.co"],
  ["private host", "TLS error for db.production.internal:6543"],
  ["relative certificate path", "open '../.private/db-ca.pem'"],
  ["mixed", `x ${POOLER_URL} y for user "z" at 10.0.0.1:6543 via api.supabase.com`],
  [
    "certificate and path",
    `TLS error for user "db-user" password=do-not-show open '/var/private/provider-ca.pem' -----BEGIN CERTIFICATE-----\\nCERT_DATA_DO_NOT_SHOW\\n-----END CERTIFICATE-----`,
  ],
];
for (const [label, input] of sanitizers) {
  const out = sanitizeDbMessage(input);
  check(!looksLeaky(out), `[sanitize:${label}] leaky output: ${out}`);
  check(!out.includes(SECRET), `[sanitize:${label}] password leaked`);
  check(!out.includes("abcdefghijkl"), `[sanitize:${label}] username leaked`);
  if (label === "ipv6") {
    check(out.includes("[host]:6543"), "[sanitize:ipv6] expected IPv6 address and port mask");
    check(!out.includes("2001:db8::7"), "[sanitize:ipv6] raw address leaked");
  }
  if (label === "private host") {
    check(out.includes("*.internal"), "[sanitize:private host] expected generic suffix mask");
    check(!out.includes("db.production.internal"), "[sanitize:private host] raw hostname leaked");
  }
  if (label === "relative certificate path") {
    check(out.includes("[path]"), "[sanitize:relative certificate path] expected path mask");
    check(!out.includes(".private"), "[sanitize:relative certificate path] path leaked");
  }
  if (label === "certificate and path") {
    for (const bad of ["do-not-show", "db-user", "/var/private", "CERT_DATA_DO_NOT_SHOW", "-----BEGIN CERTIFICATE-----"]) {
      check(!out.includes(bad), `[sanitize:${label}] sensitive value leaked: ${bad}`);
    }
  }
  console.log(`  ✓ ${label}: ${out}`);
}

/* Render pass — the actual page markup must be clean ---------------- */

console.log("\nRender pass (SetupNotice markup)…");
async function renderChecks() {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { default: SetupNotice } = await import("../src/components/site/SetupNotice");

  const tricky = pgError(
    "28P01",
    `password authentication failed for user "postgres.abcdefghijkl" using ${POOLER_URL}`,
  );
  const html = renderToStaticMarkup(createElement(SetupNotice, { error: tricky }));

  check(!html.includes(SECRET), "RENDER LEAK: password visible in page HTML");
  check(!html.includes("postgresql://"), "RENDER LEAK: connection URL visible in page HTML");
  check(!html.includes("abcdefghijkl"), "RENDER LEAK: username visible in page HTML");
  check(html.includes("28P01"), "expected technical code 28P01 in HTML");
  check(html.includes("باسورد"), "expected Arabic fix text in HTML");
  check(html.includes("password authentication failed"), "expected sanitized English detail in HTML");

  const tlsSecret = "tls-password-do-not-echo";
  const tlsError = Object.assign(
    new Error(
      `self-signed certificate in certificate chain ${POOLER_URL} user=postgres.abcdefghijkl ` +
        `password=${tlsSecret} open '/vercel/private/ca.pem' ` +
        "-----BEGIN CERTIFICATE-----\\nCA_BODY_DO_NOT_ECHO\\n-----END CERTIFICATE-----",
    ),
    { code: "SELF_SIGNED_CERT_IN_CHAIN" },
  );
  const tlsHtml = renderToStaticMarkup(createElement(SetupNotice, { error: tlsError }));
  for (const bad of [
    tlsSecret,
    "postgres.abcdefghijkl",
    "postgresql://",
    "/vercel/private",
    "CA_BODY_DO_NOT_ECHO",
    "-----BEGIN CERTIFICATE-----",
    "sslmode=require",
  ]) {
    check(!tlsHtml.includes(bad), `TLS RENDER LEAK: "${bad}" visible in page HTML`);
  }
  check(tlsHtml.includes("SELF_SIGNED_CERT_IN_CHAIN"), "TLS code should be shown safely");
  check(tlsHtml.includes("DATABASE_SSL_CA"), "TLS diagnosis should name the CA setting");

  const missing = renderToStaticMarkup(
    createElement(SetupNotice, {
      error: Object.assign(new Error("DATABASE_URL is not set"), {
        name: "MissingDatabaseUrlError",
      }),
    }),
  );
  check(missing.includes("setup required"), "missing-url should keep the setup badge");
  check(missing.includes("DATABASE_URL"), "missing-url should name the variable");

  console.log(`  ✓ rendered ${html.length} + ${missing.length} bytes, no leaks`);
  return Promise.resolve();
}

renderChecks()
  .catch((err) => {
    failed++;
    console.error("  ✗ render pass crashed:", err);
  })
  .finally(() => {
    console.log(
      failed === 0
        ? "\n✅ ALL DIAGNOSE TESTS PASSED"
        : `\n❌ ${failed} assertion(s) failed`,
    );
    process.exit(failed === 0 ? 0 : 1);
  });
