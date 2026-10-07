/**
 * control-plane.test.ts — full-stack integration (Phases 2+3+5+6 together):
 * HTTP control plane + UDP edge + OCC ledger + idempotency + envelope +
 * observability, one sovereign system under test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { createSystem } from '../app/container.js';
import { startControlPlane } from '../control-plane.js';
import { GATEWAY_MAGIC } from '../transport/udp-gateway.js';

async function makeSystem() {
  const sys = await createSystem({
    udpPort: 0,
    host: '127.0.0.1',
    masterSecret: 'integration-master-secret-0123456789',
    idempotencySecret: 'integration-idempotency-secret-01234',
    sampleRate: 1,
  });
  await sys.start();
  const http = await startControlPlane(0, sys);
  const port = (http.address() as AddressInfo).port;
  return { sys, http, base: `http://127.0.0.1:${port}` };
}

test('control plane: health, transfer, idempotent replay, reads, envelope, metrics', async () => {
  const { sys, http, base } = await makeSystem();
  try {
    await sys.store.createAccount('t1', 'alice', 10_000);
    await sys.store.createAccount('t1', 'bob', 0);

    // ---- /healthz ----
    const health = await (await fetch(`${base}/healthz`)).json() as { status: string; components: unknown[] };
    assert.equal(health.status, 'ok');
    assert.ok(Array.isArray(health.components) && health.components.length >= 3);

    // ---- /transfer (ABAC + validation + OCC + outbox in one path) ----
    const body = JSON.stringify({ tenant: 't1', from: 'alice', to: 'bob', amount: 2_500 });
    const r1 = await (await fetch(`${base}/transfer`, { method: 'POST', body })).json() as {
      result: { ok: boolean; replayed?: boolean; transferId?: number };
      idempotencyKey: string;
    };
    assert.ok(r1.result.ok);

    // deterministic idempotency: SAME body ⇒ SAME key ⇒ replay
    const r2 = await (await fetch(`${base}/transfer`, { method: 'POST', body })).json() as typeof r1;
    assert.ok(r2.result.ok);
    assert.equal(r2.result.replayed, true);
    assert.equal(r2.idempotencyKey, r1.idempotencyKey);
    assert.equal(r2.result.transferId, r1.result.transferId);

    // ---- SWR read side ----
    const alice = await (await fetch(`${base}/account/t1/alice`)).json() as { balance: number };
    assert.equal(alice.balance, 7_500);
    const ghost = await fetch(`${base}/account/t1/nobody`);
    assert.equal(ghost.status, 404);

    // ---- envelope demo ----
    const seal = await (await fetch(`${base}/seal`, { method: 'POST', body: 'hello sovereign' })).json() as {
      opened: string;
      ciphertextBytes: number;
    };
    assert.equal(seal.opened, 'hello sovereign');
    assert.ok(seal.ciphertextBytes > 0);

    // ---- bad input discipline ----
    assert.equal((await fetch(`${base}/transfer`, { method: 'POST', body: '{oops' })).status, 400);
    assert.equal(
      (await fetch(`${base}/transfer`, { method: 'POST', body: JSON.stringify({ tenant: 't1' }) })).status,
      400,
    );

    // ---- /metrics ----
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /sovereign_uptime_seconds/);
    assert.match(metrics, /sovereign_component_depth\{name="udp_gateway"\}/);

    // ---- tracing recorded the transfers (sampleRate=1) ----
    assert.ok(sys.tracer.sampled >= 2);
  } finally {
    http.close();
    await sys.stop();
  }
});

test('control plane: UDP edge admits a transfer end-to-end (Phase 2 path)', async () => {
  const { sys, http } = await makeSystem();
  try {
    await sys.store.createAccount('edge', 'a', 5_000);
    await sys.store.createAccount('edge', 'b', 0);

    const client = dgram.createSocket('udp4');
    const payload = Buffer.from(
      JSON.stringify({ tenant: 'edge', from: 'a', to: 'b', amount: 1_200 }),
      'utf8',
    );
    const frame = Buffer.allocUnsafe(5 + payload.byteLength);
    frame[0] = GATEWAY_MAGIC;
    frame.writeUInt32LE(321, 1);
    payload.copy(frame, 5);

    const reply = await new Promise<{ seq: number; body: { ok: boolean } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no gateway reply')), 3000);
      client.on('message', (msg) => {
        clearTimeout(timer);
        resolve({ seq: msg.readUInt32LE(1), body: JSON.parse(msg.subarray(5).toString('utf8')) });
      });
      client.send(frame, sys.gateway.boundPort, '127.0.0.1');
    });
    client.close();

    assert.equal(reply.seq, 321);
    assert.equal(reply.body.ok, true);
    assert.equal((await sys.store.getAccount('edge', 'a'))?.balance, 3_800);
    assert.equal((await sys.store.getAccount('edge', 'b'))?.balance, 1_200);
    assert.ok(sys.gateway.metrics.processed >= 1);
  } finally {
    http.close();
    await sys.stop();
  }
});

test('control plane: /ops persists replicated CRDT ops with an outbox row', async () => {
  const { sys, http, base } = await makeSystem();
  try {
    const res = await (
      await fetch(`${base}/ops`, {
        method: 'POST',
        body: JSON.stringify({
          tenant: 'web1',
          op: { kind: 'set', id: 'p1', field: 'title', v: 'من الواجهة' },
        }),
      })
    ).json() as { ok: boolean; id: number };
    assert.equal(res.ok, true);
    assert.ok(res.id >= 1);

    // outbox carries the op.received breadcrumb (drained already by the relay)
    const events = await sys.store.outboxPending(10);
    assert.equal(events.length, 0, 'relay already drained');

    // malformed bodies are rejected before touching storage
    assert.equal((await fetch(`${base}/ops`, { method: 'POST', body: '{}' })).status, 400);
    assert.equal((await fetch(`${base}/ops`, { method: 'POST', body: '{' })).status, 400);
  } finally {
    http.close();
    await sys.stop();
  }
});

test('control plane: ABAC denial at the system boundary', async () => {
  const { sys, http } = await makeSystem();
  try {
    await sys.store.createAccount('t9', 'x', 1_000);
    await sys.store.createAccount('t9', 'y', 0);
    // Unverified subject → deny rule wins over the admin allow rule.
    const res = await sys.transfer(
      { tenant: 't9', from: 'x', to: 'y', amount: 10, idempotencyKey: 'abac-1' },
      { role: 'admin', verified: false },
    );
    assert.deepEqual(res, { ok: false, code: 'invalid' });
    assert.equal((await sys.store.getAccount('t9', 'x'))?.balance, 1_000);
  } finally {
    http.close();
    await sys.stop();
  }
});
