/**
 * state-node.test.ts — END-TO-END integration of the Phase 1 pipeline:
 *
 *   real connectStore ⇄ binary protocol ⇄ real StateNode engine
 *
 * exercised over an async fake wire with structured-clone semantics.
 * Covers: seed + snapshot delivery, optimistic create, commit ack, forced
 * rollback on commit failure (inverse ops), set/del, and crash recovery via
 * oplog replay from shared storage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../core/storage.js';
import type { LwwOp } from '../core/crdt.js';
import { connectStore } from '../client/store.js';
import { flushSignals } from '../runtime/signal.js';
import { StateNode } from '../worker/state-node.js';
import type { CommitResult, SyncAdapter } from '../worker/sync-adapter.js';

/* ---------------- fake wire with structured-clone semantics ------------- */
class FakePort {
  peer!: FakePort;
  #handler: ((ev: { data: unknown }) => void) | null = null;

  addEventListener(_type: 'message', h: (ev: { data: unknown }) => void): void {
    this.#handler = h;
  }
  start(): void {}

  /** Async delivery + buffer copy = structured clone without a browser. */
  postMessage(msg: unknown, _transfer?: unknown[]): void {
    const peer = this.peer;
    const env = msg as { bin: ArrayBuffer; sab?: SharedArrayBuffer };
    const copy = { bin: env.bin.slice(0), sab: env.sab };
    queueMicrotask(() => {
      peer.#handler?.({ data: copy });
    });
  }
}

function wirePair(): [FakePort, FakePort] {
  const a = new FakePort();
  const b = new FakePort();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

/* --------------------------- scripted adapters --------------------------- */
class ScriptedAdapter implements SyncAdapter {
  readonly outcomes: boolean[] = [];
  readonly committed: LwwOp[] = [];
  constructor(private readonly latencyMs = 40) {}
  commit(op: LwwOp): Promise<CommitResult> {
    this.committed.push(op);
    const ok = this.outcomes.shift() ?? true;
    // Real commits have latency; the optimistic window must be observable.
    return new Promise((resolve) => {
      setTimeout(() => resolve(ok ? { ok: true } : { ok: false, code: 'conflict' }), this.latencyMs);
    });
  }
}

class NeverAdapter implements SyncAdapter {
  commit(_op: LwwOp): Promise<CommitResult> {
    return new Promise(() => {}); // in flight forever (simulates a crash window)
  }
}

/** Let microtasks + timers settle, then flush the signal graph. */
async function settle(ms = 30): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  flushSignals();
}

function titles(store: ReturnType<typeof connectStore>): string[] {
  const out: string[] = [];
  for (const rec of store.records.get().values()) out.push(String(rec.get('title')));
  return out.sort();
}

/* ------------------------------- the tests ------------------------------- */

test('e2e: hello → snapshot delivers the seeded replica', async () => {
  const storage = new MemoryStorage();
  const node = new StateNode({ storage, adapter: new ScriptedAdapter() });
  await node.boot();
  const [a, b] = wirePair();
  node.attachPort(b as never);
  const store = connectStore(a as never);
  await settle();
  assert.equal(store.clientId.peek(), 1);
  assert.equal(store.records.get().size, 3); // 3 seeded projects
  assert.equal(node.lww.liveIds().length, 3);
});

test('e2e: optimistic create commits (pending drains, data persists)', async () => {
  const storage = new MemoryStorage();
  const adapter = new ScriptedAdapter();
  const node = new StateNode({ storage, adapter });
  await node.boot();
  const [a, b] = wirePair();
  node.attachPort(b as never);
  const store = connectStore(a as never);
  await settle();

  store.sendCreate({ title: 'New Project', summary: '', status: 'draft', sort: 9 });
  await settle(10);
  flushSignals();
  // optimistic: visible immediately, pending while in flight
  assert.ok(titles(store).includes('New Project'), 'optimistic insert must be visible');

  await settle(60);
  assert.equal(store.pending.get().size, 0, 'commit must drain pending');
  assert.equal(adapter.committed.length, 1);
  assert.ok(titles(store).includes('New Project'));
  node.flushPersistence();
  assert.equal(storage.snap?.records.filter((r) => r.dead === null).length, 4);
});

