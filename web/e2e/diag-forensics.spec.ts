// TEMPORARY diagnostic — removed once E2E is green. v11: confirm the app
// reaches ready on the plain-Hello handshake, plus a port-poison check
// (SAB frame then plain frame on the SAME port).
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
  const timeline: Array<[number, string]> = [];
  let last = 0;
  for (const ms of [800, 1800, 3000, 4500]) {
    await page.waitForTimeout(ms - last);
    last = ms;
    timeline.push([ms, (await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a'))]);
  }

  const info: Record<string, unknown> = {};
  info.pillTimeline = JSON.stringify(timeline);

  // poison check on a fresh port: SAB frame first, then plain on same port
  info.poisonCheck = await page.evaluate(async () => {
    const proto = (await import(new URL('./dist/core/protocol.js', location.href).href)) as unknown as {
      BinWriter: new (n: number) => { u32(n: number): unknown; u8(n: number): unknown; finish(): Uint8Array };
      beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown; u8(n: number): unknown };
      Tag: { Hello: number };
    };
    const mkHello = (): Uint8Array => {
      const w = new proto.BinWriter(16);
      proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
      return w.finish();
    };
    const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'poison-' + Math.random() });
    const p = sw.port;
    let reply = 'none';
    p.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer }; if (d && d.bin) reply = 'reply len=' + d.bin.byteLength; };
    p.start();
    const sabFrame = mkHello();
    try {
      p.postMessage({ bin: sabFrame.buffer, sab: new SharedArrayBuffer(64) }, [sabFrame.buffer]);
    } catch (e) {
      return JSON.stringify({ sabSend: 'threw: ' + String(e).slice(0, 120) });
    }
    await new Promise((r) => setTimeout(r, 1500));
    const afterSAB = reply;
    const plainFrame = mkHello();
    p.postMessage({ bin: plainFrame.buffer }, [plainFrame.buffer]);
    await new Promise((r) => setTimeout(r, 1500));
    return JSON.stringify({ sabSend: 'ok', afterSAB, afterPlain: reply });
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
