/**
 * security/idempotency.ts — tamper-evident idempotency keys (Phase 3+5).
 *
 * Clients never invent raw keys: a key is HMAC-SHA256(secret, tenant ∥
 * intent ∥ payloadDigest) in base64url. The same logical operation always
 * yields the same key (deterministic retries are safe); a forged or mutated
 * payload yields a DIFFERENT key and is treated as a new operation — it can
 * never hijack another operation's idempotency slot.
 *
 * @complexity Time O(payload) for the digest; Space O(1) beyond output.
 */
import { createHash, createHmac } from 'node:crypto';
import { ctEqual } from './envelope.js';

export class IdempotencyKeyer {
  constructor(private readonly secret: Buffer) {
    if (secret.byteLength < 32) throw new RangeError('idempotency secret must be >= 32 bytes');
  }

  /** Deterministic key for one logical operation. O(payload). */
  issue(tenant: string, intent: string, payload: Buffer): string {
    const digest = createHash('sha256').update(payload).digest();
    return createHmac('sha256', this.secret)
      .update(`${tenant}\u0000${intent}\u0000`)
      .update(digest)
      .digest('base64url');
  }

  /** Constant-time verification of a client-presented key. O(1) after HMAC. */
  verify(tenant: string, intent: string, payload: Buffer, presented: string): boolean {
    const expected = this.issue(tenant, intent, payload);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(presented, 'utf8');
    return ctEqual(a, b);
  }
}