test('e2e: failed commit triggers deterministic rollback via inverse ops', async () => {
  const storage = new MemoryStorage();
  const adapter = new ScriptedAdapter();
  adapter.outcomes.push(false); // the next commit FAILS
  const node = new StateNode({ storage, adapter });
  await node.boot();
  const [a, b] = wirePair();
  node.attachPort(b as never);
  const store = connectStore(a as never);
  await settle();
  const before = store.records.get().size;

  store.sendCreate({ title: 'Doomed', summary: '', status: 'draft', sort: 9 });
  await settle(10);
  flushSignals();
  assert.ok(titles(store).includes('Doomed'), 'optimistic phase shows the row');

  await settle(60);
  flushSignals();
  assert.ok(!titles(store).includes('Doomed'), 'rollback must remove the row');
  assert.equal(store.records.get().size, before);
  assert.equal(store.pending.get().size, 0);
  const rej = store.rejected.get();
  assert.ok(rej !== null && rej.code === 'conflict');
});

test('e2e: set + del flow through the binary protocol', async () => {
  const storage = new MemoryStorage();
  const node = new StateNode({ storage, adapter: new ScriptedAdapter() });
  await node.boot();
  const [a, b] = wirePair();
  node.attachPort(b as never);
  const store = connectStore(a as never);
  await settle();

  const firstId = [...store.records.get().keys()][0] as string;
  store.sendSet(firstId, 'title', 'Renamed — معاد تسميته');
  await settle(60);
  assert.equal(store.records.get().get(firstId)?.get('title'), 'Renamed — معاد تسميته');

  store.sendDel(firstId);
  await settle(60);
  assert.ok(!store.records.get().has(firstId), 'del must remove the record');
  assert.equal(node.lww.isDeleted(firstId), true);
});

test('e2e: crash recovery — uncommitted ops replay from the oplog', async () => {
  const storage = new MemoryStorage();
  // Node A: op stays in flight, then "crashes" (never commits).
  const nodeA = new StateNode({ storage, adapter: new NeverAdapter() });
  await nodeA.boot();
  const [a1, b1] = wirePair();
  nodeA.attachPort(b1 as never);
  const storeA = connectStore(a1 as never);
  await settle();
  storeA.sendCreate({ title: 'InFlight', summary: '', status: 'draft', sort: 77 });
  await settle(20);
  assert.ok(titles(storeA).includes('InFlight'));
  assert.equal(storage.oplog.size, 1, 'uncommitted op must survive in the oplog');

  // Node B boots from the SAME storage: oplog replay restores the write.
  const nodeB = new StateNode({ storage, adapter: new ScriptedAdapter() });
  await nodeB.boot();
  assert.ok(
    nodeB.lww.liveIds().some((id) => nodeB.lww.getField(id, 'title') === 'InFlight'),
    'oplog replay must restore the in-flight write',
  );
});

test('e2e: malformed / oversized input is rejected without corrupting state', async () => {
  const storage = new MemoryStorage();
  const node = new StateNode({ storage, adapter: new ScriptedAdapter() });
  await node.boot();
  const [a, b] = wirePair();
  node.attachPort(b as never);
  const store = connectStore(a as never);
  await settle();

  // 100 KiB passes the wire budget (256 KiB) but violates the server-side
  // 64 KiB field budget → OpReject 'invalid', state untouched.
  store.sendCreate({ title: 'x'.repeat(100 * 1024), summary: '', status: 'draft', sort: 1 });
  await settle(40);
  flushSignals();
  assert.equal(store.records.get().size, 3, 'invalid op must not create a record');
  const rej = store.rejected.get();
  assert.ok(rej !== null && rej.code === 'invalid');
});
