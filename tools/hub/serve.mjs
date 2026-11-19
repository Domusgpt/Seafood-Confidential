#!/usr/bin/env node
// Minimal static server for previewing the hub locally.  pnpm hub:serve [--dir _site] [--port 4173]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../lib/repo.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function startServer(dir, port = 4173) {
  const root = path.resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { code: 403 });
      if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(err.code === 403 ? 403 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(err.code === 403 ? 'Forbidden' : 'Not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i === -1 ? d : process.argv[i + 1];
  };
  const dir = path.resolve(REPO_ROOT, flag('dir', '_site'));
  const port = Number(flag('port', 4173));
  await startServer(dir, port);
  console.log(`serving ${dir} at http://127.0.0.1:${port}/`);
}
