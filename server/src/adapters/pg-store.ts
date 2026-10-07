import pg from 'pg';
import type { AccountRow, EventRow, LedgerStore, OutboxRow, TransferInput, TransferResult } from '../ports/store.js';
import { SCHEMA_SQL } from './pglite-store.js';
interface TxClient { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>; }

/**
 * node-postgres speaks the EXTENDED protocol: one statement per query.
 * (PGlite.exec batches, which is why the shared schema string runs as one
 * statement on the embedded engine and must be split for real Postgres.)
 * Splits on top-level semicolons only — the $$-quoted DO block is opaque.
 */
export function splitSchemaStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql.charAt(i);
    if (ch === '$' && sql.charAt(i + 1) === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i += 1;
      continue;
    }
    if (ch === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}
export class PgStore implements LedgerStore {
  readonly #pool: pg.Pool;
  #listener: pg.Client | null = null;
  constructor(url: string, poolMax = Number(process.env.DATABASE_POOL_MAX ?? 5)) {
    const parsed = new URL(url);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    const sslmode = parsed.searchParams.get('sslmode');
    if (!isLocal) {
      if (sslmode === 'disable') throw new Error('refusing plaintext connection to a remote host');
      if (sslmode === 'no-verify') throw new Error('sslmode=no-verify is rejected (hostname must verify)');
    }
    this.#pool = new pg.Pool({
      connectionString: url,
      max: Math.max(1, Math.min(20, poolMax)),
      ssl: isLocal && sslmode === 'disable' ? undefined : { rejectUnauthorized: true },
      idleTimeoutMillis: 10_000,
    });
  }
  async init(): Promise<void> {
    for (const statement of splitSchemaStatements(SCHEMA_SQL)) {
      await this.#pool.query(statement);
    }
  }
  async #scopedTx<T>(tenant: string, fn: (c: TxClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('role', 'sovereign_app', true)`);
      await client.query(`SELECT set_config('app.tenant', $1, true)`, [tenant]);
      const out = await fn(client as unknown as TxClient);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
  }
  async createAccount(tenant: string, id: string, opening: number): Promise<void> {
    if (!Number.isInteger(opening) || opening < 0) throw new RangeError('opening must be integer cents >= 0');
    await this.#scopedTx(tenant, (c) => c.query(
      `INSERT INTO accounts (id, balance, version) VALUES ($1, $2, 0)
       ON CONFLICT (tenant, id) DO UPDATE SET balance = accounts.balance`, [id, opening]).then(() => undefined));
  }
  async getAccount(tenant: string, id: string): Promise<AccountRow | null> {
    return this.#scopedTx(tenant, async (c) => {
      const res = await c.query<{ balance: string; version: string }>(`SELECT balance, version FROM accounts WHERE id = $1`, [id]);
      const row = res.rows[0];
      if (row === undefined) return null;
      return { balance: Number(row.balance), version: Number(row.version) };
    });
  }
  async attemptTransfer(input: TransferInput): Promise<TransferResult> {
    try {
      return await this.#scopedTx(input.tenant, async (c) => {
        const dup = await c.query<{ id: string }>(`SELECT id FROM transfers WHERE idempotency_key = $1`, [input.idempotencyKey]);
        if (dup.rows[0] !== undefined) return { ok: true, transferId: Number(dup.rows[0].id), replayed: true };
        const fromRes = await c.query<{ balance: string; version: string }>(`SELECT balance, version FROM accounts WHERE id = $1`, [input.from]);
        const toRes = await c.query<{ version: string }>(`SELECT version FROM accounts WHERE id = $1`, [input.to]);
        const from = fromRes.rows[0]; const to = toRes.rows[0];
        if (from === undefined || to === undefined) return { ok: false, code: 'not_found' as const };
        if (Number(from.balance) < input.amount) return { ok: false, code: 'insufficient_funds' as const };
        const debit = await c.query(`UPDATE accounts SET balance = balance - $1, version = version + 1 WHERE id = $2 AND version = $3`, [input.amount, input.from, Number(from.version)]);
        if ((debit.rowCount ?? 0) === 0) return { ok: false, code: 'conflict' as const };
        const credit = await c.query(`UPDATE accounts SET balance = balance + $1, version = version + 1 WHERE id = $2 AND version = $3`, [input.amount, input.to, Number(to.version)]);
        if ((credit.rowCount ?? 0) === 0) return { ok: false, code: 'conflict' as const };
        const ins = await c.query<{ id: string }>(`INSERT INTO transfers (from_id, to_id, amount, idempotency_key, status) VALUES ($1, $2, $3, $4, 'committed') RETURNING id`, [input.from, input.to, input.amount, input.idempotencyKey]);
        const transferId = Number(ins.rows[0]!.id);
        await c.query(`INSERT INTO outbox (topic, payload) VALUES ($1, $2)`, ['transfer.committed', JSON.stringify({ transferId, from: input.from, to: input.to, amount: input.amount })]);
        await this.#appendEvent(c, `account:${input.from}`, 'debited', { transferId, amount: input.amount });
        await this.#appendEvent(c, `account:${input.to}`, 'credited', { transferId, amount: input.amount });
        return { ok: true, transferId, replayed: false };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate key') && msg.includes('idempotency_key')) return this.#findIdempotent(input);
      if (msg.includes('event_log_stream_seq_key')) return { ok: false, code: 'conflict' };
      throw e;
    }
  }
  async #findIdempotent(input: TransferInput): Promise<TransferResult> {
    return this.#scopedTx(input.tenant, async (c) => {
      const res = await c.query<{ id: string }>(`SELECT id FROM transfers WHERE idempotency_key = $1`, [input.idempotencyKey]);
      const r = res.rows[0];
      if (r === undefined) return { ok: false, code: 'conflict' as const };
      return { ok: true, transferId: Number(r.id), replayed: true };
    });
  }
  async #appendEvent(c: TxClient, stream: string, type: string, payload: unknown): Promise<void> {
    const res = await c.query<{ next: string }>(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM event_log WHERE stream = $1`, [stream]);
    await c.query(`INSERT INTO event_log (stream, seq, type, payload) VALUES ($1, $2, $3, $4)`, [stream, Number(res.rows[0]!.next), type, JSON.stringify(payload)]);
  }
  async outboxPending(limit: number): Promise<OutboxRow[]> {
    const res = await this.#pool.query<{ id: string; topic: string; payload: string }>(`SELECT id, topic, payload FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT $1`, [limit]);
    return res.rows.map((r: { id: string; topic: string; payload: string }) => ({ id: Number(r.id), topic: r.topic, payload: r.payload }));
  }
  async outboxMarkSent(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.#pool.query(`UPDATE outbox SET sent_at = now() WHERE id = ANY($1::bigint[])`, [ids]);
  }
  async eventsSince(afterId: number, limit: number): Promise<EventRow[]> {
    const res = await this.#pool.query<{ id: string; stream: string; seq: string; type: string; payload: string }>(`SELECT id, stream, seq, type, payload FROM event_log WHERE id > $1 ORDER BY id LIMIT $2`, [afterId, limit]);
    return res.rows.map((r: { id: string; stream: string; seq: string; type: string; payload: string }) => ({ id: Number(r.id), stream: r.stream, seq: Number(r.seq), type: r.type, payload: r.payload }));
  }
  async appendOp(tenant: string, opJson: string): Promise<number> {
    return this.#scopedTx(tenant, async (c) => {
      const ins = await c.query<{ id: string }>(`INSERT INTO crdt_ops (op) VALUES ($1) RETURNING id`, [opJson]);
      const id = Number(ins.rows[0]!.id);
      await c.query(`INSERT INTO outbox (topic, payload) VALUES ('op.received', $1)`, [JSON.stringify({ opId: id, tenant })]);
      return id;
    });
  }
  async opsSince(tenant: string, afterId: number, limit: number): Promise<Array<{ id: number; op: string }>> {
    return this.#scopedTx(tenant, async (c) => {
      const res = await c.query<{ id: string; op: string }>(`SELECT id, op FROM crdt_ops WHERE id > $1 ORDER BY id LIMIT $2`, [afterId, limit]);
      return res.rows.map((r) => ({ id: Number(r.id), op: r.op }));
    });
  }
  async listen(channel: string, onNotification: (payload: string) => void): Promise<void> {
    const warm = await this.#pool.connect(); warm.release();
    this.#listener = new pg.Client({ connectionString: this.#pool.options.connectionString ?? undefined });
    await this.#listener.connect();
    await this.#listener.query(`LISTEN ${channel.replace(/[^a-z0-9_]/gi, '')}`);
    this.#listener.on('notification', (n: { payload?: string }) => { if (n.payload !== undefined) onNotification(n.payload); });
  }
  async notify(channel: string, payload: unknown): Promise<void> {
    const text = JSON.stringify(payload);
    if (text.length > 7500) return;
    await this.#pool.query(`SELECT pg_notify($1, $2)`, [channel, text]);
  }
  async close(): Promise<void> {
    await this.#listener?.end().catch(() => {});
    await this.#pool.end();
  }
}
