#!/usr/bin/env node
// Serve the locally built public site (SITE_OUTPUT_DIR) with the same security headers the static
// host sends. For development and the end-to-end tests only.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const dir = path.resolve(process.env.SITE_OUTPUT_DIR ?? '.site-output');
const port = Number(process.env.SITE_PORT ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action https://app.kit.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.resolve(dir, `.${clean}`);
  // Inside the site directory only (a bare prefix check would also match a sibling such as .site-output.old-x).
  if (target !== dir && !target.startsWith(dir + path.sep)) return null;
  for (const candidate of [target, path.join(target, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

http
  .createServer(async (req, res) => {
    if (req.url === '/__health') return res.writeHead(200, HEADERS).end('ok');
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, HEADERS).end();
    // Directory URLs without a trailing slash redirect, like the static host.
    const file = await resolveFile(req.url ?? '/');
    if (
      file &&
      file.endsWith('index.html') &&
      !(req.url ?? '/').split('?')[0].endsWith('/') &&
      !(req.url ?? '').endsWith('.html')
    ) {
      return res.writeHead(301, { ...HEADERS, Location: `${req.url}/` }).end();
    }
    if (!file) {
      const notFound = path.join(dir, '404.html');
      try {
        await stat(notFound);
        res.writeHead(404, { ...HEADERS, 'Content-Type': TYPES['.html'] });
        return createReadStream(notFound).pipe(res);
      } catch {
        return res.writeHead(404, HEADERS).end('Not found');
      }
    }
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () =>
    console.log(`public site (local) on http://127.0.0.1:${port} from ${dir}`),
  );
