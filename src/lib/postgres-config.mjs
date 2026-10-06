import { X509Certificate } from "node:crypto";
import { createSecureContext } from "node:tls";
import { parseIntoClientConfig } from "pg-connection-string";

const SSL_QUERY_PARAMETERS = new Set([
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "uselibpqcompat",
]);

const VERIFIED_SSL_MODES = new Set([
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

const MAX_CA_BUNDLE_BYTES = 512 * 1024;

/**
 * Raised for an unsafe or invalid PostgreSQL/TLS configuration. Messages are
 * deliberately static: they never include the URL, credential, CA, or path.
 */
export class PostgresConnectionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "PostgresConnectionConfigError";
    this.code = "DATABASE_SSL_CONFIG";
  }
}

function configurationError(message) {
  return new PostgresConnectionConfigError(message);
}

function singleParameter(url, normalizedName, removedNames) {
  const values = [];
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === normalizedName) {
      values.push(value);
      removedNames.add(key);
    }
  }

  if (values.length > 1) {
    throw configurationError(
      `DATABASE_URL contains duplicate ${normalizedName} options. Keep only one value for each SSL option.`,
    );
  }

  return values[0];
}

function readSslParameters(url) {
  const values = new Map();
  const removedNames = new Set();

  for (const parameter of SSL_QUERY_PARAMETERS) {
    const value = singleParameter(url, parameter, removedNames);
    if (value !== undefined) values.set(parameter, value);
  }

  // sslrootcert/sslcert/sslkey are local filesystem paths in pg's URI parser.
  // Do not let a DATABASE_URL trigger arbitrary file reads in a serverless app.
  for (const parameter of ["sslrootcert", "sslcert", "sslkey", "sslpassword"]) {
    if (values.has(parameter)) {
      throw configurationError(
        `DATABASE_URL certificate-file options are not supported. Set a trusted server CA with DATABASE_SSL_CA instead; do not put file paths or private keys in DATABASE_URL.`,
      );
    }
  }

  const sslNegotiationValues = url.searchParams.getAll("sslnegotiation");
  if (sslNegotiationValues.length > 1) {
    throw configurationError(
      "DATABASE_URL contains duplicate sslnegotiation options. Keep only one value.",
    );
  }

  return {
    values,
    removedNames,
    sslNegotiation: sslNegotiationValues[0]?.toLowerCase(),
  };
}

function normalizeCaBundle(value) {
  if (value == null || String(value).trim() === "") return undefined;

  const supplied = String(value);
  if (Buffer.byteLength(supplied, "utf8") > MAX_CA_BUNDLE_BYTES) {
    throw configurationError(
      "DATABASE_SSL_CA is too large. Supply only the provider's PEM-encoded CA certificate bundle.",
    );
  }

  const pem = supplied
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
  const certificatePattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  const certificates = pem.match(certificatePattern) ?? [];
  const remainder = pem.replace(certificatePattern, "").trim();

  if (certificates.length === 0 || remainder !== "") {
    throw configurationError(
      "DATABASE_SSL_CA must contain one or more valid PEM CA certificates only. Do not include a private key or the database server's leaf certificate.",
    );
  }

  try {
    for (const certificatePem of certificates) {
      const certificate = new X509Certificate(certificatePem);
      if (!certificate.ca) {
        throw new Error("not a CA certificate");
      }
    }
    // Validate the same bundle shape that Node's TLS implementation will use.
    createSecureContext({ ca: certificates.join("\n") });
  } catch {
    // Never include the OpenSSL error, PEM, or any filesystem path here.
    throw configurationError(
      "DATABASE_SSL_CA is invalid. Add the provider's trusted PEM CA certificate bundle; certificate contents are not included in this error.",
    );
  }

  return certificates.join("\n");
}

function isLoopbackHost(host) {
  const normalized = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("/") // PostgreSQL Unix-domain socket path
  );
}

