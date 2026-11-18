#!/usr/bin/env node
// AT-23 / SC-005: server secrets must never reach browser bundles or prerendered pages.
// Scans .next/static (everything shipped to browsers) and prerendered HTML/RSC payloads for known
// secret shapes and for the literal values of local secrets. Prints file and rule, never the value.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desk = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = path.join(desk, '.next');
if (!existsSync(next)) {
  console.error('No .next build found: run `next build` first.');
  process.exit(2);
}

const rules = [
  { id: 'supabase-secret-key', re: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { id: 'service-role-claim', re: /"role"\s*:\s*"service_role"|service_role_key/i },
  { id: 'postgres-url', re: /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/ },
  { id: 'agent-token', re: /sca_[a-z0-9]{8}_[A-Za-z0-9_-]{43}/ },
  { id: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    id: 'jwt-secret-name',
    re: /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|INTAKE_HASH_SECRET|DESK_DATABASE_URL/,
  },
];

// Literal values from local env files (if present), so a leaked value is caught even if reshaped.
for (const file of ['.env.local', '.env.ops.local']) {
  const full = path.join(desk, file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
    if (!m) continue;
    const [, key, value] = m;
    if (/SECRET|KEY|DATABASE_URL|DB_URL/.test(key) && !key.includes('PUBLISHABLE') && value.length >= 16) {
      rules.push({ id: `value-of-${key}`, literal: value });
    }
  }
}

const roots = [path.join(next, 'static'), path.join(next, 'server', 'app')];
const shipped = (file) =>
  file.includes(`${path.sep}static${path.sep}`) || /\.(html|rsc|body|meta)$/.test(file);
const findings = [];
let scanned = 0;
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (shipped(full)) {
      scanned++;
      const text = readFileSync(full, 'latin1');
      for (const rule of rules) {
        const hit = rule.literal ? text.includes(rule.literal) : rule.re.test(text);
        if (hit) findings.push({ file: path.relative(desk, full), rule: rule.id });
      }
    }
  }
}
roots.forEach(walk);

if (findings.length) {
  for (const f of findings) console.error(`LEAK ${f.rule} in ${f.file}`);
  console.error(`${findings.length} finding(s) in ${scanned} shipped files.`);
  process.exit(1);
}
console.log(
  `bundle scan: ${scanned} shipped files, ${rules.length} rules (including local secret values), no findings.`,
);
