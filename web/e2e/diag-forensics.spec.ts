// TEMPORARY diagnostic — removed once E2E is green. v13:
// 1. worker BC breadcrumbs (module scope + onconnect)
// 2. main-thread heartbeat every 250ms (init script)
// 3. an EARLY probe worker (created by init script, before page JS) — is the
//    startup delay general or specific to the app's t=0 worker?
// 4. resource timing dump at 5.5s
// 5. late join of the app instance recording ALL messages (strings + bins)
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

test('diag: boot forensics', async ({ page }) => {
  const logs: string[] = [];
  const push = (s: string): void => { if (logs.length < 100) logs.push(s.slice(0, 220)); };
  page.on('console', (m) => push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => push(`[pageerror] ${String(e)}`));

  await page.addInitScript(() => {
    const w = window as unknown as {
      __bcLog: Array<[number, string]>;
      __hb: Array<number>;
      __earlyReply: string[];
    };
    w.__bcLog = [];
    w.__hb = [];
    w.__earlyReply = [];
    try {
      const bc = new BroadcastChannel('sovd-wire');
      bc.onmessage = (ev) => {
        if (typeof ev.data === 'string' && w.__bcLog.length < 200) w.__bcLog.push([Math.round(performance.now()), ev.data]);
      };
    } catch { /* BC unavailable */ }
    setInterval(() => {
      if (w.__hb.length < 200) w.__hb.push(Math.round(performance.now()));
    }, 250);
    // EARLY probe worker: created before any page JS, same script as the app's.
    try {
      const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'probe-early' });
      const p = sw.port;
      p.onmessage = (ev) => {
        const d = ev.data as { bin?: ArrayBuffer } | string;
        if (w.__earlyReply.length < 20) {
          if (typeof d === 'string') w.__earlyReply.push([Math.round(performance.now()), 'str:' + d.slice(0, 80)] as unknown as string);
          else if (d && d.bin) w.__earlyReply.push([Math.round(performance.now()), 'bin:' + d.bin.byteLength] as unknown as string);
        }
      };
      p.start();
    } catch (e) {
      w.__earlyReply.push('early-threw: ' + String(e).slice(0, 120));
    }
  });

  await page.goto('/index.html');
  await page.waitForTimeout(5500);
  const pill = await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a');

  const info: Record<string, unknown> = { pill };
  info.dump = await page.evaluate(() => {
    const w = window as unknown as {
      __bcLog: Array<[number, string]>;
      __hb: Array<number>;
      __earlyReply: string[];
    };
    const res = performance.getEntriesByType('resource').slice(0, 60).map((r) => [
      Math.round(r.startTime), Math.round(r.duration), (r as PerformanceResourceTiming).initiatorType, r.name.split('/').slice(-2).join('/'),
    ]);
    return JSON.stringify({
      bcLog: w.__bcLog,
      hb: w.__hb,
      earlyReply: w.__earlyReply,
      res,
    });
  });

  // late join: record ALL messages (strings + bins) with timestamps
  info.joinAll = await page.evaluate(async () => {
    const proto = (await import(new URL('./dist/core/protocol.js', location.href).href)) as unknown as {
      BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
      beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
      Tag: { Hello: number };
    };
    const msgs: Array<[number, string]> = [];
    const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'sovereign-state' });
    const p = sw.port;
    p.onmessage = (ev) => {
      const d = ev.data as { bin?: ArrayBuffer } | string;
      if (msgs.length < 30) {
        if (typeof d === 'string') msgs.push([Math.round(performance.now()), 'str:' + d.slice(0, 100)]);
        else if (d && d.bin) msgs.push([Math.round(performance.now()), 'bin:' + d.bin.byteLength]);
        else msgs.push([Math.round(performance.now()), 'other:' + String(typeof d)]);
      }
    };
    p.start();
    const w = new proto.BinWriter(16);
    proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
    const f = w.finish();
    p.postMessage({ bin: f.buffer }, [f.buffer]);
    await new Promise((r) => setTimeout(r, 2000));
    return JSON.stringify(msgs);
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
