// TEMPORARY diagnostic — removed once E2E is green. v10: probe the APP's
// real 'sovereign-state' SharedWorker instance: plain Hello vs SAB-envelope
// Hello. Confirms whether SAB-carrying frames are dropped on receipt.
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
  await page.waitForTimeout(3500); // let the app's worker boot (incl. 1s hello retry)

  const info: Record<string, unknown> = {};
  info.pill = await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a');

  // --- probe the app's real worker (same URL + name 'sovereign-state') ---
  info.appWorker = await page.evaluate(async () => {
    const mkHello = (proto: unknown) => {
      const p = proto as {
        BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
        beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
        Tag: { Hello: number };
      };
      const w = new p.BinWriter(16);
      p.beginFrame(w, p.Tag.Hello, 1).u32(0);
      return w.finish();
    };
    const proto = (await import(new URL('./dist/core/protocol.js', location.href).href)) as unknown;

    // conn A: plain Hello (transferred, no SAB)
    let replyA = 'none';
    const swA = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'sovereign-state' });
    const pa = swA.port;
    pa.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer }; if (d && d.bin) replyA = 'reply len=' + d.bin.byteLength; };
    pa.start();
    const fa = mkHello(proto);
    pa.postMessage({ bin: fa.buffer }, [fa.buffer]);
    await new Promise((r) => setTimeout(r, 2500));

    // conn B: SAB-envelope Hello (ring style, SAB NOT transferred)
    let replyB = 'none';
    let portErrB = '';
    const swB = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'sovereign-state' });
    const pb = swB.port;
    pb.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer }; if (d && d.bin) replyB = 'reply len=' + d.bin.byteLength; };
    pb.onerror = (e) => { portErrB = 'port-error: ' + String(e); };
    pb.start();
    let fb: Uint8Array;
    try {
      fb = mkHello(proto);
      pb.postMessage({ bin: fb.buffer, sab: new SharedArrayBuffer(4096) });
    } catch (e) {
      replyB = 'send-threw: ' + String(e).slice(0, 160);
    }
    await new Promise((r) => setTimeout(r, 2500));

    return JSON.stringify({ replyA, replyB, portErrB: portErrB || 'none' });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
