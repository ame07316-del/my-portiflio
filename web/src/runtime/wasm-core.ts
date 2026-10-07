/**
 * runtime/wasm-core.ts — typed host wrapper around the hand-assembled
 * `core.wasm` (see tools/wasm-assemble.mjs).
 *
 * Provides:
 *   fnv1a32(bytes)            — fast non-cryptographic hash (CRDT op dedupe).
 *   ctEq(a, b)                — CONSTANT-TIME equality (timing-attack safe;
 *                               length mismatch is public info → O(1) reject).
 *   f32Morph / morphInMemory  — vectorized interpolation for particle fields.
 *
 * All entry points validate sizes against the linear-memory budget BEFORE
 * copying anything in; the module grows memory only in page-granular steps
 * up to the 16 MiB hard cap, after which requests are rejected (anti-OOM).
 *
 * @complexity fnv1a32: Time O(len) in WASM (no JS loop overhead), Space O(len) scratch.
 * @complexity ctEq:    Time O(len) constant-profile, Space O(len) scratch.
 * @complexity f32Morph: Time O(n) lanes, Space O(1) extra when buffers resident.
 */

import { WASM_MEMORY_BUDGET_BYTES } from '../core/bounds.js';

const PAGE = 65536;

export class WasmCore {
  readonly instance: WebAssembly.Instance;
  #u8: Uint8Array;
  #f32: Float32Array;

  private constructor(instance: WebAssembly.Instance) {
    this.instance = instance;
    const mem = instance.exports['mem'] as WebAssembly.Memory;
    this.#u8 = new Uint8Array(mem.buffer);
    this.#f32 = new Float32Array(mem.buffer);
  }

  static async fromFetch(url: string): Promise<WasmCore> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`wasm fetch failed: ${res.status}`);
    const { instance } = await WebAssembly.instantiateStreaming(res);
    return new WasmCore(instance);
  }

  static fromBytes(bytes: Uint8Array<ArrayBuffer>): WasmCore {
    // Synchronous path for workers/tests. @complexity O(module size).
    const mod = new WebAssembly.Module(bytes);
    return new WasmCore(new WebAssembly.Instance(mod));
  }

  /** Re-derive views after a grow (buffer identity changes). O(1). */
  #views(): { u8: Uint8Array; f32: Float32Array } {
    const mem = this.instance.exports['mem'] as WebAssembly.Memory;
    if (mem.buffer !== this.#u8.buffer) {
      this.#u8 = new Uint8Array(mem.buffer);
      this.#f32 = new Float32Array(mem.buffer);
    }
    return { u8: this.#u8, f32: this.#f32 };
  }

  /** Grow so that `byteOffset + bytes` fits; reject past the budget. O(pages). */
  #fit(byteOffset: number, bytes: number): void {
    const mem = this.instance.exports['mem'] as WebAssembly.Memory;
    const need = byteOffset + bytes;
    if (need > WASM_MEMORY_BUDGET_BYTES) {
      throw new RangeError(`wasm request ${need}B exceeds ${WASM_MEMORY_BUDGET_BYTES}B budget`);
    }
    if (need <= mem.buffer.byteLength) return;
    const pages = Math.ceil((need - mem.buffer.byteLength) / PAGE);
    mem.grow(pages);
    this.#views();
  }

  /** Upload bytes to `offset`, growing if needed. @complexity O(bytes). */
  upload(offset: number, data: Uint8Array): void {
    this.#fit(offset, data.byteLength);
    this.#views().u8.set(data, offset);
  }

  /** Download a copy of linear memory [offset, offset+len). O(len). */
  download(offset: number, len: number): Uint8Array {
    if (offset + len > this.#views().u8.byteLength) throw new RangeError('download OOB');
    return this.#views().u8.slice(offset, offset + len);
  }

  /** FNV-1a 32 over arbitrary bytes. @complexity Time O(len). */
  fnv1a32(data: Uint8Array): number {
    const at = 0;
    this.upload(at, data);
    const fn = this.instance.exports['fnv1a32'] as (p: number, l: number) => number;
    return fn(at, data.byteLength) >>> 0;
  }

  /**
   * Constant-time buffer equality. Length difference leaks nothing secret
   * (lengths are public metadata) and allows an O(1) reject.
   * @complexity Time O(len) with a data-independent profile.
   */
  ctEq(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    const A = 0;
    const B = a.byteLength;
    this.upload(A, a);
    this.upload(B, b);
    const fn = this.instance.exports['ct_eq'] as (x: number, y: number, l: number) => number;
    return fn(A, B, a.byteLength) === 1;
  }

  /**
   * dst[i] = a[i] + (b[i]-a[i]) * t, computed inside WASM.
   * All three arrays must share length; result lands in `dst`.
   * @complexity Time O(n) lanes, Space O(n) scratch inside wasm memory.
   */
  f32Morph(dst: Float32Array, a: Float32Array, b: Float32Array, t: number): void {
    if (dst.length !== a.length || a.length !== b.length) {
      throw new RangeError('f32Morph: length mismatch');
    }
    const n = a.length;
    const bytes = n * 4;
    const A = 0;
    const B = bytes;
    const D = bytes * 2;
    this.#fit(D, bytes);
    const views = this.#views();
    views.f32.set(a, A / 4);
    views.f32.set(b, B / 4);
    const fn = this.instance.exports['f32_morph'] as (
      d: number,
      x: number,
      y: number,
      n: number,
      t: number,
    ) => void;
    fn(D, A, B, n, t);
    dst.set(views.f32.subarray(D / 4, D / 4 + n));
  }

  /**
   * In-memory variant for resident buffers (no per-call copies): the worker
   * uploads the static sources once, then ticks this per frame and copies
   * only the result out to the shared frame buffer.
   * @complexity Time O(n), Space O(1) extra.
   */
  morphInMemory(dstOff: number, aOff: number, bOff: number, n: number, t: number): void {
    const fn = this.instance.exports['f32_morph'] as (
      d: number,
      x: number,
      y: number,
      n: number,
      t: number,
    ) => void;
    fn(dstOff, aOff, bOff, n, t);
  }

  /** Expose an f32 view over a byte region (for zero-copy-ish staging). O(1). */
  f32View(byteOffset: number, lanes: number): Float32Array {
    this.#fit(byteOffset, lanes * 4);
    return this.#views().f32.subarray(byteOffset / 4, byteOffset / 4 + lanes);
  }
}
