/** fsm.test.ts — lifecycle machine legality + observers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IllegalTransitionError, createAppMachine } from '../core/fsm.js';

test('fsm: happy path boot → ready', () => {
  const m = createAppMachine();
  assert.equal(m.state, 'boot');
  m.send('START_LOAD');
  m.send('LOADED');
  assert.equal(m.state, 'ready');
});

test('fsm: degrade/recover cycle', () => {
  const m = createAppMachine();
  m.send('START_LOAD');
  m.send('LOADED');
  m.send('DEGRADE');
  assert.equal(m.state, 'degraded');
  m.send('RECOVER');
  assert.equal(m.state, 'ready');
});

test('fsm: illegal transitions throw loudly', () => {
  const m = createAppMachine();
  assert.throws(() => m.send('LOADED'), IllegalTransitionError);
  m.send('START_LOAD');
  assert.throws(() => m.send('RESET'), IllegalTransitionError);
});

test('fsm: fatal only escapes via RESET', () => {
  const m = createAppMachine();
  m.send('FAIL');
  assert.equal(m.state, 'fatal');
  m.send('RESET');
  assert.equal(m.state, 'boot');
});

test('fsm: observers fire with (from,to,event) and can dispose', () => {
  const m = createAppMachine();
  const seen: string[] = [];
  const dispose = m.onTransition((from, to, e) => seen.push(`${from}>${to}:${e}`));
  m.send('START_LOAD');
  dispose();
  m.send('LOADED');
  assert.deepEqual(seen, ['boot>loading:START_LOAD']);
});
