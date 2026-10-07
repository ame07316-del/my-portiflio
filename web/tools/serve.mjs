#!/usr/bin/env node
/**
 * tools/serve.mjs — zero-dependency static server for the Edge UI.
 *
 * - Serves the web/ root over 0.0.0.0 (preview-proxy friendly).
 * - Sends COOP/COEP headers so `SharedArrayBuffer` (and thus the zero-copy
 *   bench + lock-free telemetry ring) is enabled in the browser.
 * - Correct MIME for .js/.mjs/.wasm (module + streaming-instantiation safe).
 * - Path traversal is impossible: resolved paths must stay under root.
 *
 * @complexity per request: O(file size) streaming, O(1) routing.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.map', 'application/json'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    // Root-level service worker alias (scope must cover the whole shell).
    if (p === '/sw.js') p = '/dist/sw.js';

    const abs = normalize(join(ROOT, p));
    if (abs !== ROOT && !abs.startsWith(ROOT + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    let file = abs;
    const st = await stat(file).catch(() => null);
    if (st !== null && st.isDirectory()) file = join(file, 'index.html');

    const body = await readFile(file).catch(() => null);
    if (body === null) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }

    const type = MIME.get(extname(file)) ?? 'application/octet-stream';
    const isHtml = type.startsWith('text/html');
    const isSw = file.endsWith('sw.js');
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.byteLength,
      // Cross-origin isolation → SharedArrayBuffer is available.
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cache-control': isHtml || isSw ? 'no-store' : 'public, max-age=1800',
    });
    res.end(body);
  } catch {
    try {
      res.writeHead(500).end('internal error');
    } catch {
      /* socket already gone */
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] sovereign edge ui → http://${HOST}:${PORT} (COOP/COEP enabled)`);
});
