import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepo } from '../lib/repo.mjs';
import { contrastReport, tokensCss } from './tokens.mjs';
import { parseCosts } from './pages.mjs';
import { renderMarkdown, countH1 } from './docs.mjs';
import { updateIndex } from './previews-index.mjs';
import { renderStatusBlock } from '../devtrack/status.mjs';
import { loadProject } from '../lib/project.mjs';

const repo = createRepo();

test('every declared brand contrast pair passes, and a weakened pair would fail', async () => {
  const tokens = await repo.readJson('brand/tokens.json');
  const report = contrastReport(tokens);
  assert.ok(report.length >= 20);
  assert.deepEqual(
    report.filter((p) => !p.pass).map((p) => `${p.theme}.${p.text}`),
    [],
  );
  // Raw brand rust as small text on salt is exactly the failure the derived token exists to prevent.
  const weakened = structuredClone(tokens);
  weakened.theme.light['accent-text'] = '{color.brand.rust}';
  weakened.contrast.pairs.push({ theme: 'light', text: 'accent-text', on: 'paper', use: 'test', min: 4.5 });
  assert.ok(contrastReport(weakened).some((p) => !p.pass && p.text === 'accent-text'));
});

test('token CSS declares light, dark (system and explicit) and masthead roles', async () => {
  const css = tokensCss(await repo.readJson('brand/tokens.json'));
  assert.match(css, /--paper: #F3EFE5;/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /:root\[data-theme='dark'\]/);
  assert.match(css, /--masthead-line: #7FA59A;/);
});

test('cost table reconciles with the workbook totals and rejects drift', async () => {
  const md = await repo.readText('docs/LAUNCH_PACKET.md');
  const verification = await repo.readJson('planning/WORKBOOK_VERIFICATION.json');
  const costs = parseCosts(md, verification);
  assert.equal(costs.low, 119);
  assert.equal(costs.high, 169);
  assert.equal(costs.items[0].label, 'AI usage allowance');
  assert.equal(costs.optional.length, 2);
  assert.throws(
    () => parseCosts(md.replace('| Supabase Pro | $25 |', '| Supabase Pro | $35 |'), verification),
    /do not match/,
  );
});

test('markdown rendering rewrites links, keeps anchors and makes tables keyboard-scrollable', () => {
  const bySrc = new Map([['docs/A.md', { slug: 'a' }]]);
  const html = renderMarkdown(
    '# T\n\n[a](A.md#x) [p](../packet/f.pdf) [w](https://e.x)\n\n| h |\n|---|\n| c |\n',
    {
      src: 'docs/B.md',
      bySrc,
      githubBlob: (p) => `https://github.com/o/r/blob/b/${p}`,
      rel: '../',
    },
  );
  assert.match(html, /href="a\.html#x"/);
  assert.match(html, /href="https:\/\/github\.com\/o\/r\/blob\/b\/packet\/f\.pdf"/);
  assert.match(html, /<h1 id="t">T<\/h1>/);
  assert.match(html, /<div class="table-wrap" tabindex="0" role="region"/);
  assert.equal(countH1('# a\n```\n# not\n```\n# b\n'), 2);
});

test('previews index keeps main, prunes the oldest branches and points latest at the newest', async () => {
  const site = await mkdtemp(path.join(os.tmpdir(), 'sc-pages-'));
  try {
    const t0 = Date.parse('2026-11-18T12:00:00Z');
    for (const [i, b] of ['main', 'feat/a', 'feat/b', 'feat/c'].entries()) {
      const slug = b.replace('/', '-');
      await mkdir(path.join(site, 'branches', slug), { recursive: true });
      await writeFile(path.join(site, 'branches', slug, 'build.json'), JSON.stringify({ version: '0.1.0' }));
      await updateIndex({ site, branch: b, slug, commit: `c${i}`, keep: 2, now: new Date(t0 + i * 60000) });
    }
    const manifest = JSON.parse(await readFile(path.join(site, 'previews.json'), 'utf8'));
    assert.deepEqual(
      manifest.previews.map((p) => p.branch),
      ['feat/c', 'feat/b', 'main'],
    );
    assert.equal(existsSync(path.join(site, 'branches', 'feat-a')), false);
    assert.match(
      await readFile(path.join(site, 'latest', 'index.html'), 'utf8'),
      /url=\.\.\/branches\/feat-c\//,
    );
    await updateIndex({ site, slug: 'feat-c', remove: true, now: new Date(t0 + 600000) });
    assert.equal(existsSync(path.join(site, 'branches', 'feat-c')), false);
    await assert.rejects(updateIndex({ site, slug: '../escape', branch: 'x' }), /valid --slug/);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});

test('implementation status block is deterministic', async () => {
  const project = await loadProject(repo);
  const { workstreams } = await repo.readJson('devtrack/workstreams.json');
  assert.equal(renderStatusBlock(project, workstreams), renderStatusBlock(project, workstreams));
  assert.doesNotMatch(renderStatusBlock(project, workstreams), /\bundefined\b/);
});
