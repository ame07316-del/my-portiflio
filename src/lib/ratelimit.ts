/**
 * Rate limiting.
 *
 * Two layers:
 *  1. an in-memory sliding window — free, but per function instance;
 *  2. the `throttle` table (Postgres) — shared by every instance, which is the
 *     one that actually matters on serverless hosting.
 *
 * `checkRateLimit` is the hot path and never touches the database;
 * `checkRateLimitShared` uses both and is meant for the few sensitive routes
 * (admin sign-in, magic link, contact form).
 */
import { query, queryOne } from "@/lib/db";

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

/** Forget a bucket — call it after a successful login so the budget resets. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Shared (multi-instance) budget. Fails **open** if the database is not
 * reachable: the in-memory layer still applies, and a broken DB must never
 * lock the owner out of their own dashboard.
 */
export async function checkRateLimitShared(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const local = checkRateLimit(key, max, windowMs);
  if (!local.ok) return local;

  try {
    const row = await queryOne<{ hits: number; window_start: string }>(
      `INSERT INTO throttle (key, window_start, hits)
       VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE
                  WHEN throttle.window_start < now() - ($2::int * interval '1 millisecond')
                    THEN 1
                  ELSE throttle.hits + 1
                END,
         window_start = CASE
                  WHEN throttle.window_start < now() - ($2::int * interval '1 millisecond')
                    THEN now()
                  ELSE throttle.window_start
                END
       RETURNING hits, window_start`,
      [key, Math.round(windowMs)],
    );
    const hits = Number(row?.hits ?? 1);
    if (hits > max) {
      const openedAt = row?.window_start
        ? new Date(row.window_start).getTime()
        : Date.now();
      return {
        ok: false,
        retryAfterMs: Math.max(1000, windowMs - (Date.now() - openedAt)),
      };
    }
    // Opportunistic janitor (~1 in 50 requests) keeps the table tiny.
    if (Math.random() < 0.02) {
      await query(
        `DELETE FROM throttle WHERE window_start < now() - interval '1 day'`,
      ).catch(() => undefined);
    }
    return { ok: true, retryAfterMs: 0 };
  } catch {
    return { ok: true, retryAfterMs: 0 };
  }
}

/** Release a shared budget after a success (e.g. a correct password). */
export async function clearRateLimitShared(key: string) {
  buckets.delete(key);
  await query("DELETE FROM throttle WHERE key = $1", [key]).catch(
    () => undefined,
  );
}

/** First public IP from the proxy chain (Vercel sets x-forwarded-for). */
export function clientIp(h?: Headers): string {
  const fwd = h?.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || "unknown";
}
