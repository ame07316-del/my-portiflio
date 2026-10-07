/**
 * adapters/lru-read-store.ts — the CQRS read side (Phase 3).
 *
 * Per the approved caching decision there is NO external cache tier: reads
 * are served by a bounded in-process LRU keyed like a KV store (the Scylla
 * slot), with stale-while-revalidate on top. Bounded by construction → no
 * unbounded memory growth under key-flooding (anti-OOM).
 *
 * @complexity get: Time O(1) cache hit (+ async revalidate tail);
 * Space O(capacity).
 */
import { LruCache } from '../../../web/src/core/lru.js';
import type { ReadStore } from '../ports/store.js';

interface Entry<V> {
  value: V;
  fetchedAt: number;
}

export class LruReadStore<V> implements ReadStore<V> {
  readonly #cache: LruCache<string, Entry<V>>;
  readonly #refreshing = new Set<string>();

  constructor(
    capacity: number,
    private readonly ttlMs: number,
    private readonly fetcher: (key: string) => Promise<V | undefined>,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.#cache = new LruCache<string, Entry<V>>(capacity);
  }

  get size(): number {
    return this.#cache.size;
  }

  /** Raw port write (used by projections). O(1). */
  async put(key: string, value: V): Promise<void> {
    this.#cache.set(key, { value, fetchedAt: this.now() });
  }

  async delete(key: string): Promise<void> {
    this.#cache.delete(key);
  }

  /** Raw port read without fetcher. O(1). */
  async get(key: string): Promise<V | undefined> {
    return this.peek(key);
  }

  /**
   * SWR read: fresh → return; stale → return stale AND revalidate in the
   * background; absent → blocking fetch. Revalidation for a key already in
   * flight is coalesced (Set guard) — no cache stampede.
   * @complexity O(1) + optional async fetch.
   */
  async read(key: string): Promise<V | undefined> {
    const hit = this.#cache.get(key);
    const t = this.now();
    if (hit !== undefined) {
      if (t - hit.fetchedAt <= this.ttlMs) return hit.value; // fresh
      this.#revalidate(key); // stale → serve now, refresh in background
      return hit.value;
    }
    const v = await this.fetcher(key);
    if (v !== undefined) this.#cache.set(key, { value: v, fetchedAt: t });
    return v;
  }

  #revalidate(key: string): void {
    if (this.#refreshing.has(key)) return;
    this.#refreshing.add(key);
    void this.fetcher(key)
      .then((v) => {
        if (v !== undefined) this.#cache.set(key, { value: v, fetchedAt: this.now() });
        else this.#cache.delete(key);
      })
      .finally(() => {
        this.#refreshing.delete(key);
      });
  }

  /** Direct inspection for tests/projections. O(1). */
  peek(key: string): V | undefined {
    return this.#cache.get(key)?.value;
  }
}

/**
 * Balance read-model projector: folds the event log into per-account
 * balances keyed `balance:{tenant}:{id}`. Pure, replayable, O(events).
 */
export function projectBalanceEvent(
  key: (tenant: string, accountId: string) => string,
  state: Map<string, number>,
  event: { stream: string; type: string; payload: string; tenant: string },
): void {
  // stream format: account:<id>
  const id = event.stream.slice('account:'.length);
  const k = key(event.tenant, id);
  const cur = state.get(k) ?? 0;
  const { amount } = JSON.parse(event.payload) as { amount: number };
  state.set(k, event.type === 'debited' ? cur - amount : cur + amount);
}
