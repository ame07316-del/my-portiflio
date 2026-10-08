// TEMPORARY diagnostic — removed once E2E is green. v9: isolate the exact
// worker-port mechanism that fails — (1) onmessage + plain reply, (2)
// addEventListener+start + plain reply, (3) onmessage + TRANSFERRED reply —
// then the real-worker chain with port-channel CRUMBs.
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
  await page.waitForTimeout(1500);

  const info: Record<string, unknown> = {};
  info.pill = await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a');

  // control A: onmessage + plain reply (proven in earlier rounds)
  info.ctlOnmsgPlain = await page.evaluate(async () => {
    const code = 'self.onconnect = (ev) => { const p = ev.ports[0]; p.onmessage = (e) => p.postMessage("pong:" + String(e.data)); };\n';
    const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'a-' + Math.random() });
    const port = sw.port;
    return await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve('timeout-2s'), 2000);
      port.onmessage = (ev) => { clearTimeout(t); resolve('reply: ' + JSON.stringify(ev.data)); };
      port.start();
      port.postMessage('hi');
    });
  });

  // control B: addEventListener + start + plain reply (app's attachPort pattern)
  info.ctlALPlain = await page.evaluate(async () => {
    const code =
      'self.onconnect = (ev) => {\n' +
      '  const p = ev.ports[0];\n' +
      '  p.addEventListener("message", (e) => p.postMessage("pong-al:" + String(e.data)));\n' +
      '  p.start();\n' +
      '};\n';
    const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'b-' + Math.random() });
    const port = sw.port;
    return await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve('timeout-2s'), 2000);
      port.onmessage = (ev) => { clearTimeout(t); resolve('reply: ' + JSON.stringify(ev.data)); };
      port.start();
      port.postMessage('hi');
    });
  });

  // control C: onmessage + TRANSFERRED ArrayBuffer reply (worker's Client.send pattern)
  info.ctlOnmsgTransfer = await page.evaluate(async () => {
    const code =
      'self.onconnect = (ev) => {\n' +
      '  const p = ev.ports[0];\n' +
      '  p.onmessage = (e) => { const b = new ArrayBuffer(16); p.postMessage({ bin: b }, [b]); };\n' +
      '};\n';
    const sw = new SharedWorker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module', name: 'c-' + Math.random() });
    const port = sw.port;
    return await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve('timeout-2s'), 2000);
      port.onmessage = (ev) => {
        clearTimeout(t);
        const d = ev.data as { bin?: ArrayBuffer };
        resolve(d && d.bin ? 'reply bin len=' + d.bin.byteLength : 'reply: ' + JSON.stringify(ev.data));
      };
      port.start();
      port.postMessage('hi');
    });
  });

  // --- chain: import all graph modules in-worker, then reconnect Hello with CRUMB capture ---
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
      'const trim = (t) => t.slice(' + base.length + ');\n' +
      'const race = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("import-hung-2500ms")), 2500))]);\n' +
      'self.onconnect = (ev) => {\n' +
      '  const p = ev.ports[0];\n' +
      '  p.onmessage = (e) => { if (e.data === "go") void run(p); };\n' +
      '};\n' +
      'async function run(p) {\n' +
      '  for (const t of targets) {\n' +
      '    try { await race(import(t)); p.postMessage("OK " + trim(t)); }\n' +
      '    catch (e) { p.postMessage("FAIL " + trim(t) + " :: " + String((e && e.message) || e).slice(0, 160)); }\n' +
      '  }\n' +
      '  p.postMessage("done");\n' +
      '}\n';
    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const name = 'chain9-' + Date.now();

    const sw1 = new SharedWorker(blobUrl, { type: 'module', name });
    const chainMsgs: string[] = [];
    sw1.port.onmessage = (ev) => { if (typeof ev.data === 'string' && chainMsgs.length < 60) chainMsgs.push(ev.data.slice(0, 200)); };
    sw1.port.start();
    sw1.port.postMessage('go');
    let done = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 13000) {
      await new Promise((r) => setTimeout(r, 200));
      if (chainMsgs.includes('done')) { done = true; break; }
    }
    let hello: { reply: string; msgs: string[] } = { reply: 'chain-not-done', msgs: [] };
    if (done) {
      const sw3 = new SharedWorker(blobUrl, { type: 'module', name });
      const c3msgs: string[] = [];
      let reply = 'none';
      sw3.port.onmessage = (ev) => {
        if (typeof ev.data === 'string') { if (c3msgs.length < 40) c3msgs.push(ev.data.slice(0, 200)); }
        else if (ev.data && (ev.data as { bin?: ArrayBuffer }).bin) reply = 'reply len=' + (ev.data as { bin: ArrayBuffer }).bin.byteLength;
      };
      sw3.port.start();
      const proto = (await import(new URL('./dist/core/protocol.js', location.href).href)) as unknown as {
        BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
        beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
        Tag: { Hello: number };
      };
      const w = new proto.BinWriter(16);
      proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
      const frame = w.finish();
      sw3.port.postMessage({ bin: frame.buffer }, [frame.buffer]);
      await new Promise((r) => setTimeout(r, 2500));
      hello = { reply, msgs: c3msgs };
    }
    return JSON.stringify({ done, chainMsgs, hello });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
