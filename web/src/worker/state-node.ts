/**
 * worker/state-node.ts — THE SOVEREIGN STATE NODE (engine, env-agnostic).
 *
 * All authoritative decisions live here: CRDT merges, optimistic
 * apply/rollback, id assignment, persistence, WASM compute hooks. The file
 * contains no browser globals — `state-worker.ts` wraps it for the browser
 * and tests wrap it with fakes, which is what makes the whole optimistic
 * pipeline machine-verifiable.
 *
 * Wire protocol: binary frames inside `{bin: ArrayBuffer}` envelopes (a
 * SharedArrayBuffer may ride along for telemetry/bench). JSON touches none
 * of this. Complexity budget per message: O(payload), no unbounded scans.
 */

import {
  LamportClock,
  LwwMap,
  type FieldCell,
  type FieldValue,
  type LwwOp,
  type LwwSnapshot,
} from '../core/crdt.js';
import {
  BinReader,
  BinWriter,
  ProtocolViolation,
  Tag,
  beginFrame,
  readHeader,
  writeRecord,
} from '../core/protocol.js';
import { ValidationFailure, bool, num, str, type Schema } from '../core/validate.js';
import { SpscRing } from '../core/ring.js';
import type { StateStorage } from '../core/storage.js';
import type { SyncAdapter } from './sync-adapter.js';
import type { WasmCore } from '../runtime/wasm-core.js';

/* ------------------------------------------------------------------ *
 * Ports & envelopes
 * ------------------------------------------------------------------ */
export interface WirePort {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (ev: MessageEvent) => void): void;
  start?(): void;
}

interface Envelope {
  bin: Uint8Array;
  sab?: SharedArrayBuffer;
}

/**
 * Realm-agnostic buffer checks. Envelopes cross structured-clone boundaries
 * (page ⇄ worker); `instanceof` against realm-foreign typed arrays can fail
 * on some engines, so we duck-type via @@toStringTag as the fallback.
 */
function isAB(x: unknown): x is ArrayBuffer {
  return (
    x instanceof ArrayBuffer ||
    (typeof x === 'object' && x !== null && Object.prototype.toString.call(x) === '[object ArrayBuffer]')
  );
}
function isU8(x: unknown): x is Uint8Array {
  return (
    x instanceof Uint8Array ||
    (typeof x === 'object' && x !== null && Object.prototype.toString.call(x) === '[object Uint8Array]')
  );
}
function isSAB(x: unknown): x is SharedArrayBuffer {
  return (
    x instanceof SharedArrayBuffer ||
    (typeof x === 'object' && x !== null && Object.prototype.toString.call(x) === '[object SharedArrayBuffer]')
  );
}

