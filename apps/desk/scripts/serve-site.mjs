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
  '.avif': 'image/avif',
  '.webp': 'image/webp',
};
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action https://app.kit.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

/** The file a URL path names inside the site directory, null when there is none, or 'bad' for a malformed path. */
async function resolveFile(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return 'bad';
  }
  if (clean.includes('\0')) return 'bad';
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

/** A same-site path for a directory's index file, built from the file system, never from the request. */
function directoryUrl(indexFile) {
  const rel = path.relative(dir, path.dirname(indexFile));
  return rel ? `/${rel.split(path.sep).map(encodeURIComponent).join('/')}/` : '/';
}

async function handle(req, res) {
  if (req.url === '/__health') return res.writeHead(200, HEADERS).end('ok');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, HEADERS).end();
  const file = await resolveFile(req.url ?? '/');
  if (file === 'bad') return res.writeHead(400, HEADERS).end('Bad request');
  // Directory URLs without a trailing slash redirect, like the static host.
  const urlPath = (req.url ?? '/').split('?')[0];
  if (file && path.basename(file) === 'index.html' && !urlPath.endsWith('/') && !urlPath.endsWith('.html')) {
    return res.writeHead(301, { ...HEADERS, Location: directoryUrl(file) }).end();
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
}

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(`serve-site: ${error.message}`);
      if (!res.headersSent) res.writeHead(500, HEADERS);
      res.end();
    });
  })
  .listen(port, '127.0.0.1', () =>
    console.log(`public site (local) on http://127.0.0.1:${port} from ${dir}`),
  );
