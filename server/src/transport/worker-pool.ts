/**
 * transport/worker-pool.ts — bounded worker_threads pool.
 *
 * The Main (event-loop) thread must never burn CPU: heavy kernels are
 * shipped to a fixed pool with a BOUNDED waiting room. When the room is
 * full, tasks are shed instantly (O(1)) — the event loop stays responsive
 * under any load, which is the whole point of anti-fragility.
 *
 * @complexity submit: Time O(1); completion delivery O(1) via Map lookup.
 * @complexity space: O(size workers + queueCapacity) fixed.
 */
import { Worker } from 'node:worker_threads';
import { BoundedQueue } from './bounded-queue.js';

export interface PoolMetrics {
  submitted: number;
  completed: number;
  failed: number;
  shed: number;
  active: number;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface QueuedTask {
  id: number;
  kernel: string;
  args: unknown;
  pending: Pending;
}

export class WorkerPool {
  readonly #workers: Worker[] = [];
  readonly #idle: Worker[] = [];
  readonly #queue: BoundedQueue<QueuedTask>;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;
  readonly #metrics: PoolMetrics = { submitted: 0, completed: 0, failed: 0, shed: 0, active: 0 };
  #closed = false;

  /**
   * @param size worker count (≈ physical cores reserved for compute).
   * @param workerScript absolute URL of pool-worker.js.
   * @param queueCapacity power-of-two waiting-room size.
   * @complexity construction: O(size) workers spawned asynchronously.
   */
  constructor(size: number, workerScript: URL, queueCapacity: number) {
    if (size < 1) throw new RangeError('pool size must be >= 1');
    this.#queue = new BoundedQueue<QueuedTask>(queueCapacity);
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerScript);
      w.on('message', (msg: { id: number; result?: unknown; error?: string }) => {
        const p = this.#pending.get(msg.id);
        if (p !== undefined) {
          this.#pending.delete(msg.id);
          this.#metrics.completed++;
          this.#metrics.active--;
          if (msg.error !== undefined) {
            this.#metrics.failed++;
            p.reject(new Error(msg.error));
          } else {
            p.resolve(msg.result);
          }
        }
        this.#onWorkerFree(w);
      });
      this.#workers.push(w);
      this.#idle.push(w);
    }
  }

  get metrics(): PoolMetrics {
    return { ...this.#metrics, shed: this.#queue.dropped };
  }

  get queueDepth(): number {
    return this.#queue.size;
  }

  /**
   * Submit or shed. Resolves with the kernel result; rejects on kernel
   * error; rejects with 'shed' when the waiting room is full.
   * @complexity Time O(1) submit; latency = kernel + queue wait.
   */
  run(kernel: string, args: unknown): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error('pool closed'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const task: QueuedTask = { id, kernel, args, pending: { resolve, reject } };
      const worker = this.#idle.pop();
      if (worker !== undefined) {
        this.#dispatch(worker, task);
        return;
      }
      if (!this.#queue.push(task)) {
        this.#metrics.shed++;
        reject(new Error('shed'));
        return;
      }
      this.#pending.set(id, task.pending);
    });
  }

  #dispatch(worker: Worker, task: QueuedTask): void {
    this.#metrics.submitted++;
    this.#metrics.active++;
    this.#pending.set(task.id, task.pending);
    worker.postMessage({ id: task.id, kernel: task.kernel, args: task.args });
  }

  #onWorkerFree(worker: Worker): void {
    const next = this.#queue.pop();
    if (next === undefined) {
      this.#idle.push(worker);
      return;
    }
    this.#dispatch(worker, next);
  }

  /** Terminate all workers. @complexity O(size). */
  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all(this.#workers.map((w) => w.terminate()));
  }
}
