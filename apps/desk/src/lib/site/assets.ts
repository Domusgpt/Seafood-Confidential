import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SiteFile } from './build';

// Static assets for the public site (styles, fonts, the bathymetry motif), prepared at build time
// by scripts/build-site-assets.mjs into site-static/assets.

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

let cached: { dir: string; files: SiteFile[] } | undefined;

export async function loadSiteAssets(dir: string): Promise<SiteFile[]> {
  if (cached?.dir === dir) return cached.files;
  const root = path.join(dir, 'assets');
  const files: SiteFile[] = [];
  const walk = async (rel: string) => {
    for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) await walk(child);
      else {
        const type = TYPES[path.extname(entry.name)];
        if (!type) continue;
        files.push({
          path: `/assets/${child}`,
          body: await readFile(path.join(root, child)),
          contentType: type,
        });
      }
    }
  };
  try {
    await walk('');
  } catch (error) {
    throw new Error(
      `Site assets are missing in ${root} (${(error as Error).message}). Run \`pnpm --filter @sc/desk site:assets\`.`,
    );
  }
  cached = { dir, files };
  return files;
}
