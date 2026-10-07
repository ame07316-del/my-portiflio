#!/usr/bin/env node
/**
 * tools/wasm-assemble.mjs — hand-rolled WebAssembly binary assembler.
 *
 * Zero external tooling (no wabt, no emscripten): emits the exact byte
 * sequence of `core.wasm` per the WebAssembly binary spec
 * (https://webassembly.github.io/spec/core/binary/index.html).
 *
 * Exported functions (all operate on the module's linear memory):
 *   fnv1a32(ptr, len) -> u32        FNV-1a 32-bit hash.      Time O(len), Space O(1)
 *   ct_eq(a, b, len)  -> 0|1        Constant-time byte equality (no early exit).
 *                                                            Time O(len), Space O(1)
 *   f32_morph(dst, a, b, n, t)      dst[i] = a[i] + (b[i]-a[i]) * t over n f32 lanes.
 *                                                            Time O(n),   Space O(1)
 *
 * Memory: 16 pages initial (1 MiB), 256 pages max (16 MiB) — bounded growth,
 * the host wrapper refuses inputs that would exceed the budget (OOM guard).
 *
 * @complexity Build time O(output bytes) ≈ O(1) for this fixed program.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * LEB128 + section helpers
 * ------------------------------------------------------------------ */
const uleb = (n) => {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    out.push(b);
  } while (n !== 0);
  return out;
};

const sleb = (value) => {
  const out = [];
  let n = value;
  let more = true;
  while (more) {
    let b = n & 0x7f;
    n >>= 7;
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) {
      more = false;
    } else {
      b |= 0x80;
    }
    out.push(b);
  }
  return out;
};

const vec = (items) => [...uleb(items.length), ...items.flat()];
const utf8 = (s) => {
  const b = [...new TextEncoder().encode(s)];
  return [...uleb(b.length), ...b];
};
const section = (id, body) => [id, ...uleb(body.length), ...body];

/* ------------------------------------------------------------------ *
 * Opcodes used
 * ------------------------------------------------------------------ */
const I32 = 0x7f;
const F32 = 0x7d;
const op = {
  end: 0x0b,
  br: 0x0c,
  br_if: 0x0d,
  block: 0x02,
  loop: 0x03,
  local_get: 0x20,
  local_set: 0x21,
  i32_const: 0x41,
  i32_eqz: 0x45,
  i32_ge_u: 0x4f,
  i32_add: 0x6a,
  i32_mul: 0x6c,
  i32_or: 0x72,
  i32_xor: 0x73,
  i32_shl: 0x74,
  i32_load8_u: 0x2d,
  f32_load: 0x2a,
  f32_store: 0x38,
  f32_add: 0x92,
  f32_sub: 0x93,
  f32_mul: 0x94,
};
const get = (i) => [op.local_get, ...uleb(i)];
const set = (i) => [op.local_set, ...uleb(i)];
const iconst = (v) => [op.i32_const, ...sleb(v)];
const load8 = (align = 0, offset = 0) => [op.i32_load8_u, ...uleb(align), ...uleb(offset)];
const fload = (align = 2, offset = 0) => [op.f32_load, ...uleb(align), ...uleb(offset)];
const fstore = (align = 2, offset = 0) => [op.f32_store, ...uleb(align), ...uleb(offset)];
const VOID = 0x40;

/* ------------------------------------------------------------------ *
 * Body: fnv1a32(ptr=0, len=1) -> u32 ; locals: h=2, i=3
 * h = 2166136261; per byte: h = (h ^ byte) * 16777619 (wraps mod 2^32)
 * ------------------------------------------------------------------ */
const FNV_OFFSET = 2166136261; // 0x811C9DC5
const FNV_PRIME = 16777619; // 0x01000193

const fnv1a32Body = [
  ...iconst(FNV_OFFSET), ...set(2),
  ...iconst(0), ...set(3),
  op.block, VOID,
    op.loop, VOID,
      ...get(3), ...get(1), op.i32_ge_u, op.br_if, 0x01, // i >= len -> done
      ...get(2),
      ...get(0), ...get(3), op.i32_add, ...load8(),
      op.i32_xor,
      ...iconst(FNV_PRIME), op.i32_mul,
      ...set(2),
      ...get(3), ...iconst(1), op.i32_add, ...set(3),
      op.br, 0x00,
    op.end,
  op.end,
  ...get(2),
  op.end,
];

/* ------------------------------------------------------------------ *
 * Body: ct_eq(a=0, b=1, len=2) -> 0|1 ; locals: acc=3, i=4
 * acc |= a[i] ^ b[i] over the WHOLE buffer — no early exit, so the
 * execution profile is independent of where bytes differ (timing-attack
 * safe). Returns 1 when equal.
 * ------------------------------------------------------------------ */
const ctEqBody = [
  ...iconst(0), ...set(3),
  ...iconst(0), ...set(4),
  op.block, VOID,
    op.loop, VOID,
      ...get(4), ...get(2), op.i32_ge_u, op.br_if, 0x01,
      ...get(3),
      ...get(0), ...get(4), op.i32_add, ...load8(),
      ...get(1), ...get(4), op.i32_add, ...load8(),
      op.i32_xor,
      op.i32_or,
      ...set(3),
      ...get(4), ...iconst(1), op.i32_add, ...set(4),
      op.br, 0x00,
    op.end,
  op.end,
  ...get(3), op.i32_eqz,
  op.end,
];

