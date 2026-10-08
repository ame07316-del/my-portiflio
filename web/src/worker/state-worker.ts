/**
 * worker/state-worker.ts — thin browser shell around the StateNode engine.
 *
 * Runs as a SharedWorker (one sovereign replica shared by all tabs) with a
 * dedicated-Worker fallback. All logic lives in state-node.ts, which is
 * unit/integration-tested in plain Node — this file only wires platform
 * globals (ports, IndexedDB storage, wasm fetch) to the engine.
 *
 * @complexity O(1) wiring; boot cost is in StateNode.boot (see there).
 */

import { StateNode, type WirePort } from './state-node.js';
import { idbStorage } from '../core/idb.js';
import { HttpSyncAdapter, MockSyncAdapter, type SyncAdapter } from './sync-adapter.js';
import { WasmCore } from '../runtime/wasm-core.js';

// TEMP-DIAG (revert before merge): breadcrumb trail via self.postMessage →
// clients receive it as SharedWorker.onmessage. Locates the silent failure.
const __diag = (s: string): void => {
  try {
    (self as unknown as { postMessage?: (m: string) => void }).postMessage?.(`DIAG-WS ${s}`);
  } catch {
    /* diagnostics only */
  }
};
(globalThis as { __wsdiag?: (s: string) => void }).__wsdiag = __diag;
__diag('entry-start');
self.addEventListener('error', (e: ErrorEvent) => __diag('worker-error: ' + (e.message || 'unknown')));
self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
  __diag('unhandled-rejection: ' + String((e.reason as { stack?: string })?.stack ?? e.reason).slice(0, 300)),
);

/**
 * Sync target selection: set `globalThis.SYNC_URL` (e.g. an inline script in
 * the host page) to replicate ops to the sovereign server's /ops sink;
 * otherwise the local mock exercises commit/rollback with simulated latency.
 */
const SYNC_URL = (globalThis as { SYNC_URL?: unknown }).SYNC_URL;
const adapter: SyncAdapter =
  typeof SYNC_URL === 'string' && SYNC_URL.length > 0
    ? new HttpSyncAdapter(SYNC_URL, 'portfolio')
    : new MockSyncAdapter();

const node = new StateNode({
  storage: idbStorage(),
  adapter,
});
__diag('node-created');

void node.boot(async () =>
  WasmCore.fromFetch(new URL('../core.wasm', import.meta.url).href),
).then(
  () => __diag('boot-done'),
  (e: unknown) => __diag('boot-failed: ' + String((e as { stack?: string })?.stack ?? e).slice(0, 300)),
);
__diag('boot-armed');

const scope = self as unknown as {
  onconnect?: ((ev: MessageEvent) => void) | null;
  addEventListener: (type: 'message', h: (ev: MessageEvent) => void) => void;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

if ('onconnect' in scope) {
  scope.onconnect = (ev: MessageEvent) => {
    __diag(`onconnect-fired ports=${(ev.ports as unknown[]).length}`);
    const port = (ev.ports as MessagePort[])[0];
    if (port !== undefined) {
      const wire: WirePort = {
        postMessage: (msg: unknown, transfer?: Transferable[]) => {
          __diag('worker-send');
          if (transfer !== undefined) port.postMessage(msg, transfer);
          else port.postMessage(msg);
        },
        addEventListener: (type: 'message', h: (mev: MessageEvent) => void) => {
          port.addEventListener(type, (mev) => {
            __diag('msg-received');
            h(mev);
          });
        },
        start: () => port.start(),
      };
      node.attachPort(wire);
      __diag('port-attached');
    }
  };
  __diag('onconnect-armed');
} else {
  node.attachPort({
    postMessage: (msg, transfer) => scope.postMessage(msg, transfer),
    addEventListener: (type, h) => scope.addEventListener(type, h),
  });
}
