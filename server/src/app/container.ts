/**
 * app/container.ts — the composition root (Phase 4, Hexagonal).
 *
 * The ONLY place in the system where concrete adapters meet abstract ports.
 * Everything is constructor-injected, immutable after wiring, and disposed
 * in reverse order on shutdown — no service locator, no globals, no magic.
 *
 * Phase 7: the zero-trust door (AuthService + HttpGuard), the realtime
 * broadcast hub (SSE), and the store selector — real PostgreSQL via
 * PG_URL, embedded PGlite otherwise. Same one-connection-string swap.
 *
 * @complexity wiring: O(components); startup dominated by DB bootstrap.
 */
import { PgliteStore } from '../adapters/pglite-store.js';
import { PgStore } from '../adapters/pg-store.js';
import { LruReadStore } from '../adapters/lru-read-store.js';
import { executeTransfer, validateTransferInput } from '../domain/ledger.js';
import { OutboxRelay } from '../domain/outbox-relay.js';
import { EventLoopLagProbe, collectHealth, type ComponentProbe, type HealthReport } from '../obs/health.js';
import { RealtimeHub } from '../obs/realtime.js';
import { Tracer } from '../obs/tracer.js';
import type { LedgerStore, TransferInput, TransferResult } from '../ports/store.js';
import { EnvelopeCipher, type Envelope } from '../security/envelope.js';
import { AuthService, type AuthSubject } from '../security/auth.js';
import { HttpGuard } from '../security/http-guard.js';
import { IdempotencyKeyer } from '../security/idempotency.js';
import { PORTFOLIO_POLICIES, evaluate, type AbacRequest } from '../security/abac.js';
import { SessionRegistry } from '../security/sessions.js';
import { UdpGateway, type IngestedDatagram } from '../transport/udp-gateway.js';
import { WorkerPool } from '../transport/worker-pool.js';

/** Default tenant for the portfolio site (bilingual content, Phase 7). */
export const PORTFOLIO_TENANT = 'portfolio';
export type { AuthSubject };

export interface SystemConfig {
  readonly udpPort: number;
  readonly host: string;
  readonly masterSecret: string; // >= 32 chars
  readonly idempotencySecret: string; // >= 32 chars
  readonly adminSecret: string; // >= 32 chars (Phase 7: mandatory admin auth)
  readonly dbDir?: string; // ':memory:' default
  readonly pgUrl?: string; // Phase 7: real PostgreSQL (PG_URL) — set to swap adapters
  readonly sampleRate?: number; // tracing fraction
  readonly poolSize?: number;
}

