/**
 * client/spawn-worker.ts — spawn the sovereign state node.
 *
 * Prefers a MODULE SharedWorker (one state node shared by all tabs of the
 * origin — the browser's answer to a local replication server). Falls back
 * to a dedicated module Worker where SharedWorker is unavailable.
 *
 * @complexity O(1); worker script fetch handled by the platform.
 */

export interface WirePort {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (ev: MessageEvent) => void): void;
  start?(): void;
}

export interface SpawnResult {
  port: WirePort;
  shared: boolean;
}

export function spawnStateWorker(): SpawnResult {
  // boot.js lives in dist/; the worker compiles to dist/worker/.
  const url = new URL('./worker/state-worker.js', import.meta.url);
  try {
    const sw = new SharedWorker(url, { type: 'module', name: 'sovereign-state' });
    return { port: sw.port as unknown as WirePort, shared: true };
  } catch {
    const w = new Worker(url, { type: 'module' });
    return { port: w as unknown as WirePort, shared: false };
  }
}
