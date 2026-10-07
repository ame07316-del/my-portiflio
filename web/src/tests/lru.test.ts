/** lru.test.ts — bounded LRU eviction semantics. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LruCache } from '../core/lru.js';

test('lru: evicts least-recently-used when capacity is exceeded', () => {
  const c = new LruCache<string, number>(2);
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3); // evicts 'a'
  assert.equal(c.has('a'), false);
  assert.equal(c.get('b'), 2);
  assert.equal(c.get('c'), 3);
});

test('lru: get refreshes recency', () => {
  const c = new LruCache<string, number>(2);
  c.set('a', 1);
  c.set('b', 2);
  c.get('a');    // 'a' is now most recent
  c.set('c', 3); // evicts 'b'
  assert.equal(c.has('a'), true);
  assert.equal(c.has('b'), false);
});

test('lru: has() does not touch recency', () => {
  const c = new LruCache<string, number>(2);
  c.set('a', 1);
  c.set('b', 2);
  c.has('a');
  c.set('c', 3); // still evicts 'a'
  assert.equal(c.has('a'), false);
});

test('lru: onEvict hook fires with evicted pair', () => {
  const evicted: Array<[string, number]> = [];
  const c = new LruCache<string, number>(1, (k, v) => evicted.push([k, v]));
  c.set('a', 1);
  c.set('b', 2);
  assert.deepEqual(evicted, [['a', 1]]);
});

test('lru: capacity must be >= 1', () => {
  assert.throws(() => new LruCache(0), RangeError);
});
