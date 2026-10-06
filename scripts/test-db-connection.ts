import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tls, { type ConnectionOptions } from "node:tls";
import { Client } from "pg";
import { getCliPostgresConnectionConfig, loadEnvFiles } from "../scripts/db.mjs";
import { getApplicationPostgresConnectionConfig } from "../src/lib/db";
import {
  buildPostgresConnectionConfig,
  PostgresConnectionConfigError,
} from "../src/lib/postgres-config.mjs";

type EffectivePgClient = Client & {
  connectionParameters: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    application_name?: string;
    ssl: false | (ConnectionOptions & { rejectUnauthorized?: boolean });
  };
};

function effectiveSsl(client: Client): EffectivePgClient["connectionParameters"]["ssl"] {
  return (client as EffectivePgClient).connectionParameters.ssl;
}

function configError(url: string, ca?: string) {
  const encodedPassword = decodeURIComponent(new URL(url).password);
  const sensitiveValues = [
    url,
    ...(encodedPassword.length >= 8 ? [encodedPassword] : []),
    ca ?? "",
  ].filter(Boolean);
  assert.throws(
    () => buildPostgresConnectionConfig(url, ca),
    (error: unknown) => {
      if (!(error instanceof PostgresConnectionConfigError)) return false;
      for (const value of sensitiveValues) {
        assert.equal(error.message.includes(value), false);
      }
      return true;
    },
  );
}

function tlsHandshake(
  host: string,
  port: number,
  ssl: ConnectionOptions & { rejectUnauthorized?: boolean },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, ...ssl });
    socket.once("secureConnect", () => {
      socket.end();
      resolve();
    });
    socket.once("error", reject);
  });
}

async function createLocalTestCertificates(directory: string) {
  const caKey = path.join(directory, "test-ca.key");
  const caCert = path.join(directory, "test-ca.pem");
  const serverKey = path.join(directory, "test-server.key");
  const serverCsr = path.join(directory, "test-server.csr");
  const serverCert = path.join(directory, "test-server.pem");
  const extensions = path.join(directory, "server-extensions.cnf");

  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", caKey,
    "-out", caCert,
    "-days", "1",
    "-subj", "/CN=Portfolio Isolated Test CA",
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ], { stdio: "ignore" });

  execFileSync("openssl", [
    "req", "-new", "-newkey", "rsa:2048", "-nodes",
    "-keyout", serverKey,
    "-out", serverCsr,
    "-subj", "/CN=localhost",
  ], { stdio: "ignore" });

  await writeFile(extensions, [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=DNS:localhost",
    "",
  ].join("\n"));

  execFileSync("openssl", [
    "x509", "-req",
    "-in", serverCsr,
    "-CA", caCert,
    "-CAkey", caKey,
    "-CAcreateserial",
    "-out", serverCert,
    "-days", "1",
    "-sha256",
    "-extfile", extensions,
  ], { stdio: "ignore" });

  return {
    ca: await readFile(caCert, "utf8"),
    key: await readFile(serverKey, "utf8"),
    cert: await readFile(serverCert, "utf8"),
  };
}

