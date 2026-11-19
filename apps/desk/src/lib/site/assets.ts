import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SiteFile, SitePage } from './build';

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

/**
 * The standing pages (About, How we work): Markdown files with a small front matter block, prepared
 * from site-src/pages into site-static/pages. The slug is the file name.
 *
 *   ---
 *   title: About Seafood Confidential
 *   description: One sentence for search results and the page header.
 *   order: 1
 *   ---
 *   Markdown body
 */
export function parseSitePage(fileName: string, source: string): SitePage {
  const slug = fileName.replace(/\.md$/, '');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, '\n'));
  if (!match) throw new Error(`site page ${fileName} has no front matter`);
  const meta = Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^([a-z]+):\s*(.+)$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2].trim()]),
  );
  const order = Number(meta.order ?? '100');
  if (!meta.title || !meta.description || !Number.isFinite(order))
    throw new Error(`site page ${fileName} needs a title, a description and a numeric order`);
  const bodyMarkdown = match[2].trim();
  if (!bodyMarkdown) throw new Error(`site page ${fileName} is empty`);
  return { slug, title: meta.title, description: meta.description, order, bodyMarkdown };
}

let cachedPages: { dir: string; pages: SitePage[] } | undefined;

export async function loadSitePages(dir: string): Promise<SitePage[]> {
  if (cachedPages?.dir === dir) return cachedPages.pages;
  const root = path.join(dir, 'pages');
  let names: string[];
  try {
    names = (await readdir(root)).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return []; // no standing pages prepared
  }
  const pages = await Promise.all(
    names.map(async (n) => parseSitePage(n, await readFile(path.join(root, n), 'utf8'))),
  );
  cachedPages = { dir, pages };
  return pages;
}
