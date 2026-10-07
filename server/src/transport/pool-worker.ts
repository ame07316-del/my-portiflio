/**
 * transport/pool-worker.ts — CPU-isolation worker for the sovereign pool.
 *
 * Kernels are a CLOSED registry (no eval, no dynamic code): a task names a
 * kernel, the worker executes it. Heavy numeric kernels run on f64/typed
 * arrays; add new kernels by extending the registry — the wire contract is
 * {id, kernel, args} → {id, result?} | {id, error}.
 *
 * @complexity dispatch: O(1) registry lookup; kernels documented inline.
 */
import { parentPort } from 'node:worker_threads';

interface TaskMessage {
  id: number;
  kernel: string;
  args: unknown;
}

/**
 * FNV-1a 32 over a byte array (server-side twin of the WASM kernel used by
 * the client). @complexity Time O(len), Space O(1).
 */
function fnv1a32(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of data) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const kernels: Record<string, (args: never) => unknown> = {
  /** Hash a batch of byte payloads. Time O(total bytes). */
  hashBatch(args: { payloads: Uint8Array[] }): number[] {
    return args.payloads.map((p) => fnv1a32(p));
  },
  /** Sum of squares over a Float64Array — stand-in for matrix reduction. O(n). */
  vecReduce(args: { values: Float64Array }): number {
    let acc = 0;
    const v = args.values;
    for (let i = 0; i < v.length; i++) {
      const x = v[i] as number;
      acc += x * x;
    }
    return acc;
  },
  echo: (args: unknown) => args,
  /** Spin-wait kernel used to saturate a worker in shedding tests. O(ms). */
  busy(args: { ms: number }): number {
    const t0 = performance.now();
    while (performance.now() - t0 < args.ms) {
      /* deliberate spin */
    }
    return Math.round(performance.now() - t0);
  },
};

if (parentPort !== null) {
  const port = parentPort;
  port.on('message', (msg: TaskMessage) => {
    const kernel = kernels[msg.kernel];
    if (kernel === undefined) {
      port.postMessage({ id: msg.id, error: `unknown kernel ${msg.kernel}` });
      return;
    }
    try {
      const result = kernel(msg.args as never);
      port.postMessage({ id: msg.id, result });
    } catch (e) {
      port.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
