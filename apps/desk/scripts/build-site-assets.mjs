#!/usr/bin/env node
// Prepare the public site's static assets in site-static/assets (git-ignored): brand tokens compiled
// from brand/tokens.json, the site stylesheet, self-hosted fonts with their licences, the favicon,
// the bathymetry motif with its validated shaders inlined, the contour linework, and the motion
// system with GSAP (sc-visual-codex).
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
// The contour linework (scripts/build-contours.mjs) and the motion system (sc-visual-codex v0.7.0).
for (const f of ['contours.svg', 'motion-boot.js', 'motion.js'])
  await copyFile(path.join(desk, 'site-src', f), path.join(out, f));
// GSAP and ScrollTrigger, self-hosted under the strict CSP. Webflow's Standard "no charge" licence
// (https://gsap.com/standard-license) asks that GSAP's notices stay intact: the files are copied
// byte for byte. THIRD_PARTY_NOTICES.md records the version and terms.
await mkdir(path.join(out, 'vendor'), { recursive: true });
const gsapDist = path.join(path.dirname(require.resolve('gsap/package.json')), 'dist');
for (const f of ['gsap.min.js', 'ScrollTrigger.min.js'])
  await copyFile(path.join(gsapDist, f), path.join(out, 'vendor', f));

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

// Version what the stylesheet loads (fonts, the contour linework) by content. Everything under
// /assets is cached for a year as immutable, so a changed file needs a new address; the pages link
// the stylesheet itself with the site-wide asset version (src/lib/site/build.ts), which changes
// whenever this text does. A reference to a missing file fails the build.
const cssFile = path.join(out, 'site.css');
const css = await readFile(cssFile, 'utf8');
const LOADED = /url\((['"]?)((?:fonts\/)?[\w.-]+\.(?:svg|woff2))\1\)/g;
const versions = new Map();
for (const [, , ref] of css.matchAll(LOADED))
  versions.set(
    ref,
    createHash('sha256')
      .update(await readFile(path.join(out, ref)))
      .digest('hex')
      .slice(0, 10),
  );
await writeFile(
  cssFile,
  css.replace(LOADED, (_, q, ref) => `url(${q}${ref}?v=${versions.get(ref)}${q})`),
);

const shader = (name) => readFile(path.join(root, 'tools/hub/assets/shaders', name), 'utf8');
const gl = (await readFile(path.join(root, 'tools/hub/assets/waterfront-gl.js'), 'utf8'))
  .replace('__BATHYMETRY_VERT__', JSON.stringify(await shader('bathymetry.vert')))
  .replace('__BATHYMETRY_FRAG__', JSON.stringify(await shader('bathymetry.frag')));
await writeFile(path.join(out, 'waterfront-gl.js'), gl);
// Standing pages (About, How we work): Markdown, rendered by the site builder at every publication.
const pagesOut = path.join(desk, 'site-static', 'pages');
await rm(pagesOut, { recursive: true, force: true });
await mkdir(pagesOut, { recursive: true });
for (const f of (await readdir(path.join(desk, 'site-src', 'pages'))).filter((n) => n.endsWith('.md')))
  await copyFile(path.join(desk, 'site-src', 'pages', f), path.join(pagesOut, f));
console.log(`site assets ready in ${path.relative(root, out)}`);
