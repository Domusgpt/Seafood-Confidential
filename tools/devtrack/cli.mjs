#!/usr/bin/env node
// Delivery tracking CLI.
//
//   pnpm devtrack status                 print a summary
//   pnpm devtrack status --write         regenerate the block in docs/IMPLEMENTATION_STATUS.md
//   pnpm devtrack status --check         exit 1 if that block is stale (CI)
//   pnpm devtrack ticket SC-005 in_progress
//                                        set a ticket status in BACKLOG.json and BACKLOG.csv together
//   pnpm devtrack evidence --subjects SC-005,AT-01 --kind test --result pass \
//        --summary "..." --steps "..." --observed "..." [--location path] [--defect ID]
//                                        append an evidence record (id, time, session, commit, env auto-filled)
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createRepo, gitInfo } from '../lib/repo.mjs';
import { loadProject, TICKET_STATUSES } from '../lib/project.mjs';
import { parseCsv } from '../lib/csv.mjs';
import { isoInZone } from '../lib/time.mjs';
import { renderStatusBlock, replaceBlock } from './status.mjs';

const repo = createRepo();
const [command, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};
const STATUS_DOC = 'docs/IMPLEMENTATION_STATUS.md';

async function status() {
  const project = await loadProject(repo);
  const { workstreams } = await repo.readJson('devtrack/workstreams.json');
  const block = renderStatusBlock(project, workstreams);
  const current = await readFile(repo.abs(STATUS_DOC), 'utf8');
  const next = replaceBlock(current, block);
  if (rest.includes('--write')) {
    if (next !== current) await writeFile(repo.abs(STATUS_DOC), next);
    console.log(next === current ? `${STATUS_DOC} already current` : `updated ${STATUS_DOC}`);
    return;
  }
  if (rest.includes('--check')) {
    if (next !== current) {
      console.error(`${STATUS_DOC} is stale: run \`pnpm devtrack status --write\` and commit the result.`);
      process.exitCode = 1;
    } else console.log(`${STATUS_DOC} is current`);
    return;
  }
  const d = project.derived;
  console.log(`Seafood Confidential v${project.version}`);
  console.log(
    `Tickets: ${JSON.stringify(d.ticketStatusCounts)}  Acceptance: ${JSON.stringify(d.acceptanceStatusCounts)}`,
  );
  console.log(
    `Decisions: ${JSON.stringify(d.decisionStatusCounts)}  Evidence records: ${project.evidence.length}`,
  );
  console.log(
    `Critical path (high): ${d.criticalPath.high.path.join(' → ')} = ${d.criticalPath.high.hours} h`,
  );
}

/** Quote a CSV field when needed (RFC 4180). */
const csvField = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function ticket() {
  const [id, next] = rest;
  if (!id || !TICKET_STATUSES.includes(next))
    throw new Error(`usage: pnpm devtrack ticket SC-### <${TICKET_STATUSES.join('|')}>`);
  const backlogPath = repo.abs('planning/BACKLOG.json');
  const backlog = JSON.parse(await readFile(backlogPath, 'utf8'));
  const tk = backlog.tickets.find((t) => t.id === id);
  if (!tk) throw new Error(`unknown ticket ${id}`);
  if (next === 'done') {
    const { records } = await repo.readJson('devtrack/evidence.json');
    if (!records.some((e) => e.subjects.includes(id) && e.result === 'pass'))
      throw new Error(`${id}: record passing evidence first (pnpm devtrack evidence …); "done" requires it`);
  }
  const previous = tk.status;
  tk.status = next;
  await writeFile(backlogPath, `${JSON.stringify(backlog, null, 2)}\n`);
  // Keep the importable CSV view in lockstep, preserving its RFC 4180 CRLF line endings.
  const csvText = await readFile(repo.abs('planning/BACKLOG.csv'), 'utf8');
  const eol = csvText.includes('\r\n') ? '\r\n' : '\n';
  const rows = parseCsv(csvText);
  const statusCol = rows[0].indexOf('Status');
  for (const row of rows.slice(1)) if (row[0] === id) row[statusCol] = next;
  await writeFile(
    repo.abs('planning/BACKLOG.csv'),
    rows.map((r) => r.map(csvField).join(',')).join(eol) + (csvText.endsWith(eol) ? eol : ''),
  );
  console.log(
    `${id}: ${previous} → ${next} (BACKLOG.json + BACKLOG.csv). Run \`pnpm devtrack status --write\`.`,
  );
}

async function evidence() {
  const required = ['subjects', 'kind', 'result', 'summary', 'steps', 'observed'];
  const missing = required.filter((k) => !flag(k));
  if (missing.length) throw new Error(`missing --${missing.join(', --')}`);
  const file = repo.abs('devtrack/evidence.json');
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const { sessions } = await repo.readJson('devtrack/sessions.json');
  const open = [...sessions].reverse().find((s) => s.status === 'open') ?? sessions.at(-1);
  const git = gitInfo(repo.root);
  const nextId = `EV-${String(doc.records.length + 1).padStart(4, '0')}`;
  const record = {
    id: nextId,
    recordedAt: isoInZone(),
    session: flag('session') ?? open.id,
    environment: flag('environment') ?? `${os.platform()} ${os.arch()}, Node ${process.version}`,
    commit: git.dirty ? `WORKTREE@${git.commit}` : git.commit,
    operator: flag('operator') ?? process.env.DEVTRACK_OPERATOR ?? 'unspecified operator',
    subjects: flag('subjects')
      .split(',')
      .map((s) => s.trim()),
    kind: flag('kind'),
    summary: flag('summary'),
    steps: flag('steps'),
    observed: flag('observed'),
    result: flag('result'),
    ...(flag('location') ? { location: flag('location') } : {}),
    ...(flag('defect') ? { defect: flag('defect') } : {}),
  };
  doc.records.push(record);
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`recorded ${nextId} (${record.result}) for ${record.subjects.join(', ')}`);
}

const commands = { status, ticket, evidence };
if (!commands[command]) {
  console.error('usage: pnpm devtrack <status|ticket|evidence> … (see header of tools/devtrack/cli.mjs)');
  process.exitCode = 2;
} else {
  commands[command]().catch((err) => {
    console.error(`devtrack: ${err.message}`);
    process.exitCode = 1;
  });
}
