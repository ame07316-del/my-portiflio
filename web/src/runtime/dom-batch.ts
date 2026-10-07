/**
 * runtime/dom-batch.ts — rAF-coalesced DOM scheduler.
 *
 * The Main Thread's ONLY job is painting. All writes funnel through this
 * scheduler: keyed jobs dedupe to one run per frame, reads are drained
 * before writes (no read/write interleaving → no layout thrash), and each
 * flush is measured against an 8 ms budget (half of the 16 ms frame). If a
 * flush overruns, the breach is reported to the telemetry hook — never
 * thrown — so the frame still ships.
 *
 * @complexity schedule*: Time O(1) (Map keying), Space O(distinct keys).
 * @complexity flush:     Time O(jobs), once per animation frame.
 */

import { FRAME_BUDGET_MS } from '../core/bounds.js';

type Job = () => void;

let reads = new Map<string, Job>();
let writes = new Map<string, Job>();
let scheduled = false;
let onBudgetBreach: ((elapsedMs: number, jobCount: number) => void) | null = null;

/** Register a telemetry sink for frame-budget breaches. O(1). */
export function setBudgetHook(fn: ((elapsedMs: number, jobCount: number) => void) | null): void {
  onBudgetBreach = fn;
}

/** Queue a DOM READ. Same-key jobs collapse to the latest. O(1). */
export function scheduleRead(key: string, job: Job): void {
  reads.set(key, job);
  ensureScheduled();
}

/** Queue a DOM WRITE. Same-key jobs collapse to the latest. O(1). */
export function scheduleWrite(key: string, job: Job): void {
  writes.set(key, job);
  ensureScheduled();
}

function ensureScheduled(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flush);
}

/**
 * One frame's work: all reads, then all writes. Jobs added during a flush
 * roll to the next frame — no unbounded in-frame loops.
 * @complexity Time O(jobs) per frame.
 */
function flush(): void {
  scheduled = false;
  const t0 = performance.now();
  let count = 0;

  const r = reads;
  reads = new Map();
  for (const job of r.values()) {
    job();
    count++;
  }
  const w = writes;
  writes = new Map();
  for (const job of w.values()) {
    job();
    count++;
  }

  const elapsed = performance.now() - t0;
  if (elapsed > FRAME_BUDGET_MS) onBudgetBreach?.(elapsed, count);

  if (reads.size > 0 || writes.size > 0) ensureScheduled();
}

/** Test/DI hook: run one flush synchronously. O(jobs). */
export function flushDomBatchForTest(): void {
  flush();
}
