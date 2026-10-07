/**
 * adapters/pglite-store.ts — LedgerStore on a REAL PostgreSQL engine.
 *
 * PGlite embeds genuine Postgres (WASM) — the exact SQL written here runs
 * unchanged on the production PostgreSQL of the independent server; the
 * adapter swap is a connection string, not a rewrite.
 *
 * Discipline enforced here:
 *  - PREPARED STATEMENTS ONLY — every query is parameterized, no string
 *    interpolation of values, ever.
 *  - RLS FORCED — `FORCE ROW LEVEL SECURITY` makes tenant isolation apply
 *    even to the table owner; every business transaction first does
 *    `set_config('app.tenant', …, local)`. Bypassing the API yields zero
 *    rows, not other tenants' data (Phase 5 invariant, tested).
 *  - OCC — version-conditioned UPDATEs; rowCount=0 ⇒ 'conflict'.
 *  - OUTBOX — the transfer, its outbox row and its events commit in ONE
 *    transaction: no event without a transfer, no transfer without events.
 *  - Money is BIGINT cents — no floats touch money.
 *
 * @complexity attemptTransfer: Time O(log n) index probes + O(1) writes,
 *   one SERIALIZABLE-grade round trip; Space O(1) per call.
 */
import { PGlite } from '@electric-sql/pglite';
import type {
  AccountRow,
  EventRow,
  LedgerStore,
  OutboxRow,
  TransferInput,
  TransferResult,
} from '../ports/store.js';

interface Tx {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
  exec(sql: string): Promise<unknown>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  tenant  TEXT NOT NULL DEFAULT current_setting('app.tenant', true),
  id      TEXT NOT NULL,
  balance BIGINT NOT NULL CHECK (balance >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant, id)
);
CREATE TABLE IF NOT EXISTS transfers (
  id              BIGSERIAL PRIMARY KEY,
  tenant          TEXT NOT NULL DEFAULT current_setting('app.tenant', true),
  from_id         TEXT NOT NULL,
  to_id           TEXT NOT NULL,
  amount          BIGINT NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant, idempotency_key)
);
CREATE TABLE IF NOT EXISTS outbox (
  id         BIGSERIAL PRIMARY KEY,
  topic      TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS event_log (
  id          BIGSERIAL PRIMARY KEY,
  stream      TEXT NOT NULL,
  seq         BIGINT NOT NULL,
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stream, seq)
);
ALTER TABLE accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts  FORCE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_accounts ON accounts;
CREATE POLICY tenant_accounts ON accounts
  USING (tenant = current_setting('app.tenant', true))
  WITH CHECK (tenant = current_setting('app.tenant', true));
DROP POLICY IF EXISTS tenant_transfers ON transfers;
CREATE POLICY tenant_transfers ON transfers
  USING (tenant = current_setting('app.tenant', true))
  WITH CHECK (tenant = current_setting('app.tenant', true));
