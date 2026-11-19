#!/usr/bin/env node
// Maintains the gh-pages root: previews.json, an index of branch previews, and /latest/ redirect.
// Used by .github/workflows/pages.yml. No third-party dependencies (runs before or without install).
//
//   node tools/hub/previews-index.mjs --site <gh-pages dir> --branch <name> --slug <slug> --commit <sha>
//        [--repo https://github.com/owner/repo] [--keep 20]
//   node tools/hub/previews-index.mjs --site <dir> --slug <slug> --remove
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export async function updateIndex({
  site,
  branch,
  slug,
  commit,
  repo,
  keep = 20,
  remove = false,
  now = new Date(),
}) {
  if (!site || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug))
    throw new Error('--site and a valid --slug are required');
  const manifestPath = path.join(site, 'previews.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : { previews: [] };
  let previews = manifest.previews.filter((p) => p.slug !== slug);
  if (remove) {
    await rm(path.join(site, 'branches', slug), { recursive: true, force: true });
  } else {
    let build = {};
    const buildPath = path.join(site, 'branches', slug, 'build.json');
    if (existsSync(buildPath)) build = JSON.parse(await readFile(buildPath, 'utf8'));
    previews.push({
      slug,
      branch,
      commit,
      updatedAt: now.toISOString(),
      version: build.version ?? null,
      tickets: build.tickets ?? null,
      acceptance: build.acceptance ?? null,
    });
  }
  previews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const kept = [];
  for (const p of previews) {
    if (p.branch === 'main' || kept.filter((k) => k.branch !== 'main').length < keep) kept.push(p);
    else await rm(path.join(site, 'branches', p.slug), { recursive: true, force: true });
  }
  previews = kept;
  await writeFile(
    manifestPath,
    `${JSON.stringify({ updatedAt: now.toISOString(), repo, previews }, null, 2)}\n`,
  );
  await writeFile(path.join(site, 'index.html'), renderIndex(previews, repo, now));
  await mkdir(path.join(site, 'latest'), { recursive: true });
  const latest = previews[0] ? `../branches/${previews[0].slug}/` : '../';
  await writeFile(
    path.join(site, 'latest', 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${esc(latest)}"><title>Latest preview</title></head><body><p><a href="${esc(latest)}">Open the latest branch preview</a></p></body></html>\n`,
  );
  await writeFile(path.join(site, '.nojekyll'), '');
  return previews;
}

function fmt(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

export function renderIndex(previews, repo, now) {
  const rows = previews
    .map(
      (p, i) => `<li class="preview${i === 0 ? ' is-latest' : ''}">
      <div class="head"><a class="branch" href="branches/${esc(p.slug)}/">${esc(p.branch)}</a>${i === 0 ? '<span class="tag">Latest</span>' : ''}${p.branch === 'main' ? '<span class="tag">Default branch</span>' : ''}</div>
      <div class="meta">Updated ${esc(fmt(p.updatedAt))}${p.version ? ` · v${esc(p.version)}` : ''} · commit ${repo ? `<a href="${esc(repo)}/commit/${esc(p.commit)}"><code>${esc(String(p.commit).slice(0, 7))}</code></a>` : `<code>${esc(String(p.commit).slice(0, 7))}</code>`}${repo ? ` · <a href="${esc(repo)}/tree/${esc(p.branch)}">source</a>` : ''}</div>
    </li>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Branch previews · Seafood Confidential project hub</title>
<style>
:root{--paper:#F3EFE5;--surface:#FBF9F4;--ink:#102B3A;--ink2:#3E5563;--rule:rgba(16,43,58,.16);--accent:#B64D35;--link:#2C5A70;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0B202C;--surface:#102B3A;--ink:#F3EFE5;--ink2:#C5D0CC;--rule:rgba(243,239,229,.16);--accent:#E08A72;--link:#8DB8CC;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
header{background:#102B3A;color:#F3EFE5;padding:28px 16px 22px}header div,main{max-width:900px;margin:0 auto}
h1{font:800 clamp(1.8rem,6vw,2.8rem)/1 Georgia,"Times New Roman",serif;text-transform:uppercase;margin:0 0 10px;letter-spacing:.01em}
header p{margin:0;font-style:italic;font-family:Georgia,serif}header hr{border:0;height:2px;background:#B64D35;width:min(100%,420px);margin:10px 0}
main{padding:24px 16px 48px}h2{font:700 1.4rem Georgia,serif;margin:0 0 12px}a{color:var(--link)}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}.preview{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:12px 16px}
.preview.is-latest{border-left:4px solid var(--accent)}.head{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.branch{font-weight:700;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.95rem;overflow-wrap:anywhere}
.tag{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:1px solid var(--rule);border-radius:999px;padding:1px 8px;color:var(--ink2)}
.meta{color:var(--ink2);font-size:.9rem;margin-top:4px}code{font-size:.85rem}footer{color:var(--ink2);font-size:.85rem;margin-top:24px}
</style>
</head>
<body>
<header><div><h1>Seafood Confidential</h1><hr><p>Project hub · branch previews</p></div></header>
<main>
<h2>Previews (${previews.length})</h2>
<p>Each pushed branch publishes its own hub. Work continues from the latest open pull request, so the newest preview is usually the current one. <a href="latest/">Open the latest</a>.</p>
<ol>${rows || '<li class="preview">No previews yet.</li>'}</ol>
<footer><p>Updated ${esc(fmt(now.toISOString()))}. Planning hubs only; the publication and the operations desk run as a preview, not launched. © 2026 the Seafood Confidential founders.</p></footer>
</main>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateIndex({
    site: arg('site'),
    branch: arg('branch'),
    slug: arg('slug'),
    commit: arg('commit', ''),
    repo: arg('repo'),
    keep: Number(arg('keep', 20)),
    remove: process.argv.includes('--remove'),
  })
    .then((p) => console.log(`previews index updated: ${p.length} preview(s)`))
    .catch((err) => {
      console.error(`previews-index: ${err.message}`);
      process.exitCode = 1;
    });
}
