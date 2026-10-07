/**
 * worker/sync-adapter.ts — the seam between the optimistic local CRDT and
 * the (future) replication server.
 *
 * Phase 1 ships `MockSyncAdapter`: configurable latency + failure rate, so
 * the optimistic-UI commit/rollback paths are exercised for real. Phase 2
 * replaces it with the QUIC gateway client WITHOUT touching the worker core —
 * the interface is the contract.
 *
 * @complexity commit: Time O(1) local work + network latency (external).
 */

import type { LwwOp } from '../core/crdt.js';

export interface CommitResult {
  readonly ok: boolean;
  readonly code?: 'conflict' | 'unavailable' | 'invalid';
}

export interface SyncAdapter {
  commit(op: LwwOp): Promise<CommitResult>;
}

/** Deterministic PRNG (mulberry32) so failure behaviour is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Real HTTP adapter (used when the page defines a sync endpoint): posts each
 * CRDT op to the server's /ops sink. Failures surface as 'unavailable' and
 * the worker's rollback machinery handles the rest — the UI never blocks.
 *
 * @complexity O(op size) + one RTT; bounded by AbortSignal timeout.
 */
export class HttpSyncAdapter implements SyncAdapter {
  constructor(
    private readonly url: string,
    private readonly tenant: string,
    private readonly timeoutMs = 5000,
  ) {}

  async commit(op: LwwOp): Promise<CommitResult> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant: this.tenant, op }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        return { ok: false, code: res.status >= 500 ? 'unavailable' : 'invalid' };
      }
      return { ok: true };
    } catch {
      return { ok: false, code: 'unavailable' };
    }
  }
}

export class MockSyncAdapter implements SyncAdapter {
  readonly #rand: () => number;

  constructor(
    private readonly opts: { minLatencyMs: number; maxLatencyMs: number; failRate: number; seed?: number } = {
      minLatencyMs: 350,
      maxLatencyMs: 900,
      failRate: 0.15,
      seed: 0xc0ffee,
    },
  ) {
    this.#rand = mulberry32(this.opts.seed ?? 1);
  }

  /** Simulated round-trip. @complexity O(1) + latency. */
  commit(_op: LwwOp): Promise<CommitResult> {
    const r = this.#rand;
    const latency = this.opts.minLatencyMs + r() * (this.opts.maxLatencyMs - this.opts.minLatencyMs);
    const fail = r() < this.opts.failRate;
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(fail ? { ok: false, code: 'conflict' } : { ok: true });
      }, latency);
    });
  }
}
