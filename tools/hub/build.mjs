#!/usr/bin/env node
// Builds the static project hub into _site/ (or --out <dir>).
//   pnpm hub:build [--out _site] [--previews-index ../../index.html] [--branch name] [--commit sha]
// Hard gates: brand contrast pairs must pass; the cost table must reconcile with the workbook totals.
import { mkdir, rm, writeFile, copyFile, readFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { createRepo, gitInfo } from '../lib/repo.mjs';
import { loadProject } from '../lib/project.mjs';
import { isoInZone, displayInZone } from '../lib/time.mjs';
import { page, favicon } from './layout.mjs';
import { tokensCss, contrastReport } from './tokens.mjs';
import { buildDocIndex, renderMarkdown, countH1, SITE_COPIED } from './docs.mjs';
import * as P from './pages.mjs';
import { branchSlug } from '../lib/slug.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

export async function buildHub({ outDir, previewsIndex, branch, commit } = {}) {
  const repo = createRepo();
  const out = path.resolve(repo.root, outDir ?? '_site');
  const git = gitInfo(repo.root);
  const build = {
    version: (await repo.readJson('package.json')).version,
    branch: branch ?? git.branch,
    commit: commit ?? git.commit,
    builtAt: isoInZone(),
    previewsIndex,
  };
  build.shortCommit = build.commit ? build.commit.slice(0, 7) : 'uncommitted';
  build.builtDisplay = displayInZone(build.builtAt);
  build.commitUrl = build.commit ? `${git.remote}/commit/${build.commit}` : git.remote;
  build.treeUrl = `${git.remote}/tree/${encodeURIComponent(build.branch).replace(/%2F/g, '/')}`;
  const githubBlob = (p) => `${git.remote}/blob/${build.branch}/${p}`;

  const project = await loadProject(repo);
  const tokens = await repo.readJson('brand/tokens.json');

  // Gate 1: computed contrast for every declared token pair.
  const failing = contrastReport(tokens).filter((p) => !p.pass);
  if (failing.length)
    throw new Error(
      `contrast gate failed: ${failing.map((p) => `${p.theme}.${p.text} on ${p.on} = ${p.ratio.toFixed(2)} < ${p.min}`).join('; ')}`,
    );
  // Gate 2: cost table reconciles with the workbook verification record.
  const launchPacket = await repo.readText('docs/LAUNCH_PACKET.md');
  const costs = P.parseCosts(launchPacket, project.verification);

  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'assets', 'fonts'), { recursive: true });
  await mkdir(path.join(out, 'docs'), { recursive: true });
  await mkdir(path.join(out, 'devlog'), { recursive: true });

  // Assets
  const fontFiles = {
    '@fontsource-variable/fraunces': ['fraunces-latin-full-normal.woff2', 'fraunces-latin-full-italic.woff2'],
    '@fontsource-variable/source-sans-3': [
      'source-sans-3-latin-wght-normal.woff2',
      'source-sans-3-latin-wght-italic.woff2',
    ],
  };
  for (const [pkg, files] of Object.entries(fontFiles)) {
    for (const f of files)
      await copyFile(repo.abs(`node_modules/${pkg}/files/${f}`), path.join(out, 'assets/fonts', f));
    await copyFile(
      repo.abs(`node_modules/${pkg}/LICENSE`),
      path.join(out, 'assets/fonts', `${pkg.split('/')[1]}-OFL.txt`),
    );
  }
  await writeFile(path.join(out, 'assets/tokens.css'), tokensCss(tokens));
  await copyFile(repo.abs('tools/hub/assets/hub.css'), path.join(out, 'assets/hub.css'));
  await copyFile(repo.abs('tools/hub/assets/hub.js'), path.join(out, 'assets/hub.js'));
  const gl = (await readFile(repo.abs('tools/hub/assets/waterfront-gl.js'), 'utf8'))
    .replace(
      '__BATHYMETRY_VERT__',
      JSON.stringify(await repo.readText('tools/hub/assets/shaders/bathymetry.vert')),
    )
    .replace(
      '__BATHYMETRY_FRAG__',
      JSON.stringify(await repo.readText('tools/hub/assets/shaders/bathymetry.frag')),
    );
  await writeFile(path.join(out, 'assets/waterfront-gl.js'), gl);
  for (const w of [768, 1536])
    await copyFile(
      repo.abs(`brand/web/brand-concept-${w}.jpg`),
      path.join(out, `assets/brand-concept-${w}.jpg`),
    );
  await writeFile(path.join(out, 'assets/favicon.svg'), favicon);
  for (const prefix of SITE_COPIED)
    if (repo.exists(prefix)) await cp(repo.abs(prefix), path.join(out, prefix), { recursive: true });
  await writeFile(path.join(out, '.nojekyll'), '');

  const devlogSlug = (e) => path.basename(e.file, '.md');
  const write = async (rel, html) => {
    await mkdir(path.dirname(path.join(out, rel)), { recursive: true });
    await writeFile(path.join(out, rel), html);
  };
  const root = { rel: '', githubBlob, devlogSlug, build };
  const sub = { rel: '../', githubBlob, devlogSlug, build };

  const pages = [
    [
      'index.html',
      'Overview',
      'overview',
      'Status, sprint shape and next steps for Seafood Confidential.',
      P.overviewPage(project, costs, root),
    ],
    [
      'backlog.html',
      'Backlog',
      'backlog',
      'Sixteen planned tickets with dependencies, critical path and effort.',
      P.backlogPage(project, root),
    ],
    [
      'acceptance.html',
      'Acceptance',
      'acceptance',
      'Twenty-six acceptance scenarios and their evidence status.',
      P.acceptancePage(project),
    ],
    [
      'decisions.html',
      'Decisions',
      'decisions',
      'Founder decisions and architecture decision records.',
      P.decisionsPage(project, root),
    ],
    [
      'editorial.html',
      'Editorial',
      'editorial',
      'Sections, weekly rhythm and the six-week commissioning plan.',
      P.editorialPage(project, {
        launchPacket,
        playbook: await repo.readText('editorial/EDITORIAL_PLAYBOOK.md'),
      }),
    ],
    [
      'visual-codex.html',
      'Visual codex',
      'codex',
      'Working Waterfront tokens, contrast, type and motif.',
      P.codexPage(tokens, root),
    ],
  ];
  for (const [file, title, key, description, body] of pages)
    await write(file, page({ title, description, rel: '', current: key, body, build }));

  // Docs
  const index = buildDocIndex(project.adrs);
  await write(
    'docs/index.html',
    page({
      title: 'Docs',
      description: 'Repository documentation.',
      rel: '../',
      current: 'docs',
      body: P.docsIndexPage(index, sub),
      build,
    }),
  );
  for (const g of index.groups)
    for (const doc of g.docs) {
      if (!repo.exists(doc.src)) throw new Error(`docs registry: ${doc.src} does not exist`);
      const md = await repo.readText(doc.src);
      const h1s = countH1(md);
      let html = /\.md$/i.test(doc.src)
        ? renderMarkdown(md, {
            src: doc.src,
            bySrc: index.bySrc,
            githubBlob,
            rel: '../',
            demote: h1s === 1 ? 0 : 1,
          })
        : `<pre>${md.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
      // Exactly one h1 per page: documents without one, or with several, get the registry title.
      if (h1s !== 1) html = `<h1>${doc.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1>\n${html}`;
      await write(
        `docs/${doc.slug}.html`,
        page({
          title: doc.title,
          description: `${doc.title} (${doc.src}).`,
          rel: '../',
          current: 'docs',
          body: P.docPage(doc, html, index, sub),
          build,
        }),
      );
    }

  // Dev log
  await write(
    'devlog/index.html',
    page({
      title: 'Dev log',
      description: 'Timestamped dev log and sessions.',
      rel: '../',
      current: 'devlog',
      body: P.devlogIndexPage(project, sub),
      build,
    }),
  );
  await write(
    'devlog/evidence.html',
    page({
      title: 'Evidence log',
      description: 'Append-only evidence records.',
      rel: '../',
      current: 'devlog',
      body: P.evidencePage(project),
      build,
    }),
  );
  for (const e of project.devlog) {
    const html = renderMarkdown(e.body, {
      src: e.file,
      bySrc: index.bySrc,
      githubBlob,
      rel: '../',
      docBase: '../docs/',
    });
    await write(
      `devlog/${devlogSlug(e)}.html`,
      page({
        title: e.title,
        description: `Dev log ${e.id}.`,
        rel: '../',
        current: 'devlog',
        body: P.devlogEntryPage(e, html, project),
        build,
      }),
    );
  }

  const manifest = {
    project: 'Seafood Confidential',
    version: build.version,
    branch: build.branch,
    branchSlug: branchSlug(build.branch),
    commit: build.commit,
    builtAt: build.builtAt,
    previewsIndex: previewsIndex ?? null,
    tickets: project.derived.ticketStatusCounts,
    acceptance: project.derived.acceptanceStatusCounts,
  };
  await writeFile(path.join(out, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { out, manifest, pages: pages.length };
}

export { branchSlug };

if (import.meta.url === `file://${process.argv[1]}`) {
  buildHub({
    outDir: opt('out'),
    previewsIndex: opt('previews-index'),
    branch: opt('branch'),
    commit: opt('commit'),
  })
    .then(({ out, manifest }) =>
      console.log(
        `hub built → ${path.relative(process.cwd(), out) || out} (branch ${manifest.branch} @ ${manifest.commit?.slice(0, 7) || 'uncommitted'})`,
      ),
    )
    .catch((err) => {
      console.error(`hub build failed: ${err.message}`);
      process.exitCode = 1;
    });
}
