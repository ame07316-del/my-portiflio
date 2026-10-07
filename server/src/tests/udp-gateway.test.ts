/** udp-gateway.test.ts — real-socket edge admission integration tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { GATEWAY_MAGIC, UdpGateway, type IngestedDatagram } from '../transport/udp-gateway.js';

function frame(seq: number, payload: string): Buffer {
  const p = Buffer.from(payload, 'utf8');
  const out = Buffer.allocUnsafe(5 + p.byteLength);
  out[0] = GATEWAY_MAGIC;
  out.writeUInt32LE(seq, 1);
  p.copy(out, 5);
  return out;
}

async function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('udp gateway: admits well-formed datagrams and strips framing (zero-copy views)', async () => {
  const seen: Array<{ seq: number; payload: string }> = [];
  const gw = new UdpGateway({
    host: '127.0.0.1',
    port: 0,
    perClientRate: 1000,
    perClientBurst: 100,
    maxClients: 16,
    queueCapacity: 64,
    handler: (m: IngestedDatagram) => {
      seen.push({ seq: m.seq, payload: m.payload.toString('utf8') });
    },
  });
  await gw.start();
  const client = dgram.createSocket('udp4');
  try {
    client.send(frame(1, 'alpha'), gw.boundPort, '127.0.0.1');
    client.send(frame(2, 'beta'), gw.boundPort, '127.0.0.1');
    await waitUntil(() => seen.length === 2);
    assert.deepEqual(seen.map((s) => s.payload).sort(), ['alpha', 'beta']);
    assert.equal(gw.metrics.malformed, 0);
    assert.equal(gw.metrics.processed, 2);
  } finally {
    client.close();
    await gw.stop();
  }
});

test('udp gateway: malformed datagrams are dropped before any allocation', async () => {
  const gw = new UdpGateway({
    host: '127.0.0.1',
    port: 0,
    perClientRate: 1000,
    perClientBurst: 100,
    maxClients: 16,
    queueCapacity: 16,
    handler: () => {},
  });
  await gw.start();
  const client = dgram.createSocket('udp4');
  try {
    client.send(Buffer.from('garbage-no-magic'), gw.boundPort, '127.0.0.1');
    client.send(Buffer.from([0x00, 0x01]), gw.boundPort, '127.0.0.1');
    await waitUntil(() => gw.metrics.received >= 2);
    assert.equal(gw.metrics.malformed, 2);
    assert.equal(gw.metrics.processed, 0);
  } finally {
    client.close();
    await gw.stop();
  }
});

test('udp gateway: per-client token bucket rate-limits floods (O(1) reject)', async () => {
  let now = 0; // frozen clock → no refill during the test
  const gw = new UdpGateway({
    host: '127.0.0.1',
    port: 0,
    perClientRate: 1,
    perClientBurst: 4,
    maxClients: 16,
    queueCapacity: 64,
    handler: () => {},
    now: () => now,
  });
  await gw.start();
  const client = dgram.createSocket('udp4');
  try {
    for (let i = 0; i < 20; i++) client.send(frame(i, `x${i}`), gw.boundPort, '127.0.0.1');
    await waitUntil(() => gw.metrics.received >= 20);
    assert.equal(gw.metrics.rateLimited, 16, 'only the burst of 4 may pass');
    assert.equal(gw.metrics.processed + gw.queueDepth, 4);
  } finally {
    client.close();
    await gw.stop();
  }
});

test('udp gateway: slow handler → queue fills → excess is SHED, never queued unbounded', async () => {
  const gw = new UdpGateway({
    host: '127.0.0.1',
    port: 0,
    perClientRate: 100000,
    perClientBurst: 100000,
    maxClients: 16,
    queueCapacity: 8, // usable 7
    handler: async () => {
      await new Promise((r) => setTimeout(r, 25)); // simulate downstream slowness
    },
  });
  await gw.start();
  const client = dgram.createSocket('udp4');
  try {
    for (let i = 0; i < 40; i++) client.send(frame(i, 'flood'), gw.boundPort, '127.0.0.1');
    await waitUntil(() => gw.metrics.shed > 0);
    assert.ok(gw.metrics.shed >= 20, `expected heavy shedding, got ${gw.metrics.shed}`);
    assert.ok(gw.queueDepth <= 7, 'queue must never exceed capacity');
  } finally {
    client.close();
    await gw.stop();
  }
});

test('udp gateway: reply travels back with matching seq', async () => {
  const gw = new UdpGateway({
    host: '127.0.0.1',
    port: 0,
    perClientRate: 1000,
    perClientBurst: 100,
    maxClients: 16,
    queueCapacity: 16,
    handler: (m) => {
      gw.reply(Buffer.from('pong', 'utf8'), m.rinfo, m.seq);
    },
  });
  await gw.start();
  const client = dgram.createSocket('udp4');
  try {
    const got = new Promise<{ seq: number; payload: string }>((resolve) => {
      client.on('message', (msg) => {
        resolve({ seq: msg.readUInt32LE(1), payload: msg.subarray(5).toString('utf8') });
      });
    });
    client.send(frame(77, 'ping'), gw.boundPort, '127.0.0.1');
    const res = await got;
    assert.equal(res.seq, 77);
    assert.equal(res.payload, 'pong');
  } finally {
    client.close();
    await gw.stop();
  }
});
