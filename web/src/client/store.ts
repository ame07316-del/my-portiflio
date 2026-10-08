/**
 * client/store.ts — the Main-Thread mirror of the worker's CRDT state,
 * exposed as fine-grained signals.
 *
 * Dataflow (one direction only):
 *   Worker --binary frame--> parse --> immutable view swap --> signal.set()
 *   signal --> effect --> scheduleWrite() --> rAF DOM paint
 *
 * The UI NEVER mutates state; it dispatches ops. Truth lives in the worker.
 * Optimistic semantics: `pending` holds in-flight opIds; OpCommit removes,
 * OpReject removes AND raises `rejected` so the UI can surface the rollback
 * (the worker has already applied the inverse ops — the next Patch carries
 * the reverted records, so no manual un-rendering is needed here).
 *
 * @complexity per Patch: Time O(records in frame), Space O(view) — one new
 * Map per update, old Map becomes garbage only when V8 proves it dead.
 */

import type { FieldCell, FieldValue, LwwOp } from '../core/crdt.js';
import {
  BinReader,
  BinWriter,
  Tag,
  beginFrame,
  readHeader,
  readRecord,
  writeOp,
} from '../core/protocol.js';
import { batch, signal, type Signal } from '../runtime/signal.js';
import type { WirePort } from './spawn-worker.js';

export type RecordView = ReadonlyMap<string, FieldValue>;

export interface StoreEvents {
  onReady?: (clientId: number) => void;
  onError?: (message: string) => void;
}

export interface StoreHandle {
  readonly records: Signal<ReadonlyMap<string, RecordView>>;
  readonly pending: Signal<ReadonlySet<number>>;
  readonly rejected: Signal<{ opId: number; code: string } | null>;
  readonly contentHash: Signal<number>;
  readonly clientId: Signal<number>;
  sendCreate(fields: Record<string, FieldValue>): number;
  sendSet(id: string, field: string, v: FieldValue): number;
  sendDel(id: string): number;
  sendBenchStart(sab: SharedArrayBuffer, n: number): void;
  sendBenchStop(): void;
}

function cellsToView(fields: Map<string, FieldCell>): RecordView {
  const m = new Map<string, FieldValue>();
  for (const [k, c] of fields) if (c.v !== null) m.set(k, c.v);
  return m;
}

/** Parse a Snapshot/Patch payload. @complexity O(records + deleted). */
function readRecordsFrame(r: BinReader): {
  records: Array<{ id: string; view: RecordView }>;
  deleted: string[];
  hash: number;
} {
  const n = r.u32();
  const records: Array<{ id: string; view: RecordView }> = [];
  for (let i = 0; i < n; i++) {
    const { id, fields } = readRecord(r);
    records.push({ id, view: cellsToView(fields) });
  }
  const d = r.u32();
  const deleted: string[] = [];
  for (let i = 0; i < d; i++) deleted.push(r.str());
  const hash = r.u32();
  return { records, deleted, hash };
}

