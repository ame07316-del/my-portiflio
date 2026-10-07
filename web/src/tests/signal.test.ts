/** signal.test.ts — fine-grained reactivity: precision + coalescing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batch, computed, effect, flushSignals, signal } from '../runtime/signal.js';

test('signal: effects observe only the deps they actually read', () => {
  const a = signal(1);
  const b = signal(100);
  let runs = 0;
  let seen = 0;
  effect(() => {
    seen = a.get();
    runs++;
  });
  assert.equal(runs, 1);
  b.set(200); // not a dep → no re-run
  flushSignals();
  assert.equal(runs, 1);
  a.set(2);
  flushSignals();
  assert.equal(runs, 2);
  assert.equal(seen, 2);
});

test('signal: identical writes are no-ops', () => {
  const a = signal(5);
  let runs = 0;
  effect(() => {
    a.get();
    runs++;
  });
  a.set(5);
  flushSignals();
  assert.equal(runs, 1);
});

test('signal: batch coalesces many writes into one effect run', () => {
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    a.get();
    b.get();
    runs++;
  });
  batch(() => {
    a.set(1);
    b.set(1);
    a.set(2);
  });
  flushSignals();
  assert.equal(runs, 2); // initial + ONE coalesced flush
});

test('signal: computed caches until a dep changes', () => {
  const a = signal(2);
  let evals = 0;
  const double = computed(() => {
    evals++;
    return a.get() * 2;
  });
  assert.equal(double.get(), 4);
  assert.equal(double.get(), 4);
  assert.equal(evals, 1); // cached
  a.set(5);
  flushSignals();
  assert.equal(double.get(), 10);
  assert.equal(evals, 2);
});

test('signal: computed chains propagate', () => {
  const a = signal(1);
  const plus1 = computed(() => a.get() + 1);
  const times10 = computed(() => plus1.get() * 10);
  assert.equal(times10.get(), 20);
  a.set(3);
  flushSignals();
  assert.equal(times10.get(), 40);
});

test('signal: disposer stops future runs and unlinks deps', () => {
  const a = signal(0);
  let runs = 0;
  const dispose = effect(() => {
    a.get();
    runs++;
  });
  dispose();
  a.set(1);
  flushSignals();
  assert.equal(runs, 1);
});
