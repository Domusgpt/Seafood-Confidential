// The validators must catch the failure modes they exist for. Each test copies the repository's
// canonical files into a temporary tree, breaks one thing, and expects a specific error.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRepo, REPO_ROOT } from '../lib/repo.mjs';
import * as C from './checks.mjs';

let dir;
const COPY = [
  'planning',
  'editorial',
  'docs',
  'devtrack',
  'devlog',
  'contracts',
  'fixtures',
  'packet',
  'decisions',
  'package.json',
];

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'sc-validate-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fresh(name) {
  const root = path.join(dir, name);
  for (const p of COPY) await cp(path.join(REPO_ROOT, p), path.join(root, p), { recursive: true });
  return createRepo(root);
}
const editJson = async (repo, rel, fn) => {
  const data = JSON.parse(await readFile(repo.abs(rel), 'utf8'));
  fn(data);
  await writeFile(repo.abs(rel), JSON.stringify(data, null, 2));
};

test('the real repository passes every check', async () => {
  const repo = createRepo();
  for (const check of C.ALL_CHECKS) {
    const r = await check(repo);
    assert.deepEqual(r.errors, [], `${r.name}: ${r.errors.join('; ')}`);
  }
});

test('backlog: dangling dependency, cycle and hour drift are caught', async () => {
  const repo = await fresh('backlog');
  await editJson(repo, 'planning/BACKLOG.json', (b) => {
    b.tickets[1].dependencies.push('SC-999');
  });
  assert.match((await C.checkBacklog(repo)).errors.join('\n'), /unknown ticket SC-999/);
  await editJson(repo, 'planning/BACKLOG.json', (b) => {
    b.tickets[1].dependencies = ['SC-001'];
    b.tickets[0].dependencies = ['SC-002'];
  });
  assert.match((await C.checkBacklog(repo)).errors.join('\n'), /cycle/);
  await editJson(repo, 'planning/BACKLOG.json', (b) => {
    b.tickets[0].dependencies = [];
    b.tickets[0].hoursHigh += 1;
  });
  assert.match((await C.checkBacklog(repo)).errors.join('\n'), /engineeringHours/);
});

test('backlog: CSV drift from JSON is caught', async () => {
  const repo = await fresh('csv');
  const csv = await readFile(repo.abs('planning/BACKLOG.csv'), 'utf8');
  await writeFile(
    repo.abs('planning/BACKLOG.csv'),
    csv.replace('Public site hosting and publishing roles', 'Hosting setup'),
  );
  assert.match((await C.checkBacklog(repo)).errors.join('\n'), /SC-002 Title/);
});

test('evidence rule: a ticket cannot be done without passing evidence', async () => {
  // SC-016 (operator rehearsal) is the last ticket on the critical path and has no evidence yet.
  const repo = await fresh('evidence');
  await editJson(repo, 'planning/BACKLOG.json', (b) => {
    b.tickets.find((t) => t.id === 'SC-016').status = 'done';
  });
  assert.match(
    (await C.checkTracking(repo)).errors.join('\n'),
    /SC-016: marked done without a passing evidence record/,
  );
});

test('evidence rule: a ticket with passing evidence may be marked done', async () => {
  const repo = await fresh('evidence-ok');
  await editJson(repo, 'planning/BACKLOG.json', (b) => {
    b.tickets.find((t) => t.id === 'SC-005').status = 'done';
  });
  assert.doesNotMatch((await C.checkTracking(repo)).errors.join('\n'), /SC-005: marked done/);
});

test('acceptance: PASS without a test record is rejected', async () => {
  const repo = await fresh('acceptance');
  const md = await readFile(repo.abs('docs/ACCEPTANCE_TESTS.md'), 'utf8');
  await writeFile(
    repo.abs('docs/ACCEPTANCE_TESTS.md'),
    md.replace(
      '| AT-02 | Guest contributor or editor attempts publish | Denied: contributors have no desk role, and only owners and managing editors publish (ADR-005) | UNRUN |',
      '| AT-02 | Guest contributor or editor attempts publish | Denied: contributors have no desk role, and only owners and managing editors publish (ADR-005) | PASS |',
    ),
  );
  assert.match(
    (await C.checkAcceptance(repo)).errors.join('\n'),
    /AT-02: marked PASS without a devtrack evidence record/,
  );
});

test('agent contract: a publish tool slipping into the valid corpus fails', async () => {
  const repo = await fresh('contract');
  await cp(
    repo.abs('contracts/examples/invalid/publish-tool.json'),
    repo.abs('contracts/examples/valid/publish-tool.json'),
  );
  assert.match((await C.checkAgentContract(repo)).errors.join('\n'), /publish-tool\.json: expected VALID/);
});

test('fixture guard: the example article can never become publishable', async () => {
  const repo = await fresh('fixture');
  await editJson(repo, 'fixtures/example-article.json', (f) => {
    f.publishable = true;
  });
  assert.match((await C.checkFixture(repo)).errors.join('\n'), /publishable must be false/);
});

test('packet integrity: a modified original is detected', async () => {
  const repo = await fresh('packet');
  await writeFile(repo.abs('packet/START_HERE.txt'), 'tampered');
  assert.match((await C.checkPacket(repo)).errors.join('\n'), /START_HERE\.txt: sha256/);
});

test('tracking: evidence ids must be sequential and reference known subjects', async () => {
  const repo = await fresh('tracking');
  await editJson(repo, 'devtrack/evidence.json', (e) => {
    e.records[1].id = 'EV-0009';
    e.records[2].subjects = ['WS-NOPE'];
  });
  const errors = (await C.checkTracking(repo)).errors.join('\n');
  assert.match(errors, /ids must be sequential/);
  assert.match(errors, /unknown subject WS-NOPE/);
});