function getExplicitSslSetting(values, sslNegotiation) {
  const modeValue = values.get("sslmode");
  const mode = modeValue?.trim().toLowerCase();
  if (modeValue !== undefined && !mode) {
    throw configurationError("DATABASE_URL has an empty sslmode. Set an explicit supported SSL mode.");
  }

  const supportedModes = new Set([
    "disable",
    "prefer",
    "require",
    "verify-ca",
    "verify-full",
    "no-verify",
  ]);
  if (mode && !supportedModes.has(mode)) {
    throw configurationError(
      "DATABASE_URL has an unsupported sslmode. Use disable (local only), require, verify-ca, or verify-full.",
    );
  }
  if (mode === "no-verify") {
    throw configurationError(
      "DATABASE_URL uses sslmode=no-verify, which disables certificate verification. Remove it and use a verified SSL mode; do not turn off certificate checks.",
    );
  }

  const sslValue = values.get("ssl")?.trim().toLowerCase();
  let sslFlag;
  if (sslValue !== undefined) {
    if (["true", "1"].includes(sslValue)) sslFlag = true;
    else if (["false", "0"].includes(sslValue)) sslFlag = false;
    else {
      throw configurationError(
        "DATABASE_URL has an unsupported ssl option. Use true/false only when an explicit SSL setting is needed.",
      );
    }
  }

  const compatValue = values.get("uselibpqcompat")?.trim().toLowerCase();
  if (
    compatValue !== undefined &&
    !["", "true", "false", "1", "0"].includes(compatValue)
  ) {
    throw configurationError("DATABASE_URL has an invalid uselibpqcompat option.");
  }
  const libpqCompat = compatValue === "true" || compatValue === "1";

  if (
    libpqCompat &&
    ["prefer", "require", "verify-ca"].includes(mode)
  ) {
    throw configurationError(
      "DATABASE_URL combines uselibpqcompat with an SSL mode that would weaken certificate or hostname verification. Remove uselibpqcompat or choose verify-full.",
    );
  }

  if (sslNegotiation !== undefined && !["postgres", "direct"].includes(sslNegotiation)) {
    throw configurationError(
      "DATABASE_URL has an invalid sslnegotiation option. Use postgres or direct.",
    );
  }

  const modeDisablesSsl = mode === "disable";
  const modeEnablesSsl = mode !== undefined && VERIFIED_SSL_MODES.has(mode);
  if (sslFlag !== undefined && mode !== undefined && sslFlag !== !modeDisablesSsl) {
    throw configurationError(
      "DATABASE_URL contains conflicting ssl and sslmode options. Keep one consistent SSL setting.",
    );
  }
  if (sslNegotiation === "direct" && (modeDisablesSsl || sslFlag === false)) {
    throw configurationError(
      "DATABASE_URL requests direct TLS negotiation while also disabling SSL. Remove the conflicting option.",
    );
  }

  if (modeDisablesSsl || sslFlag === false) return { enabled: false, mode: mode ?? "disable" };
  if (modeEnablesSsl || sslFlag === true || sslNegotiation === "direct") {
    return { enabled: true, mode: mode ?? "enabled" };
  }

  return { enabled: undefined, mode: mode ?? "default" };
}

/**
 * Build the exact connection config consumed by `pg` from the PostgreSQL URI
 * and optional DATABASE_SSL_CA value.
 *
 * SSL precedence is intentional and shared by the app and CLI:
 *  - TLS query options are parsed here, then removed before pg sees a URL.
 *  - pg receives parsed host/user/password/query fields, never connectionString.
 *  - every PostgreSQL connection defaults to verified TLS; plaintext is allowed
 *    only when the URI explicitly disables SSL for a local host.
 *  - `sslmode=no-verify` and remote explicit SSL disable are rejected.
 */
export function buildPostgresConnectionConfig(databaseUrl, databaseSslCa) {
  const rawUrl = String(databaseUrl ?? "").trim();
  if (!rawUrl) {
    throw configurationError("DATABASE_URL is required for a PostgreSQL connection.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw configurationError(
      "DATABASE_URL is not a valid PostgreSQL connection URI. Check its scheme and percent-encoding; the value is never displayed.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw configurationError(
      "DATABASE_URL must be a PostgreSQL URI beginning with postgres:// or postgresql://, not an HTTPS database API URL.",
    );
  }

  const { values, removedNames, sslNegotiation } = readSslParameters(url);
  const explicitSsl = getExplicitSslSetting(values, sslNegotiation);
  const ca = normalizeCaBundle(databaseSslCa);

  // A caller-provided CA and an explicit TLS disable are mutually exclusive.
  if (ca && explicitSsl.enabled === false) {
    throw configurationError(
      "DATABASE_SSL_CA cannot be used while DATABASE_URL explicitly disables SSL. Enable verified TLS or remove DATABASE_SSL_CA.",
    );
  }

  for (const name of removedNames) url.searchParams.delete(name);

  let pgConfig;
  try {
    // Use the same parser as pg, but without its SSL URL parameters. This keeps
    // all non-TLS URI options and percent-decoded credentials intact.
    pgConfig = parseIntoClientConfig(url.toString());
  } catch {
    throw configurationError(
      "DATABASE_URL could not be parsed as a PostgreSQL connection URI. Check its non-secret format and percent-encoding.",
    );
  }

  // Make the effective host explicit so environment PGHOST cannot silently
  // alter local-vs-remote TLS policy after configuration validation.
  if (typeof pgConfig.host !== "string" || pgConfig.host.length === 0) {
    pgConfig.host = process.env.PGHOST?.trim() || "localhost";
  }
  const host = pgConfig.host;
  const localHost = isLoopbackHost(host);
  const sslEnabled = explicitSsl.enabled ?? true;

  if (!sslEnabled && !localHost) {
    throw configurationError(
      "SSL is explicitly disabled for a non-local PostgreSQL host. Use verified TLS for remote databases; plaintext is allowed only for local development.",
    );
  }
  if (sslEnabled && process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw configurationError(
      "NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS verification process-wide and is not supported. Remove it; the database connection requires verified TLS.",
    );
  }
  if (ca && !sslEnabled) {
    throw configurationError(
      "DATABASE_SSL_CA was supplied but TLS is disabled. Enable verified TLS or remove DATABASE_SSL_CA.",
    );
  }

  // Always keep chain validation enabled. With no custom CA, Node uses its
  // standard trust roots. A custom DATABASE_SSL_CA replaces the per-connection
  // trust set; hostname validation remains Node's default checkServerIdentity.
  pgConfig.ssl = sslEnabled
    ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
    : false;
  delete pgConfig.connectionString;

  const database =
    typeof pgConfig.database === "string" && pgConfig.database.length > 0
      ? pgConfig.database
      : typeof pgConfig.user === "string" && pgConfig.user.length > 0
        ? pgConfig.user
        : "postgres";

  return {
    pgConfig,
    host,
    database,
    sslEnabled,
    sslMode: explicitSsl.mode,
  };
}
