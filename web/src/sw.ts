/**
 * sw.ts — hand-written service worker: offline-first shell.
 *
 * Strategy: cache-first with background revalidation for same-origin GETs.
 * First paint after the very first visit never touches the network, so the
 * app is immune to slow/flaky connections (local-first mandate). No
 * workbox, no framework — 40 lines of platform API.
 *
 * @complexity fetch handler: O(1) cache lookups; network is async tail work.
 */

const sw = self as unknown as {
  addEventListener(type: string, handler: (ev: any) => void): void;
  skipWaiting(): Promise<void>;
};

const CACHE = 'sovereign-shell-v1';

sw.addEventListener('install', (ev: any) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(['./', './index.html']);
    await sw.skipWaiting();
  })());
});

sw.addEventListener('activate', (ev: any) => {
  ev.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await (self as any).clients.claim();
  })());
});

sw.addEventListener('fetch', (ev: any) => {
  const req: Request = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const refresh = fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => undefined);
    if (hit !== undefined) {
      void refresh; // stale-while-revalidate: serve now, update in background
      return hit;
    }
    const fresh = await refresh;
    if (fresh === undefined) return Response.error();
    return fresh;
  })());
});

export {};
