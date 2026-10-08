/**
 * boot.ts — Main-Thread entry. Its entire charter: PAINT.
 *
 * Sequence:
 *   1. FSM boot → loading.
 *   2. Allocate the telemetry ring (SAB) when cross-origin isolation allows.
 *   3. Spawn the sovereign state node (SharedWorker → Worker fallback).
 *   4. Connect the signal store; on Snapshot → FSM ready → hydrate sections.
 *   5. Start the rAF HUD loop (fps + ring drain). Register the SW (https only).
 *
 * Nothing here does state logic — every decision was delegated at birth.
 *
 * @complexity boot: O(1) + worker fetch; HUD loop: O(1) per frame.
 */

import { spawnStateWorker } from './client/spawn-worker.js';
import { connectStore } from './client/store.js';
import { createAppMachine } from './core/fsm.js';
import { SpscRing } from './core/ring.js';
import { scheduleWrite, setBudgetHook } from './runtime/dom-batch.js';
import { mountAppShell } from './components/app-shell.js';
import { mountProjects } from './components/section-projects.js';
import { mountBench } from './components/morph-bench.js';

async function main(): Promise<void> {
  const machine = createAppMachine();
  machine.send('START_LOAD');

  const sabAvailable = typeof SharedArrayBuffer !== 'undefined';
  const ring = sabAvailable ? SpscRing.withCapacity(1024) : null;

  const { port, shared, handoffRing } = spawnStateWorker();
  const shell = mountAppShell(machine, shared);

  const store = connectStore(port, {
    events: {
      onReady: () => {
        if (machine.canSend('LOADED')) machine.send('LOADED');
      },
      onError: (m) => {
        console.error('[sovereign]', m);
        if (machine.canSend('DEGRADE')) machine.send('DEGRADE');
      },
    },
  });

  // Telemetry ring handoff: best-effort, on a disposable second connection
  // (never on the state port — SAB frames can poison it in realms that
  // cannot materialize them). Success also arms the bench (sendBenchStart
  // is gated on the capability).
  if (ring !== null) {
    void handoffRing(ring.buffer).then((ok) => store.setSandboxCapable(ok));
  }

  mountProjects(document.getElementById('projects') as HTMLElement, store);
  mountBench(document.getElementById('bench') as HTMLElement, store, sabAvailable);

  if (!sabAvailable && machine.canSend('DEGRADE')) machine.send('DEGRADE');

  // ---- HUD: fps + worker compute µs (drained from the lock-free ring) ----
  let last = performance.now();
  let emaFrame = 16.7;
  let emaWorker = 0;
  let workerSamples = 0;
  const reader = ring !== null ? SpscRing.over(ring.buffer) : null;

  setBudgetHook((ms, jobs) => {
    console.warn(`[dom-batch] frame budget breach: ${ms.toFixed(1)}ms across ${jobs} jobs`);
  });

  function hud(now: number): void {
    const dt = now - last;
    last = now;
    emaFrame = emaFrame * 0.9 + dt * 0.1;

    if (reader !== null) {
      let v: number | undefined;
      let n = 0;
      let sum = 0;
      while ((v = reader.tryPop()) !== undefined) {
        sum += v;
        n++;
      }
      if (n > 0) {
        workerSamples += n;
        emaWorker = emaWorker * 0.8 + (sum / n) * 0.2;
      }
    }

    scheduleWrite('hud', () => {
      shell.hudFps.textContent = `${(1000 / emaFrame).toFixed(0)} fps · frame ${emaFrame.toFixed(1)} ms`;
      shell.hudHash.textContent = `state hash 0x${store.contentHash.peek().toString(16).padStart(8, '0')}`;
      shell.hudWorker.textContent =
        workerSamples > 0 ? `worker compute ${emaWorker.toFixed(0)} µs/op` : 'worker idle';
    });
    requestAnimationFrame(hud);
  }
  requestAnimationFrame(hud);

  // ---- Service worker: offline-first shell (secure contexts only) ----
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // Served at the site root by tools/serve.mjs (→ dist/sw.js) so the
    // default scope covers the whole shell.
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is progressive enhancement — never fatal */
    });
  }
}

main().catch((err: unknown) => {
  const el = document.querySelector('[data-status-pill]');
  if (el !== null) {
    el.textContent = 'fatal';
    el.setAttribute('data-phase', 'fatal');
  }
  console.error('[boot] fatal:', err);
});
