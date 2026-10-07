/**
 * ports/store.ts — the Hexagonal seams (Phase 4).
 *
 * The domain speaks ONLY these interfaces. Adapters (PGlite for tests and
 * local runs, real PostgreSQL behind a pooler for production, ScyllaDB for
 * hot reads) plug in at the composition root and are swappable without a
 * single line of domain code changing. This is the Dependency Inversion
 * boundary made literal.
 */

export interface AccountRow {
  readonly balance: number;
  readonly version: number;
}

export type TransferCode = 'insufficient_funds' | 'conflict' | 'not_found' | 'invalid';

export type TransferResult =
  | { readonly ok: true; readonly transferId: number; readonly replayed: boolean }
  | { readonly ok: false; readonly code: TransferCode };

export interface TransferInput {
  readonly tenant: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
  /** Encrypted-grade idempotency key (see security/idempotency). */
  readonly idempotencyKey: string;
}

export interface OutboxRow {
  readonly id: number;
  readonly topic: string;
  readonly payload: string;
}

export interface EventRow {
  readonly id: number;
  readonly stream: string;
  readonly seq: number;
  readonly type: string;
  readonly payload: string;
}

/** Write-side port (PostgreSQL). Prepared-statement discipline enforced by adapters. */
export interface LedgerStore {
  init(): Promise<void>;
  createAccount(tenant: string, id: string, opening: number): Promise<void>;
  getAccount(tenant: string, id: string): Promise<AccountRow | null>;
  /** ONE optimistic attempt: version-checked debits/credits + outbox + event. */
  attemptTransfer(input: TransferInput): Promise<TransferResult>;
  outboxPending(limit: number): Promise<OutboxRow[]>;
  outboxMarkSent(ids: number[]): Promise<void>;
  eventsSince(afterId: number, limit: number): Promise<EventRow[]>;
  /** Persist one replicated CRDT op (server-side sync sink). */
  appendOp(tenant: string, opJson: string): Promise<number>;
  /** Read persisted ops after a cursor (replication catch-up). */
  opsSince(tenant: string, afterId: number, limit: number): Promise<Array<{ id: number; op: string }>>;
  close(): Promise<void>;
}

/** Read-side port (the "Scylla slot": any low-latency key/value reader). */
export interface ReadStore<V> {
  get(key: string): Promise<V | undefined>;
  put(key: string, value: V): Promise<void>;
  delete(key: string): Promise<void>;
}
