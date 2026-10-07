/**
 * core/lru.ts — bounded LRU cache built directly on Map insertion order.
 *
 * V8 keeps Map entries in a hash table + insertion list, so re-keying an
 * entry (delete → set) is amortized O(1) with zero auxiliary structures:
 * no doubly-linked list nodes to allocate, nothing for the GC to chase.
 *
 * @complexity get/set/has/delete: Time O(1) amortized, Space O(capacity).
 */
export class LruCache<K, V> {
  readonly #map = new Map<K, V>();
  readonly #capacity: number;
  readonly #onEvict?: (key: K, value: V) => void;

  constructor(capacity: number, onEvict?: (key: K, value: V) => void) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('LruCache capacity must be an integer >= 1');
    }
    this.#capacity = capacity;
    this.#onEvict = onEvict;
  }

  get size(): number {
    return this.#map.size;
  }

  get capacity(): number {
    return this.#capacity;
  }

  /** O(1) amortized: hit re-inserts the key to refresh recency. */
  get(key: K): V | undefined {
    const v = this.#map.get(key);
    if (v === undefined) return undefined;
    this.#map.delete(key);
    this.#map.set(key, v);
    return v;
  }

  /** O(1) amortized; evicts the least-recently-used entry when over capacity. */
  set(key: K, value: V): void {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#capacity) {
      const oldest = this.#map.keys().next();
      if (!oldest.done) {
        const k = oldest.value;
        const v = this.#map.get(k) as V;
        this.#map.delete(k);
        this.#onEvict?.(k, v);
      }
    }
  }

  has(key: K): boolean {
    return this.#map.has(key); // does NOT touch recency — O(1)
  }

  delete(key: K): boolean {
    return this.#map.delete(key);
  }

  clear(): void {
    this.#map.clear();
  }

  /** Iteration is O(size), oldest → newest. */
  *entries(): IterableIterator<[K, V]> {
    yield* this.#map.entries();
  }
}
