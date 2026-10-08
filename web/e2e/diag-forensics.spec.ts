// TEMPORARY diagnostic — removed once E2E is green. v8: port-driven import
// chain inside a SharedWorker (no TLA top-level, no reliance on
// self.postMessage). After the chain imports the real worker, a fresh
// connection sends Hello and reports a reply.
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

  // --- control: minimal blob module SW, port pong (proven pattern) ---
  info.controlPong = await page.evaluate(async () => {
    const code = 'self.onconnect = (ev) => { const p = ev.ports[0]; p.onmessage = (e) => p.postMessage("pong:" + String(e.data)); };\n';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const sw = new SharedWorker(url, { type: 'module', name: 'ctl-' + Math.random() });
    const port = sw.port;
    return await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve('timeout-2s'), 2000);
      port.onmessage = (ev) => { clearTimeout(t); resolve('reply: ' + JSON.stringify(ev.data)); };
      port.start();
      port.postMessage('hi');
    });
  });

  // --- port-driven import chain + reconnect Hello ---
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
      'let active = null;\n' +
      'self.onconnect = (ev) => {\n' +
      '  const p = ev.ports[0];\n' +
      '  p.onmessage = (e) => { if (e.data === "go") { active = p; void run(p); } };\n' +
      '};\n' +
      'async function run(p) {\n' +
      '  for (const t of targets) {\n' +
      '    try { await race(import(t)); p.postMessage("OK " + trim(t)); }\n' +
      '    catch (e) { p.postMessage("FAIL " + trim(t) + " :: " + String((e && e.message) || e).slice(0, 160)); }\n' +
      '  }\n' +
      '  p.postMessage("done");\n' +
      '}\n';
    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const name = 'chain8-' + Date.now();

    const mkConn = (sw: SharedWorker) => {
      const msgs: string[] = [];
      let reply = 'none';
      sw.port.onmessage = (ev) => {
        if (typeof ev.data === 'string') { if (msgs.length < 60) msgs.push(ev.data.slice(0, 200)); }
        else if (ev.data && (ev.data as { bin?: ArrayBuffer }).bin) reply = 'reply len=' + (ev.data as { bin: ArrayBuffer }).bin.byteLength;
      };
      sw.port.start();
      return { msgs, getReply: () => reply };
    };

    const sw1 = new SharedWorker(blobUrl, { type: 'module', name });
    const c1 = mkConn(sw1);
    sw1.port.postMessage('go');
    // wait for done (or 13s); if the first connection is dead, reconnect after 3s of silence
    let done = false;
    let c2 = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 13000) {
      await new Promise((r) => setTimeout(r, 200));
      if (c1.msgs.includes('done')) { done = true; break; }
      if (Date.now() - t0 > 3000 && c1.msgs.length === 0 && c2 === null) {
        const sw2 = new SharedWorker(blobUrl, { type: 'module', name });
        c2 = mkConn(sw2);
        sw2.port.postMessage('go');
      }
    }
    const chainMsgs = c1.msgs.length > 0 ? c1.msgs : c2?.msgs ?? [];
    // reconnect Hello: fresh connection → real onconnect handler (armed after chain)
    let helloReply = 'no-worker-state';
    if (done) {
      const sw3 = new SharedWorker(blobUrl, { type: 'module', name });
      const c3 = mkConn(sw3);
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
      helloReply = c3.getReply();
    }
    return JSON.stringify({ done, reconnected: c2 !== null, chainMsgs, helloReply });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
