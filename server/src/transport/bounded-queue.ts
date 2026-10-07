/**
 * transport/bounded-queue.ts — fixed-capacity FIFO with O(1) load shedding.
 *
 * Server-side sibling of the client's SPSC ring. Node's event loop is
 * single-threaded, so no atomics are needed — but the discipline is
 * identical: the queue NEVER grows past capacity; excess work is dropped
 * at the door in O(1) instead of ballooning the heap (backpressure by
 * construction — this is what keeps one process upright at 1M+ clients).
 *
 * Slots hold object references; cleared on pop so the GC can reclaim.
 *
 * @complexity push/pop/peek: Time O(1), Space O(capacity) fixed forever.
 */
export class BoundedQueue<T> {
  readonly #slots: Array<T | undefined>;
  readonly #mask: number;
  #head = 0;
  #tail = 0;
  #size = 0;
  /** Count of items dropped because the queue was full (load-shedding meter). */
  dropped = 0;

  constructor(capacity: number) {
    if (capacity < 2 || (capacity & (capacity - 1)) !== 0) {
      throw new RangeError('capacity must be a power of two >= 2');
    }
    this.#slots = new Array<T | undefined>(capacity);
    this.#mask = capacity - 1;
  }

  get size(): number {
    return this.#size;
  }

  get capacity(): number {
    return this.#slots.length - 1; // one slot sacrificed for full/empty disambiguation
  }

  get isFull(): boolean {
    return this.#size === this.#slots.length - 1;
  }

  /** Push or shed. @complexity O(1). */
  push(item: T): boolean {
    if (this.isFull) {
      this.dropped++;
      return false;
    }
    this.#slots[this.#tail] = item;
    this.#tail = (this.#tail + 1) & this.#mask;
    this.#size++;
    return true;
  }

  /** Pop or undefined. @complexity O(1) + releases the slot for GC. */
  pop(): T | undefined {
    if (this.#size === 0) return undefined;
    const item = this.#slots[this.#head];
    this.#slots[this.#head] = undefined; // no retained memory (Phase 4)
    this.#head = (this.#head + 1) & this.#mask;
    this.#size--;
    return item;
  }

  peek(): T | undefined {
    return this.#size === 0 ? undefined : this.#slots[this.#head];
  }
}
