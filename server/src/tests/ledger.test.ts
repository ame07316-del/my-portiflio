/**
 * ledger.test.ts — Phase 3 core: OCC transfers, idempotency, atomicity,
 * retry policy — all on a REAL PostgreSQL engine (PGlite).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgliteStore, SCHEMA_SQL } from '../adapters/pglite-store.js';
import { executeTransfer, validateTransferInput } from '../domain/ledger.js';
import type { LedgerStore, TransferInput, TransferResult } from '../ports/store.js';

async function freshStore(): Promise<PgliteStore> {
  const store = new PgliteStore();
  await store.init();
  return store;
}

const T = 'tenantA';

test('ledger: committed transfer moves money, bumps versions, writes outbox + events', async () => {
  const store = await freshStore();
  try {
    await store.createAccount(T, 'alice', 10_000);
    await store.createAccount(T, 'bob', 500);

    const res = await executeTransfer(store, {
      tenant: T, from: 'alice', to: 'bob', amount: 2_500, idempotencyKey: 'k1',
    });
    assert.ok(res.ok);
    assert.equal(res.replayed, false);

    const alice = await store.getAccount(T, 'alice');
    const bob = await store.getAccount(T, 'bob');
    assert.equal(alice?.balance, 7_500);
    assert.equal(bob?.balance, 3_000);
    assert.ok((alice?.version ?? 0) >= 1 && (bob?.version ?? 0) >= 1);

    const pending = await store.outboxPending(10);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.topic, 'transfer.committed');

    const events = await store.eventsSince(0, 10);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.type).sort(), ['credited', 'debited']);
    // per-stream monotonic seq
    for (const e of events) assert.equal(e.seq, 1);
  } finally {
    await store.close();
  }
});

test('ledger: insufficient funds and unknown accounts are business rejects', async () => {
  const store = await freshStore();
  try {
    await store.createAccount(T, 'alice', 100);
    await store.createAccount(T, 'bob', 0);
    const poor = await executeTransfer(store, {
      tenant: T, from: 'alice', to: 'bob', amount: 101, idempotencyKey: 'k2',
    });
    assert.deepEqual(poor, { ok: false, code: 'insufficient_funds' });
    const ghost = await executeTransfer(store, {
      tenant: T, from: 'alice', to: 'nobody', amount: 1, idempotencyKey: 'k3',
    });
    assert.deepEqual(ghost, { ok: false, code: 'not_found' });
    assert.equal((await store.getAccount(T, 'alice'))?.balance, 100);
  } finally {
    await store.close();
  }
});

test('ledger: idempotent replay returns the ORIGINAL id and does not double-spend', async () => {
  const store = await freshStore();
  try {
    await store.createAccount(T, 'alice', 10_000);
    await store.createAccount(T, 'bob', 0);
    const input: TransferInput = {
      tenant: T, from: 'alice', to: 'bob', amount: 1_000, idempotencyKey: 'same-key',
    };
    const first = await executeTransfer(store, input);
    const second = await executeTransfer(store, input);
    assert.ok(first.ok && second.ok);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(second.transferId, first.transferId);
    assert.equal((await store.getAccount(T, 'alice'))?.balance, 9_000, 'no double debit');
  } finally {
    await store.close();
  }
});

test('ledger: money conservation across a transfer batch', async () => {
  const store = await freshStore();
  try {
    await store.createAccount(T, 'a', 50_000);
    await store.createAccount(T, 'b', 50_000);
    await store.createAccount(T, 'c', 50_000);
    for (let i = 0; i < 25; i++) {
      const route = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ][i % 3] as { from: string; to: string };
      await executeTransfer(store, {
        tenant: T, from: route.from, to: route.to, amount: 137, idempotencyKey: `batch-${i}`,
      });
    }
    const total =
      ((await store.getAccount(T, 'a'))?.balance ?? 0) +
      ((await store.getAccount(T, 'b'))?.balance ?? 0) +
      ((await store.getAccount(T, 'c'))?.balance ?? 0);
    assert.equal(total, 150_000, 'conservation law must hold');
  } finally {
    await store.close();
  }
});

test('OCC: version-conditioned UPDATE rejects stale versions at the SQL level', async () => {
  const db = new PGlite();
  try {
    await db.exec(SCHEMA_SQL);
    await db.query(`SELECT set_config('role', 'sovereign_app', true)`);
    await db.query(`SELECT set_config('app.tenant', $1, false)`, [T]);
    await db.query(`INSERT INTO accounts (id, balance, version) VALUES ('x', 100, 3)`);
    const stale = await db.query(
      `UPDATE accounts SET balance = balance - 10, version = version + 1 WHERE id = 'x' AND version = 2`,
    );
    assert.equal(stale.affectedRows, 0, 'stale version must touch zero rows');
    const fresh = await db.query(
      `UPDATE accounts SET balance = balance - 10, version = version + 1 WHERE id = 'x' AND version = 3`,
    );
    assert.equal(fresh.affectedRows, 1);
  } finally {
    await db.close();
  }
});

test('OCC: domain retry policy recovers from transient conflicts', async () => {
  const real = await freshStore();
  try {
    await real.createAccount(T, 'alice', 10_000);
    await real.createAccount(T, 'bob', 0);
    let attempts = 0;
    // Spy store: two forced conflicts, then the real attempt succeeds.
    const spy: LedgerStore = {
      init: () => real.init(),
      createAccount: (t, i, o) => real.createAccount(t, i, o),
      getAccount: (t, i) => real.getAccount(t, i),
      attemptTransfer: async (input) => {
        attempts++;
        if (attempts <= 2) return { ok: false, code: 'conflict' as const };
        return real.attemptTransfer(input);
      },
      outboxPending: (l) => real.outboxPending(l),
      outboxMarkSent: (ids) => real.outboxMarkSent(ids),
      eventsSince: (a, l) => real.eventsSince(a, l),
      appendOp: (t, o) => real.appendOp(t, o),
      close: () => real.close(),
    };
    const res = await executeTransfer(spy, {
      tenant: T, from: 'alice', to: 'bob', amount: 10, idempotencyKey: 'retry-key',
    }, { maxAttempts: 5, baseDelayMs: 1, sleep: () => Promise.resolve() });
    assert.ok(res.ok);
    assert.equal(attempts, 3, 'two conflicts then success');

    // Exhaustion surfaces as conflict, not as a throw.
    attempts = 0;
    const alwaysConflict: LedgerStore = {
      ...spy,
      attemptTransfer: async () => {
        attempts++;
        return { ok: false, code: 'conflict' as const } as TransferResult;
      },
    };
    const exhausted = await executeTransfer(alwaysConflict, {
      tenant: T, from: 'alice', to: 'bob', amount: 10, idempotencyKey: 'never',
    }, { maxAttempts: 4, baseDelayMs: 1, sleep: () => Promise.resolve() });
    assert.deepEqual(exhausted, { ok: false, code: 'conflict' });
    assert.equal(attempts, 4);
  } finally {
    await real.close();
  }
});

test('ledger: input validation rejects garbage before any round trip', () => {
  const bad: TransferInput[] = [
    { tenant: T, from: 'a', to: 'a', amount: 5, idempotencyKey: 'k' }, // self-transfer
    { tenant: T, from: 'a', to: 'b', amount: -5, idempotencyKey: 'k' },
    { tenant: T, from: 'a', to: 'b', amount: Number.NaN, idempotencyKey: 'k' },
    { tenant: T, from: '', to: 'b', amount: 5, idempotencyKey: 'k' },
    { tenant: T, from: 'a', to: 'b', amount: 5, idempotencyKey: '' },
  ];
  for (const input of bad) {
    assert.deepEqual(validateTransferInput(input), { ok: false, code: 'invalid' });
  }
  assert.equal(
    validateTransferInput({ tenant: T, from: 'a', to: 'b', amount: 5, idempotencyKey: 'k' }),
    null,
  );
});
