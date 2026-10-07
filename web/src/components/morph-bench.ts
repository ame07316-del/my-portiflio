/**
 * components/morph-bench.ts — proof of Main-Thread isolation.
 *
 * The heavy work (interpolating 8 192 × 3 float lanes every 16 ms) runs in
 * the State Worker inside core.wasm. Results land in a SharedArrayBuffer
 * that this component reads DIRECTLY — no postMessage, no copies, no GC.
 * The Main Thread's entire per-frame job is a rotation + ImageData blit of
 * a 256 × 256 raster: comfortably inside a 120 fps frame budget.
 *
 * @complexity per frame: Time O(N points + W·H pixels), Space O(1) —
 * the ImageData buffer is allocated once and reused forever.
 */

import type { StoreHandle } from '../client/store.js';

const N = 8192;
const W = 256;
const H = 256;

export function mountBench(host: HTMLElement, store: StoreHandle, sabAvailable: boolean): void {
  host.innerHTML = `
    <div class="panel-head"><h2>WASM Morph Bench</h2><span class="hint">worker + wasm + SharedArrayBuffer · zero-copy frames</span></div>
    <div class="bench-body">
      <canvas width="${W}" height="${H}" class="bench-canvas"></canvas>
      <div class="bench-side">
        <button class="btn bench-toggle" type="button">Start</button>
        <p class="bench-stat"></p>
      </div>
    </div>`;

  const canvas = host.querySelector('.bench-canvas') as HTMLCanvasElement;
  const btn = host.querySelector('.bench-toggle') as HTMLButtonElement;
  const stat = host.querySelector('.bench-stat') as HTMLParagraphElement;

  if (!sabAvailable) {
    stat.textContent = 'DEGRADED: SharedArrayBuffer requires cross-origin isolation headers (COOP/COEP). CRDT features remain fully functional.';
    btn.disabled = true;
    return;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(W, H); // allocated ONCE — zero per-frame GC
  const px = img.data;

  let positions: Float32Array | null = null;
  let raf = 0;
  let running = false;
  let frames = 0;
  let lastStat = performance.now();

  /** Rotation + orthographic projection + blit. O(N + W·H). */
  function draw(now: number): void {
    if (!running || positions === null) return;
    const yaw = now * 0.0004;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    px.fill(0); // clear (alpha=0)
    const scale = 105;
    for (let i = 0; i < N; i++) {
      const x = positions[i * 3] as number;
      const y = positions[i * 3 + 1] as number;
      const z = positions[i * 3 + 2] as number;
      const rx = x * cy + z * sy;
      const rz = -x * sy + z * cy;
      const sx = (W / 2 + rx * scale) | 0;
      const syy = (H / 2 + y * scale) | 0;
      if (sx < 0 || sx >= W || syy < 0 || syy >= H) continue;
      const bright = 120 + ((rz + 1) * 60) | 0; // depth shading
      const off = (syy * W + sx) * 4;
      px[off] = 212;      // gold
      px[off + 1] = 175;
      px[off + 2] = 55;
      px[off + 3] = bright;
    }
    ctx.putImageData(img, 0, 0);

    frames++;
    if (now - lastStat > 500) {
      const fps = (frames * 1000) / (now - lastStat);
      stat.textContent = `main-thread paint: ${fps.toFixed(0)} fps · ${N} points · compute lives in the worker (see HUD)`;
      frames = 0;
      lastStat = now;
    }
    raf = requestAnimationFrame(draw);
  }

  btn.addEventListener('click', () => {
    if (!running) {
      const sab = new SharedArrayBuffer(N * 3 * 4);
      positions = new Float32Array(sab);
      store.sendBenchStart(sab, N);
      running = true;
      btn.textContent = 'Stop';
      raf = requestAnimationFrame(draw);
    } else {
      running = false;
      cancelAnimationFrame(raf);
      store.sendBenchStop();
      btn.textContent = 'Start';
      stat.textContent = 'stopped — main thread idle';
    }
  });
}
