import { LruCache } from '../../../web/src/core/lru.js';
import { TokenBucket } from '../transport/token-bucket.js';
export class HttpGuard {
  readonly #general: LruCache<string, TokenBucket>;
  readonly #login: LruCache<string, TokenBucket>;
  deniedGeneral = 0;
  deniedLogin = 0;
  constructor(maxTrackedIps = 16384) {
    this.#general = new LruCache<string, TokenBucket>(maxTrackedIps);
    this.#login = new LruCache<string, TokenBucket>(maxTrackedIps);
  }
  #bucket(cache: LruCache<string, TokenBucket>, ip: string, rate: number, burst: number): TokenBucket {
    let b = cache.get(ip);
    if (b === undefined) { b = new TokenBucket(rate, burst); cache.set(ip, b); }
    return b;
  }
  allow(ip: string): boolean {
    if (this.#bucket(this.#general, ip, 200, 100).tryConsume(1)) return true;
    this.deniedGeneral++; return false;
  }
  allowLogin(ip: string): boolean {
    if (this.#bucket(this.#login, ip, 2 / 60, 5).tryConsume(1)) return true;
    this.deniedLogin++; return false;
  }
}
