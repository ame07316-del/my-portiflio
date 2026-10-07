/** worker-pool.test.ts — CPU isolation pool: execution + shedding. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerPool } from '../transport/worker-pool.js';

const WORKER_URL = new URL('../transport/pool-worker.js', import.meta.url);

test('worker pool: kernels execute off the event loop', async () => {
  const pool = new WorkerPool(2, WORKER_URL, 16);
  try {
    const echoed = await pool.run('echo', { hello: 'sovereign' });
    assert.deepEqual(echoed, { hello: 'sovereign' });

    const hashes = (await pool.run('hashBatch', {
      payloads: [Uint8Array.from([1, 2, 3]), Uint8Array.from([97])],
    })) as number[];
    assert.equal(hashes[1], 0xe40c292c, 'fnv1a32("a") canonical vector');
    assert.equal(hashes.length, 2);

    const sum = await pool.run('vecReduce', { values: Float64Array.of(1, 2, 3) });
    assert.equal(sum, 14);
  } finally {
    await pool.close();
  }
});

test('worker pool: unknown kernel rejects cleanly', async () => {
  const pool = new WorkerPool(1, WORKER_URL, 4);
  try {
    await assert.rejects(() => pool.run('nonexistent', {}), /unknown kernel/);
  } finally {
    await pool.close();
  }
});

test('worker pool: bounded waiting room sheds overload instead of growing', async () => {
  const pool = new WorkerPool(1, WORKER_URL, 4); // usable 3
  try {
    // Occupy the single worker for a while.
    const blocker = pool.run('busy', { ms: 250 });
    const results: Array<PromiseSettledResult<unknown>> = [];
    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 12; i++) tasks.push(pool.run('echo', { i }));
    results.push(...(await Promise.allSettled([...tasks, blocker])));
    const shed = results.filter((r) => r.status === 'rejected').length;
    assert.ok(shed >= 8, `expected most overflow tasks shed, shed=${shed}`);
    assert.equal(pool.metrics.shed, shed);
  } finally {
    await pool.close();
  }
});
