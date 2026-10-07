/**
 * rls-outbox.test.ts — the two load-bearing Phase 3/5 guarantees:
 *  1. RLS tenant isolation holds even when the API layer is BYPASSED.
 *  2. The outbox relay delivers exactly the committed rows, at-least-once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgliteStore, SCHEMA_SQL } from '../adapters/pglite-store.js';
import { executeTransfer } from '../domain/ledger.js';
import { OutboxRelay } from '../domain/outbox-relay.js';

test('RLS: raw SQL bypass without tenant context returns ZERO rows', async () => {
  const db = new PGlite();
  try {
    await db.exec(SCHEMA_SQL);
    // Seed as privileged owner (simulates two tenants' data at rest).
    await db.query(`SELECT set_config('app.tenant', 'A', false)`);
    await db.query(`INSERT INTO accounts (id, balance) VALUES ('a1', 100)`);
    await db.query(`SELECT set_config('app.tenant', 'B', false)`);
    await db.query(`INSERT INTO accounts (id, balance) VALUES ('b1', 999)`);

    // The unprivileged app role with NO tenant context sees nothing.
    // (An attacker bypassing the adapter has no app.tenant set at all.)
    await db.query(`SELECT set_config('role', 'sovereign_app', false)`);
    await db.query(`SELECT set_config('app.tenant', '', false)`);
    const leak = await db.query(`SELECT count(*)::int AS n FROM accounts`);
    assert.equal((leak.rows[0] as { n: number }).n, 0, 'bypass must not leak rows');

    await db.query(`SELECT set_config('app.tenant', 'A', false)`);
    const scoped = await db.query(`SELECT id FROM accounts`);
    assert.deepEqual(scoped.rows.map((r) => (r as { id: string }).id), ['a1']);

    // Write isolation: WITH CHECK blocks cross-tenant inserts.
    await assert.rejects(
      db.query(`INSERT INTO accounts (tenant, id, balance) VALUES ('B', 'sneak', 1)`),
      /row-level security/i,
    );
  } finally {
    await db.close();
  }
});

test('RLS: API paths are tenant-scoped end to end', async () => {
  const store = new PgliteStore();
  try {
    await store.init();
    await store.createAccount('A', 'shared-id', 111);
    await store.createAccount('B', 'shared-id', 222);
    assert.equal((await store.getAccount('A', 'shared-id'))?.balance, 111);
    assert.equal((await store.getAccount('B', 'shared-id'))?.balance, 222);
    // Cross-tenant transfer is impossible: target invisible under source tenant.
    const res = await executeTransfer(store, {
      tenant: 'A', from: 'shared-id', to: 'shared-id-x', amount: 1, idempotencyKey: 'x1',
    });
    assert.deepEqual(res, { ok: false, code: 'not_found' });
  } finally {
    await store.close();
  }
});

test('outbox: relay drains committed rows and marks them sent', async () => {
  const store = new PgliteStore();
  try {
    await store.init();
    await store.createAccount('A', 'a', 1_000);
    await store.createAccount('A', 'b', 0);
    await executeTransfer(store, {
      tenant: 'A', from: 'a', to: 'b', amount: 100, idempotencyKey: 'r1',
    });
    await executeTransfer(store, {
      tenant: 'A', from: 'a', to: 'b', amount: 200, idempotencyKey: 'r2',
    });

    const relay = new OutboxRelay(store, 1); // batchSize 1 → multi-iteration drain
    const delivered: number[] = [];
    relay.subscribe((row) => {
      delivered.push(row.id);
    });
    const n = await relay.drain();
    assert.equal(n, 2);
    assert.equal(delivered.length, 2);
    assert.equal((await store.outboxPending(10)).length, 0, 'all marked sent');
    assert.equal(await relay.drain(), 0, 'second drain is a no-op');
  } finally {
    await store.close();
  }
});

test('outbox: consumer failure keeps the row pending (at-least-once)', async () => {
  const store = new PgliteStore();
  try {
    await store.init();
    await store.createAccount('A', 'a', 1_000);
    await store.createAccount('A', 'b', 0);
    await executeTransfer(store, {
      tenant: 'A', from: 'a', to: 'b', amount: 50, idempotencyKey: 'f1',
    });

    const relay = new OutboxRelay(store);
    relay.subscribe(() => {
      throw new Error('downstream broker is on fire');
    });
    await assert.rejects(() => relay.drain(), /broker is on fire/);
    assert.equal((await store.outboxPending(10)).length, 1, 'row must remain pending');

    // A healthy consumer later drains it — nothing lost, nothing doubled.
    const relay2 = new OutboxRelay(store);
    const seen: number[] = [];
    relay2.subscribe((row) => {
      seen.push(row.id);
    });
    assert.equal(await relay2.drain(), 1);
    assert.equal(seen.length, 1);
  } finally {
    await store.close();
  }
});
