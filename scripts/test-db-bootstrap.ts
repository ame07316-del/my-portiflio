import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { initializeDatabase, postgresTransaction, type ManagedDriver } from "../src/lib/db-bootstrap";
import { migrate, seed } from "../src/lib/db";

async function main() {
  // Fake pool rejects pool.query: transactions must only use the leased client.
  const statements: string[] = [];
  const releases: boolean[] = [];
  let failLock = false;
  let closed = false;
  const pool = {
    async connect() {
      return {
        async query(sql: string) {
          statements.push(sql);
          if (failLock && sql.includes("pg_advisory_xact_lock")) throw new Error("lock timeout");
          return { rows: [] };
        },
        release(discard: boolean) { releases.push(discard); },
      };
    },
    async query() { throw new Error("must not query through pool during bootstrap"); },
  } as unknown as Pool;
  const pgDriver: ManagedDriver = {
    query: () => { throw new Error("unexpected query outside transaction"); },
    exec: () => { throw new Error("unexpected exec outside transaction"); },
    transaction: (work) => postgresTransaction(pool, work),
    async close() { closed = true; },
  };
  await initializeDatabase(pgDriver, true,
    (tx) => tx.exec("MIGRATE"), (tx) => tx.exec("SEED"));
  assert.deepEqual(statements, ["BEGIN", "SET LOCAL lock_timeout = '15s'", "SET LOCAL statement_timeout = '30s'", "SELECT pg_advisory_xact_lock($1)", "MIGRATE", "SEED", "COMMIT"]);
  assert.deepEqual(releases, [false]);
  assert.equal(closed, false);
  statements.length = 0;
  failLock = true;
  await assert.rejects(initializeDatabase(pgDriver, true,
    (tx) => tx.exec("MIGRATE"), (tx) => tx.exec("SEED")), /lock timeout/);
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.includes("MIGRATE"));
  assert.equal(closed, true);
  console.log("✓ same-client transaction, transaction lock, rollback, release and cleanup");

  // Exercise the actual schema and seed in isolated in-memory PostgreSQL.
  const lite = await PGlite.create();
  const local: ManagedDriver = {
    query: (sql, params) => lite.query(sql, params),
    async exec(sql) { await lite.exec(sql); },
    transaction: (work) => lite.transaction((tx) => work({
      query: (sql, params) => tx.query(sql, params),
      async exec(sql) { await tx.exec(sql); },
    })),
    // Keep the in-memory instance open so rollback can be inspected below.
    async close() {},
  };
  try {
    await assert.rejects(initializeDatabase(local, false, migrate, async (tx) => {
      await seed(tx);
      throw new Error("simulated interrupted bootstrap");
    }), /simulated interrupted/);
    const absent = await lite.query<{ name: string | null }>("SELECT to_regclass('public.users')::text AS name");
    assert.equal(absent.rows[0].name, null);
    await initializeDatabase(local, false, migrate, seed);
    for (const [table, count] of [["users", 1], ["settings", 1], ["projects", 3], ["skills", 12]] as const) {
      const result = await lite.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      assert.equal(result.rows[0].n, count);
    }
    await lite.query("UPDATE settings SET name_en = 'Keep my name' WHERE id = 1");
    await initializeDatabase(local, false, migrate, seed);
    assert.equal((await lite.query<{ n: number }>("SELECT count(*)::int AS n FROM skills")).rows[0].n, 12);
    assert.equal((await lite.query<{ name_en: string }>("SELECT name_en FROM settings")).rows[0].name_en, "Keep my name");
    await lite.query("DELETE FROM settings");
    await initializeDatabase(local, false, migrate, seed);
    assert.equal((await lite.query<{ n: number }>("SELECT count(*)::int AS n FROM settings")).rows[0].n, 1);
    console.log("✓ fresh database, atomic rollback/retry, idempotent seed, preserve edits, repair missing settings");
  } finally { await lite.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
