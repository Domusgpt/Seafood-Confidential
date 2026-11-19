#!/usr/bin/env node
// Image delivery audit (v0.7.2). For every photograph on a page it compares the rendition the
// browser downloaded with the right one: the smallest rendition covering the width the picture is
// drawn at, times the density the site serves. That density is the screen's own up to 2.5x; denser
// screens are served at two-thirds of theirs, about 2x (imageSizes in src/lib/site/build.ts).
// Cold cache, every lazy image loaded, on a desktop, a 2x laptop, a tablet and two phones.
//
//   pnpm --filter @sc/desk audit:images https://seafood-confidential-preview.web.app [path ...]
//
// With no paths it audits the home page, the first story and the first section page it links to.
// Exits 1 if any image is larger or smaller than the right rendition.
import { chromium, devices } from '@playwright/test';

const [site, ...given] = process.argv.slice(2);
if (!site) {
  console.error('usage: audit-images.mjs <site-url> [path ...]');
  process.exit(2);
}
const base = site.replace(/\/+$/, '');
const PROFILES = [
  ['desktop 1x', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  ['laptop 2x', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  ['iPad Mini 2x', devices['iPad Mini']],
  ['Pixel 7 2.6x', devices['Pixel 7']],
  ['iPhone 13 3x', devices['iPhone 13']],
];
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const browser = await chromium.launch();
let paths = given;
if (!paths.length) {
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  const links = await page.$$eval('a[href]', (as) => as.map((a) => new URL(a.href).pathname));
  paths = [
    '/',
    links.find((p) => p.startsWith('/stories/')),
    links.find((p) => p.startsWith('/sections/')),
  ].filter(Boolean);
  await page.close();
}

let downloaded = 0;
let rightSized = 0;
let wrong = 0;
for (const [profile, options] of PROFILES) {
  for (const path of paths) {
    const context = await browser.newContext({ ...options });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    await page.waitForLoadState('networkidle');
    const rows = await page.evaluate(async () => {
      const bytes = async (url) => {
        const entry = performance.getEntriesByName(url)[0];
        if (entry?.encodedBodySize) return entry.encodedBodySize;
        const head = await fetch(url, { method: 'HEAD' });
        return Number(head.headers.get('content-length')) || 0;
      };
      const out = [];
      for (const img of document.querySelectorAll('picture img')) {
        if (!img.currentSrc) continue;
        const format = img.currentSrc.split('.').pop();
        const source = img.parentElement.querySelector(`source[type="image/${format}"]`);
        const candidates = (source?.getAttribute('srcset') ?? '')
          .split(',')
          .map((c) => c.trim().split(/\s+/))
          .map(([u, w]) => ({ url: new URL(u, location.href).href, width: Number.parseInt(w) }));
        if (!candidates.length) continue;
        // Frames crop with object-fit: cover, so the picture is drawn at least as wide as this.
        const drawn = Math.max(img.offsetWidth, img.offsetHeight * (img.naturalWidth / img.naturalHeight));
        const density = devicePixelRatio >= 2.5 ? devicePixelRatio * 0.67 : devicePixelRatio;
        const needed = drawn * density;
        const chosen = candidates.find((c) => c.url === img.currentSrc);
        const right = candidates.find((c) => c.width >= needed) ?? candidates[candidates.length - 1];
        out.push({
          needed: Math.round(needed),
          chosen: chosen?.width,
          right: right.width,
          format,
          bytes: await bytes(img.currentSrc),
          rightBytes: await bytes(right.url),
        });
      }
      return out;
    });
    const got = rows.reduce((n, r) => n + r.bytes, 0);
    const right = rows.reduce((n, r) => n + r.rightBytes, 0);
    downloaded += got;
    rightSized += right;
    wrong += rows.filter((r) => r.chosen !== r.right).length;
    const detail = rows
      .map(
        (r) =>
          `${r.needed}→${r.chosen}${r.chosen === r.right ? '' : ` (${r.chosen > r.right ? 'over' : 'under'}: want ${r.right})`}`,
      )
      .join(' ');
    console.log(
      `${profile.padEnd(13)} ${path.padEnd(40).slice(0, 40)} ${kb(got).padStart(7)} (right-sized ${kb(right)})  ${detail}`,
    );
    await context.close();
  }
}
await browser.close();
console.log(
  `\nAll pages and screens: ${kb(downloaded)} of images, right-sized ${kb(rightSized)}; ${wrong} image(s) not right-sized`,
);
process.exit(wrong ? 1 : 0);