export interface SovereignSystem {
  readonly store: LedgerStore;
  readonly relay: OutboxRelay;
  readonly readCache: LruReadStore<number>;
  readonly keyer: IdempotencyKeyer;
  readonly cipher: EnvelopeCipher;
  readonly sessions: SessionRegistry;
  readonly tracer: Tracer;
  readonly lag: EventLoopLagProbe;
  readonly pool: WorkerPool;
  readonly gateway: UdpGateway;
  readonly auth: AuthService;
  readonly guard: HttpGuard;
  readonly hub: RealtimeHub;
  /** Single authorized-entry point — ABAC + validation + OCC in one path. */
  transfer(input: TransferInput, subject: AbacRequest['subject']): Promise<TransferResult>;
  seal(data: string, aad?: string): Envelope;
  open(env: Envelope, aad?: string): string;
  health(): HealthReport;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createSystem(cfg: SystemConfig): Promise<SovereignSystem> {
  // ---- store selector (Phase 7): real PostgreSQL when PG_URL is set ----
  const pg = cfg.pgUrl !== undefined && cfg.pgUrl.length > 0 ? new PgStore(cfg.pgUrl) : null;
  const store: LedgerStore = pg ?? new PgliteStore(cfg.dbDir ?? ':memory:');
  await store.init();

  // ---- the zero-trust door (Phase 7): mandatory auth + per-IP admission + realtime ----
  const auth = new AuthService({ adminSecret: cfg.adminSecret });
  const guard = new HttpGuard();
  const hub = new RealtimeHub();

  const readCache = new LruReadStore<number>(
    1024,
    5000,
    async (key) => {
      // key format: balance:<tenant>:<id> — served through the RLS-scoped port
      const parts = key.split(':');
      const tenant = parts[1] ?? '';
      const id = parts[2] ?? '';
      const acc = await store.getAccount(tenant, id);
      return acc === null ? undefined : acc.balance;
    },
  );

  const keyer = new IdempotencyKeyer(Buffer.from(cfg.idempotencySecret.padEnd(32, '#'), 'utf8'));
  const cipher = EnvelopeCipher.masterFromSecret(cfg.masterSecret);
  const sessions = new SessionRegistry();
  const tracer = new Tracer(cfg.sampleRate ?? 0.1, 512);
  const lag = new EventLoopLagProbe(500);
  const relay = new OutboxRelay(store);
  const pool = new WorkerPool(
    cfg.poolSize ?? 2,
    new URL('../transport/pool-worker.js', import.meta.url),
    64,
  );

  // ---- outbox → realtime broadcast (+ cross-replica NOTIFY on real PG) ----
  relay.subscribe((row) => {
    hub.publish('*', row.topic, JSON.parse(row.payload));
    if (pg !== null) void pg.notify('sovereign_events', { topic: row.topic, payload: row.payload });
  });

  // ---- the single write path: ABAC → validate → OCC ----
  async function transfer(
    input: TransferInput,
    subject: AbacRequest['subject'],
  ): Promise<TransferResult> {
    const span = tracer.startSpan('transfer', input.idempotencyKey);
    try {
      const decision = evaluate(PORTFOLIO_POLICIES, {
        subject,
        action: 'transfer',
        resource: { ownerId: input.tenant },
      });
      if (decision !== 'allow') return { ok: false, code: 'invalid' };
      const veto = validateTransferInput(input);
      if (veto !== null) return veto;
      const res = await executeTransfer(store, input);
      if (res.ok) {
        // CQRS: invalidate touched read-model keys (SWR refetches lazily).
        await readCache.delete(`balance:${input.tenant}:${input.from}`);
        await readCache.delete(`balance:${input.tenant}:${input.to}`);
      }
      span.finish('ok');
      return res;
    } catch (e) {
      span.finish('error');
      throw e;
    }
  }

  // ---- UDP edge: validate-before-allocate, backpressure by shedding ----
  const gateway = new UdpGateway({
    host: cfg.host,
    port: cfg.udpPort,
    perClientRate: 500,
    perClientBurst: 64,
    maxClients: 65536,
    queueCapacity: 1024,
    handler: async (msg: IngestedDatagram) => {
      let body: unknown;
      if (msg.payload.byteLength > 4096) return; // bound BEFORE parsing
      try {
        body = JSON.parse(Buffer.from(msg.payload).toString('utf8'));
      } catch {
        return; // malformed → shed silently
      }
      const b = body as { tenant?: unknown; from?: unknown; to?: unknown; amount?: unknown };
      if (
        typeof b.tenant !== 'string' ||
        typeof b.from !== 'string' ||
        typeof b.to !== 'string' ||
        typeof b.amount !== 'number'
      ) {
        return;
      }
      const idempotencyKey =
        typeof (body as { key?: unknown }).key === 'string'
          ? ((body as { key: string }).key)
          : keyer.issue(b.tenant, 'transfer', msg.payload);
      const res = await transfer(
        { tenant: b.tenant, from: b.from, to: b.to, amount: Math.trunc(b.amount), idempotencyKey },
        { role: 'admin', verified: true },
      );
      gateway.reply(
        Buffer.from(JSON.stringify({ seq: msg.seq, ok: res.ok, code: res.ok ? undefined : res.code }), 'utf8'),
        msg.rinfo,
        msg.seq,
      );
    },
  });

  // ---- health composition ----
  const probes: ComponentProbe[] = [
    () => ({
      name: 'udp_gateway',
      depth: gateway.queueDepth,
      dropped: gateway.metrics.shed + gateway.metrics.rateLimited,
      ok: true,
    }),
    () => ({
      name: 'worker_pool',
      depth: pool.queueDepth,
      dropped: pool.metrics.shed,
      ok: true,
    }),
    () => ({ name: 'ledger_store', ok: true }),
    () => ({ name: 'realtime_hub', depth: hub.subscribers, dropped: hub.shedSlow, ok: true }),
    () => ({ name: 'auth', depth: auth.activeSessions, dropped: guard.deniedLogin, ok: true }),
  ];

  const system: SovereignSystem = {
    store,
    relay,
    readCache,
    keyer,
    cipher,
    sessions,
    tracer,
    lag,
    pool,
    gateway,
    auth,
    guard,
    hub,
    transfer,
    seal: (data, aad) => cipher.encrypt(Buffer.from(data, 'utf8'), aad === undefined ? undefined : Buffer.from(aad, 'utf8')),
    open: (env, aad) =>
      cipher.decrypt(env, aad === undefined ? undefined : Buffer.from(aad, 'utf8')).toString('utf8'),
    health: () => collectHealth(probes, lag),
    start: async () => {
      lag.start();
      await gateway.start();
      if (pg !== null) {
        await pg.listen('sovereign_events', (payload) => {
          try {
            const n = JSON.parse(payload);
            hub.publish('*', `${n.topic}.replica`, JSON.parse(n.payload));
          } catch {}
        });
      }
    },
    stop: async () => {
      lag.stop();
      await gateway.stop();
      await pool.close();
      await store.close();
    },
  };
  return system;
}
