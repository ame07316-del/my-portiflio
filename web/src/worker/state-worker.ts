/**
 * worker/state-worker.ts — thin browser shell around the StateNode engine.
 *
 * Runs as a SharedWorker (one sovereign replica shared by all tabs of the
 * origin — the browser's answer to a local replication server). Falls back
 * to a dedicated module Worker where SharedWorker is unavailable.
 *
 * All logic lives in state-node.ts, which is unit/integration-tested in
 * plain Node — this file only wires platform globals (ports, IndexedDB
 * storage, wasm fetch) to the engine.
 *
 * Note: worker CONSTRUCTION (new SharedWorker/Worker) is owned by the
 * classic inline launcher in index.html — some Chromium builds silently
 * drop worker constructions issued from a module-script context in
 * cross-origin-isolated pages.
 *
 * @complexity O(1) wiring; boot cost is in StateNode.boot (see there).
 */

import { StateNode, type WirePort } from './state-node.js';
import { idbStorage } from '../core/idb.js';
import { HttpSyncAdapter, MockSyncAdapter, type SyncAdapter } from './sync-adapter.js';
import { WasmCore } from '../runtime/wasm-core.js';

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

void node
  .boot(async () => WasmCore.fromFetch(new URL('../core.wasm', import.meta.url).href))
  .catch(() => {
    /* boot failed: clients never handshake → the main thread's watchdog
       (reconnect → dedicated fallback → DEGRADE) carries the UX. */
  });

const scope = self as unknown as {
  onconnect?: ((ev: MessageEvent) => void) | null;
  addEventListener: (type: 'message', h: (ev: MessageEvent) => void) => void;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

if ('onconnect' in scope) {
  scope.onconnect = (ev: MessageEvent) => {
    const port = (ev.ports as MessagePort[])[0];
    if (port !== undefined) {
      node.attachPort(port as unknown as WirePort);
    }
  };
} else {
  node.attachPort({
    postMessage: (msg, transfer) => scope.postMessage(msg, transfer),
    addEventListener: (type, h) => scope.addEventListener(type, h),
  });
}
