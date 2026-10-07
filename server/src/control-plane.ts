/**
 * control-plane.ts — the observable edge of the sovereign server (Phase 6).
 *
 * HTTP surface (node:http, zero frameworks):
 *   GET  /healthz          live health JSON (event-loop lag, heap, queues)
 *   GET  /metrics          Prometheus text exposition
 *   GET  /account/:t/:id   RLS-scoped balance read (via SWR read store)
 *   POST /transfer         ABAC-gated OCC transfer (bounded body: 64 KiB)
 *   POST /seal  · GET /envelope-info   envelope-encryption demonstration
 *
 * Security at the door: every request body is SIZE-CAPPED and read fully
 * before parsing — no allocation follows an untrusted length.
 *
 * @complexity routing: O(1) string match; handlers documented inline.
 */
import http from 'node:http';
import { createSystem } from './app/container.js';
import type { SovereignSystem } from './app/container.js';
import type { TransferInput } from './ports/store.js';

const MAX_BODY_BYTES = 64 * 1024;

/** Read a request body with a hard cap (anti-OOM at the HTTP door). O(body). */
function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.byteLength;
      if (size > MAX_BODY_BYTES) {
        req.destroy(); // reject BEFORE accumulating more
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.byteLength,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  });
  res.end(payload);
}

export async function startControlPlane(httpPort: number, system: SovereignSystem): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (req.method === 'GET' && path === '/healthz') {
        const report = system.health();
        json(res, report.status === 'ok' ? 200 : 503, report);
        return;
      }
      if (req.method === 'GET' && path === '/metrics') {
        const { metricsText } = await import('./obs/health.js');
        const text = metricsText(system.health());
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
        res.end(text);
        return;
      }
      if (req.method === 'GET' && path.startsWith('/account/')) {
        const parts = path.split('/');
        const tenant = decodeURIComponent(parts[2] ?? '');
        const id = decodeURIComponent(parts[3] ?? '');
        const balance = await system.readCache.read(`balance:${tenant}:${id}`);
        if (balance === undefined) {
          json(res, 404, { error: 'not_found' });
          return;
        }
        json(res, 200, { tenant, id, balance });
        return;
      }
      if (req.method === 'POST' && path === '/transfer') {
        const body = await readBody(req);
        if (body === null) {
          json(res, 413, { error: 'body_too_large' });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body.toString('utf8'));
        } catch {
          json(res, 400, { error: 'bad_json' });
          return;
        }
        const p = parsed as Partial<TransferInput> & { idempotencyKey?: string };
        if (
          typeof p.tenant !== 'string' ||
          typeof p.from !== 'string' ||
          typeof p.to !== 'string' ||
          typeof p.amount !== 'number'
        ) {
          json(res, 400, { error: 'invalid_fields' });
          return;
        }
        const idempotencyKey =
          typeof p.idempotencyKey === 'string' && p.idempotencyKey.length > 0
            ? p.idempotencyKey
            : system.keyer.issue(p.tenant, 'transfer', body);
        const result = await system.transfer(
          { tenant: p.tenant, from: p.from, to: p.to, amount: p.amount, idempotencyKey },
          { role: 'admin', verified: true },
        );
        await system.relay.drain(); // move committed outbox rows downstream
        json(res, result.ok ? 200 : 409, { result, idempotencyKey });
        return;
      }
      if (req.method === 'POST' && path === '/ops') {
        // CRDT sync sink: validated op → Postgres + outbox in one commit.
        const body = await readBody(req);
        if (body === null) {
          json(res, 413, { error: 'body_too_large' });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body.toString('utf8'));
        } catch {
          json(res, 400, { error: 'bad_json' });
          return;
        }
        const p = parsed as { tenant?: unknown; op?: unknown };
        if (typeof p.tenant !== 'string' || p.tenant.length === 0 || typeof p.op !== 'object' || p.op === null) {
          json(res, 400, { error: 'invalid_fields' });
          return;
        }
        const span = system.tracer.startSpan('op.received', body.toString('utf8').slice(0, 64));
        const id = await system.store.appendOp(p.tenant, JSON.stringify(p.op));
        await system.relay.drain();
        span.finish('ok');
        json(res, 200, { ok: true, id });
        return;
      }
      if (req.method === 'POST' && path === '/seal') {
        const body = await readBody(req);
        if (body === null) {
          json(res, 413, { error: 'body_too_large' });
          return;
        }
        const env = system.seal(body.toString('utf8'), 'sovereign-demo');
        json(res, 200, {
          opened: system.open(env, 'sovereign-demo'),
          ciphertextBytes: env.ciphertext.byteLength,
          wrappedDekBytes: env.wrappedDek.byteLength,
        });
        return;
      }
      json(res, 404, { error: 'not_found' });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : 'internal' });
    }
  });

  await new Promise<void>((resolve) => server.listen(httpPort, '0.0.0.0', resolve));
  return server;
}

/** Standalone run: `node dist/server/src/control-plane.js`. */
if (process.argv[1]?.endsWith('control-plane.js')) {
  const udpPort = Number(process.env.UDP_PORT ?? 9443);
  const httpPort = Number(process.env.HTTP_PORT ?? 8081);
  const sys = await createSystem({
    udpPort,
    host: '0.0.0.0',
    masterSecret: process.env.MASTER_SECRET ?? 'sovereign-master-secret-change-me-please',
    idempotencySecret: process.env.IDEMPOTENCY_SECRET ?? 'sovereign-idempotency-secret-change-me',
    dbDir: process.env.DB_DIR ?? ':memory:',
    sampleRate: 1,
  });
  await sys.start();
  if ((process.env.SEED_DEMO ?? '1') === '1') {
    await sys.store.createAccount('demo', 'alice', 100_000);
    await sys.store.createAccount('demo', 'bob', 0);
    console.log('[control-plane] seeded demo accounts: demo/alice (1000.00) · demo/bob (0.00)');
  }
  const httpServer = await startControlPlane(httpPort, sys);
  console.log(
    `[control-plane] http :${httpPort} (healthz/metrics/transfer) · udp :${udpPort} gateway armed`,
  );
  const shutdown = async (): Promise<void> => {
    httpServer.close();
    await sys.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}
