// TEMPORARY diagnostic — removed once E2E is green. v12:
// 1. BroadcastChannel breadcrumbs from the worker module scope (app instance)
// 2. join the app's 'sovereign-state' instance late with a fresh port + plain Hello
// 3. control: a different instance name
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

test('diag: boot forensics', async ({ page }) => {
  const logs: string[] = [];
  const push = (s: string): void => { if (logs.length < 100) logs.push(s.slice(0, 220)); };
  page.on('console', (m) => push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => push(`[pageerror] ${String(e)}`));

  await page.addInitScript(() => {
    (window as unknown as { __bcLog: Array<[number, string]> }).__bcLog = [];
    try {
      const bc = new BroadcastChannel('sovd-wire');
      bc.onmessage = (ev) => {
        const w = window as unknown as { __bcLog: Array<[number, string]> };
        if (typeof ev.data === 'string' && w.__bcLog.length < 120) w.__bcLog.push([Math.round(performance.now()), ev.data]);
      };
    } catch {
      /* BC unavailable */
    }
  });

  await page.goto('/index.html');
  await page.waitForTimeout(4000);
  const pill = await page.evaluate(() => document.querySelector('[data-status-pill]')?.textContent ?? 'n/a');

  const info: Record<string, unknown> = { pill };
  info.bcEarly = await page.evaluate(() =>
    JSON.stringify((window as unknown as { __bcLog?: Array<[number, string]> }).__bcLog ?? []),
  );
  info.probes = await page.evaluate(async () => {
    const proto = (await import(new URL('./dist/core/protocol.js', location.href).href)) as unknown as {
      BinWriter: new (n: number) => { u32(n: number): unknown; finish(): Uint8Array };
      beginFrame(w: unknown, tag: number, seq: number): { u32(n: number): unknown };
      Tag: { Hello: number };
    };
    const mkHello = (): Uint8Array => {
      const w = new proto.BinWriter(16);
      proto.beginFrame(w, proto.Tag.Hello, 1).u32(0);
      return w.finish();
    };
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const out: Record<string, unknown> = {};

    // 1) BroadcastChannel: collect crumbs, then ping
    const bcMsgs: Array<[number, string]> = [];
    let bc: { postMessage: (s: string) => void; close: () => void } | null = null;
    try {
      bc = new BroadcastChannel('sovd-wire');
      bc.onmessage = (ev) => { if (typeof ev.data === 'string' && bcMsgs.length < 60) bcMsgs.push([Math.round(performance.now()), ev.data]); };
    } catch (e) {
      out.bcError = String(e).slice(0, 150);
    }
    await sleep(700);
    try { bc?.postMessage('ping'); } catch { /* ignore */ }
    await sleep(700);
    out.bcMsgs = bcMsgs;

    // 2) join the APP's instance (same name) with a fresh port
    const join = await new Promise<string>((resolve) => {
      let reply = 'none';
      try {
        const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'sovereign-state' });
        const p = sw.port;
        p.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer } | string; if (typeof d === 'string') reply = reply === 'none' ? d : reply; else if (d && d.bin) reply = 'reply len=' + d.bin.byteLength; };
        p.start();
        const f = mkHello();
        p.postMessage({ bin: f.buffer }, [f.buffer]);
      } catch (e) {
        resolve('threw: ' + String(e).slice(0, 150));
        return;
      }
      setTimeout(() => resolve(reply), 1500);
    });
    out.appInstanceJoin = join;

    // 3) control: different instance name
    const ctrl = await new Promise<string>((resolve) => {
      let reply = 'none';
      try {
        const sw = new SharedWorker('./dist/worker/state-worker.js', { type: 'module', name: 'ctrl-' + Math.random() });
        const p = sw.port;
        p.onmessage = (ev) => { const d = ev.data as { bin?: ArrayBuffer } | string; if (typeof d === 'string') reply = reply === 'none' ? d : reply; else if (d && d.bin) reply = 'reply len=' + d.bin.byteLength; };
        p.start();
        const f = mkHello();
        p.postMessage({ bin: f.buffer }, [f.buffer]);
      } catch (e) {
        resolve('threw: ' + String(e).slice(0, 150));
        return;
      }
      setTimeout(() => resolve(reply), 1500);
    });
    out.ctrlInstance = ctrl;

    try { bc?.close(); } catch { /* ignore */ }
    return out;
  });

  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
