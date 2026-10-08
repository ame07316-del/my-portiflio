// TEMPORARY diagnostic — removed once E2E is green. v6: inside-SharedWorker
// per-module dynamic-import chain (absolute URLs) with real error messages,
// plus Hello on the original connection and on a fresh reconnect.
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

  // --- control: minimal blob module SharedWorker ---
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

  // --- the chain: per-module dynamic import inside a SharedWorker ---
  info.chain = await page.evaluate(async () => {
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
      'for (const t of targets) {\n' +
      '  try { await import(t); self.postMessage("diag-chain OK " + t.slice(' + base.length + ')); }\n' +
      '  catch (e) { self.postMessage("diag-chain FAIL " + t.slice(' + base.length + ') + " :: " + String((e && e.message) || e).slice(0, 200)); }\n' +
      '}\n' +
      'self.postMessage("diag-chain done");\n';
    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const name = 'chain-' + Date.now();
    const msgs: string[] = [];
    let swError = '';
    const sw = new SharedWorker(blobUrl, { type: 'module', name });
    sw.onmessage = (ev) => { if (msgs.length < 60 && typeof ev.data === 'string') msgs.push(ev.data.slice(0, 220)); };
    sw.onerror = (e) => { swError = swError + ' | ' + (e.message || e.type || 'sw-error') + (e.filename ? ' @' + e.filename : ''); };
    const port = sw.port;
    let reply1 = 'none';
    port.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer }; if (d && d.bin) reply1 = 'reply len=' + d.bin.byteLength; };
    const protoUrl = new URL('./dist/core/protocol.js', location.href).href;
    const proto = (await import(protoUrl)) as unknown as {
      BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
      beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
      Tag: { Hello: number };
    };
    const mkHello = (): ArrayBuffer => {
      const w = new proto.BinWriter(16);
      proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
      return w.finish().buffer as ArrayBuffer;
    };
    port.start();
    await new Promise<void>((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => { if (msgs.includes('diag-chain done') || Date.now() - t0 > 9000) { clearInterval(iv); resolve(); } }, 100);
    });
    const chainDone = msgs.includes('diag-chain done');
    // Hello #1: original connection (made at construction, before module ready)
    const h1 = mkHello();
    port.postMessage({ bin: h1 }, [h1]);
    await new Promise((r) => setTimeout(r, 2500));
    // Hello #2: fresh connection object, same instance (name + blob URL)
    let reply2 = 'none';
    const sw2 = new SharedWorker(blobUrl, { type: 'module', name });
    const port2 = sw2.port;
    port2.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer }; if (d && d.bin) reply2 = 'reply len=' + d.bin.byteLength; };
    port2.start();
    const h2 = mkHello();
    port2.postMessage({ bin: h2 }, [h2]);
    await new Promise((r) => setTimeout(r, 2500));
    return JSON.stringify({ swError: swError || 'none', chainDone, reply1, reply2, msgs });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
