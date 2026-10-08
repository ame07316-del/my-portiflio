import { createHash, randomBytes } from 'node:crypto';
import { LruCache } from '../../../web/src/core/lru.js';
import { ctEqual } from './envelope.js';

export interface AuthSubject { readonly id: string; readonly role: string; readonly verified: boolean; }
interface SessionRecord { readonly subject: AuthSubject; readonly expiresAt: number; }
export interface AuthConfig { readonly adminSecret: string; readonly ttlMs?: number; readonly maxSessions?: number; readonly now?: () => number; }
export class AuthService {
  readonly #adminSecret: string; readonly #ttlMs: number;
  readonly #sessions: LruCache<string, SessionRecord>; readonly #now: () => number;
  constructor(cfg: AuthConfig) {
    if (cfg.adminSecret.length < 32) throw new RangeError('ADMIN_SECRET must be >= 32 characters — refusing to boot insecure');
    this.#adminSecret = cfg.adminSecret;
    this.#ttlMs = cfg.ttlMs ?? 12 * 3600 * 1000;
    this.#sessions = new LruCache<string, SessionRecord>(cfg.maxSessions ?? 64);
    this.#now = cfg.now ?? Date.now;
  }
  login(presentedSecret: string): { token: string; expiresAt: number } | null {
    if (!ctEqual(Buffer.from(this.#adminSecret, 'utf8'), Buffer.from(presentedSecret, 'utf8'))) return null;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.#now() + this.#ttlMs;
    this.#sessions.set(this.#hash(token), { subject: { id: 'admin', role: 'admin', verified: true }, expiresAt });
    return { token, expiresAt };
  }
  verify(token: string): AuthSubject | null {
    if (token.length === 0 || token.length > 256) return null;
    const rec = this.#sessions.get(this.#hash(token));
    if (rec === undefined) return null;
    if (rec.expiresAt <= this.#now()) { this.logout(token); return null; }
    return rec.subject;
  }
  logout(token: string): void { this.#sessions.delete(this.#hash(token)); }
  get activeSessions(): number { return this.#sessions.size; }
  #hash(token: string): string { return createHash('sha256').update(token).digest('base64url'); }
}
export function bearerToken(header: string | undefined): string | null {
  if (header === undefined || !header.startsWith('Bearer ')) return null;
  const tok = header.slice(7).trim();
  return tok.length > 0 ? tok : null;
}
