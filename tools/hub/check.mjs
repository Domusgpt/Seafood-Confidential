#!/usr/bin/env node
// Post-build checks for the hub: every internal link and asset resolves, each page has one h1, a title,
// lang, a skip-link target and a CSP; no external scripts, styles or fonts are loaded.
//   pnpm hub:check [--dir _site]
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../lib/repo.mjs';

export async function checkSite(dir) {
  const errors = [];
  const pages = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.html')) pages.push(p);
    }
  }
  await walk(dir);
  const exists = async (p) => {
    try {
      const s = await stat(p);
      return s.isDirectory() ? exists(path.join(p, 'index.html')) : true;
    } catch {
      return false;
    }
  };
  // The previews index lives outside a branch build (gh-pages root); that one link may leave the site.
  let allowedOutside = null;
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'build.json'), 'utf8'));
    if (manifest.previewsIndex) allowedOutside = path.resolve(dir, manifest.previewsIndex);
  } catch {
    /* no manifest: no exemption */
  }
  let links = 0;
  for (const file of pages) {
    const rel = path.relative(dir, file);
    const html = await readFile(file, 'utf8');
    const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
    if (h1 !== 1) errors.push(`${rel}: expected exactly one <h1>, found ${h1}`);
    if (!/<html lang="en">/.test(html)) errors.push(`${rel}: missing lang`);
    if (!/<title>[^<]{3,}<\/title>/.test(html)) errors.push(`${rel}: missing title`);
    if (!/Content-Security-Policy/.test(html)) errors.push(`${rel}: missing CSP`);
    if (/href="#content"/.test(html) && !/id="content"/.test(html))
      errors.push(`${rel}: skip link target missing`);
    for (const m of html.matchAll(/<(script|link)\b[^>]*(?:src|href)="(https?:)?\/\/[^"]*"/g))
      if (m[1] === 'script' || /rel="(stylesheet|preload)"/.test(m[0]))
        errors.push(`${rel}: external ${m[1]} ${m[0].slice(0, 80)}`);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const url = m[1];
      if (/^(https?:|mailto:|data:)/.test(url)) continue;
      links += 1;
      const [target, hash] = url.split('#');
      if (!target) {
        if (hash && !ids.has(decodeURIComponent(hash)))
          errors.push(`${rel}: missing in-page anchor #${hash}`);
        continue;
      }
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
      if (resolved === allowedOutside) continue;
      if (!resolved.startsWith(path.resolve(dir))) errors.push(`${rel}: link escapes the site → ${url}`);
      else if (!(await exists(resolved))) errors.push(`${rel}: broken link → ${url}`);
    }
    for (const m of html.matchAll(/\ssrcset="([^"]+)"/g))
      for (const part of m[1].split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (!(await exists(path.resolve(path.dirname(file), url))))
          errors.push(`${rel}: broken srcset → ${url}`);
      }
  }
  return { pages: pages.length, links, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--dir');
  const dir = path.resolve(REPO_ROOT, i === -1 ? '_site' : process.argv[i + 1]);
  const { pages, links, errors } = await checkSite(dir);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`\nhub check failed: ${errors.length} problem(s) across ${pages} pages`);
    process.exitCode = 1;
  } else
    console.log(
      `✓ hub check: ${pages} pages, ${links} internal links and assets resolve; structure and CSP present`,
    );
}