async function testTlsHandshake(generated: {
  ca: string;
  key: string;
  cert: string;
}) {
  let server: tls.Server | undefined;

  try {
    server = tls.createServer({ key: generated.key, cert: generated.cert }, (socket) => {
      socket.end("isolated TLS test");
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    const url = `postgresql://tls-test:tls-test@localhost:${port}/postgres?sslmode=verify-full`;

    const trusted = buildPostgresConnectionConfig(url, generated.ca);
    assert.equal(trusted.sslEnabled, true);
    const trustedOptions = trusted.pgConfig.ssl;
    assert.ok(trustedOptions && typeof trustedOptions === "object");
    assert.equal(trustedOptions.rejectUnauthorized, true);
    assert.equal(trustedOptions.ca, generated.ca.trim());
    await tlsHandshake("localhost", port, trustedOptions);
    console.log("✓ isolated TLS handshake accepts the explicitly trusted test CA");

    const untrusted = buildPostgresConnectionConfig(url);
    const untrustedOptions = untrusted.pgConfig.ssl;
    assert.ok(untrustedOptions && typeof untrustedOptions === "object");
    assert.equal(untrustedOptions.rejectUnauthorized, true);
    await assert.rejects(
      tlsHandshake("localhost", port, untrustedOptions),
      (error: unknown) => {
        const code = (error as NodeJS.ErrnoException).code;
        return [
          "SELF_SIGNED_CERT_IN_CHAIN",
          "DEPTH_ZERO_SELF_SIGNED_CERT",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
        ].includes(code ?? "");
      },
    );
    console.log("✓ isolated TLS handshake rejects an untrusted test CA with no insecure retry");

    const wrongHost = buildPostgresConnectionConfig(
      `postgresql://tls-test:tls-test@127.0.0.1:${port}/postgres?sslmode=verify-full`,
      generated.ca,
    );
    const wrongHostOptions = wrongHost.pgConfig.ssl;
    assert.ok(wrongHostOptions && typeof wrongHostOptions === "object");
    await assert.rejects(
      tlsHandshake("127.0.0.1", port, wrongHostOptions),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ERR_TLS_CERT_ALTNAME_INVALID",
    );
    console.log("✓ isolated TLS handshake still rejects a trusted CA with a hostname mismatch");
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

async function testEnvFilePrecedence() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-db-env-test-"));
  try {
    await writeFile(
      path.join(directory, ".env"),
      [
        "DATABASE_URL=from-dot-env",
        "DATABASE_SSL_CA=from-dot-env-ca",
        "BASE_ONLY=base-value",
        "",
      ].join(String.fromCharCode(10)),
    );
    await writeFile(
      path.join(directory, ".env.local"),
      [
        "DATABASE_URL=from-dot-env-local",
        'DATABASE_SSL_CA="first PEM line',
        'second PEM line"',
        "LOCAL_ONLY=local-value",
        "",
      ].join(String.fromCharCode(10)),
    );

    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "from-shell-environment",
    };
    loadEnvFiles(directory, environment);
    assert.equal(environment.DATABASE_URL, "from-shell-environment");
    assert.equal(
      environment.DATABASE_SSL_CA,
      ["first PEM line", "second PEM line"].join(String.fromCharCode(10)),
    );
    assert.equal(environment.BASE_ONLY, "base-value");
    assert.equal(environment.LOCAL_ONLY, "local-value");
    console.log("✓ CLI environment priority is shell > .env.local > .env; multiline PEM is preserved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  await testEnvFilePrecedence();
  const url = "postgresql://test:test@example.com/postgres?sslmode=require";

  // Regression: pg parses connectionString after merging options, so sslmode
  // from the URI replaces a separately passed ssl object.
  const oldPattern = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  assert.deepEqual(effectiveSsl(oldPattern), {});

  const shared = buildPostgresConnectionConfig(url);
  assert.equal("connectionString" in shared.pgConfig, false);
  const pgReceives = new Client(shared.pgConfig);
  assert.deepEqual(effectiveSsl(pgReceives), { rejectUnauthorized: true });
  assert.equal(shared.sslEnabled, true);
  console.log("✓ sslmode=require no longer overrides the final verified SSL config received by pg");

  // Non-empty URI fields have priority over pg's environment defaults, and a
  // process-level PGSSLMODE cannot weaken the final explicit TLS object.
  const pgEnvOverrides: Record<string, string> = {
    PGHOST: "environment.example.test",
    PGPORT: "9999",
    PGDATABASE: "environment_database",
    PGUSER: "environment_user",
    PGPASSWORD: "environment_password",
    PGSSLMODE: "no-verify",
  };
  const previousPgEnv = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(pgEnvOverrides)) {
    previousPgEnv.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    const uriClient = new Client(
      buildPostgresConnectionConfig(
        "postgresql://uri_user:uri_password@uri.example.test:6543/uri_database?sslmode=verify-full",
      ).pgConfig,
    ) as EffectivePgClient;
    assert.equal(uriClient.connectionParameters.host, "uri.example.test");
    assert.equal(uriClient.connectionParameters.port, 6543);
    assert.equal(uriClient.connectionParameters.database, "uri_database");
    assert.equal(uriClient.connectionParameters.user, "uri_user");
    assert.equal(uriClient.connectionParameters.password, "uri_password");
    const uriSsl = effectiveSsl(uriClient);
    assert.ok(uriSsl && typeof uriSsl === "object");
    assert.equal(uriSsl.rejectUnauthorized, true);
  } finally {
    for (const [key, value] of previousPgEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  console.log("✓ DATABASE_URL fields override PG* defaults; PGSSLMODE cannot weaken verified TLS");

  // Explicit verification modes remain verified; no-verify and unsafe remote
  // disable are configuration errors rather than fallbacks.
  for (const mode of ["require", "verify-ca", "verify-full", "prefer"]) {
    const verified = buildPostgresConnectionConfig(
      `postgresql://test:test@db.example.test/postgres?sslmode=${mode}`,
    );
    const client = new Client(verified.pgConfig);
    const ssl = effectiveSsl(client);
    assert.ok(ssl && typeof ssl === "object");
    assert.equal(ssl.rejectUnauthorized, true, `${mode} must verify the certificate`);
  }
  const verifyFull = new Client(
    buildPostgresConnectionConfig(
      "postgresql://test:test@db.example.test/postgres?sslmode=verify-full",
    ).pgConfig,
  );
  const verifyFullSsl = effectiveSsl(verifyFull);
  assert.ok(verifyFullSsl && typeof verifyFullSsl === "object");
  assert.equal(verifyFullSsl.rejectUnauthorized, true);
  assert.equal(verifyFullSsl.checkServerIdentity, undefined);
  configError("postgresql://test:private-credential-must-not-leak@db.example.test/postgres?sslmode=no-verify");
  configError("postgresql://test:secret@db.example.test/postgres?uselibpqcompat=true&sslmode=require");
  const previousNodeTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    configError("postgresql://test:secret@db.example.test/postgres?sslmode=verify-full");
  } finally {
    if (previousNodeTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousNodeTlsSetting;
  }
  configError("postgresql://test:secret@db.example.test/postgres?sslmode=disable");
  configError("postgresql://test:secret@db.example.test/postgres?ssl=0");
  console.log("✓ verification modes stay strict; no-verify and remote plaintext are rejected");

  // Local PostgreSQL defaults to verified TLS too; plaintext is allowed only
  // when the URI explicitly opts out, and contradictory CA/SSL modes fail safely.
  const localDefault = buildPostgresConnectionConfig(
    "postgresql://local:local@localhost:5432/portfolio",
  );
  assert.equal(localDefault.sslEnabled, true);
  const localDefaultSsl = effectiveSsl(new Client(localDefault.pgConfig));
  assert.ok(localDefaultSsl && typeof localDefaultSsl === "object");
  assert.equal(localDefaultSsl.rejectUnauthorized, true);

  const local = buildPostgresConnectionConfig(
    "postgresql://local:local@localhost:5432/portfolio?sslmode=disable",
  );
  assert.equal(local.sslEnabled, false);
  assert.equal(effectiveSsl(new Client(local.pgConfig)), false);
  configError(
    "postgresql://local:local@localhost:5432/portfolio?sslmode=disable",
    "-----BEGIN CERTIFICATE-----not-a-real-certificate-----END CERTIFICATE-----",
  );
  configError("postgresql://u:p@example.com/postgres?sslmode=require&ssl=0");
  let pathError: unknown;
  try {
    buildPostgresConnectionConfig(
      "postgresql://u:p@example.com/postgres?sslrootcert=%2Fprivate%2Fdb-ca.pem",
    );
  } catch (error) {
    pathError = error;
  }
  assert.ok(pathError instanceof Error);
  assert.equal(pathError.message.includes("/private"), false);
  console.log("✓ local connections default to verified TLS; explicit local SSL disable and conflict checks pass");

  // A CA can be supplied on its own or with literal backslash-n newlines. The
  // final pg Client options must keep rejectUnauthorized=true.
  const syntheticPem = "-----BEGIN CERTIFICATE-----\\nTEST-ONLY-PLACEHOLDER\\n-----END CERTIFICATE-----";
  // The placeholder is intentionally rejected rather than treated as trust.
  configError("postgresql://test:test@db.example.test/postgres?sslmode=require", syntheticPem);

  // Use an actual generated CA to test normalization, application/CLI parity,
  // and the Node TLS handshake below.
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-db-ca-test-"));
  try {
    const generated = await createLocalTestCertificates(directory);
    const caAsLiteralNewlines = generated.ca.trim().replace(/\n/g, "\\n");
    const caUrl = "postgresql://u%40ser:p%3Ass%40word%2B@db.example.test:6432/portfolio?sslmode=require&application_name=connection-regression&options=-c%20statement_timeout%3D2500";

    const appConfig = getApplicationPostgresConnectionConfig(caUrl, caAsLiteralNewlines);
    const cliConfig = getCliPostgresConnectionConfig(caUrl, caAsLiteralNewlines);
    assert.deepEqual(appConfig, cliConfig);
    assert.equal(appConfig.host, "db.example.test");
    assert.equal(appConfig.pgConfig.host, "db.example.test");
    assert.equal(appConfig.pgConfig.port, 6432);
    assert.equal(appConfig.database, "portfolio");
    assert.equal(appConfig.pgConfig.user, "u@ser");
    assert.equal(appConfig.pgConfig.password, "p:ss@word+");
    assert.equal(appConfig.pgConfig.application_name, "connection-regression");
    assert.equal(appConfig.pgConfig.options, "-c statement_timeout=2500");
    const customCaClient = new Client(appConfig.pgConfig);
    const customCaSsl = effectiveSsl(customCaClient);
    assert.ok(customCaSsl && typeof customCaSsl === "object");
    assert.equal(customCaSsl.rejectUnauthorized, true);
    assert.equal(customCaSsl.ca, generated.ca.trim());
    assert.equal(customCaSsl.checkServerIdentity, undefined);
    console.log("✓ custom CA, percent-encoded credentials, other URI options, and app/CLI parity pass");

    // This exercises the shared config against a locally generated CA/leaf.
    await testTlsHandshake(generated);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log("\n✅ ALL DATABASE CONNECTION CONFIGURATION TESTS PASSED");
}

main().catch((error) => {
  console.error("\n❌ DATABASE CONNECTION CONFIGURATION TEST FAILED");
  console.error(error instanceof Error ? error.message : "Unknown test error");
  process.exitCode = 1;
});
