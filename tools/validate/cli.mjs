#!/usr/bin/env node
// Usage: pnpm validate [--json]
// Runs every repository integrity check; exits 1 when any check reports an error.
import { createRepo } from '../lib/repo.mjs';
import { ALL_CHECKS } from './checks.mjs';

const repo = createRepo();
const results = [];
for (const check of ALL_CHECKS) {
  try {
    results.push(await check(repo));
  } catch (err) {
    results.push({ name: check.name, errors: [`check crashed: ${err.message}`], warnings: [], notes: [] });
  }
}

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} else {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  for (const r of results) {
    const mark = r.errors.length
      ? paint('31', '✗ FAIL')
      : r.warnings.length
        ? paint('33', '! WARN')
        : paint('32', '✓ PASS');
    console.log(`${mark}  ${r.name}`);
    for (const n of r.notes) console.log(`        ${n}`);
    for (const w of r.warnings) console.log(paint('33', `        warning: ${w}`));
    for (const e of r.errors) console.log(paint('31', `        error: ${e}`));
  }
  const failed = results.filter((r) => r.errors.length).length;
  console.log(
    `\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} failed` : ''}.`,
  );
}
process.exitCode = results.some((r) => r.errors.length) ? 1 : 0;
