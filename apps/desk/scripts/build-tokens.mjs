#!/usr/bin/env node
// Compile brand/tokens.json into src/app/tokens.css (the single source of brand values, per the
// sc-visual-codex skill). Run with --check in CI to fail when the committed file is stale.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokensCss, contrastReport } from '../../../tools/hub/tokens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = path.resolve(here, '../src/app/tokens.css');
const tokens = JSON.parse(await readFile(path.join(root, 'brand/tokens.json'), 'utf8'));

const failures = contrastReport(tokens).filter((p) => !p.pass);
if (failures.length) {
  for (const f of failures)
    console.error(`contrast: ${f.theme}.${f.text} on ${f.on} is ${f.ratio.toFixed(2)}:1 (< ${f.min})`);
  process.exit(1);
}

// The desk self-hosts the fonts through @fontsource-variable, which registers 'Fraunces Variable'
// and 'Source Sans 3 Variable'. Put those names first; the token families stay as the next fallback.
const css = tokensCss(tokens)
  .replace('--font-display: Fraunces,', "--font-display: 'Fraunces Variable', Fraunces,")
  .replace("--font-text: 'Source Sans 3',", "--font-text: 'Source Sans 3 Variable', 'Source Sans 3',")
  .replace(
    'Do not edit by hand. */',
    'Do not edit by hand.\n   Desk build: apps/desk/scripts/build-tokens.mjs (adds the self-hosted variable font names). */',
  );
if (process.argv.includes('--check')) {
  const current = await readFile(out, 'utf8').catch(() => '');
  if (current !== css) {
    console.error('src/app/tokens.css is stale: run `pnpm --filter @sc/desk tokens`.');
    process.exit(1);
  }
  console.log('tokens.css is current');
} else {
  await writeFile(out, css);
  console.log(`wrote ${path.relative(root, out)}`);
}
