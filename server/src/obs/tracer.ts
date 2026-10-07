/**
 * obs/tracer.ts — zero-overhead tracing (Phase 6).
 *
 * The sampling decision happens ONCE at trace creation using a deterministic
 * hash of the trace id — unsampled traces cost a single 32-bit compare and
 * allocate NOTHING (null span). Sampled spans write into a BOUNDED ring:
 * under telemetry storms the oldest spans are shed, never the heap.
 *
 * This is the OpenTelemetry pattern without the SDK weight.
 *
 * @complexity startSpan: Time O(len traceId) hash + O(1) decision;
 * finish: O(1) ring write. Space O(capacity) fixed.
 */

export interface Span {
  readonly traceId: string;
  readonly name: string;
  readonly startedAt: number;
  finish(status?: 'ok' | 'error'): void;
}

export interface FinishedSpan {
  readonly traceId: string;
  readonly name: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'error';
}

/** FNV-1a 32 (server twin of the WASM kernel). O(len). */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const NOOP_SPAN: Span = {
  traceId: '',
  name: '',
  startedAt: 0,
  finish: () => {},
};

export class Tracer {
  readonly #buffer: FinishedSpan[];
  #head = 0;
  #count = 0;
  sampled = 0;
  unsampled = 0;

  /**
   * @param sampleRate 0..1 — fraction of traces recorded.
   * @param capacity bounded span ring (oldest shed on overflow).
   */
  constructor(
    readonly sampleRate: number,
    capacity: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (sampleRate < 0 || sampleRate > 1) throw new RangeError('sampleRate must be in [0,1]');
    if (capacity < 1) throw new RangeError('capacity must be >= 1');
    this.#buffer = new Array<FinishedSpan>(capacity);
  }

  /**
   * Deterministic sampling: the SAME trace id always gets the SAME verdict
   * across processes — distributed traces stay whole or stay absent.
   * @complexity O(len traceId).
   */
  shouldSample(traceId: string): boolean {
    if (this.sampleRate >= 1) return true;
    if (this.sampleRate <= 0) return false;
    return fnv1a32(traceId) / 0x100000000 < this.sampleRate;
  }

  startSpan(name: string, traceId: string): Span {
    if (!this.shouldSample(traceId)) {
      this.unsampled++;
      return NOOP_SPAN; // zero allocation for the 1−p majority
    }
    this.sampled++;
    const startedAt = this.now();
    return {
      traceId,
      name,
      startedAt,
      finish: (status = 'ok') => {
        this.#push({ traceId, name, durationMs: this.now() - startedAt, status });
      },
    };
  }

  /** O(1) bounded write; overwrites oldest when full (shedding). */
  #push(span: FinishedSpan): void {
    const cap = this.#buffer.length;
    if (this.#count === cap) this.#head = (this.#head + 1) % cap;
    else this.#count++;
    const idx = (this.#head + this.#count - 1) % cap;
    this.#buffer[idx] = span;
  }

  /** Drain recorded spans oldest→newest and reset. O(count). */
  drain(): FinishedSpan[] {
    const out: FinishedSpan[] = new Array(this.#count);
    for (let i = 0; i < this.#count; i++) {
      out[i] = this.#buffer[(this.#head + i) % this.#buffer.length] as FinishedSpan;
    }
    this.#head = 0;
    this.#count = 0;
    return out;
  }

  get buffered(): number {
    return this.#count;
  }
}
