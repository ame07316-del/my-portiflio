/**
 * pg-store.test.ts — Phase 7: the REAL PostgreSQL adapter (node-postgres).
 *
 * Skipped unless PG_URL points at a reachable database; CI runs it against
 * a disposable Postgres service container.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgStore } from '../adapters/pg-store.js';

test('pg-store: schema, tenant isolation, OCC, idempotency, NOTIFY (real Postgres)', async (t) => {
  if (!process.env.PG_URL) { t.skip('PG_URL not set — real-Postgres adapter test skipped'); return; }
  const store = new PgStore(process.env.PG_URL);
  try {
    await store.init();

    // ---- tenant "rt": accounts + one OCC transfer + idempotent replay ----
    await store.createAccount('rt', 'alice', 10_000);
    await store.createAccount('rt', 'bob', 0);
    const first = await store.attemptTransfer({ tenant: 'rt', from: 'alice', to: 'bob', amount: 4_000, idempotencyKey: 'pg-it-1' });
    assert.ok(first.ok);
    const replay = await store.attemptTransfer({ tenant: 'rt', from: 'alice', to: 'bob', amount: 4_000, idempotencyKey: 'pg-it-1' });
    assert.ok(replay.ok);
    if (first.ok && replay.ok) {
      assert.equal(replay.replayed, true);
      assert.equal(replay.transferId, first.transferId);
    }
    assert.equal((await store.getAccount('rt', 'alice'))?.balance, 6_000);
    assert.equal((await store.getAccount('rt', 'bob'))?.balance, 4_000);

    // ---- tenant isolation (RLS under the unprivileged role) ----
    await store.createAccount('other', 'alice', 999);
    assert.equal(await store.getAccount('other', 'bob'), null);
    const otherAlice = await store.getAccount('other', 'alice');
    assert.equal(otherAlice?.balance, 999);

    // ---- CRDT ops: append + tenant-scoped read ----
    const opId = await store.appendOp('rt', JSON.stringify({ kind: 'set', id: 'p1', field: 'title', v: 'live' }));
    assert.ok(opId > 0);
    assert.equal((await store.opsSince('rt', 0, 10)).length, 1);
    assert.equal((await store.opsSince('other', 0, 10)).length, 0);

    // ---- LISTEN/NOTIFY round trip (cross-replica signal) ----
    const received = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no NOTIFY received within 4s')), 4_000);
      void store
        .listen('sovereign_events', (payload) => { clearTimeout(timer); resolve(payload); })
        .then(async () => {
          await new Promise((r) => setTimeout(r, 200));
          await store.notify('sovereign_events', { topic: 'transfer.committed', probe: true });
        })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
    const payload = await received;
    assert.match(payload, /transfer\.committed/);

    // ---- outbox drains to zero ----
    const pending = await store.outboxPending(100);
    await store.outboxMarkSent(pending.map((r) => r.id));
    assert.equal((await store.outboxPending(100)).length, 0);
  } finally {
    await store.close();
  }
});