CREATE TABLE IF NOT EXISTS crdt_ops (
  id          BIGSERIAL PRIMARY KEY,
  tenant      TEXT NOT NULL DEFAULT current_setting('app.tenant', true),
  op          TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Business transactions run under an UNPRIVILEGED role: superusers bypass
-- RLS by definition, so the API path must not be superuser-owned.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sovereign_app') THEN
    CREATE ROLE sovereign_app NOLOGIN;
  END IF;
END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO sovereign_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sovereign_app;
`;

/** Exported for security audits/tests that need the raw schema. */
export { SCHEMA as SCHEMA_SQL };

export class PgliteStore implements LedgerStore {
  readonly #db: PGlite;

  constructor(dataDir: string = ':memory:') {
    // PGlite treats any string as a filesystem location; the TRUE in-memory
    // database is created by passing no dataDir at all.
    this.#db = dataDir === ':memory:' ? new PGlite() : new PGlite(dataDir);
  }

  /** Idempotent schema bootstrap. @complexity O(schema size) once. */
  async init(): Promise<void> {
    await this.#db.exec(SCHEMA);
  }

  async createAccount(tenant: string, id: string, opening: number): Promise<void> {
    if (!Number.isInteger(opening) || opening < 0) throw new RangeError('opening must be integer cents >= 0');
    await this.#db.transaction(async (tx) => {
      await (tx as Tx).query(`SELECT set_config('role', 'sovereign_app', true)`);
      await (tx as Tx).query(`SELECT set_config('app.tenant', $1, true)`, [tenant]);
      await (tx as Tx).query(
        `INSERT INTO accounts (id, balance, version) VALUES ($1, $2, 0)
         ON CONFLICT (tenant, id) DO UPDATE SET balance = accounts.balance`,
        [id, opening],
      );
    });
  }

  async getAccount(tenant: string, id: string): Promise<AccountRow | null> {
    return this.#db.transaction(async (tx) => {
      await (tx as Tx).query(`SELECT set_config('role', 'sovereign_app', true)`);
      await (tx as Tx).query(`SELECT set_config('app.tenant', $1, true)`, [tenant]);
      const res = await (tx as Tx).query<{ balance: bigint | string; version: bigint | string }>(
        `SELECT balance, version FROM accounts WHERE id = $1`,
        [id],
      );
      const row = res.rows[0];
      if (row === undefined) return null;
      return { balance: Number(row.balance), version: Number(row.version) };
    });
  }

  /**
   * One optimistic attempt inside a single local transaction.
   * @complexity O(1) indexed statements; conflict surfaces as rowCount=0.
   */
  async attemptTransfer(input: TransferInput): Promise<TransferResult> {
    try {
      return await this.#db.transaction(async (tx) => {
        const t = tx as Tx;
        await t.query(`SELECT set_config('role', 'sovereign_app', true)`);
        await t.query(`SELECT set_config('app.tenant', $1, true)`, [input.tenant]);

        // 1) Idempotency gate — replay returns the ORIGINAL result.
        const dup = await t.query<{ id: bigint | string }>(
          `SELECT id FROM transfers WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        const dupRow = dup.rows[0];
        if (dupRow !== undefined) {
          return { ok: true, transferId: Number(dupRow.id), replayed: true };
        }

        // 2) Read both rows (RLS-scoped to this tenant automatically).
        const fromRes = await t.query<{ balance: bigint | string; version: bigint | string }>(
          `SELECT balance, version FROM accounts WHERE id = $1`,
          [input.from],
        );
        const toRes = await t.query<{ version: bigint | string }>(
          `SELECT version FROM accounts WHERE id = $1`,
          [input.to],
        );
        const from = fromRes.rows[0];
        const to = toRes.rows[0];
        if (from === undefined || to === undefined) return { ok: false, code: 'not_found' as const };

        const balance = Number(from.balance);
        if (balance < input.amount) return { ok: false, code: 'insufficient_funds' as const };

        // 3) Version-conditioned writes — the OCC gate.
        const debit = await t.query(
          `UPDATE accounts SET balance = balance - $1, version = version + 1
           WHERE id = $2 AND version = $3`,
          [input.amount, input.from, Number(from.version)],
        );
        if ((debit.affectedRows ?? 0) === 0) return { ok: false, code: 'conflict' as const };

        const credit = await t.query(
          `UPDATE accounts SET balance = balance + $1, version = version + 1
           WHERE id = $2 AND version = $3`,
          [input.amount, input.to, Number(to.version)],
        );
        if ((credit.affectedRows ?? 0) === 0) return { ok: false, code: 'conflict' as const };

        // 4) Transfer record + outbox + events — one atomic commit.
        const ins = await t.query<{ id: bigint | string }>(
          `INSERT INTO transfers (from_id, to_id, amount, idempotency_key, status)
           VALUES ($1, $2, $3, $4, 'committed') RETURNING id`,
          [input.from, input.to, input.amount, input.idempotencyKey],
        );
        const transferId = Number((ins.rows[0] as { id: bigint | string }).id);

        await t.query(
          `INSERT INTO outbox (topic, payload) VALUES ($1, $2)`,
          [
            'transfer.committed',
            JSON.stringify({
              transferId,
              from: input.from,
              to: input.to,
              amount: input.amount,
              idempotencyKey: input.idempotencyKey,
            }),
          ],
        );
        await this.#appendEvent(t, `account:${input.from}`, 'debited', {
          transferId,
          amount: input.amount,
        });
        await this.#appendEvent(t, `account:${input.to}`, 'credited', {
          transferId,
          amount: input.amount,
        });

        return { ok: true, transferId, replayed: false };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('idempotency_key') || msg.includes('duplicate key')) {
        // Concurrent winner of the same idempotency key → treat as replay.
        const row = await this.#findIdempotent(input);
        if (row !== null) return { ok: true, transferId: row, replayed: true };
      }
      if (msg.includes('event_log_stream_seq_key') || msg.includes('event_log')) {
        return { ok: false, code: 'conflict' };
      }
      throw e;
    }
  }

  async #findIdempotent(input: TransferInput): Promise<number | null> {
    return this.#db.transaction(async (tx) => {
      const t = tx as Tx;
      await t.query(`SELECT set_config('role', 'sovereign_app', true)`);
      await t.query(`SELECT set_config('app.tenant', $1, true)`, [input.tenant]);
      const res = await t.query<{ id: bigint | string }>(
        `SELECT id FROM transfers WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      const r = res.rows[0];
      return r === undefined ? null : Number(r.id);
    });
  }

  /** Per-stream monotonic seq inside the caller's transaction. O(log n). */
  async #appendEvent(t: Tx, stream: string, type: string, payload: unknown): Promise<void> {
    const res = await t.query<{ next: bigint | string }>(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM event_log WHERE stream = $1`,
      [stream],
    );
    await t.query(
      `INSERT INTO event_log (stream, seq, type, payload) VALUES ($1, $2, $3, $4)`,
      [stream, Number((res.rows[0] as { next: bigint | string }).next), type, JSON.stringify(payload)],
    );
  }

  async outboxPending(limit: number): Promise<OutboxRow[]> {
    const res = await this.#db.query<{ id: bigint | string; topic: string; payload: string }>(
      `SELECT id, topic, payload FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({ id: Number(r.id), topic: r.topic, payload: r.payload }));
  }

  async outboxMarkSent(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.#db.query(`UPDATE outbox SET sent_at = now() WHERE id = ANY($1::bigint[])`, [ids]);
  }

  async eventsSince(afterId: number, limit: number): Promise<EventRow[]> {
    const res = await this.#db.query<{
      id: bigint | string;
      stream: string;
      seq: bigint | string;
      type: string;
      payload: string;
    }>(`SELECT id, stream, seq, type, payload FROM event_log WHERE id > $1 ORDER BY id LIMIT $2`, [
      afterId,
      limit,
    ]);
    return res.rows.map((r) => ({
      id: Number(r.id),
      stream: r.stream,
      seq: Number(r.seq),
      type: r.type,
      payload: r.payload,
    }));
  }

  /** Append one replicated CRDT op + outbox row atomically. O(op size). */
  async appendOp(tenant: string, opJson: string): Promise<number> {
    return this.#db.transaction(async (tx) => {
      const t = tx as Tx;
      await t.query(`SELECT set_config('role', 'sovereign_app', true)`);
      await t.query(`SELECT set_config('app.tenant', $1, true)`, [tenant]);
      const ins = await t.query<{ id: bigint | string }>(
        `INSERT INTO crdt_ops (op) VALUES ($1) RETURNING id`,
        [opJson],
      );
      const id = Number((ins.rows[0] as { id: bigint | string }).id);
      await t.query(`INSERT INTO outbox (topic, payload) VALUES ('op.received', $1)`, [
        JSON.stringify({ opId: id, tenant }),
      ]);
      return id;
    });
  }

  async close(): Promise<void> {
    await this.#db.close();
  }
}
