/**
 * transport/udp-gateway.ts — connectionless edge gateway (Phase 2 core).
 *
 * Why UDP at the edge (with QUIC-style discipline, no QUIC dependency):
 *  - no accept/handshake storms: every datagram is independently admissible;
 *  - head-of-line blocking is impossible;
 *  - shedding is a branch, not an exception path.
 * (In production the independent server may terminate real QUIC at a proxy;
 * the admission/queue machinery below is transport-agnostic by design.)
 *
 * Zero-copy discipline: Node's dgram hands us ONE buffer per datagram (the
 * unavoidable kernel→userspace copy); everything after that is subarray
 * VIEWS — no re-copies, no slicing, no intermediate strings on the hot path.
 *
 * Admission pipeline per datagram, all O(1):
 *   magic check → per-client token bucket → bounded queue (drop when full)
 * and a single drain loop applies backpressure: while the handler is busy
 * the queue simply fills and then sheds.
 *
 * Wire format: [0xA7 magic u8][seq u32 LE][payload…]
 *
 * @complexity per datagram: Time O(1) admission + O(payload) handler.
 * @complexity space: O(maxClients buckets + queueCapacity) — hard capped.
 */
import dgram from 'node:dgram';
import { LruCache } from '../../../web/src/core/lru.js';
import { BoundedQueue } from './bounded-queue.js';
import { TokenBucket } from './token-bucket.js';

export const GATEWAY_MAGIC = 0xa7;

export interface IngestedDatagram {
  /** Client identity (ip:port) — stable enough for admission bucketing. */
  readonly key: string;
  readonly seq: number;
  /** VIEW into the received buffer — do not retain past processing. */
  readonly payload: Buffer;
  readonly rinfo: dgram.RemoteInfo;
  readonly receivedAt: number;
}

export interface GatewayMetrics {
  received: number;
  shed: number;
  rateLimited: number;
  malformed: number;
  processed: number;
}

export interface GatewayConfig {
  host: string;
  port: number;
  perClientRate: number;
  perClientBurst: number;
  maxClients: number;
  queueCapacity: number; // power of two
  handler: (msg: IngestedDatagram) => void | Promise<void>;
  now?: () => number;
}

export class UdpGateway {
  readonly #cfg: GatewayConfig;
  readonly #queue: BoundedQueue<IngestedDatagram>;
  readonly #buckets: LruCache<string, TokenBucket>;
  readonly #socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  readonly #metrics: GatewayMetrics = {
    received: 0,
    shed: 0,
    rateLimited: 0,
    malformed: 0,
    processed: 0,
  };
  #busy = false;
  #pumpScheduled = false;
  #running = false;
  readonly #now: () => number;

  constructor(cfg: GatewayConfig) {
    this.#cfg = cfg;
    this.#queue = new BoundedQueue<IngestedDatagram>(cfg.queueCapacity);
    this.#buckets = new LruCache<string, TokenBucket>(Math.max(1, cfg.maxClients));
    this.#now = cfg.now ?? (() => performance.now());
  }

  get metrics(): GatewayMetrics {
    return { ...this.#metrics };
  }

  get queueDepth(): number {
    return this.#queue.size;
  }

  get queueDropped(): number {
    return this.#queue.dropped;
  }

  /** Answer a client datagram (server→client direction). O(payload). */
  reply(payload: Buffer, to: dgram.RemoteInfo, seq: number): void {
    const out = Buffer.allocUnsafe(5 + payload.byteLength);
    out[0] = GATEWAY_MAGIC;
    out.writeUInt32LE(seq, 1);
    payload.copy(out, 5);
    this.#socket.send(out, to.port, to.address);
  }

  get boundPort(): number {
    return this.#socket.address().port;
  }

  /** Bind and start admitting. @complexity O(1) + OS bind latency. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (e: Error): void => reject(e);
      this.#socket.once('error', onError);
      this.#socket.bind(this.#cfg.port, this.#cfg.host, () => {
        this.#socket.removeListener('error', onError);
        this.#running = true;
        this.#socket.on('message', (msg, rinfo) => this.#admit(msg, rinfo));
        resolve();
      });
    });
  }

  /** Close the socket and stop the pump. @complexity O(1). */
  stop(): Promise<void> {
    this.#running = false;
    return new Promise((resolve) => this.#socket.close(() => resolve()));
  }

  /** O(1) admission: magic → bucket → queue. Never throws on hot path. */
  #admit(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    this.#metrics.received++;
    if (msg.byteLength < 5 || msg[0] !== GATEWAY_MAGIC) {
      this.#metrics.malformed++;
      return; // drop — authentication of shape before anything else
    }
    const key = `${rinfo.address}:${rinfo.port}`;
    let bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      bucket = new TokenBucket(this.#cfg.perClientRate, this.#cfg.perClientBurst, this.#now);
      this.#buckets.set(key, bucket);
    }
    if (!bucket.tryConsume(1)) {
      this.#metrics.rateLimited++;
      return;
    }
    const seq = msg.readUInt32LE(1);
    const ok = this.#queue.push({
      key,
      seq,
      payload: msg.subarray(5), // view, not copy — zero-copy discipline
      rinfo,
      receivedAt: this.#now(),
    });
    if (!ok) this.#metrics.shed++;
    this.#schedulePump();
  }

  /**
   * Single drain loop. Backpressure emerges naturally: while the handler
   * runs, nothing else is drained; the queue fills; excess is shed at the
   * door. @complexity amortized O(1) per item (+ handler cost).
   */
  #schedulePump(): void {
    if (this.#pumpScheduled || !this.#running) return;
    this.#pumpScheduled = true;
    setImmediate(() => {
      this.#pumpScheduled = false;
      void this.#pump();
    });
  }

  async #pump(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      for (;;) {
        const item = this.#queue.pop();
        if (item === undefined) break;
        await this.#cfg.handler(item);
        this.#metrics.processed++;
      }
    } finally {
      this.#busy = false;
      if (this.#queue.size > 0) this.#schedulePump();
    }
  }
}
