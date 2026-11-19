#!/usr/bin/env node
// Visual and accessibility verification of the built hub.
//   pnpm hub:shots [--dir _site] [--out <dir>] [--pages index.html,backlog.html] [--no-images]
// For each page and profile (desktop 2x, iPhone 13, dark, reduced motion) it records: screenshot
// (JPEG), axe WCAG 2.2 A/AA violations, console errors, horizontal overflow and the WebGL masthead state.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { startServer } from './serve.mjs';
import { REPO_ROOT } from '../lib/repo.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const dir = path.resolve(REPO_ROOT, arg('dir', '_site'));
const out = path.resolve(REPO_ROOT, arg('out', 'test-results/hub-shots'));
const images = !process.argv.includes('--no-images');
const pages = arg(
  'pages',
  'index.html,backlog.html,acceptance.html,decisions.html,editorial.html,visual-codex.html,docs/index.html,docs/foundation-planning-brief.html,docs/launch-packet.html,devlog/index.html,devlog/evidence.html',
).split(',');

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { ...devices['iPhone 13'] },
  dark: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' },
  reduced: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' },
};
const profileNames = arg('profiles', 'desktop,mobile,dark,reduced').split(',');

await mkdir(out, { recursive: true });
const server = await startServer(dir, 0);
const base = `http://127.0.0.1:${server.address().port}/`;
// Software GL so the WebGL2 masthead renders in headless CI and containers.
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const report = [];
try {
  for (const name of profileNames) {
    const context = await browser.newContext(PROFILES[name]);
    for (const rel of pages) {
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + rel, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      const facts = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-bathymetry]');
        return {
          title: document.title,
          canvasState: c?.dataset.state ?? 'absent',
          canvasReason: c?.dataset.reason ?? null,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          fontsLoaded: [...document.fonts]
            .filter((f) => f.status === 'loaded')
            .map((f) => `${f.family} ${f.style}`),
        };
      });
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const violations = axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes[0]?.target?.join(' '),
      }));
      let shot = null;
      if (images) {
        shot = `${name}-${rel.replace(/[/.]/g, '_')}.jpg`;
        // JPEG caps at 65,535 px per side: clip very tall pages (long documents on 3x phones).
        const { height, width, dpr } = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          width: document.documentElement.clientWidth,
          dpr: window.devicePixelRatio,
        }));
        const maxCss = Math.floor(16000 / dpr);
        const clip = height > maxCss ? { x: 0, y: 0, width, height: maxCss } : undefined;
        try {
          await page.screenshot({
            path: path.join(out, shot),
            fullPage: true,
            clip,
            type: 'jpeg',
            quality: 80,
          });
        } catch (err) {
          errors.push(`screenshot failed: ${err.message.split('\n')[0]}`);
          shot = null;
        }
      }
      report.push({
        profile: name,
        page: rel,
        ...facts,
        consoleErrors: errors,
        violations,
        screenshot: shot,
      });
      const flag = violations.length || errors.length || facts.overflowX > 0 ? '✗' : '✓';
      console.log(
        `${flag} ${name.padEnd(8)} ${rel.padEnd(40)} canvas=${facts.canvasState.padEnd(8)} axe=${violations.length} console=${errors.length} overflowX=${facts.overflowX}`,
      );
      for (const v of violations)
        console.log(`      axe ${v.impact} ${v.id}: ${v.help} (${v.nodes} node(s), e.g. ${v.sample})`);
      for (const e of errors) console.log(`      console: ${e.slice(0, 160)}`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(
  path.join(out, 'report.json'),
  `${JSON.stringify({ base: 'hub', generatedAt: new Date().toISOString(), report }, null, 2)}\n`,
);
const bad = report.filter((r) => r.violations.length || r.consoleErrors.length || r.overflowX > 0);
console.log(
  `\n${report.length - bad.length}/${report.length} page renders clean → ${path.relative(REPO_ROOT, out)}/report.json`,
);
process.exitCode = bad.length ? 1 : 0;
