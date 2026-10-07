/** wasm.test.ts — the hand-assembled module vs JS reference implementations. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WasmCore } from '../runtime/wasm-core.js';

async function load(): Promise<WasmCore> {
  // compiled tests live in dist/tests/, core.wasm in dist/
  const bytes = await readFile(fileURLToPath(new URL('../core.wasm', import.meta.url)));
  return WasmCore.fromBytes(new Uint8Array(bytes));
}

function refFnv1a32(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of data) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

test('wasm: fnv1a32 matches reference + canonical vectors', async () => {
  const w = await load();
  const enc = new TextEncoder();
  assert.equal(w.fnv1a32(enc.encode('a')), 0xe40c292c);
  assert.equal(w.fnv1a32(enc.encode('foobar')), 0xbf9cf968);
  for (const s of ['', 'hello', 'مرحبا بالعالم', 'x'.repeat(4096)]) {
    const data = enc.encode(s);
    assert.equal(w.fnv1a32(data), refFnv1a32(data), `mismatch for length ${data.byteLength}`);
  }
});

test('wasm: ct_eq is exact and handles edge cases', async () => {
  const w = await load();
  const a = Uint8Array.from({ length: 1000 }, (_, i) => i & 0xff);
  const b = new Uint8Array(a);
  assert.equal(w.ctEq(a, b), true);
  b[999] = (b[999] ?? 0) ^ 1; // differ only at the LAST byte — worst case for early-exit
  assert.equal(w.ctEq(a, b), false);
  assert.equal(w.ctEq(a, a.subarray(0, 999)), false); // length mismatch → O(1) reject
  assert.equal(w.ctEq(new Uint8Array(0), new Uint8Array(0)), true);
});

test('wasm: f32_morph matches linear interpolation lane-for-lane', async () => {
  const w = await load();
  const n = 3000;
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  const dst = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = Math.sin(i) * 100;
    b[i] = Math.cos(i * 0.7) * 50;
  }
  for (const t of [0, 0.25, 0.5, 0.999, 1]) {
    w.f32Morph(dst, a, b, t);
    for (let i = 0; i < n; i += 97) {
      const ai = a[i] as number;
      const bi = b[i] as number;
      const expect = ai + (bi - ai) * t;
      assert.ok(
        Math.abs((dst[i] as number) - expect) < 1e-3,
        `lane ${i} @t=${t}: ${dst[i]} vs ${expect}`,
      );
    }
  }
});

test('wasm: morph endpoints are exact (t=0 → a, t=1 → b)', async () => {
  const w = await load();
  const a = Float32Array.of(1, 2, 3);
  const b = Float32Array.of(9, 8, 7);
  const dst = new Float32Array(3);
  w.f32Morph(dst, a, b, 0);
  assert.deepEqual([...dst], [1, 2, 3]);
  w.f32Morph(dst, a, b, 1);
  assert.deepEqual([...dst], [9, 8, 7]);
});

test('wasm: requests beyond the 16 MiB budget are rejected (anti-OOM)', async () => {
  const w = await load();
  const tooBig = new Uint8Array(17 * 1024 * 1024);
  assert.throws(() => w.fnv1a32(tooBig), RangeError);
});
