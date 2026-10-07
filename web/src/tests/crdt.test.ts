/**
 * crdt.test.ts — LWW convergence properties, incl. a randomized
 * commutativity/idempotency check (convergence is THE contract).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LamportClock, LwwMap, stampAfter, type LwwOp } from '../core/crdt.js';

test('crdt: later timestamp wins regardless of arrival order', () => {
  const m = new LwwMap();
  const old: LwwOp = { kind: 'set', id: 'x', field: 'title', v: 'old', ts: 1, actor: 1 };
  const newer: LwwOp = { kind: 'set', id: 'x', field: 'title', v: 'new', ts: 2, actor: 1 };
  m.apply(newer);
  m.apply(old); // stale arrival — must lose
  assert.equal(m.getField('x', 'title'), 'new');
});

test('crdt: equal timestamps break deterministically on actorId', () => {
  const m = new LwwMap();
  m.apply({ kind: 'set', id: 'x', field: 'f', v: 'from-1', ts: 5, actor: 1 });
  m.apply({ kind: 'set', id: 'x', field: 'f', v: 'from-2', ts: 5, actor: 2 });
  assert.equal(m.getField('x', 'f'), 'from-2');
  // reversed arrival → same winner
  const m2 = new LwwMap();
  m2.apply({ kind: 'set', id: 'x', field: 'f', v: 'from-2', ts: 5, actor: 2 });
  m2.apply({ kind: 'set', id: 'x', field: 'f', v: 'from-1', ts: 5, actor: 1 });
  assert.equal(m2.getField('x', 'f'), 'from-2');
});

test('crdt: tombstones, and revival by a newer write', () => {
  const m = new LwwMap();
  m.apply({ kind: 'create', id: 'x', fields: { title: 'hi' }, ts: 1, actor: 1 });
  m.apply({ kind: 'del', id: 'x', ts: 2, actor: 1 });
  assert.equal(m.getField('x', 'title'), undefined);
  assert.equal(m.isDeleted('x'), true);
  m.apply({ kind: 'set', id: 'x', field: 'title', v: 'revived', ts: 3, actor: 1 });
  assert.equal(m.isDeleted('x'), false);
  assert.equal(m.getField('x', 'title'), 'revived');
  // stale set against a tombstone: its CELL is absorbed (order-independent
  // merge) but the record must remain deleted — existence is stamp-derived.
  const m2 = new LwwMap();
  m2.apply({ kind: 'create', id: 'y', fields: { a: 1 }, ts: 1, actor: 1 });
  m2.apply({ kind: 'del', id: 'y', ts: 5, actor: 1 });
  m2.apply({ kind: 'set', id: 'y', field: 'a', v: 2, ts: 2, actor: 1 });
  assert.equal(m2.isDeleted('y'), true);
  assert.equal(m2.getField('y', 'a'), undefined);
});

test('crdt: field tombstone (null) reads as absent', () => {
  const m = new LwwMap();
  m.apply({ kind: 'create', id: 'x', fields: { a: 'v' }, ts: 1, actor: 1 });
  m.apply({ kind: 'set', id: 'x', field: 'a', v: null, ts: 2, actor: 1 });
  assert.equal(m.getField('x', 'a'), undefined);
});

test('crdt: applying the same op twice is a no-op (idempotent)', () => {
  const m = new LwwMap();
  const op: LwwOp = { kind: 'set', id: 'x', field: 'f', v: 'v', ts: 1, actor: 1 };
  assert.equal(m.apply(op), true);
  assert.equal(m.apply(op), false);
});

test('crdt: randomized convergence — any permutation yields identical state', () => {
  // seeded PRNG (mulberry32) for reproducibility
  let a = 0x9e3779b9;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const ops: LwwOp[] = [];
  let ts = 0;
  for (let i = 0; i < 300; i++) {
    ts++;
    const id = `r${Math.floor(rand() * 8)}`;
    const actor = 1 + Math.floor(rand() * 3);
    const roll = rand();
    if (roll < 0.2) ops.push({ kind: 'create', id, fields: { v: i }, ts, actor });
    else if (roll < 0.85) ops.push({ kind: 'set', id, field: `f${Math.floor(rand() * 4)}`, v: i, ts, actor });
    else ops.push({ kind: 'del', id, ts, actor });
  }

  const forward = new LwwMap();
  forward.merge(ops);

  const backward = new LwwMap();
  backward.merge([...ops].reverse());

  const shuffled = new LwwMap();
  const copy = [...ops];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i] as LwwOp;
    copy[i] = copy[j] as LwwOp;
    copy[j] = tmp;
  }
  shuffled.merge(copy);

  assert.deepEqual(forward.snapshot(), backward.snapshot());
  assert.deepEqual(forward.snapshot(), shuffled.snapshot());
});

test('crdt: lamport clock is strictly monotonic past any observation', () => {
  const c = new LamportClock(7, 3);
  assert.equal(c.tick(), 4);
  c.observe(100);
  assert.equal(c.tick(), 101);
  assert.equal(c.actor, 7);
});

test('crdt: stampAfter is a strict total order', () => {
  assert.equal(stampAfter({ ts: 2, actor: 1 }, { ts: 1, actor: 9 }), true);
  assert.equal(stampAfter({ ts: 1, actor: 9 }, { ts: 2, actor: 1 }), false);
  assert.equal(stampAfter({ ts: 1, actor: 2 }, { ts: 1, actor: 1 }), true);
  assert.equal(stampAfter({ ts: 1, actor: 1 }, { ts: 1, actor: 1 }), false);
});
