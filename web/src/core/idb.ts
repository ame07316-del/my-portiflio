/**
 * core/idb.ts — minimal promise wrapper over IndexedDB.
 *
 * The local node of the local-first architecture. Two stores, fixed schema
 * (the IndexedDB analogue of prepared statements — object stores and
 * keypaths are declared ONCE at version upgrade, never ad-hoc):
 *
 *   kv     { k: string, v: unknown }              — snapshot + meta
 *   oplog  { opId: number, op: LwwOp }            — uncommitted local ops
 *
 * Crash semantics: on boot we load the snapshot then REPLAY the oplog, so a
 * reload mid-flight never loses the user's writes (CRDT ops are the truth).
 *
 * @complexity put/get/delete: Time O(log n) B-tree-ish per IDB internals, Space O(value).
 * @complexity getAll: Time O(n), Space O(n).
 */

import type { LwwOp, LwwSnapshot } from './crdt.js';
import type { StateMeta, StateStorage } from './storage.js';

const DB_NAME = 'portfolio-edge';
const DB_VERSION = 1;

// TEMP-DIAG (revert before merge): breadcrumb hook (set by the worker shell).
const __wsdiag = (s: string): void => {
  (globalThis as { __wsdiag?: (s: string) => void }).__wsdiag?.(s);
};

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Open (and memoize) the database, creating stores on first run. */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('oplog')) db.createObjectStore('oplog', { keyPath: 'opId' });
    };
    open.onsuccess = () => {
      __wsdiag('idb-open-ok');
      resolve(open.result);
    };
    open.onerror = () => {
      __wsdiag('idb-open-err: ' + String(open.error));
      reject(open.error ?? new Error('IndexedDB open failed'));
    };
    open.onblocked = () => {
      __wsdiag('idb-blocked');
      reject(new Error('IndexedDB open blocked by another tab'));
    };
  });
  return dbPromise;
}

export async function kvGet<T>(k: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await req<{ k: string; v: T } | undefined>(
    db.transaction('kv', 'readonly').objectStore('kv').get(k) as IDBRequest<{ k: string; v: T } | undefined>,
  );
  return row?.v;
}

export async function kvPut(k: string, v: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put({ k, v });
  await txDone(tx);
}

export async function oplogPut(opId: number, op: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('oplog', 'readwrite');
  tx.objectStore('oplog').put({ opId, op });
  await txDone(tx);
}

export async function oplogDelete(opId: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('oplog', 'readwrite');
  tx.objectStore('oplog').delete(opId);
  await txDone(tx);
}

export async function oplogAll(): Promise<Array<{ opId: number; op: unknown }>> {
  const db = await openDb();
  return req(db.transaction('oplog', 'readonly').objectStore('oplog').getAll());
}

/** `StateStorage` adapter over the two fixed stores. @complexity per-op O(value). */
export function idbStorage(): StateStorage {
  return {
    loadMeta: () => kvGet<StateMeta>('meta'),
    saveMeta: (meta) => kvPut('meta', meta),
    loadSnapshot: () => kvGet<LwwSnapshot>('snap'),
    saveSnapshot: (snap) => kvPut('snap', snap),
    oplogAll: async () => {
      const rows = await oplogAll();
      return rows.map((r) => ({ opId: r.opId, op: r.op as LwwOp }));
    },
    oplogPut: (opId, op) => oplogPut(opId, op),
    oplogDelete: (opId) => oplogDelete(opId),
  };
}
