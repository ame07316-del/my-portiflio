#!/usr/bin/env node
/**
 * scripts/load-test.mjs — Phase 7 staged load storm (ZERO dependencies).
 *
 * env:
 *   BASE_URL        default http://127.0.0.1:8081
 *   ADMIN_SECRET    required, >= 32 chars (exit 2 otherwise)
 *   STEPS           comma list of target rps, default '25,50,100'
 *   SECONDS_PER_STEP default 8
 *   P99_BUDGET_MS   default 1500
 *
 * Budget (not fixed): p99 <= max(P99_BUDGET_MS, 20*step*1000/rps),
 * floor rps >= 0.6*maxRps, and money conservation: demo alice+bob == 100000.
 */
const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8081').replace(/\/$/, '');
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';
const STEPS = (process.env.STEPS ?? '25,50,100')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const SECONDS_PER_STEP = Number(process.env.SECONDS_PER_STEP ?? 8);
const P99_BUDGET_MS = Number(process.env.P99_BUDGET_MS ?? 1500);

if (ADMIN_SECRET.length < 32) {
  console.error('load-test: ADMIN_SECRET must be >= 32 characters (openssl rand -base64 48)');
  process.exit(2);
}

/** Ordered-array percentile (nearest-rank). O(n) once sorted. */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

const headers = {};
async function main() {
  // ---- login once, reuse the bearer across the whole storm ----
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: ADMIN_SECRET }),
  });
  if (loginRes.status !== 200) {
    console.error(`load-test: login failed (${loginRes.status})`);
    process.exit(1);
  }
  const { token } = (await loginRes.json());
  headers.authorization = `Bearer ${token}`;

  let failures = 0;
  const fail = (msg) => { failures++; console.error(`FAIL: ${msg}`); };

  /** One step: `rps` concurrent workers hammering /transfer until the clock says stop. */
  async function runStep(rps) {
    const started = Date.now();
    const stopAt = started + SECONDS_PER_STEP * 1000;
    const durations = new Float64Array(200_000);
    let n = 0;
    let errors = 0;
    let throttled = 0;

    const worker = async () => {
      while (Date.now() < stopAt) {
        const body = JSON.stringify({
          tenant: 'demo',
          from: 'alice',
          to: 'bob',
          amount: 1,
          idempotencyKey: `storm-${rps}-${n}-${Math.random().toString(36).slice(2)}`,
        });
        const t0 = performance.now();
        try {
          const res = await fetch(`${BASE_URL}/transfer`, { method: 'POST', headers, body });
          if (res.status === 429) throttled++;
          await res.body?.cancel().catch(() => {});
        } catch {
          errors++;
        }
        if (n < durations.length) durations[n] = performance.now() - t0;
        n++;
      }
    };
    await Promise.all(Array.from({ length: rps }, () => worker()));
    const elapsedSec = (Date.now() - started) / 1000;
    const used = durations.subarray(0, n).slice().sort((a, b) => a - b);
    const actualRps = n / Math.max(elapsedSec, 1e-9);
    const report = {
      target: rps,
      rps: Math.round(actualRps * 10) / 10,
      p50: Math.round(percentile(used, 50) * 10) / 10,
      p95: Math.round(percentile(used, 95) * 10) / 10,
      p99: Math.round(percentile(used, 99) * 10) / 10,
      p999: Math.round(percentile(used, 99.9) * 10) / 10,
      errors,
      throttled,
    };
    console.log(
      `step target=${rps} rps: ${report.rps} · p50 ${report.p50}ms · p95 ${report.p95}ms · p99 ${report.p99}ms · p99.9 ${report.p999}ms · errors ${errors} · throttled ${throttled}`,
    );
    return report;
  }

  // ---- warm-up (not checked) ----
  console.log('warm-up:');
  await runStep(5);

  // ---- checked steps ----
  for (const step of STEPS) {
    const r = await runStep(step);
    if (r.errors > 0.01 * Math.max(1, r.rps * SECONDS_PER_STEP)) {
      fail(`step ${step}: errors ${r.errors} > 1% of requests`);
    }
    const budget = Math.max(P99_BUDGET_MS, Math.round((20 * step * 1000) / Math.max(1, r.rps)));
    if (r.p99 > budget) fail(`step ${step}: p99 ${r.p99}ms > budget ${budget}ms`);
    if (r.rps < step * 0.6) fail(`step ${step}: rps ${r.rps} < floor ${step * 0.6}`);
  }

  // ---- conservation law: the storm must not create or destroy money ----
  const [alice, bob] = await Promise.all([
    fetch(`${BASE_URL}/account/demo/alice`, { headers }).then((r) => r.json()),
    fetch(`${BASE_URL}/account/demo/bob`, { headers }).then((r) => r.json()),
  ]);
  const total = (alice.balance ?? 0) + (bob.balance ?? 0);
  console.log(`conservation: demo/alice=${alice.balance} demo/bob=${bob.balance} total=${total}`);
  if (total !== 100_000) fail(`money not conserved: total=${total} (expected 100000)`);

  if (failures > 0) {
    console.error(`LOAD TEST FAILED ❌ (${failures} violation(s))`);
    process.exit(1);
  }
  console.log('LOAD TEST PASSED ✅');
}

main().catch((e) => {
  console.error('LOAD TEST ERROR ❌', e);
  process.exit(1);
});
