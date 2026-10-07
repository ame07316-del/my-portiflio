/**
 * domain/ledger.ts — the sovereign domain core (Phase 3 + Phase 4).
 *
 * Pure orchestration over the LedgerStore port: Optimistic Concurrency
 * Control with bounded exponential backoff, idempotent replays surfaced as
 * first-class results. No I/O details, no driver imports — the domain stays
 * portable across Postgres versions and deployments.
 *
 * OCC semantics: each account row carries a `version`. An attempt reads
 * versions, then performs version-conditioned UPDATEs; rowCount = 0 means a
 * concurrent writer won the race → attempt returns 'conflict' → we retry
 * with fresh reads. Lost updates are impossible by construction; no locks
 * are held across application code.
 *
 * @complexity executeTransfer: Time O(attempts × (reads+writes)) =
 *   O(retries) SQL round-trips; Space O(1).
 */
import type { LedgerStore, TransferInput, TransferResult } from '../ports/store.js';

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_POLICY: RetryPolicy = { maxAttempts: 5, baseDelayMs: 2 };

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic-ish jitter (no Math.random on the hot path): golden-ratio
 * scramble of the attempt counter. @complexity O(1).
 */
function backoffMs(base: number, attempt: number): number {
  const GOLDEN = 0.6180339887498949;
  const frac = (attempt * GOLDEN) % 1;
  return base * 2 ** attempt * (0.5 + frac);
}

/**
 * Run one transfer to completion (commit, business reject, or exhausted
 * retries). Idempotent replays return {ok:true, replayed:true} with the
 * ORIGINAL transfer id — callers can safely retry on network failure.
 */
export async function executeTransfer(
  store: LedgerStore,
  input: TransferInput,
  policy: RetryPolicy = DEFAULT_POLICY,
): Promise<TransferResult> {
  const sleep = policy.sleep ?? defaultSleep;
  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    const res = await store.attemptTransfer(input);
    if (res.ok || res.code !== 'conflict') return res;
    if (attempt < policy.maxAttempts - 1) await sleep(backoffMs(policy.baseDelayMs, attempt));
  }
  return { ok: false, code: 'conflict' };
}

/** Validate business bounds BEFORE any store round-trip. O(1). */
export function validateTransferInput(input: TransferInput): TransferResult | null {
  if (
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > 1e12 ||
    input.from === input.to ||
    input.from.length === 0 ||
    input.to.length === 0 ||
    input.idempotencyKey.length === 0
  ) {
    return { ok: false, code: 'invalid' };
  }
  return null;
}
