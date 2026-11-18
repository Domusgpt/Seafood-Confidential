#!/usr/bin/env node
// Prepare the public site's static assets in site-static/assets (git-ignored): brand tokens compiled
// from brand/tokens.json, the site stylesheet, self-hosted fonts with their licences, the favicon
// and the bathymetry motif with its validated shaders inlined (sc-visual-codex).
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastReport, tokensCss } from '../../../tools/hub/tokens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const desk = path.resolve(here, '..');
const root = path.resolve(desk, '../..');
const out = path.join(desk, 'site-static', 'assets');
const require = createRequire(path.join(desk, 'package.json'));

const tokens = JSON.parse(await readFile(path.join(root, 'brand/tokens.json'), 'utf8'));
const failures = contrastReport(tokens).filter((p) => !p.pass);
if (failures.length) {
  for (const f of failures)
    console.error(`contrast: ${f.theme}.${f.text} on ${f.on} is ${f.ratio.toFixed(2)}:1`);
  process.exit(1);
}

await rm(path.join(desk, 'site-static'), { recursive: true, force: true });
await mkdir(path.join(out, 'fonts'), { recursive: true });

await writeFile(path.join(out, 'tokens.css'), tokensCss(tokens));
await copyFile(path.join(desk, 'site-src/site.css'), path.join(out, 'site.css'));
await copyFile(path.join(desk, 'site-src/favicon.svg'), path.join(out, 'favicon.svg'));

const fonts = {
  '@fontsource-variable/fraunces': ['fraunces-latin-full-normal.woff2', 'fraunces-latin-full-italic.woff2'],
  '@fontsource-variable/source-sans-3': [
    'source-sans-3-latin-wght-normal.woff2',
    'source-sans-3-latin-wght-italic.woff2',
  ],
};
for (const [pkg, files] of Object.entries(fonts)) {
  const dir = path.dirname(require.resolve(`${pkg}/package.json`));
  for (const f of files) await copyFile(path.join(dir, 'files', f), path.join(out, 'fonts', f));
  await copyFile(path.join(dir, 'LICENSE'), path.join(out, 'fonts', `${pkg.split('/')[1]}-OFL.txt`));
}

const shader = (name) => readFile(path.join(root, 'tools/hub/assets/shaders', name), 'utf8');
const gl = (await readFile(path.join(root, 'tools/hub/assets/waterfront-gl.js'), 'utf8'))
  .replace('__BATHYMETRY_VERT__', JSON.stringify(await shader('bathymetry.vert')))
  .replace('__BATHYMETRY_FRAG__', JSON.stringify(await shader('bathymetry.frag')));
await writeFile(path.join(out, 'waterfront-gl.js'), gl);
console.log(`site assets ready in ${path.relative(root, out)}`);
