#!/usr/bin/env node
// Dev log CLI.
//   pnpm devlog:new --title "Short title" [--session S02] [--turn 1] [--tickets SC-005,SC-006]
//                   [--workstreams WS-HUB] [--author "Name"]
// Creates devlog/entries/<YYYY-MM-DD>-<session>-<slug>.md with validated front matter and the
// standard section skeleton. Timestamps use America/New_York with an explicit offset.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRepo, gitInfo } from '../lib/repo.mjs';
import { isoInZone } from '../lib/time.mjs';
import { loadDevlog } from '../lib/project.mjs';
import { slugify } from '../lib/slug.mjs';

export { slugify };

export const SECTIONS = [
  'Summary',
  'What changed',
  'Decisions',
  'Problems and resolutions',
  'Evidence',
  'Risks and open questions',
  'Next actions',
];

export function renderEntry(meta) {
  const list = (xs) => `[${xs.join(', ')}]`;
  const fm = [
    '---',
    `id: ${meta.id}`,
    `title: ${JSON.stringify(meta.title)}`,
    `session: ${meta.session}`,
    `turn: ${meta.turn}`,
    `version: ${meta.version}`,
    `branch: ${meta.branch}`,
    `baseCommit: ${meta.baseCommit}`,
    `startedAt: ${meta.startedAt}`,
    `recordedAt: ${meta.recordedAt}`,
    `author: ${JSON.stringify(meta.author)}`,
    `tickets: ${list(meta.tickets)}`,
    `workstreams: ${list(meta.workstreams)}`,
    `evidence: ${list(meta.evidence)}`,
    `status: ${meta.status}`,
    '---',
    '',
    `# ${meta.title}`,
    '',
  ];
  for (const s of SECTIONS) fm.push(`## ${s}`, '', '_To be completed._', '');
  return fm.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== 'new') {
    console.error('usage: pnpm devlog:new --title "…" [--session S##] [--turn N] [--tickets …] [--workstreams …]');
    process.exitCode = 2;
    return;
  }
  const flag = (n) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? undefined : args[i + 1];
  };
  const title = flag('title');
  if (!title) throw new Error('--title is required');
  const repo = createRepo();
  const { sessions } = await repo.readJson('devtrack/sessions.json');
  const session = flag('session') ?? sessions.at(-1).id;
  const sess = sessions.find((s) => s.id === session);
  if (!sess) throw new Error(`unknown session ${session}; add it to devtrack/sessions.json first`);
  const pkg = await repo.readJson('package.json');
  const git = gitInfo(repo.root);
  const now = isoInZone();
  const day = now.slice(0, 10);
  const existing = (await loadDevlog(repo)).filter((e) => String(e.recordedAt).startsWith(day));
  const sameSession = (await loadDevlog(repo)).filter((e) => e.session === session);
  const meta = {
    id: `DL-${day.replace(/-/g, '')}-${String(existing.length + 1).padStart(2, '0')}`,
    title,
    session,
    turn: Number(flag('turn') ?? sameSession.length + 1),
    version: pkg.version,
    branch: git.branch,
    baseCommit: git.commit || sess.baseCommit,
    startedAt: sess.startedAt,
    recordedAt: now,
    author: flag('author') ?? sess.agent ?? 'unspecified',
    tickets: (flag('tickets') ?? '').split(',').filter(Boolean),
    workstreams: (flag('workstreams') ?? '').split(',').filter(Boolean),
    evidence: [],
    status: 'in-progress',
  };
  await mkdir(repo.abs('devlog/entries'), { recursive: true });
  const file = `devlog/entries/${day}-${session.toLowerCase()}-${slugify(title)}.md`;
  if (existsSync(repo.abs(file))) throw new Error(`${file} already exists`);
  await writeFile(repo.abs(file), renderEntry(meta));
  console.log(`created ${file}\nAdd it to devtrack/sessions.json → ${session}.devlog, then fill in each section.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`devlog: ${err.message}`);
    process.exitCode = 1;
  });
}
