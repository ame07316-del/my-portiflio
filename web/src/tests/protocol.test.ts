/** protocol.test.ts — binary frame round-trips + hostile-input defence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BinReader,
  BinWriter,
  ProtocolViolation,
  Tag,
  beginFrame,
  readHeader,
  readOp,
  readRecord,
  writeOp,
  writeRecord,
} from '../core/protocol.js';
import type { LwwOp } from '../core/crdt.js';

test('protocol: header + primitive round-trip', () => {
  const w = new BinWriter(8); // deliberately tiny → exercises growth
  beginFrame(w, Tag.Op, 77).u32(0xdeadbeef).f64(Math.PI).str('مرحبا sovereign — 你好');
  const r = new BinReader(w.finish());
  const h = readHeader(r);
  assert.equal(h.tag, Tag.Op);
  assert.equal(h.seq, 77);
  assert.equal(r.u32(), 0xdeadbeef);
  assert.equal(r.f64(), Math.PI);
  assert.equal(r.str(), 'مرحبا sovereign — 你好');
  assert.equal(r.done, true);
});

test('protocol: field values round-trip incl. null tombstone', () => {
  const w = new BinWriter();
  w.fieldValue('s').fieldValue(42.5).fieldValue(true).fieldValue(null);
  const r = new BinReader(w.finish());
  assert.equal(r.fieldValue(), 's');
  assert.equal(r.fieldValue(), 42.5);
  assert.equal(r.fieldValue(), true);
  assert.equal(r.fieldValue(), null);
});

test('protocol: ops round-trip for all three kinds', () => {
  const ops: Array<{ opId: number; op: LwwOp }> = [
    { opId: 1, op: { kind: 'create', id: 'p9', fields: { title: 'x', sort: 3, live: false }, ts: 5, actor: 1 } },
    { opId: 2, op: { kind: 'set', id: 'p9', field: 'title', v: 'y', ts: 6, actor: 1 } },
    { opId: 3, op: { kind: 'del', id: 'p9', ts: 7, actor: 1 } },
  ];
  const w = new BinWriter();
  for (const { opId, op } of ops) writeOp(w, opId, op);
  const r = new BinReader(w.finish());
  for (const expected of ops) {
    assert.deepEqual(readOp(r), expected);
  }
});

test('protocol: records round-trip', () => {
  const w = new BinWriter();
  const fields = new Map([
    ['title', { v: 'hello', ts: 3, actor: 1 }],
    ['sort', { v: 2, ts: 4, actor: 2 }],
  ] as const);
  writeRecord(w, 'p1', fields);
  const r = new BinReader(w.finish());
  const rec = readRecord(r);
  assert.equal(rec.id, 'p1');
  assert.deepEqual(rec.fields.get('title'), { v: 'hello', ts: 3, actor: 1 });
});

test('protocol: forged string length is rejected before allocation', () => {
  const w = new BinWriter();
  w.u32(0xffffffff); // claims 4 GiB of string
  const r = new BinReader(w.finish());
  assert.throws(() => r.str(), ProtocolViolation);
});

test('protocol: truncated frames throw, never read OOB', () => {
  const w = new BinWriter();
  beginFrame(w, Tag.Patch, 1).u32(1); // says 1 record, then nothing
  const r = new BinReader(w.finish());
  readHeader(r);
  assert.equal(r.u32(), 1);
  assert.throws(() => r.str(), ProtocolViolation);
});

test('protocol: writer refuses to exceed the message budget', () => {
  const w = new BinWriter();
  const chunk = new Uint8Array(1 << 16).fill(0x61);
  assert.throws(() => {
    for (let i = 0; i < 20; i++) w.bytes(chunk); // 20 × 64 KiB > 1 MiB budget
  }, ProtocolViolation);
});