function toEnvelope(data: unknown): Envelope | null {
  if (isAB(data)) return { bin: new Uint8Array(data) };
  if (isU8(data)) return { bin: data };
  if (typeof data === 'object' && data !== null && 'bin' in data) {
    const d = data as { bin: unknown; sab?: unknown };
    const bin = isAB(d.bin) ? new Uint8Array(d.bin) : isU8(d.bin) ? d.bin : null;
    if (bin === null) return null;
    const sab = isSAB(d.sab) ? d.sab : undefined;
    return { bin, sab };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Validation schemas (bounds checked BEFORE any allocation)
 * ------------------------------------------------------------------ */
const idSchema = str({ maxBytes: 96, minBytes: 0 });
const fieldSchema = str({ maxBytes: 64, minBytes: 1 });
const valueSchema: Schema<FieldValue> = {
  parse(input: unknown, path = '$'): FieldValue {
    if (input === null) return null;
    if (typeof input === 'string') return str({ maxBytes: 65536 }).parse(input, path);
    if (typeof input === 'number') return num({ min: -1e12, max: 1e12 }).parse(input, path);
    if (typeof input === 'boolean') return bool().parse(input, path);
    throw new ValidationFailure(path, 'TYPE', 'field value must be string|number|boolean|null');
  },
};

type Undo =
  | { kind: 'create'; id: string }
  | { kind: 'set'; id: string; field: string; prev: FieldCell | null }
  | { kind: 'del'; id: string; prevFields: Array<[string, FieldCell]> | null };

export interface StateNodeDeps {
  storage: StateStorage;
  adapter: SyncAdapter;
}

/**
 * One sovereign state node. Attach any number of wire ports; they share a
 * single authoritative CRDT replica with optimistic-commit semantics.
 */
export class StateNode {
  readonly lww = new LwwMap();
  clock = new LamportClock(1, 0);
  entitySeq = 1;

  readonly #storage: StateStorage;
  readonly #adapter: SyncAdapter;
  readonly #clients = new Set<Client>();
  readonly #pending = new Map<number, { origin: Client; op: LwwOp; undo: Undo }>();
  #wasm: WasmCore | null = null;
  #ring: SpscRing | null = null;
  #nextClientId = 1;
  #snapTimer: ReturnType<typeof setTimeout> | null = null;
  #benchTimer: ReturnType<typeof setInterval> | null = null;
  #bench = { n: 0, aOff: 0, bOff: 0, dOff: 0, view: null as Float32Array | null };

  constructor(deps: StateNodeDeps) {
    this.#storage = deps.storage;
    this.#adapter = deps.adapter;
  }

  /* ------------------------------------------------------------ *
   * Boot: restore → replay oplog → seed → optional WASM loader
   * ------------------------------------------------------------ */
  async boot(wasmLoader?: () => Promise<WasmCore | null>): Promise<void> {
    const meta = await this.#storage.loadMeta();
    if (meta !== undefined) {
      if (typeof meta.ts === 'number') this.clock.observe(meta.ts);
      if (typeof meta.entitySeq === 'number') this.entitySeq = meta.entitySeq;
    }
    const snap = await this.#storage.loadSnapshot();
    if (snap !== undefined) this.lww.load(snap);

    const backlog = await this.#storage.oplogAll();
    backlog.sort((x, y) => x.opId - y.opId);
    for (const { op } of backlog) {
      this.clock.observe(op.ts);
      this.lww.apply(op);
    }

    if (this.lww.size === 0) this.#seed();
    if (wasmLoader !== undefined) {
      try {
        this.#wasm = await wasmLoader();
      } catch {
        this.#wasm = null; // degraded: hashing/bench off, CRDT intact
      }
    }
  }

  #seed(): void {
    const samples: Array<Record<string, FieldValue>> = [
      {
        title: 'Interactive Restaurant Menu', title_ar: 'منيو مطعم تفاعلي',
        summary: 'QR-first digital menu with a full admin dashboard: dishes, categories, prices and one-tap availability.',
        summary_ar: 'منيو رقمي يعمل بالـ QR مع لوحة تحكم كاملة: أصناف وأقسام وأسعار وإتاحة الصنف بضغطة واحدة.',
        url: 'https://interactive-restaurant-menu-one.vercel.app/', status: 'live', sort: 1,
      },
      {
        title: 'Gym & Fitness Platform', title_ar: 'منصة جيم ولياقة',
        summary: 'Conversion-focused gym site: timetable, membership plans and a protected staff dashboard.',
        summary_ar: 'موقع جيم مصمم للتحويل: جدول الحصص وباقات الاشتراك ولوحة إدارة محمية للفريق.',
        url: 'https://gym-fitness-liard.vercel.app/', status: 'live', sort: 2,
      },
      {
        title: 'EstateHub Pro', title_ar: 'منصة العقارات',
        summary: 'Property listing hub with rich search, filtering and detailed pages that scale to thousands of units.',
        summary_ar: 'منصة عقارات ببحث متقدم وفلاتر وصفحات تفاصيل تستحمل من عشرات لآلاف الوحدات.',
        url: 'https://estate-hub-pro.vercel.app/', status: 'live', sort: 3,
      },
    ];
    for (const fields of samples) {
      this.lww.apply({
        kind: 'create',
        id: `p${this.entitySeq++}`,
        fields,
        ts: this.clock.tick(),
        actor: this.clock.actor,
      });
    }
    this.#persistSoon();
  }

  /* ------------------------------------------------------------ *
   * Clients
   * ------------------------------------------------------------ */
  attachPort(port: WirePort): Client {
    const client = new Client(port, this.#nextClientId++);
    this.#clients.add(client);
    port.addEventListener('message', (ev: MessageEvent) => {
      const env = toEnvelope(ev.data);
      if (env === null) return;
      this.#handle(client, env);
    });
    port.start?.();
    return client;
  }

  /* ------------------------------------------------------------ *
   * Frame builders
   * ------------------------------------------------------------ */
  #frameAck(seq: number, clientId: number): Uint8Array {
    const w = new BinWriter(32);
    beginFrame(w, Tag.Ack, seq).u32(clientId);
    return w.finish();
  }

  #frameErr(seq: number, message: string): Uint8Array {
    const w = new BinWriter(64);
    beginFrame(w, Tag.Err, seq).str(message);
    return w.finish();
  }

  /** Live-id content hash via WASM fnv1a32. @complexity O(total id bytes). */
  #contentHash(): number {
    if (this.#wasm === null) return 0;
    const ids = this.lww.liveIds().sort().join('|');
    return this.#wasm.fnv1a32(new TextEncoder().encode(ids));
  }

  #frameRecords(tag: number, seq: number, ids: string[], deleted: string[]): Uint8Array {
    const w = new BinWriter(512);
    beginFrame(w, tag as (typeof Tag)[keyof typeof Tag], seq);
    const liveIds = ids.filter((id) => !this.lww.isDeleted(id));
    w.u32(liveIds.length);
    for (const id of liveIds) {
      const cells = this.lww.record(id);
      if (cells === null) continue;
      writeRecord(w, id, cells);
    }
    w.u32(deleted.length);
    for (const id of deleted) w.str(id);
    w.u32(this.#contentHash());
    return w.finish();
  }

  #broadcast(frame: Uint8Array, except?: Client): void {
    for (const c of this.#clients) {
      if (c === except || !c.subscribed) continue;
      c.send(frame.slice(0)); // one logical frame, one transfer per client
    }
  }

  /* ------------------------------------------------------------ *
   * Optimistic apply / rollback
   * ------------------------------------------------------------ */
  #captureUndo(op: LwwOp): Undo {
    switch (op.kind) {
      case 'create':
        return { kind: 'create', id: op.id };
      case 'set': {
        const cells = this.lww.record(op.id);
        return { kind: 'set', id: op.id, field: op.field, prev: cells?.get(op.field) ?? null };
      }
      case 'del': {
        const cells = this.lww.record(op.id);
        return { kind: 'del', id: op.id, prevFields: cells === null ? null : [...cells.entries()] };
      }
    }
  }

  /** Inverse ops stamped AFTER the rolled-back op → they win deterministically. */
  #applyUndo(u: Undo): void {
    const ts = this.clock.tick();
    const actor = this.clock.actor;
    switch (u.kind) {
      case 'create':
        this.lww.apply({ kind: 'del', id: u.id, ts, actor });
        return;
      case 'set':
        this.lww.apply({
          kind: 'set',
          id: u.id,
          field: u.field,
          v: u.prev === null ? null : u.prev.v,
          ts,
          actor,
        });
        return;
      case 'del':
        if (u.prevFields === null) return;
        {
          const fields: Record<string, FieldValue> = {};
          for (const [f, c] of u.prevFields) if (c.v !== null) fields[f] = c.v;
          this.lww.apply({ kind: 'create', id: u.id, fields, ts, actor });
        }
        return;
    }
  }

  /* ------------------------------------------------------------ *
   * Persistence (debounced snapshot; oplog per op)
   * ------------------------------------------------------------ */
  #persistSoon(): void {
    if (this.#snapTimer !== null) return;
    this.#snapTimer = setTimeout(() => {
      this.#snapTimer = null;
      void this.#storage.saveSnapshot(this.lww.snapshot());
      void this.#storage.saveMeta({
        actor: this.clock.actor,
        ts: this.clock.current,
        entitySeq: this.entitySeq,
      });
    }, 250);
  }

  /** Test hook: flush the debounced persistence immediately. */
  flushPersistence(): void {
    if (this.#snapTimer !== null) {
      clearTimeout(this.#snapTimer);
      this.#snapTimer = null;
    }
    void this.#storage.saveSnapshot(this.lww.snapshot());
    void this.#storage.saveMeta({
      actor: this.clock.actor,
      ts: this.clock.current,
      entitySeq: this.entitySeq,
    });
  }

  /* ------------------------------------------------------------ *
   * Op pipeline
   * ------------------------------------------------------------ */
  #validateWireOp(r: BinReader): { op: LwwOp } {
    const ts = r.u32();
    const actor = r.u32();
    const kind = r.u8();
    if (ts > 0xfffffffe) throw new ProtocolViolation('ts overflow');
    if (kind === 0) {
      let id = idSchema.parse(r.str(), 'op.id');
      const n = r.u32();
      if (n > 64) throw new ProtocolViolation('too many fields in create');
      const fields: Record<string, FieldValue> = {};
      for (let i = 0; i < n; i++) {
        const field = fieldSchema.parse(r.str(), 'op.field');
        fields[field] = valueSchema.parse(r.fieldValue(), `op.fields.${field}`);
      }
      if (id === '') id = `p${this.entitySeq++}`;
      return { op: { kind: 'create', id, fields, ts, actor } };
    }
    if (kind === 1) {
      const id = idSchema.parse(r.str(), 'op.id');
      const field = fieldSchema.parse(r.str(), 'op.field');
      const v = valueSchema.parse(r.fieldValue(), 'op.v');
      return { op: { kind: 'set', id, field, v, ts, actor } };
    }
    if (kind === 2) {
      const id = idSchema.parse(r.str(), 'op.id');
      return { op: { kind: 'del', id, ts, actor } };
    }
    throw new ProtocolViolation(`unknown op kind ${kind}`);
  }

  #frameOpTagged(seq: number, tag: number, opId: number, code?: string): Uint8Array {
    const w = new BinWriter(32);
    beginFrame(w, tag as (typeof Tag)[keyof typeof Tag], seq).u32(opId);
    if (code !== undefined) w.str(code);
    return w.finish();
  }

  #handleOp(client: Client, seq: number, opId: number, r: BinReader): void {
    let parsed: { op: LwwOp };
    try {
      parsed = this.#validateWireOp(r);
    } catch {
      client.send(this.#frameOpTagged(seq, Tag.OpReject, opId, 'invalid'));
      return;
    }
    const raw = parsed.op;
    const op = { ...raw, ts: this.clock.tick(), actor: this.clock.actor } as LwwOp;

    const undo = this.#captureUndo(op);
    const changed = this.lww.apply(op);
    if (!changed) {
      client.send(this.#frameOpTagged(seq, Tag.OpReject, opId, 'stale'));
      return;
    }

    this.#pending.set(opId, { origin: client, op, undo });
    void this.#storage.oplogPut(opId, op);

    client.send(this.#frameOpTagged(seq, Tag.Ack, opId));
    this.#broadcast(this.#frameRecords(Tag.Patch, seq, [op.id], op.kind === 'del' ? [op.id] : []));
    this.#persistSoon();

    void this.#adapter.commit(op).then((res) => {
      const entry = this.#pending.get(opId);
      if (entry === undefined) return; // already resolved
      this.#pending.delete(opId);
      if (res.ok) {
        void this.#storage.oplogDelete(opId);
        entry.origin.send(this.#frameOpTagged(seq, Tag.OpCommit, opId));
        this.#persistSoon();
        return;
      }
      this.#applyUndo(entry.undo);
      const alive = !this.lww.isDeleted(op.id);
      this.#broadcast(this.#frameRecords(Tag.Patch, seq, alive ? [op.id] : [], alive ? [] : [op.id]));
      entry.origin.send(this.#frameOpTagged(seq, Tag.OpReject, opId, res.code ?? 'conflict'));
      this.#persistSoon();
    });
  }

  /* ------------------------------------------------------------ *
   * Bench: WASM particle morph into a SharedArrayBuffer
   * ------------------------------------------------------------ */
  #benchStart(n: number, sab: SharedArrayBuffer): void {
    if (this.#wasm === null || n <= 0 || n > 65536) return;
    this.#benchStop();
    const lanes = n * 3;
    this.#bench.n = n;
    this.#bench.aOff = 0;
    this.#bench.bOff = lanes * 4;
    this.#bench.dOff = lanes * 8;
    this.#bench.view = new Float32Array(sab);

    const a = new Float32Array(lanes);
    const b = new Float32Array(lanes);
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = GOLDEN * i;
      a[i * 3] = Math.cos(th) * rad;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = Math.sin(th) * rad;
      const u = (i / n) * Math.PI * 2;
      b[i * 3] = (Math.sin(u) + 2 * Math.sin(2 * u)) * 0.35;
      b[i * 3 + 1] = (Math.cos(u) - 2 * Math.cos(3 * u)) * 0.35;
      b[i * 3 + 2] = -Math.sin(3 * u) * 0.35;
    }
    this.#wasm.upload(this.#bench.aOff, new Uint8Array(a.buffer));
    this.#wasm.upload(this.#bench.bOff, new Uint8Array(b.buffer));

    let phase = 0;
    this.#benchTimer = setInterval(() => {
      if (this.#wasm === null || this.#bench.view === null) return;
      const t0 = performance.now();
      phase += 0.02;
      const t = 0.5 + 0.5 * Math.sin(phase);
      this.#wasm.morphInMemory(this.#bench.dOff, this.#bench.aOff, this.#bench.bOff, lanes, t);
      this.#bench.view.set(this.#wasm.f32View(this.#bench.dOff, lanes));
      const us = Math.min(0x7fffffff, Math.round((performance.now() - t0) * 1000));
      if (this.#ring !== null) this.#ring.tryPush(us); // sheds when full
    }, 16);
  }

  #benchStop(): void {
    if (this.#benchTimer !== null) {
      clearInterval(this.#benchTimer);
      this.#benchTimer = null;
    }
  }

  /* ------------------------------------------------------------ *
   * Dispatch
   * ------------------------------------------------------------ */
  #handle(client: Client, env: Envelope): void {
    let r: BinReader;
    try {
      r = new BinReader(env.bin);
    } catch {
      return; // garbage frame: drop (load shedding)
    }
    let header: { tag: number; seq: number };
    try {
      header = readHeader(r);
    } catch {
      return;
    }
    const { tag, seq } = header;

    try {
      switch (tag) {
        case Tag.Hello: {
          if (env.sab !== undefined) this.#ring = SpscRing.over(env.sab);
          client.send(this.#frameAck(seq, client.id));
          client.send(this.#frameRecords(Tag.Snapshot, seq, this.lww.liveIds(), []));
          return;
        }
        case Tag.Sub: {
          client.subscribed = true;
          client.send(this.#frameAck(seq, client.id));
          return;
        }
        case Tag.Snapshot: {
          client.send(this.#frameRecords(Tag.Snapshot, seq, this.lww.liveIds(), []));
          return;
        }
        case Tag.Op: {
          const opId = r.u32();
          this.#handleOp(client, seq, opId, r);
          return;
        }
        case Tag.Telemetry: {
          const cmd = r.u8();
          if (cmd === 0) {
            const n = r.u32();
            if (env.sab !== undefined) this.#benchStart(n, env.sab);
          } else {
            this.#benchStop();
          }
          return;
        }
        default:
          client.send(this.#frameErr(seq, `unknown tag ${tag}`));
      }
    } catch (e) {
      const msg =
        e instanceof ProtocolViolation || e instanceof ValidationFailure ? e.message : 'internal error';
      try {
        client.send(this.#frameErr(seq, msg));
      } catch {
        /* client gone */
      }
    }
  }

  shutdown(): void {
    this.#benchStop();
    if (this.#snapTimer !== null) clearTimeout(this.#snapTimer);
  }
}

export class Client {
  readonly id: number;
  subscribed = true;
  constructor(
    private readonly port: WirePort,
    id: number,
  ) {
    this.id = id;
  }

  /** Send one binary frame; the buffer is TRANSFERRED, not copied. O(frame). */
  send(frame: Uint8Array): void {
    this.port.postMessage({ bin: frame.buffer }, [frame.buffer]);
  }
}
