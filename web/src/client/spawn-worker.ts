/**
 * client/spawn-worker.ts — spawn the sovereign state node.
 *
 * Prefers a MODULE SharedWorker (one state node shared by all tabs of the
 * origin — the browser's answer to a local replication server). Falls back
 * to a dedicated module Worker where SharedWorker is unavailable.
 *
 * Port discipline: the returned STATE port only ever carries plain
 * (transferred-ArrayBuffer) frames. Some Chromium worker realms cannot
 * materialize SharedArrayBuffer frames — they are dropped on receipt — so
 * SAB handoff (telemetry ring) happens over a separate, disposable
 * connection (`handoffRing`), which doubles as the realm-capability probe.
 *
 * Connection resilience: some Chromium builds LOST the `onconnect` event
 * for a SharedWorker connection established while the module script graph
 * was still loading (observed in CI). `connectAgain` opens a fresh
 * connection to the SAME instance; by the time it fires the handler is
 * armed and the port is attached, so the handshake completes.
 *
 * @complexity O(1); worker script fetch handled by the platform.
 */

import { BinWriter, beginFrame, Tag } from '../core/protocol.js';

export interface WirePort {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (ev: MessageEvent) => void): void;
  start?(): void;
}

export interface SpawnResult {
  port: WirePort;
  shared: boolean;
  /** Open another connection to the SAME shared instance (fresh port). */
  connectAgain: () => WirePort | null;
  /**
   * Deliver the telemetry ring SAB to the worker on a DISPOSABLE second
   * connection (Telemetry cmd 2). Resolves true iff the worker acked —
   * i.e. the SAB crossed intact and the worker's ring is armed. In realms
   * that cannot carry SAB frames the frame is dropped and this resolves
   * false (telemetry/bench degrade to idle; the state port is untouched).
   * Call AFTER the handshake: the worker must be script-ready for the
   * connection's onconnect to fire.
   */
  handoffRing: (sab: SharedArrayBuffer) => Promise<boolean>;
}

export function spawnStateWorker(): SpawnResult {
  // boot.js lives in dist/; the worker compiles to dist/worker/.
  const url = new URL('./worker/state-worker.js', import.meta.url);
  const name = 'sovereign-state';
  let shared = true;
  let port: WirePort;
  try {
    const sw = new SharedWorker(url, { type: 'module', name });
    port = sw.port as unknown as WirePort;
  } catch {
    shared = false;
    const w = new Worker(url, { type: 'module' });
    port = w as unknown as WirePort;
  }

  const openConnection = (): WirePort | null => {
    if (!shared) return null;
    try {
      return (new SharedWorker(url, { type: 'module', name }).port as unknown as WirePort);
    } catch {
      return null;
    }
  };

  return {
    port,
    shared,
    connectAgain: openConnection,
    handoffRing: (sab: SharedArrayBuffer) => {
      const p = openConnection();
      if (p === null) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean): void => {
          if (!settled) {
            settled = true;
            resolve(ok);
          }
        };
        const timer = setTimeout(() => finish(false), 2500);
        p.addEventListener('message', () => {
          clearTimeout(timer);
          finish(true); // worker processed cmd 2 ⇒ the SAB crossed
        });
        p.start?.();
        const w = new BinWriter(16);
        beginFrame(w, Tag.Telemetry, 1).u8(2);
        const frame = w.finish();
        try {
          p.postMessage({ bin: frame.buffer, sab }, [frame.buffer]);
        } catch {
          clearTimeout(timer);
          finish(false);
        }
      });
    },
  };
}
