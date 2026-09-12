#!/usr/bin/env node
/**
 * Database CLI — works against DATABASE_URL (Supabase / Neon / any Postgres)
 * or the local embedded PGlite database when DATABASE_URL is empty.
 *
 *   npm run db:check     # test the connection and list the tables
 *   npm run db:push      # create/patch all tables (safe to re-run) + seed
 *   npm run db:export     > backup.json
 *   npm run db:import     backup.json
 *   npm run db:copy-local # copy the local .data database into DATABASE_URL
 *
 * Reads .env.local / .env automatically.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/* ------------------------------ env loading ------------------------------ */

for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

const TABLES = [
  "users",
  "settings",
  "projects",
  "skills",
  "services",
  "experiences",
  "locations",
  "messages",
];

const BACKUP_TABLES = TABLES.filter((t) => t !== "users");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/* -------------------------------- drivers -------------------------------- */

async function connect(urlOverride) {
  const url = (urlOverride ?? process.env.DATABASE_URL ?? "").trim();

  if (url) {
    const { Pool } = await import("pg");
    const parsed = new URL(url);
    const local =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 20_000,
    });
    return {
      kind: "postgres",
      label: `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${parsed.pathname.slice(1) || "postgres"}`,
      query: (text, params = []) => pool.query(text, params),
      exec: (text) => pool.query(text),
      end: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), ".data", "pgdata");
  const lite = await PGlite.create(dir);
  return {
    kind: "pglite",
    label: ".data/pgdata (embedded)",
    query: (text, params = []) => lite.query(text, params),
    exec: (text) => lite.exec(text),
    end: () => lite.close(),
  };
}

async function counts(db) {
  const out = {};
  for (const t of TABLES) {
    try {
      const r = await db.query(`SELECT count(*)::text AS c FROM ${t}`);
      out[t] = Number(r.rows[0].c);
    } catch {
      out[t] = null; // table missing
    }
  }
  return out;
}

function printCounts(rows) {
  for (const [table, n] of Object.entries(rows)) {
    const status = n === null ? c.red("missing") : c.green(`${n} rows`);
    console.log(`   ${table.padEnd(13)} ${status}`);
  }
}

/* -------------------------------- commands ------------------------------- */

async function cmdCheck() {
  const db = await connect();
  console.log(`\n${c.bold("Connection")}  ${c.cyan(db.label)}  ${c.dim(`[${db.kind}]`)}`);
  const v = await db.query("SELECT version()");
  console.log(`${c.bold("Server")}      ${String(v.rows[0].version).split(",")[0]}`);
  console.log(`\n${c.bold("Tables")}`);
  printCounts(await counts(db));
  console.log();
  await db.end();
}

async function cmdPush() {
  const db = await connect();
  console.log(`\n→ applying schema to ${c.cyan(db.label)}`);
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "schema.sql"),
    "utf8",
  );
  await db.exec(schema);
  console.log(c.green("✓ schema applied"));

  const users = await db.query("SELECT count(*)::text AS c FROM users");
  if (Number(users.rows[0].c) === 0) {
    console.log("→ empty database, seeding starter content…");
    const { seed } = await import("../src/lib/db.ts").catch(() => ({}));
    if (seed) {
      await seed({ query: db.query, exec: db.exec });
    } else {
      console.log(
        c.dim("  (run `npm run dev` once — the app seeds itself on first boot)"),
      );
    }
  }
  console.log(`\n${c.bold("Tables")}`);
  printCounts(await counts(db));
  console.log();
  await db.end();
}

async function cmdExport(outFile) {
  const db = await connect();
  const data = {};
  for (const t of BACKUP_TABLES) {
    const r = await db.query(`SELECT * FROM ${t} ORDER BY id ASC`);
    data[t] = r.rows;
  }
  const payload = JSON.stringify(
    { exportedAt: new Date().toISOString(), version: 1, data },
    null,
    2,
  );
  if (outFile) {
    fs.writeFileSync(outFile, payload);
    console.error(c.green(`✓ exported ${db.label} → ${outFile}`));
  } else {
    process.stdout.write(payload);
  }
  await db.end();
}

async function insertRows(db, table, rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  if (table === "settings") {
    const row = rows[0];
    const cols = Object.keys(row).filter((k) => k !== "id" && k !== "updated_at");
    const sets = cols.map((k, i) => `${k} = $${i + 1}`).join(", ");
    await db.query(
      `UPDATE settings SET ${sets} WHERE id = 1`,
      cols.map((k) => normalize(row[k])),
    );
    return 1;
  }
  await db.query(`DELETE FROM ${table}`);
  let n = 0;
  for (const row of rows) {
    const cols = Object.keys(row).filter((k) => k !== "id");
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    await db.query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph})`,
      cols.map((k) => normalize(row[k])),
    );
    n++;
  }
  await db
    .query(
      `SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}),1))`,
    )
    .catch(() => {});
  return n;
}

function normalize(v) {
  if (v && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

async function cmdImport(file) {
  if (!file) throw new Error("usage: npm run db:import -- backup.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const db = await connect();
  console.log(`\n→ restoring ${file} into ${c.cyan(db.label)}`);
  let total = 0;
  for (const t of BACKUP_TABLES) total += await insertRows(db, t, payload.data?.[t]);
  console.log(c.green(`✓ restored ${total} rows`));
  printCounts(await counts(db));
  await db.end();
}

/** Copies the local embedded database into DATABASE_URL. */
async function cmdCopyLocal() {
  const target = (process.env.DATABASE_URL ?? "").trim();
  if (!target) throw new Error("DATABASE_URL is not set — nothing to copy into.");

  const local = await connect(""); // force PGlite
  const remote = await connect(target);

  console.log(`\n→ ${c.cyan(local.label)}  ➜  ${c.cyan(remote.label)}`);
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "schema.sql"),
    "utf8",
  );
  await remote.exec(schema);

  // users first (admin account), then content
  const users = await local.query("SELECT * FROM users ORDER BY id");
  for (const u of users.rows) {
    await remote.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
      [u.email, u.password_hash, u.name],
    );
  }
  console.log(c.green(`✓ ${users.rows.length} user(s)`));

  let total = 0;
  for (const t of BACKUP_TABLES) {
    const r = await local.query(`SELECT * FROM ${t} ORDER BY id ASC`);
    total += await insertRows(remote, t, r.rows);
  }
  console.log(c.green(`✓ ${total} content rows copied`));
  printCounts(await counts(remote));
  console.log();
  await local.end();
  await remote.end();
}

/* --------------------------------- main ---------------------------------- */

const [, , cmd, arg] = process.argv;

try {
  switch (cmd) {
    case "check":
      await cmdCheck();
      break;
    case "push":
      await cmdPush();
      break;
    case "export":
      await cmdExport(arg);
      break;
    case "import":
      await cmdImport(arg);
      break;
    case "copy-local":
      await cmdCopyLocal();
      break;
    default:
      console.log(`
${c.bold("Portfolio database CLI")}

  npm run db:check              test the connection, list tables & row counts
  npm run db:push               create/patch tables (idempotent)
  npm run db:export -- out.json dump all content to JSON
  npm run db:import -- out.json restore content from JSON
  npm run db:copy-local         copy the local dev database into DATABASE_URL
`);
  }
  process.exit(0);
} catch (err) {
  console.error(`\n${c.red("✗ " + (err?.message ?? err))}\n`);
  if (err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT") {
    console.error(
      c.dim("  Check the host in DATABASE_URL, and that your IP is allowed.\n"),
    );
  }
  process.exit(1);
}
