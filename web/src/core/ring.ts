/**
 * core/ring.ts — single-producer/single-consumer lock-free ring buffer over
 * a SharedArrayBuffer.
 *
 * Design notes (Elite Backend tier):
 * - Head and tail cursors live on SEPARATE 64-byte cache lines (16 int32
 *   slots of padding) so producer stores never invalidate the consumer's
 *   line and vice-versa — no false sharing.
 * - Only `Atomics.load/store` (sequentially consistent) on the cursors;
 *   payload slots are plain reads/writes ordered by those cursor stores.
 * - One slot is deliberately sacrificed to distinguish full from empty,
 *   keeping both operations branch-light and wait-free.
 * - Overflow policy is LOAD SHEDDING: `tryPush` returns false in O(1)
 *   instead of blocking — the producer (telemetry) never stalls the render
 *   path. (The server-side sibling of this queue in Phase 2 applies the
 *   same discipline at 1M+ connections.)
 *
 * @complexity tryPush / tryPop / length: Time O(1), Space O(1).
 * @complexity construction: Space O(capacity) int32 slots.
 */

const HEAD_SLOT = 0;
const TAIL_SLOT = 16; // separate 64B cache line (16 × 4 bytes)
const DATA_OFFSET = 32; // slots

export class SpscRing {
  readonly #view: Int32Array;
  readonly #capacity: number;
  readonly #mask: number;

  private constructor(view: Int32Array, capacity: number) {
    this.#view = view;
    this.#capacity = capacity;
    this.#mask = capacity - 1;
  }

  /**
   * Allocate a fresh ring. `capacity` must be a power of two ≥ 4.
   * Usable slots = capacity − 1 (full/empty disambiguation).
   * @complexity Time O(1), Space O(capacity).
   */
  static withCapacity(capacity: number): SpscRing {
    if (capacity < 4 || (capacity & (capacity - 1)) !== 0) {
      throw new RangeError('capacity must be a power of two >= 4');
    }
    const sab = new SharedArrayBuffer((DATA_OFFSET + capacity) * 4);
    return new SpscRing(new Int32Array(sab), capacity);
  }

  /** Wrap an existing buffer received from another thread. @complexity O(1). */
  static over(sab: SharedArrayBuffer): SpscRing {
    const view = new Int32Array(sab);
    const capacity = view.length - DATA_OFFSET;
    if (capacity < 4 || (capacity & (capacity - 1)) !== 0) {
      throw new RangeError('buffer does not hold a valid power-of-two ring');
    }
    return new SpscRing(view, capacity);
  }

  get buffer(): SharedArrayBuffer {
    return this.#view.buffer as SharedArrayBuffer;
  }

  get capacity(): number {
    return this.#capacity - 1; // usable slots
  }

  /** Wait-free push. Returns false (drops the value) when full. O(1). */
  tryPush(value: number): boolean {
    const v = this.#view;
    const tail = Atomics.load(v, TAIL_SLOT);
    const next = (tail + 1) & this.#mask;
    if (next === Atomics.load(v, HEAD_SLOT)) return false; // full → shed
    v[DATA_OFFSET + tail] = value | 0;
    Atomics.store(v, TAIL_SLOT, next); // publishes the payload write
    return true;
  }

  /** Wait-free pop. Returns undefined when empty. O(1). */
  tryPop(): number | undefined {
    const v = this.#view;
    const head = Atomics.load(v, HEAD_SLOT);
    if (head === Atomics.load(v, TAIL_SLOT)) return undefined; // empty
    const value = v[DATA_OFFSET + head];
    Atomics.store(v, HEAD_SLOT, (head + 1) & this.#mask);
    return value;
  }

  /** Snapshot of the current occupancy. O(1). */
  get length(): number {
    const v = this.#view;
    return (Atomics.load(v, TAIL_SLOT) - Atomics.load(v, HEAD_SLOT)) & this.#mask;
  }
}
