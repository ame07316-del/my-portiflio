/** ring.test.ts — SPSC lock-free ring: FIFO, wrap-around, load shedding. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpscRing } from '../core/ring.js';

test('ring: rejects non-power-of-two capacities', () => {
  assert.throws(() => SpscRing.withCapacity(3), RangeError);
  assert.throws(() => SpscRing.withCapacity(2), RangeError);
});

test('ring: FIFO order across wrap-around', () => {
  const ring = SpscRing.withCapacity(8); // usable = 7
  let pushed = 0;
  let popped = 0;
  // push/pop 10× the capacity to force many wraps
  for (let round = 0; round < 10; round++) {
    for (let i = 0; i < 5; i++) {
      assert.equal(ring.tryPush(pushed), true);
      pushed++;
    }
    for (let i = 0; i < 5; i++) {
      assert.equal(ring.tryPop(), popped);
      popped++;
    }
  }
  assert.equal(popped, 50);
  assert.equal(ring.length, 0);
});

test('ring: sheds load when full instead of blocking', () => {
  const ring = SpscRing.withCapacity(4); // usable = 3
  assert.equal(ring.tryPush(1), true);
  assert.equal(ring.tryPush(2), true);
  assert.equal(ring.tryPush(3), true);
  assert.equal(ring.tryPush(4), false); // full → dropped, O(1)
  assert.equal(ring.length, 3);
  assert.equal(ring.tryPop(), 1);
  assert.equal(ring.tryPush(4), true);
});

test('ring: empty pop returns undefined', () => {
  const ring = SpscRing.withCapacity(4);
  assert.equal(ring.tryPop(), undefined);
});

test('ring: over() reconstructs an equivalent view of the same SAB', () => {
  const a = SpscRing.withCapacity(16);
  const b = SpscRing.over(a.buffer);
  a.tryPush(42);
  assert.equal(b.tryPop(), 42);
  b.tryPush(7);
  assert.equal(a.tryPop(), 7);
});
