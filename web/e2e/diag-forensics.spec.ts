// TEMPORARY diagnostic — removed once E2E is green. v14: verify the
// classic-context launcher + boot-gated handshake reach 'ready'.
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

test('diag: boot forensics', async ({ page }) => {
  const logs: string[] = [];
  const push = (s: string): void => { if (logs.length < 120) logs.push(s.slice(0, 220)); };
  page.on('console', (m) => push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => push(`[pageerror] ${String(e)}`));

  await page.addInitScript(() => {
    const w = window as unknown as { __bcLog: Array<[number, string]>; __bc: { postMessage: (s: string) => void } | null };
    w.__bcLog = [];
    w.__bc = null;
    try {
      const bc = new BroadcastChannel('sovd-wire');
      bc.onmessage = (ev) => {
        if (typeof ev.data === 'string' && w.__bcLog.length < 200) w.__bcLog.push([Math.round(performance.now()), ev.data]);
      };
      w.__bc = bc; // hold a reference so it cannot be GC'd
    } catch {
      /* BC unavailable */
    }
  });

  await page.goto('/index.html');
  const timeline: Array<[number, string, string]> = [];
  let last = 0;
  for (const ms of [800, 2000, 4500, 8000]) {
    await page.waitForTimeout(ms - last);
    last = ms;
    timeline.push(
      await page.evaluate(() => {
        const pill = document.querySelector('[data-status-pill]');
        return [
          (pill?.textContent ?? 'n/a').trim(),
          pill?.getAttribute('data-phase') ?? 'n/a',
          document.querySelector('[data-worker-mode]')?.textContent ?? 'n/a',
        ] as [string, string, string];
      }).then((r) => [ms, r[0], `${r[1]}|${r[2]}`]),
    );
  }

  const bcLog = await page.evaluate(
    () => JSON.stringify((window as unknown as { __bcLog: Array<[number, string]> }).__bcLog ?? []),
  );

  const info: Record<string, unknown> = { pillTimeline: JSON.stringify(timeline), bcLog };
  const b64 = Buffer.from(JSON.stringify({ info, logs })).toString('base64');
  writeFileSync('/tmp/e2e-forensics.txt', `DIAG-B64 ${b64}`);
  console.log(`DIAG-B64 ${b64}`);
});
