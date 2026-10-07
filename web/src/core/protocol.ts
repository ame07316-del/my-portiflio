/**
 * core/protocol.ts — binary wire protocol between Main Thread ⇄ State Worker.
 *
 * JSON is banned on this hot path (serialization overhead + GC churn from
 * throwaway object graphs). Frames are compact little-endian binary:
 *
 *   [ tag u8 ][ seq u32 ][ payload … ]
 *
 * Strings carry a u32 byte-length prefix; readers validate the length
 * against BOTH the remaining buffer and MAX_STRING_BYTES before allocating
 * the slice — a forged length costs one comparison, not an OOM.
 *
 * @complexity encode: Time O(payload), Space O(payload).
 * @complexity decode: Time O(payload), all bounds checks O(1) each.
 */

import { MAX_MESSAGE_BYTES, MAX_STRING_BYTES } from './bounds.js';
import type { FieldCell, FieldValue, LwwOp } from './crdt.js';

export const Tag = {
  Hello: 1,
  Ack: 2,
  Err: 3,
  Sub: 4,
  Snapshot: 5,
  Op: 6,
  OpCommit: 7,
  OpReject: 8,
  Patch: 9,
  Telemetry: 10,
} as const;
export type TagId = (typeof Tag)[keyof typeof Tag];

export class ProtocolViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolViolation';
  }
}

/* ------------------------------------------------------------------ *
 * Writer — growable but HARD bounded at MAX_MESSAGE_BYTES.
 * ------------------------------------------------------------------ */
export class BinWriter {
  #buf: ArrayBuffer;
  #view: DataView;
  #u8: Uint8Array;
  #pos = 0;
  static readonly #encoder = new TextEncoder();

  constructor(initial = 256) {
    this.#buf = new ArrayBuffer(initial);
    this.#view = new DataView(this.#buf);
    this.#u8 = new Uint8Array(this.#buf);
  }

  get length(): number {
    return this.#pos;
  }

  /**
   * Grow before writing; the requested total is checked against the message
   * budget FIRST — allocation follows validation, never the reverse.
   * @complexity Time O(new size) amortized (doubling), Space O(new size).
   */
  #ensure(extra: number): void {
    const need = this.#pos + extra;
    if (need > MAX_MESSAGE_BYTES) {
      throw new ProtocolViolation(`message would exceed ${MAX_MESSAGE_BYTES} bytes`);
    }
    if (need <= this.#buf.byteLength) return;
    let cap = this.#buf.byteLength * 2;
    while (cap < need) cap *= 2;
    const next = new ArrayBuffer(cap);
    new Uint8Array(next).set(this.#u8);
    this.#buf = next;
    this.#view = new DataView(next);
    this.#u8 = new Uint8Array(next);
  }

  u8(v: number): this {
    this.#ensure(1);
    this.#view.setUint8(this.#pos, v);
    this.#pos += 1;
    return this;
  }

  u32(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
      throw new ProtocolViolation(`u32 out of range: ${v}`);
    }
    this.#ensure(4);
    this.#view.setUint32(this.#pos, v, true);
    this.#pos += 4;
    return this;
  }

  f64(v: number): this {
    if (!Number.isFinite(v)) throw new ProtocolViolation('f64 must be finite');
    this.#ensure(8);
    this.#view.setFloat64(this.#pos, v, true);
    this.#pos += 8;
    return this;
  }

  /** Length-prefixed UTF-8; byte budget validated pre-allocation. O(bytes). */
  str(s: string): this {
    const bytes = BinWriter.#encoder.encode(s);
    if (bytes.byteLength > MAX_STRING_BYTES) {
      throw new ProtocolViolation(`string exceeds ${MAX_STRING_BYTES} bytes`);
    }
    this.u32(bytes.byteLength);
    this.#ensure(bytes.byteLength);
    this.#u8.set(bytes, this.#pos);
    this.#pos += bytes.byteLength;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.u32(b.byteLength);
    this.#ensure(b.byteLength);
    this.#u8.set(b, this.#pos);
    this.#pos += b.byteLength;
    return this;
  }

  fieldValue(v: FieldValue): this {
    if (typeof v === 'string') return this.u8(0).str(v);
    if (typeof v === 'number') return this.u8(1).f64(v);
    if (typeof v === 'boolean') return this.u8(2).u8(v ? 1 : 0);
    return this.u8(3); // null = field tombstone
  }

  /** Detached copy of the written prefix — transfer-ready. O(pos). */
  finish(): Uint8Array {
    return this.#u8.slice(0, this.#pos);
  }
}

/* ------------------------------------------------------------------ *
 * Reader — every read is bounds-checked; every allocation is validated.
 * ------------------------------------------------------------------ */
export class BinReader {
  static readonly #decoder = new TextDecoder('utf-8', { fatal: true });
  readonly #u8: Uint8Array;
  readonly #view: DataView;
  #pos = 0;

