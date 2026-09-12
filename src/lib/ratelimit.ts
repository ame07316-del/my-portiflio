/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * On serverless (Vercel) memory is per function instance, so this is a
 * best-effort throttle: it slows brute-force / spam bursts on any given
 * instance without needing external storage.
 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  /** When !ok — how long the caller should wait (ms). */
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    return {
      ok: false,
      retryAfterMs: Math.max(1000, windowMs - (now - hits[0])),
    };
  }
  hits.push(now);
  // Keep the map bounded on long-lived instances.
  if (buckets.size > 4096) {
    for (const [k, arr] of buckets) if (!arr.length) buckets.delete(k);
  }
  buckets.set(key, hits);
  return { ok: true, retryAfterMs: 0 };
}

/** First public IP from the proxy chain (Vercel sets x-forwarded-for). */
export function clientIp(h?: Headers): string {
  const fwd = h?.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || "unknown";
}
