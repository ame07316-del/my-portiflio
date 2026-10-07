// TEMPORARY diagnostic — removed once E2E is green. Captures why the
// SharedWorker handshake never completes in CI Chromium.
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

test('diag: boot forensics', async ({ page }) => {
  const logs: string[] = [];
  const push = (s: string): void => { if (logs.length < 80) logs.push(s.slice(0, 250)); };
  page.on('console', (m) => push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => push(`[pageerror] ${String(e)}`));
  page.on('requestfailed', (r) => push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) push(`[http ${r.status()}] ${r.url()}`); });
  page.on('crash', () => push('[page crashed]'));

  await page.goto('/index.html');
  await page.waitForTimeout(6000);

  const info = await page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    out.sab = typeof SharedArrayBuffer;
    out.sharedWorkerCtor = typeof SharedWorker;
    out.coi = Boolean(window.crossOriginIsolated);
    out.pill = document.querySelector('[data-status-pill]')?.textContent ?? 'n/a';
    out.workerMode = document.querySelector('[data-worker-mode]')?.textContent ?? 'n/a';
    try { out.fetchWorkerScript = (await fetch('./dist/worker/state-worker.js')).status; } catch (e) { out.fetchWorkerScript = String(e); }
    try { out.fetchWasm = (await fetch('./dist/core.wasm')).status; } catch (e) { out.fetchWasm = String(e); }
    try {
      const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: `diag-${Date.now()}` });
      const err = await new Promise<string | null>((res) => {
        const t = setTimeout(() => res(null), 4000);
        sw.onerror = (e) => { res(e.message || e.type || 'worker-error'); clearTimeout(t); };
      });
      out.swSecondInstance = err === null ? 'no-error-in-4s' : err;
    } catch (e) {
      out.swSecondInstance = `ctor-threw: ${String(e)}`;
    }
    return out;
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
