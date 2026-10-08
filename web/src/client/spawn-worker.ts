/**
 * client/spawn-worker.ts — spawn the sovereign state node.
 *
 * Prefers a MODULE SharedWorker (one state node shared by all tabs of the
 * origin — the browser's answer to a local replication server). Falls back
 * to a dedicated module Worker where SharedWorker is unavailable.
 *
 * CONTEXT NOTE (empirically required): some Chromium builds SILENTLY DROP
 * SharedWorker/Worker constructions issued from a MODULE-script context in
 * cross-origin-isolated pages (the constructor returns, the port never
 * attaches, ever), while the identical construction from a CLASSIC-script
 * context works. index.html therefore installs `window.__sovereignSpawn` /
 * `window.__sovereignDedicated` (classic inline script) and every
 * construction below routes through those hooks first.
 *
 * Port discipline: the state port only ever carries plain (transferred
 * ArrayBuffer) frames. The telemetry-ring SAB rides a separate disposable
 * connection (`handoffRing`) that doubles as the realm-capability probe
 * (ack ⇒ bench armed; timeout ⇒ bench disabled); call it AFTER the
 * handshake, when the worker is guaranteed script-ready.
 *
 * @complexity O(1); worker script fetch handled by the platform.
 */

import { BinWriter, beginFrame, Tag } from '../core/protocol.js';

export interface WirePort {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (ev: MessageEvent) => void): void;
  start?(): void;
}

interface ClassicHooks {
  __sovereign?: { port: unknown; shared: boolean };
  __sovereignSpawn?: () => { port: unknown; shared: boolean } | null;
  __sovereignDedicated?: () => unknown;
}
const hooks = (globalThis as ClassicHooks);

/** Open a fresh SharedWorker connection — classic context first. */
function openShared(): WirePort | null {
  try {
    const c = hooks.__sovereignSpawn?.();
    if (c !== null && c !== undefined) return c.port as unknown as WirePort;
  } catch {
    /* fall through to module context */
  }
  try {
    return (new SharedWorker(WORKER_URL, { type: 'module', name: WORKER_NAME }).port as unknown as WirePort);
  } catch {
    return null;
  }
}

/** Open a fresh dedicated Worker — classic context first. */
function openDedicated(): WirePort | null {
  try {
    const w = hooks.__sovereignDedicated?.();
    if (w !== null && w !== undefined) return w as unknown as WirePort;
  } catch {
    /* fall through to module context */
  }
  try {
    return new Worker(WORKER_URL, { type: 'module' }) as unknown as WirePort;
  } catch {
    return null;
  }
}

export interface SpawnResult {
  port: WirePort;
  shared: boolean;
  /** Open another connection to the SAME shared instance (fresh port). */
  connectAgain: () => WirePort | null;
  /** Open a dedicated Worker (separate state node) — last-resort fallback. */
  dedicatedPort: () => WirePort | null;
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

/**
 * Resolve the worker script URL. boot.js lives in dist/, the worker in
 * dist/worker/ — resolved against the DOCUMENT (works from the classic
 * launcher and from module scope alike).
 */
function resolveUrl(): string {
  return new URL('dist/worker/state-worker.js', document.baseURI ?? window.location.href).href;
}
const WORKER_URL = typeof document !== 'undefined' ? resolveUrl() : '';
const WORKER_NAME = 'sovereign-state';

export function spawnStateWorker(): SpawnResult {
  // Initial port: prefer the classic-context spawn installed by index.html
  // (present before any module script runs); module context as fallback.
  let port: WirePort | null = null;
  let shared = false;
  if (hooks.__sovereign !== undefined) {
    port = hooks.__sovereign.port as unknown as WirePort;
    shared = hooks.__sovereign.shared;
  }
  if (port === null) {
    shared = true;
    port = openShared();
    if (port === null) {
      shared = false;
      port = openDedicated();
      if (port === null) throw new Error('sovereign: no worker construction succeeded');
    }
  }

  const handoffRing = (sab: SharedArrayBuffer): Promise<boolean> => {
    const p = openShared();
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
  };

  return {
    port,
    shared,
    connectAgain: () => openShared(),
    dedicatedPort: () => openDedicated(),
    handoffRing,
  };
}
