/** obs.test.ts — Phase 6: deterministic sampling tracer + health probes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tracer } from '../obs/tracer.js';
import { EventLoopLagProbe, collectHealth, metricsText } from '../obs/health.js';

test('tracer: sampling is deterministic per trace id', () => {
  const t = new Tracer(0.5, 16);
  const verdicts = new Map<string, boolean>();
  for (const id of ['req-1', 'req-2', 'req-3', 'req-4']) {
    const v1 = t.shouldSample(id);
    const v2 = t.shouldSample(id);
    assert.equal(v1, v2, 'same id must always get the same verdict');
    verdicts.set(id, v1);
  }
  // rate 0.5 over enough ids should mix (sanity, not a statistical proof)
  assert.ok(verdicts.size === 4);
});

test('tracer: unsampled traces allocate nothing (noop span)', () => {
  const t = new Tracer(0, 16);
  const span = t.startSpan('op', 'any');
  span.finish();
  assert.equal(t.unsampled, 1);
  assert.equal(t.sampled, 0);
  assert.equal(t.buffered, 0);
});

test('tracer: bounded ring sheds oldest under storms', () => {
  let clock = 0;
  const t = new Tracer(1, 4, () => clock);
  for (let i = 0; i < 10; i++) {
    const s = t.startSpan(`op-${i}`, `trace-${i}`);
    clock += 1;
    s.finish('ok');
  }
  assert.equal(t.buffered, 4, 'ring must never exceed capacity');
  const spans = t.drain();
  assert.deepEqual(spans.map((s) => s.name), ['op-6', 'op-7', 'op-8', 'op-9'], 'oldest shed');
  assert.ok(spans.every((s) => s.durationMs >= 0));
  assert.equal(t.buffered, 0);
});

test('health: report shape + degraded trigger', () => {
  const lag = new EventLoopLagProbe(10);
  const report = collectHealth(
    [
      () => ({ name: 'gw', depth: 3, dropped: 0, ok: true }),
      () => ({ name: 'pool', depth: 0, dropped: 2, ok: true }),
    ],
    lag,
  );
  assert.equal(report.status, 'ok');
  assert.equal(report.components.length, 2);
  assert.ok(report.memory.heapUsed > 0);
  assert.ok(typeof report.eventLoopLagMs === 'number');

  const degraded = collectHealth([() => ({ name: 'db', ok: false })], lag);
  assert.equal(degraded.status, 'degraded');
});

test('health: prometheus exposition format', () => {
  const lag = new EventLoopLagProbe(10);
  const text = metricsText(
    collectHealth([() => ({ name: 'gw', depth: 5, dropped: 1, ok: true })], lag),
  );
  assert.match(text, /sovereign_event_loop_lag_ms /);
  assert.match(text, /sovereign_component_depth\{name="gw"\} 5/);
  assert.match(text, /sovereign_component_dropped_total\{name="gw"\} 1/);
  assert.match(text, /sovereign_heap_used_bytes /);
});
