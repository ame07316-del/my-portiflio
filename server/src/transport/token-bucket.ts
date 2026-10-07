/**
 * transport/token-bucket.ts — admission control primitive.
 *
 * Lazy refill: tokens are recomputed ONLY when someone asks to consume, so
 * an idle bucket costs zero CPU — critical when millions of client buckets
 * exist but only a fraction are active (C10M regime).
 *
 * @complexity tryConsume: Time O(1), Space O(1) per bucket.
 */
export class TokenBucket {
  #tokens: number;
  #lastRefill: number;

  constructor(
    /** Sustained refill rate, tokens per second. */
    readonly ratePerSec: number,
    /** Maximum burst size (bucket capacity). */
    readonly burst: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (ratePerSec <= 0 || burst < 1) throw new RangeError('invalid bucket parameters');
    this.#tokens = burst;
    this.#lastRefill = now();
  }

  /**
   * Consume `n` tokens or reject instantly. Never blocks — rejection is the
   * load-shedding signal. @complexity O(1).
   */
  tryConsume(n = 1): boolean {
    const t = this.now();
    const elapsedSec = Math.max(0, t - this.#lastRefill) / 1000;
    this.#lastRefill = t;
    this.#tokens = Math.min(this.burst, this.#tokens + elapsedSec * this.ratePerSec);
    if (this.#tokens < n) return false;
    this.#tokens -= n;
    return true;
  }

  get tokens(): number {
    return this.#tokens;
  }
}
