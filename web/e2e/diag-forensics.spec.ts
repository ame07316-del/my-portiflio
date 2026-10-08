// TEMPORARY diagnostic — removed once E2E is green. v7: verify the
// self.postMessage→sw.onmessage channel with plain controls (no TLA, TLA only,
// single dynamic import), then the full chain with per-import timeout races.
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

test('diag: boot forensics', async ({ page }) => {
  const logs: string[] = [];
  const push = (s: string): void => { if (logs.length < 80) logs.push(s.slice(0, 250)); };
  page.on('console', (m) => push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => push(`[pageerror] ${String(e)}`));
  page.on('requestfailed', (r) => push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) push(`[http ${r.status()}] ${r.url()}`); });

  await page.goto('/index.html');
  await page.waitForTimeout(3000);

  const info: Record<string, unknown> = {};
  info.pill = await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a');

  // helper: run a blob module SharedWorker, collect sw.onmessage strings for ms
  info.probeC_plainSelfPost = await page.evaluate(
    async (code: string, ms: number) => {
      const msgs: string[] = [];
      let swError = '';
      const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'c-' + Math.random() });
      sw.onmessage = (ev) => { if (msgs.length < 40 && typeof ev.data === 'string') msgs.push(ev.data.slice(0, 200)); };
      sw.onerror = (e) => { swError = (e.message || e.type || 'sw-error') + (e.filename ? ' @' + e.filename : ''); };
      await new Promise((r) => setTimeout(r, ms));
      return JSON.stringify({ swError: swError || 'none', msgs });
    },
    'self.postMessage("self-post-plain");\n',
    2500,
  );

  info.probeD_tlaOnly = await page.evaluate(
    async (code: string, ms: number) => {
      const msgs: string[] = [];
      let swError = '';
      const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'd-' + Math.random() });
      sw.onmessage = (ev) => { if (msgs.length < 40 && typeof ev.data === 'string') msgs.push(ev.data.slice(0, 200)); };
      sw.onerror = (e) => { swError = (e.message || e.type || 'sw-error') + (e.filename ? ' @' + e.filename : ''); };
      await new Promise((r) => setTimeout(r, ms));
      return JSON.stringify({ swError: swError || 'none', msgs });
    },
    'await new Promise((r) => setTimeout(r, 50));\nself.postMessage("self-post-tla");\n',
    2500,
  );

  const origin = await page.evaluate(() => location.origin);
  info.probeE_singleImport = await page.evaluate(
    async (tgt: string) => {
      const msgs: string[] = [];
      let swError = '';
      const code =
        'const t = ' + JSON.stringify(tgt) + ';\n' +
        'try { await import(t); self.postMessage("imp-ok"); }\n' +
        'catch (e) { self.postMessage("imp-fail :: " + String((e && e.message) || e).slice(0, 160)); }\n';
      const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'e2-' + Math.random() });
      sw.onmessage = (ev) => { if (msgs.length < 40 && typeof ev.data === 'string') msgs.push(ev.data.slice(0, 200)); };
      sw.onerror = (e) => { swError = (e.message || e.type || 'sw-error') + (e.filename ? ' @' + e.filename : ''); };
      await new Promise((r) => setTimeout(r, 4000));
      return JSON.stringify({ swError: swError || 'none', msgs });
    },
    origin + '/dist/core/bounds.js',
  );

  // --- full chain with per-import 2.5s timeout races ---
  info.chainRaced = await page.evaluate(async () => {
    const base = location.origin;
    const targets = [
      '/dist/core/bounds.js',
      '/dist/core/protocol.js',
      '/dist/core/validate.js',
      '/dist/core/crdt.js',
      '/dist/core/ring.js',
      '/dist/core/storage.js',
      '/dist/core/idb.js',
      '/dist/runtime/wasm-core.js',
      '/dist/worker/sync-adapter.js',
      '/dist/worker/state-node.js',
      '/dist/worker/state-worker.js',
    ].map((p) => base + p);
    const code =
      'const targets = ' + JSON.stringify(targets) + ';\n' +
      'const race = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("import-hung-2500ms")), 2500))]);\n' +
      'for (const t of targets) {\n' +
      '  try { await race(import(t)); self.postMessage("OK " + t.slice(' + base.length + ')); }\n' +
      '  catch (e) { self.postMessage("FAIL " + t.slice(' + base.length + ') + " :: " + String((e && e.message) || e).slice(0, 160)); }\n' +
      '}\n' +
      'self.postMessage("done");\n';
    const msgs: string[] = [];
    let swError = '';
    const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'cr-' + Math.random() });
    sw.onmessage = (ev) => { if (msgs.length < 60 && typeof ev.data === 'string') msgs.push(ev.data.slice(0, 200)); };
    sw.onerror = (e) => { swError = swError + ' | ' + (e.message || e.type || 'sw-error'); };
    await new Promise<void>((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => { if (msgs.includes('done') || Date.now() - t0 > 12000) { clearInterval(iv); resolve(); } }, 100);
    });
    return JSON.stringify({ swError: swError || 'none', done: msgs.includes('done'), msgs });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
