/**
 * control-plane.test.ts — Phase 7 zero-trust integration (full stack):
 * mandatory auth (401 on admin routes + login throttling), SSE realtime
 * broadcast, CRDT op persistence + catch-up, OCC + idempotency, UDP edge,
 * ABAC — one sovereign system under test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { createSystem } from '../app/container.js';
import { startControlPlane } from '../control-plane.js';
import { GATEWAY_MAGIC } from '../transport/udp-gateway.js';

const ADMIN_SECRET = 'integration-admin-secret-0123456789';

async function makeSystem() {
  const sys = await createSystem({
    udpPort: 0,
    host: '127.0.0.1',
    masterSecret: 'integration-master-secret-0123456789',
    idempotencySecret: 'integration-idempotency-secret-01234',
    adminSecret: ADMIN_SECRET,
    sampleRate: 1,
  });
  await sys.start();
  const http = await startControlPlane(0, sys);
  const port = (http.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  // One login through the real HTTP door; the token is reused via headers.
  const login = (await (
    await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: ADMIN_SECRET }),
    })
  ).json()) as { token: string };
  return { sys, http, base, token: login.token, headers: { authorization: `Bearer ${login.token}` } };
}

test('auth door: anonymous 401, open routes stay open, login lifecycle, logout revokes', async () => {
  const { sys, http, base, token, headers } = await makeSystem();
  try {
    // Open routes need no credentials.
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/metrics`)).status, 200);

    // Anonymous → 401 on every admin route.
    assert.equal((await fetch(`${base}/transfer`, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/ops`, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/account/t1/alice`)).status, 401);
    assert.equal((await fetch(`${base}/events`)).status, 401);

    // Unknown bearer → 401.
    assert.equal(
      (await fetch(`${base}/account/t1/alice`, { headers: { authorization: 'Bearer nope' } })).status,
      401,
    );

    // A valid login issued a real token (32 random bytes → ≥ 40 base64url chars).
    assert.ok(token.length >= 40);

    // Ghost account with a valid bearer → 404 (auth passed, data absent).
    await sys.store.createAccount('t1', 'alice', 10_000);
    assert.equal((await fetch(`${base}/account/t1/ghost`, { headers })).status, 404);

    // Logout revokes the token immediately.
    sys.auth.logout(token);
    assert.equal((await fetch(`${base}/account/t1/alice`, { headers })).status, 401);
  } finally {
    http.close();
    await sys.stop();
  }
});

test('login throttling: 8 consecutive guesses include 429', async () => {
  const { sys, http, base } = await makeSystem();
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ secret: `guess-${i}-padding-to-cross-32-chars` }),
      });
      statuses.push(res.status);
    }
    assert.ok(statuses.includes(429), `expected a 429 in [${statuses.join(',')}]`);
    assert.ok(sys.guard.deniedLogin >= 1, 'guard must count the denied logins');
  } finally {
    http.close();
    await sys.stop();
  }
});

test('authenticated transfer: OCC replay, balance read, seal round-trip, realtime+auth probes', async () => {
  const { sys, http, base, headers } = await makeSystem();
  try {
    await sys.store.createAccount('t1', 'alice', 10_000);
    await sys.store.createAccount('t1', 'bob', 0);

    const body = JSON.stringify({ tenant: 't1', from: 'alice', to: 'bob', amount: 2_500 });
    const r1 = (await (await fetch(`${base}/transfer`, { method: 'POST', headers, body })).json()) as {
      result: { ok: boolean; replayed?: boolean; transferId?: number };
      idempotencyKey: string;
    };
    assert.ok(r1.result.ok);

    // Deterministic idempotency: SAME body ⇒ SAME key ⇒ replay of the ORIGINAL.
    const r2 = (await (await fetch(`${base}/transfer`, { method: 'POST', headers, body })).json()) as typeof r1;
    assert.equal(r2.result.replayed, true);
    assert.equal(r2.result.transferId, r1.result.transferId);

    const alice = (await (await fetch(`${base}/account/t1/alice`, { headers })).json()) as { balance: number };
    assert.equal(alice.balance, 7_500);

    const seal = (await (await fetch(`${base}/seal`, { method: 'POST', headers, body: 'hello sovereign' })).json()) as {
      opened: string;
    };
    assert.equal(seal.opened, 'hello sovereign');

    // Phase 7 components are observable in the metrics stream.
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /sovereign_component_depth\{name="realtime_hub"\}/);
    assert.match(metrics, /sovereign_component_depth\{name="auth"\}/);
  } finally {
    http.close();
    await sys.stop();
  }
});

test('SSE: /events streams op.received live; /ops/since replays the op', async () => {
  const { sys, http, base, headers } = await makeSystem();
  try {
    const res = await fetch(`${base}/events?tenant=web1`, { headers });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    const stream = res.body;
    assert.ok(stream, 'SSE body stream must exist');
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const textPromise = (async () => {
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (acc.includes('event: op.received') && acc.includes('بث حي')) return acc;
      }
      return acc;
    })();

    const opRes = await fetch(`${base}/ops`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tenant: 'web1', op: { kind: 'set', id: 'p1', field: 'title', v: 'بث حي' } }),
    });
    assert.equal(opRes.status, 200);

    const frame = await Promise.race([
      textPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('SSE frame not delivered within 3s')), 3_000)),
    ]);
    assert.match(frame, /event: op\.received/);
    assert.match(frame, /بث حي/);

    // Catch-up endpoint sees exactly the one persisted op for this tenant.
    const since = (await (await fetch(`${base}/ops/since?tenant=web1&after=0`, { headers })).json()) as {
      ops: Array<{ id: number; op: string }>;
    };
    assert.equal(since.ops.length, 1);
    await reader.cancel();
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