  constructor(src: Uint8Array) {
    this.#u8 = src;
    this.#view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  }

  get done(): boolean {
    return this.#pos >= this.#u8.byteLength;
  }

  get remaining(): number {
    return this.#u8.byteLength - this.#pos;
  }

  #need(n: number): void {
    if (this.#pos + n > this.#u8.byteLength) {
      throw new ProtocolViolation(`truncated frame: need ${n} at ${this.#pos}`);
    }
  }

  u8(): number {
    this.#need(1);
    return this.#view.getUint8(this.#pos++);
  }

  u32(): number {
    this.#need(4);
    const v = this.#view.getUint32(this.#pos, true);
    this.#pos += 4;
    return v;
  }

  f64(): number {
    this.#need(8);
    const v = this.#view.getFloat64(this.#pos, true);
    this.#pos += 8;
    return v;
  }

  /** Validate length BEFORE allocating the slice. O(bytes). */
  str(): string {
    const len = this.u32();
    if (len > MAX_STRING_BYTES) throw new ProtocolViolation(`declared string length ${len} exceeds budget`);
    this.#need(len);
    const slice = this.#u8.subarray(this.#pos, this.#pos + len);
    this.#pos += len;
    return BinReader.#decoder.decode(slice);
  }

  bytes(): Uint8Array {
    const len = this.u32();
    if (len > MAX_MESSAGE_BYTES) throw new ProtocolViolation(`declared bytes length ${len} exceeds budget`);
    this.#need(len);
    const out = this.#u8.slice(this.#pos, this.#pos + len);
    this.#pos += len;
    return out;
  }

  fieldValue(): FieldValue {
    const t = this.u8();
    if (t === 0) return this.str();
    if (t === 1) return this.f64();
    if (t === 2) return this.u8() === 1;
    if (t === 3) return null;
    throw new ProtocolViolation(`unknown field tag ${t}`);
  }
}

/* ------------------------------------------------------------------ *
 * Frame header helpers
 * ------------------------------------------------------------------ */
export function beginFrame(w: BinWriter, tag: TagId, seq: number): BinWriter {
  return w.u8(tag).u32(seq);
}

export function readHeader(r: BinReader): { tag: number; seq: number } {
  return { tag: r.u8(), seq: r.u32() };
}

/* ------------------------------------------------------------------ *
 * Message codecs (CRDT payloads)
 * ------------------------------------------------------------------ */

/** Encode one CRDT op. @complexity O(fields of op). */
export function writeOp(w: BinWriter, opId: number, op: LwwOp): void {
  w.u32(opId);
  w.u32(op.ts);
  w.u32(op.actor);
  switch (op.kind) {
    case 'create': {
      w.u8(0).str(op.id);
      const entries = Object.entries(op.fields);
      w.u32(entries.length);
      for (const [field, v] of entries) w.str(field).fieldValue(v);
      return;
    }
    case 'set':
      w.u8(1).str(op.id).str(op.field).fieldValue(op.v);
      return;
    case 'del':
      w.u8(2).str(op.id);
      return;
  }
}

/** Decode one CRDT op. @complexity O(fields of op). */
export function readOp(r: BinReader): { opId: number; op: LwwOp } {
  const opId = r.u32();
  const ts = r.u32();
  const actor = r.u32();
  const kind = r.u8();
  if (kind === 0) {
    const id = r.str();
    const n = r.u32();
    const fields: Record<string, FieldValue> = {};
    for (let i = 0; i < n; i++) fields[r.str()] = r.fieldValue();
    return { opId, op: { kind: 'create', id, fields, ts, actor } };
  }
  if (kind === 1) {
    const id = r.str();
    const field = r.str();
    const v = r.fieldValue();
    return { opId, op: { kind: 'set', id, field, v, ts, actor } };
  }
  if (kind === 2) {
    return { opId, op: { kind: 'del', id: r.str(), ts, actor } };
  }
  throw new ProtocolViolation(`unknown op kind ${kind}`);
}

/** One live record as wire cells. @complexity O(fields). */
export function writeRecord(
  w: BinWriter,
  id: string,
  fields: ReadonlyMap<string, FieldCell>,
): void {
  w.str(id);
  w.u32(fields.size);
  for (const [field, cell] of fields) {
    w.str(field).fieldValue(cell.v).u32(cell.ts).u32(cell.actor);
  }
}

export function readRecord(
  r: BinReader,
): { id: string; fields: Map<string, FieldCell> } {
  const id = r.str();
  const n = r.u32();
  const fields = new Map<string, FieldCell>();
  for (let i = 0; i < n; i++) {
    const field = r.str();
    const v = r.fieldValue();
    const ts = r.u32();
    const actor = r.u32();
    fields.set(field, { v, ts, actor });
  }
  return { id, fields };
}