/* ------------------------------------------------------------------ *
 * Body: f32_morph(dst=0, a=1, b=2, n=3, t f32=4) ; local: i=5
 * dst[i] = a[i] + (b[i] - a[i]) * t   — branch-light lane loop.
 * Stack order note: push va, vb, va → sub gives (vb-va), mul t, add va.
 * ------------------------------------------------------------------ */
const addrAt = (base) => [...get(base), ...get(5), ...iconst(2), op.i32_shl, op.i32_add];
const f32MorphBody = [
  ...iconst(0), ...set(5),
  op.block, VOID,
    op.loop, VOID,
      ...get(5), ...get(3), op.i32_ge_u, op.br_if, 0x01,
      ...addrAt(0),                 // dst address
      ...addrAt(1), ...fload(),     // va
      ...addrAt(2), ...fload(),     // vb
      ...addrAt(1), ...fload(),     // va (again)
      op.f32_sub,                   // vb - va
      ...get(4), op.f32_mul,        // (vb - va) * t
      op.f32_add,                   // va + (vb - va) * t
      ...fstore(),
      ...get(5), ...iconst(1), op.i32_add, ...set(5),
      op.br, 0x00,
    op.end,
  op.end,
  op.end,
];

/* ------------------------------------------------------------------ *
 * Module assembly
 * ------------------------------------------------------------------ */
const functype = (params, results) => [0x60, ...vec(params), ...vec(results)];

const typeSec = section(1, vec([
  functype([I32, I32], [I32]),            // t0: fnv1a32
  functype([I32, I32, I32], [I32]),       // t1: ct_eq
  functype([I32, I32, I32, I32, F32], []),// t2: f32_morph
]));

const funcSec = section(3, vec([[0], [1], [2]].map((t) => uleb(t[0]))));

// One memory: limits {min: 16 pages (1 MiB), max: 256 pages (16 MiB)}.
const memSec = section(5, vec([[0x01, ...uleb(16), ...uleb(256)]]));

const exportEntry = (name, kind, idx) => [...utf8(name), kind, ...uleb(idx)];
const exportSec = section(7, vec([
  exportEntry('fnv1a32', 0x00, 0),
  exportEntry('ct_eq', 0x00, 1),
  exportEntry('f32_morph', 0x00, 2),
  exportEntry('mem', 0x02, 0),
]));

const codeEntry = (locals, body) => {
  const localsVec = vec(locals.map(([count, ty]) => [...uleb(count), ty]));
  const full = [...localsVec, ...body];
  return uleb(full.length).concat(full);
};
const codeSec = section(10, vec([
  codeEntry([[2, I32]], fnv1a32Body),
  codeEntry([[2, I32]], ctEqBody),
  codeEntry([[1, I32]], f32MorphBody),
]));

const moduleBytes = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, // \0asm
  0x01, 0x00, 0x00, 0x00, // version 1
  ...typeSec,
  ...funcSec,
  ...memSec,
  ...exportSec,
  ...codeSec,
]);

/* ------------------------------------------------------------------ *
 * Self-test before writing: refuse to ship a broken binary.
 * ------------------------------------------------------------------ */
const { instance } = await WebAssembly.instantiate(moduleBytes);
const ex = instance.exports;
const mem = new Uint8Array(ex.mem.buffer);

// Reference FNV-1a 32 in JS for cross-checking. Time O(n), Space O(1).
const refFnv1a32 = (bytes) => {
  let h = FNV_OFFSET >>> 0;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
};

const put = (offset, bytes) => mem.set(bytes, offset);
const ascii = (s) => [...new TextEncoder().encode(s)];

// fnv1a32 vectors
put(0, ascii('a'));
const gotA = ex.fnv1a32(0, 1) >>> 0;
if (gotA !== 0xe40c292c) throw new Error(`fnv1a32("a") = 0x${gotA.toString(16)}, expected 0xe40c292c`);
const sample = ascii('hello sovereign edge — صفر اعتماديات');
put(0, sample);
const gotS = ex.fnv1a32(0, sample.length) >>> 0;
const expS = refFnv1a32(sample);
if (gotS !== expS) throw new Error(`fnv1a32 mismatch: 0x${gotS.toString(16)} != 0x${expS.toString(16)}`);

// ct_eq: equal, differ-at-end (worst case for early-exit impls), zero-length.
put(0, [1, 2, 3, 4]); put(16, [1, 2, 3, 4]); put(32, [1, 2, 3, 5]);
if (ex.ct_eq(0, 16, 4) !== 1) throw new Error('ct_eq equal buffers must return 1');
if (ex.ct_eq(0, 32, 4) !== 0) throw new Error('ct_eq differing buffers must return 0');
if (ex.ct_eq(0, 32, 0) !== 1) throw new Error('ct_eq zero length must return 1');

// f32_morph: 3 lanes, t = 0.25
const f32 = new Float32Array(ex.mem.buffer);
const A = 1024; const B = 2048; const D = 4096;
f32.set([0, 10, -4], A / 4);
f32.set([8, 2, 4], B / 4);
ex.f32_morph(D, A, B, 3, 0.25);
const got = [f32[D / 4], f32[D / 4 + 1], f32[D / 4 + 2]];
const exp = [2, 8, -2];
for (let i = 0; i < 3; i++) {
  if (Math.abs(got[i] - exp[i]) > 1e-6) throw new Error(`f32_morph lane ${i}: ${got[i]} != ${exp[i]}`);
}

const outDir = join(__dirname, '..', 'dist');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'core.wasm');
writeFileSync(outPath, moduleBytes);
console.log(`[wasm-assemble] OK — ${moduleBytes.length} bytes, self-test passed → ${outPath}`);
