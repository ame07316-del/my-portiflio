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
  await page.waitForTimeout(5000);

  const info = await page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    out.sab = typeof SharedArrayBuffer;
    out.coi = Boolean(window.crossOriginIsolated);
    out.pill = document.querySelector('[data-status-pill]')?.textContent ?? 'n/a';
    out.workerMode = document.querySelector('[data-worker-mode]')?.textContent ?? 'n/a';
    try { out.fetchWorkerScript = (await fetch('./dist/worker/state-worker.js')).status; } catch (e) { out.fetchWorkerScript = String(e); }
    try { out.fetchWasm = (await fetch('./dist/core.wasm')).status; } catch (e) { out.fetchWasm = String(e); }
    return out;
  });

  // --- direct port probe 1: trivial inline echo SharedWorker ---
  info.trivialSw = await page.evaluate(async () => {
    try {
      const code = `self.onconnect = (ev) => { const p = ev.ports[0]; p.onmessage = (e) => p.postMessage('pong:' + (e.data && e.data.bin ? e.data.bin.byteLength : String(e.data))); };`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const sw = new SharedWorker(url, { name: 'trivial-' + Date.now() });
      const port = sw.port;
      return await new Promise<string>((resolve) => {
        const t = setTimeout(() => resolve('timeout-no-reply-in-4s'), 4000);
        sw.onerror = (e) => { clearTimeout(t); resolve('sw-error: ' + (e.message || e.type || 'err')); };
        port.onmessage = (ev) => { clearTimeout(t); resolve('reply: ' + JSON.stringify(ev.data)); };
        port.start();
        port.postMessage({ bin: new ArrayBuffer(16) });
      });
    } catch (e) { return 'ctor-threw: ' + String(e); }
  });

  // --- direct port probe 2: OUR worker script, raw Hello frame;
  //     also listen on sw.onmessage (dedicated-path miswire detector) ---
  info.ourSwDirect = await page.evaluate(async () => {
    try {
      const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'direct-' + Date.now() });
      const port = sw.port;
      const protoUrl = new URL('./dist/core/protocol.js', location.href).href;
      const proto = (await import(protoUrl)) as unknown as {
        BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
        beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
        Tag: { Hello: number };
      };
      const w = new proto.BinWriter(16);
      proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
      const frame = w.finish();
      return await new Promise<string>((resolve) => {
        let done = false;
        const finish = (s: string) => { if (!done) { done = true; clearTimeout(t); resolve(s); } };
        const t = setTimeout(() => finish('timeout-no-reply-in-8s'), 8000);
        sw.onerror = (e) => finish('sw-error: ' + (e.message || e.type || 'err'));
        sw.onmessage = (ev) => finish('via-sw-onmessage (dedicated-path miswire!): ' + JSON.stringify(ev.data)?.slice(0, 120));
        port.onmessage = (ev) => {
          const d = ev.data as { bin?: ArrayBuffer };
          const bin = d && d.bin ? d.bin : null;
          finish(bin ? `reply len=${bin.byteLength}` : 'reply non-bin: ' + JSON.stringify(ev.data));
        };
        port.start();
        port.postMessage({ bin: frame.buffer }, [frame.buffer]);
      });
    } catch (e) { return 'ctor-threw: ' + String(e); }
  });

  // --- probe 3: import the worker module graph at PAGE level (browser env) ---
  info.pageLevelImport = await page.evaluate(async () => {
    const url = new URL('./dist/worker/state-worker.js', location.href).href;
    const t = setTimeout(() => { /* keep going */ }, 0);
    try {
      await Promise.race([
        import(url),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('import-hung-6s')), 6000)),
      ]);
      return 'import-ok';
    } catch (e) {
      return 'import-failed: ' + String(e).slice(0, 160);
    } finally { clearTimeout(t); }
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