export function connectStore(port: WirePort, opts: { ring?: SharedArrayBuffer; events?: StoreEvents } = {}): StoreHandle {
  const records = signal<ReadonlyMap<string, RecordView>>(new Map());
  const pending = signal<ReadonlySet<number>>(new Set());
  const rejected = signal<{ opId: number; code: string } | null>(null);
  const contentHash = signal<number>(0);
  const clientId = signal<number>(0);

  const view = new Map<string, RecordView>();
  let seq = 0;
  let opCounter = 0;
  let attached = false;

  function send(bin: Uint8Array, sab?: SharedArrayBuffer): void {
    if (sab !== undefined) port.postMessage({ bin: bin.buffer, sab });
    else port.postMessage({ bin: bin.buffer }, [bin.buffer]);
  }

  function publish(): void {
    batch(() => {
      records.set(new Map(view)); // immutable swap → effects see one change
      contentHash.set(lastHash);
    });
  }
  let lastHash = 0;

  function applyFrame(tag: number, r: BinReader): void {
    const { records: recs, deleted, hash } = readRecordsFrame(r);
    lastHash = hash;
    for (const { id, view: v } of recs) view.set(id, v);
    for (const id of deleted) view.delete(id);
    publish();
    if (tag === Tag.Snapshot && !attached) {
      attached = true;
      opts.events?.onReady?.(clientId.peek());
    }
  }

  port.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as { bin?: ArrayBuffer | Uint8Array } | ArrayBuffer | Uint8Array;
    // Realm-agnostic: worker→page buffers cross a structured-clone boundary.
    const isAB = (x: unknown): x is ArrayBuffer =>
      x instanceof ArrayBuffer ||
      (typeof x === 'object' && x !== null && Object.prototype.toString.call(x) === '[object ArrayBuffer]');
    const isU8 = (x: unknown): x is Uint8Array =>
      x instanceof Uint8Array ||
      (typeof x === 'object' && x !== null && Object.prototype.toString.call(x) === '[object Uint8Array]');
    const raw = isAB(data)
      ? new Uint8Array(data)
      : isU8(data)
        ? data
        : data !== null && typeof data === 'object' && 'bin' in data && isAB(data.bin)
          ? new Uint8Array(data.bin)
          : null;
    if (raw === null) return;
    let r: BinReader;
    let header: { tag: number; seq: number };
    try {
      r = new BinReader(raw);
      header = readHeader(r);
    } catch {
      return; // drop malformed frames
    }
    switch (header.tag) {
      case Tag.Ack: {
        const id = r.u32();
        if (!attached) {
          clientId.set(id); // Hello ack
        } else {
          batch(() => {
            const next = new Set(pending.peek());
            next.delete(id); // opId ack == op accepted for processing
            pending.set(next);
          });
        }
        return;
      }
      case Tag.Snapshot:
        view.clear();
        applyFrame(header.tag, r);
        return;
      case Tag.Patch:
        applyFrame(header.tag, r);
        return;
      case Tag.OpCommit: {
        const opId = r.u32();
        batch(() => {
          const next = new Set(pending.peek());
          next.delete(opId);
          pending.set(next);
        });
        return;
      }
      case Tag.OpReject: {
        const opId = r.u32();
        const code = r.str();
        batch(() => {
          const next = new Set(pending.peek());
          next.delete(opId);
          pending.set(next);
          rejected.set({ opId, code });
        });
        return;
      }
      case Tag.Err:
        opts.events?.onError?.(r.str());
        return;
      default:
        return;
    }
  });
  port.start?.();

  // Hello — rides the telemetry ring SAB when provided.
  {
    const w = new BinWriter(16);
    beginFrame(w, Tag.Hello, ++seq).u32(0);
    send(w.finish(), opts.ring);
  }

  function pushPending(opId: number): void {
    batch(() => {
      const next = new Set(pending.peek());
      next.add(opId);
      pending.set(next);
    });
  }

  /** Serialize + dispatch one op. @complexity O(fields). */
  function dispatch(op: LwwOp): number {
    const opId = ++opCounter;
    const w = new BinWriter(128);
    beginFrame(w, Tag.Op, ++seq);
    writeOp(w, opId, op); // ts/actor are placeholders — the worker stamps
    pushPending(opId);
    send(w.finish());
    return opId;
  }

  return {
    records,
    pending,
    rejected,
    contentHash,
    clientId,
    sendCreate: (fields) => dispatch({ kind: 'create', id: '', fields, ts: 0, actor: 0 }),
    sendSet: (id, field, v) => dispatch({ kind: 'set', id, field, v, ts: 0, actor: 0 }),
    sendDel: (id) => dispatch({ kind: 'del', id, ts: 0, actor: 0 }),
    sendBenchStart: (sab, n) => {
      const w = new BinWriter(16);
      beginFrame(w, Tag.Telemetry, ++seq).u8(0).u32(n);
      send(w.finish(), sab);
    },
    sendBenchStop: () => {
      const w = new BinWriter(16);
      beginFrame(w, Tag.Telemetry, ++seq).u8(1);
      send(w.finish());
    },
  };
}
