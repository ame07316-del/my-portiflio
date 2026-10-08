// TEMPORARY diagnostic — removed once E2E is green. Captures why the
// SharedWorker handshake never completes in CI Chromium (v5: worker
// breadcrumbs via sw.onmessage + per-module dedicated-worker import test).
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
  await page.waitForTimeout(4000);

  const info: Record<string, unknown> = {};
  info.pill = await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a');

  // --- control: minimal module SharedWorker still works? ---
  info.minimalModuleSw = await page.evaluate(async () => {
    const code = 'self.onconnect = (ev) => { const p = ev.ports[0]; p.onmessage = (e) => p.postMessage("pong"); };\n';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const sw = new SharedWorker(url, { type: 'module', name: 'minmod-' + Date.now() });
    const port = sw.port;
    return await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve('timeout-no-reply-in-4s'), 4000);
      sw.onerror = (e) => { clearTimeout(t); resolve('sw-error: ' + (e.message || 'err')); };
      port.onmessage = (ev) => { clearTimeout(t); resolve('reply: ' + JSON.stringify(ev.data)); };
      port.start();
      port.postMessage({});
    });
  });

  // --- our worker: breadcrumb timeline + Hello ---
  info.ourSwBreadcrumb = await page.evaluate(async () => {
    const crumbs: string[] = [];
    const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'bc-' + Date.now() });
    sw.onmessage = (ev) => { if (crumbs.length < 60 && typeof ev.data === 'string' && ev.data.startsWith('DIAG-WS ')) crumbs.push(ev.data.slice(8)); };
    sw.onerror = (e) => { if (crumbs.length < 60) crumbs.push('sw-error: ' + (e.message || e.type || 'err')); };
    const port = sw.port;
    let reply = 'none';
    port.onmessage = (ev) => {
      const d = ev.data as { bin?: ArrayBuffer };
      if (d && d.bin) reply = 'reply len=' + d.bin.byteLength;
    };
    const protoUrl = new URL('./dist/core/protocol.js', location.href).href;
    const proto = (await import(protoUrl)) as unknown as {
      BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
      beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
      Tag: { Hello: number };
    };
    await new Promise((r) => setTimeout(r, 300)); // let the module start; connection already made at ctor
    port.start();
    const w = new proto.BinWriter(16);
    proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
    const frame = w.finish();
    port.postMessage({ bin: frame.buffer }, [frame.buffer]);
    await new Promise((r) => setTimeout(r, 5500));
    return JSON.stringify({ crumbs, reply });
  });

  // --- per-module import test in a DEDICATED module worker (errors surface) ---
  info.dedicatedImports = await page.evaluate(async () => {
    const files = [
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
    ];
    const code =
      'self.onmessage = async (e) => { for (const f of e.data) { try { await import(f); postMessage({ file: f, ok: true }); } catch (err) { postMessage({ file: f, err: String((err && err.message) || err).slice(0, 160) }); } } postMessage({ done: true }); };';
    const results: Array<Record<string, unknown>> = [];
    let loadError = '';
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' });
    w.onerror = (e) => { loadError = e.message || 'worker-load-error'; };
    w.onmessage = (ev) => {
      const d = ev.data as Record<string, unknown> | string;
      if (typeof d === 'string') { if (d.startsWith('DIAG-WS ')) results.push({ crumb: d.slice(8) }); return; }
      if (d && d.file) results.push({ file: String(d.file).split('/').pop(), ok: d.ok, err: d.err as string | undefined });
      if (d && d.done) { (w as unknown as { terminate: () => void }).terminate(); }
    };
    w.postMessage(files);
    await new Promise((r) => setTimeout(r, 8000));
    w.terminate();
    return JSON.stringify({ loadError, results });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
