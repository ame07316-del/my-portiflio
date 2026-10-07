/** validate.test.ts — bounds-first parsing (anti-OOM invariants). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationFailure,
  arr,
  int32,
  literal,
  num,
  obj,
  oneOf,
  str,
  utf8ByteLength,
} from '../core/validate.js';

test('validate: utf8 byte counting without allocation', () => {
  assert.equal(utf8ByteLength(''), 0);
  assert.equal(utf8ByteLength('abc'), 3);
  assert.equal(utf8ByteLength('مرحبا'), 10); // 5 × 2-byte Arabic letters
  assert.equal(utf8ByteLength('🙂'), 4);      // astral plane
});

test('validate: string byte budgets reject oversized input', () => {
  const s = str({ maxBytes: 4 });
  assert.equal(s.parse('abcd'), 'abcd');
  assert.equal(s.parse('اب'), 'اب'); // 4 bytes — exactly at budget
  assert.throws(() => s.parse('abcde'), ValidationFailure);
  assert.throws(() => s.parse('مرح'), ValidationFailure); // 6 bytes
  assert.throws(() => s.parse(5), ValidationFailure);
});

test('validate: numbers must be finite and in range', () => {
  const n = num({ min: 0, max: 10 });
  assert.equal(n.parse(5), 5);
  assert.throws(() => n.parse(Infinity), ValidationFailure);
  assert.throws(() => n.parse(NaN), ValidationFailure);
  assert.throws(() => n.parse(-1), ValidationFailure);
});

test('validate: int32 rejects fractions', () => {
  assert.equal(int32({ min: 0, max: 100 }).parse(7), 7);
  assert.throws(() => int32({ min: 0, max: 100 }).parse(7.5), ValidationFailure);
});

test('validate: arrays checked for length BEFORE element parsing', () => {
  const a = arr(num({ min: 0, max: 1 }), { maxItems: 3 });
  assert.deepEqual(a.parse([0, 1, 0]), [0, 1, 0]);
  assert.throws(() => a.parse([0, 1, 0, 1]), ValidationFailure);
  // A forged million-item array costs one length comparison:
  const huge = { length: 1_000_000 } as unknown as unknown[];
  assert.throws(() => a.parse(huge), ValidationFailure);
});

test('validate: objects report precise paths and ignore unknown keys', () => {
  const o = obj({ name: str({ maxBytes: 8 }), age: int32({ min: 0, max: 150 }) });
  assert.deepEqual(o.parse({ name: 'amr', age: 30, extra: true }), { name: 'amr', age: 30 });
  try {
    o.parse({ name: 'a-name-that-is-far-too-long', age: 30 });
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof ValidationFailure);
    assert.match(e.path, /^\.name$|\$\.name/);
  }
});

test('validate: literal + oneOf are O(1) membership checks', () => {
  assert.equal(literal('live').parse('live'), 'live');
  assert.throws(() => literal('live').parse('draft'), ValidationFailure);
  assert.equal(oneOf(['a', 'b'] as const).parse('b'), 'b');
  assert.throws(() => oneOf(['a', 'b'] as const).parse('c'), ValidationFailure);
});
