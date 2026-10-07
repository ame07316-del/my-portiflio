/**
 * core/storage.ts — persistence seam for the state node.
 *
 * The browser implementation is IndexedDB (core/idb.ts); tests inject an
 * in-memory fake. Same contract as prepared statements: the schema and the
 * operations are fixed — callers never improvise storage access.
 */

import type { LwwOp, LwwSnapshot } from './crdt.js';

export interface StateMeta {
  actor?: number;
  ts?: number;
  entitySeq?: number;
}

export interface StateStorage {
  loadMeta(): Promise<StateMeta | undefined>;
  saveMeta(meta: StateMeta): Promise<void>;
  loadSnapshot(): Promise<LwwSnapshot | undefined>;
  saveSnapshot(snap: LwwSnapshot): Promise<void>;
  oplogAll(): Promise<Array<{ opId: number; op: LwwOp }>>;
  oplogPut(opId: number, op: LwwOp): Promise<void>;
  oplogDelete(opId: number): Promise<void>;
}

/** Volatile storage for integration tests. @complexity all ops O(1)/O(n). */
export class MemoryStorage implements StateStorage {
  meta: StateMeta | undefined;
  snap: LwwSnapshot | undefined;
  readonly oplog = new Map<number, LwwOp>();

  loadMeta(): Promise<StateMeta | undefined> {
    return Promise.resolve(this.meta);
  }
  saveMeta(meta: StateMeta): Promise<void> {
    this.meta = meta;
    return Promise.resolve();
  }
  loadSnapshot(): Promise<LwwSnapshot | undefined> {
    return Promise.resolve(this.snap);
  }
  saveSnapshot(snap: LwwSnapshot): Promise<void> {
    this.snap = snap;
    return Promise.resolve();
  }
  oplogAll(): Promise<Array<{ opId: number; op: LwwOp }>> {
    return Promise.resolve([...this.oplog.entries()].map(([opId, op]) => ({ opId, op })));
  }
  oplogPut(opId: number, op: LwwOp): Promise<void> {
    this.oplog.set(opId, op);
    return Promise.resolve();
  }
  oplogDelete(opId: number): Promise<void> {
    this.oplog.delete(opId);
    return Promise.resolve();
  }
}
