import type { Pool } from "pg";

export interface Driver {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<void>;
}

export interface ManagedDriver extends Driver {
  transaction<T>(work: (tx: Driver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** BEGIN, all statements and COMMIT must use the same checked-out client.
 * This also pins the backend when using a transaction pooler (Supabase :6543).
 */
export async function postgresTransaction<T>(pool: Pool, work: (tx: Driver) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await work({
      async query<R>(text: string, params: unknown[] = []) {
        const res = await client.query(text, params);
        return { rows: res.rows as R[] };
      },
      async exec(text: string) { await client.query(text); },
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function initializeDatabase(
  driver: ManagedDriver,
  postgres: boolean,
  migrate: (tx: Driver) => Promise<unknown>,
  seed: (tx: Driver) => Promise<unknown>,
): Promise<void> {
  try {
    await driver.transaction(async (tx) => {
      if (postgres) {
        // Transaction-scoped, automatically released on COMMIT / ROLLBACK.
        // Never swallow lock failures and then seed without protection.
        await tx.query("SET LOCAL lock_timeout = '15s'");
        await tx.query("SET LOCAL statement_timeout = '30s'");
        await tx.query("SELECT pg_advisory_xact_lock($1)", [918_273_645]);
      }
      await migrate(tx);
      await seed(tx);
    });
  } catch (error) {
    // A retry must not leak the previous pool (or an embedded DB handle).
    await driver.close().catch(() => undefined);
    throw error;
  }
}
