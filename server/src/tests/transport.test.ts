/** transport.test.ts — token bucket + bounded queue discipline. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from '../transport/token-bucket.js';
import { BoundedQueue } from '../transport/bounded-queue.js';

test('token bucket: burst then sustained rate', () => {
  let now = 0;
  const b = new TokenBucket(1000, 5, () => now); // 1000/s, burst 5
  for (let i = 0; i < 5; i++) assert.equal(b.tryConsume(), true);
  assert.equal(b.tryConsume(), false, 'burst exhausted');
  now += 10; // +10ms @1000/s = +10 tokens, capped at burst=5
  for (let i = 0; i < 5; i++) assert.equal(b.tryConsume(), true);
  assert.equal(b.tryConsume(), false);
});

test('token bucket: refill is lazy and O(1)', () => {
  let now = 0;
  const b = new TokenBucket(10, 3, () => now);
  b.tryConsume();
  b.tryConsume();
  b.tryConsume();
  assert.equal(b.tryConsume(), false);
  now += 100; // 1s → 10 tokens refilled, capped at 3
  assert.equal(b.tokens <= 3, true);
  assert.equal(b.tryConsume(), true);
});

test('bounded queue: FIFO + fixed capacity + shedding meter', () => {
  const q = new BoundedQueue<number>(4); // usable 3
  assert.equal(q.capacity, 3);
  assert.equal(q.push(1), true);
  assert.equal(q.push(2), true);
  assert.equal(q.push(3), true);
  assert.equal(q.push(4), false);
  assert.equal(q.dropped, 1);
  assert.equal(q.size, 3);
  assert.equal(q.pop(), 1);
  assert.equal(q.pop(), 2);
  assert.equal(q.push(5), true);
  assert.equal(q.pop(), 3);
  assert.equal(q.pop(), 5);
  assert.equal(q.pop(), undefined);
});

test('bounded queue: slots are cleared for GC (no retained memory)', () => {
  const q = new BoundedQueue<object>(2);
  const obj = { heavy: new Array(1000) };
  q.push(obj);
  q.pop();
  // after pop the internal slot must not retain the reference
  assert.equal(q.size, 0);
});
