// Project model: reads the canonical sources (never a copy of them) and derives planning metrics.
//
// Canonical sources (see devtrack/README.md):
//   planning/BACKLOG.json              tickets, estimates, dependencies, ticket status
//   docs/ACCEPTANCE_TESTS.md           acceptance scenarios and their status column
//   planning/WORKBOOK_DECISIONS.json   founder decisions and their status
//   editorial/SIX_WEEK_CALENDAR.json   proposed editorial calendar
//   planning/WORKBOOK_VERIFICATION.json totals recorded when the workbook was generated
//   devtrack/sessions.json             agent/human working sessions and their versions
//   devtrack/evidence.json             observed evidence records (commands, observations)
//   devlog/entries/*.md                timestamped narrative log entries
import path from 'node:path';
import { extractTables, tableObjects, parseFrontMatter, firstHeading } from './markdown.mjs';

export const TICKET_STATUSES = ['planned', 'ready', 'in_progress', 'blocked', 'done'];
export const TICKET_STATUS_LABEL = {
  planned: 'Planned',
  ready: 'Ready',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};
/** BACKLOG.json status ↔ workbook "Sprint" sheet status (planning/WORKBOOK.md). */
export const WORKBOOK_STATUS = {
  planned: 'Proposed',
  ready: 'Ready',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};
export const ACCEPTANCE_STATUSES = ['UNRUN', 'BLOCKED', 'PASS', 'FAIL'];
export const DECISION_STATUSES = ['Proposed', 'Discussing', 'Decided', 'Deferred'];

/** Sprint windows from docs/SPRINT_PLAN.md ("Working days | Outcome | Tickets"). */
export const SPRINT_WINDOWS = [
  { id: 'W1', days: [1, 4], label: 'Days 1–4', from: 1, to: 4 },
  { id: 'W2', days: [5, 9], label: 'Days 5–9', from: 5, to: 7 },
  { id: 'W3', days: [10, 14], label: 'Days 10–14', from: 8, to: 11 },
  { id: 'W4', days: [15, 17], label: 'Days 15–17', from: 12, to: 15 },
  { id: 'W5', days: [18, 20], label: 'Days 18–20', from: 16, to: 16 },
];
export const HOURS_PER_DAY = 8;

const ticketNumber = (id) => Number(String(id).split('-')[1]);
export const windowOf = (id) =>
  SPRINT_WINDOWS.find((w) => ticketNumber(id) >= w.from && ticketNumber(id) <= w.to);

/** Parse the acceptance matrix table in docs/ACCEPTANCE_TESTS.md. */
export function parseAcceptance(markdown) {
  const table = extractTables(markdown).find((t) => t.header[0] === 'ID' && t.header.includes('Status'));
  if (!table) throw new Error('docs/ACCEPTANCE_TESTS.md: acceptance table not found');
  return tableObjects(table).map((r) => ({
    id: r.ID,
    scenario: r.Scenario,
    outcome: r['Required observed outcome'],
    status: r.Status,
  }));
}

/** Parse ADR markdown: title, date and status from the "Date: … Status: …" line. */
export function parseAdr(markdown, file) {
  const title = firstHeading(markdown, path.basename(file, '.md'));
  const meta = /Date:\s*([^.\n]+?)\.\s*Status:\s*([^\n]+)/i.exec(markdown);
  const statusText = meta ? meta[2].trim().replace(/\.$/, '') : 'Unknown';
  const status = /^accepted/i.test(statusText)
    ? 'Accepted'
    : /^proposed/i.test(statusText)
      ? 'Proposed'
      : /^superseded/i.test(statusText)
        ? 'Superseded'
        : 'Unknown';
  return { file, title, date: meta ? meta[1].trim() : '', status, statusText };
}

/** Longest path through the dependency DAG, weighted by a per-ticket hours selector. */
export function criticalPath(tickets, hoursOf) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const finish = new Map();
  const prev = new Map();
  const visiting = new Set();
  const ef = (id) => {
    if (finish.has(id)) return finish.get(id);
    if (visiting.has(id)) throw new Error(`dependency cycle through ${id}`);
    visiting.add(id);
    const t = byId.get(id);
    let start = 0;
    let from = null;
    for (const d of t.dependencies) {
      const f = ef(d);
      if (f > start || (f === start && from !== null && d > from)) {
        start = f;
        from = d;
      }
    }
    visiting.delete(id);
    finish.set(id, start + hoursOf(t));
    prev.set(id, from);
    return finish.get(id);
  };
  let end = null;
  for (const t of tickets) {
    const f = ef(t.id);
    if (end === null || f > finish.get(end)) end = t.id;
  }
  const pathIds = [];
  for (let cur = end; cur; cur = prev.get(cur)) pathIds.unshift(cur);
  return { path: pathIds, hours: end ? finish.get(end) : 0, finish };
}

/** Topological depth (longest dependency chain length) for DAG layout. */
export function dependencyDepth(tickets) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const memo = new Map();
  const depth = (id) => {
    if (memo.has(id)) return memo.get(id);
    const t = byId.get(id);
    const d = t.dependencies.length ? 1 + Math.max(...t.dependencies.map(depth)) : 0;
    memo.set(id, d);
    return d;
  };
  return new Map(tickets.map((t) => [t.id, depth(t.id)]));
}

export async function loadDevlog(repo) {
  const files = (await repo.list('devlog/entries', { exts: ['.md'] })).filter(
    (f) => !f.endsWith('README.md'),
  );
  const entries = [];
  for (const file of files) {
    const text = await repo.readText(file);
    const { data, body } = parseFrontMatter(text);
    entries.push({ file, ...data, body, title: data.title || firstHeading(body, file) });
  }
  return entries.sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
}

export async function loadProject(repo) {
  const [backlog, calendar, decisionsRaw, verification, sessions, evidence, acceptanceMd, pkg] =
    await Promise.all([
      repo.readJson('planning/BACKLOG.json'),
      repo.readJson('editorial/SIX_WEEK_CALENDAR.json'),
      repo.readJson('planning/WORKBOOK_DECISIONS.json'),
      repo.readJson('planning/WORKBOOK_VERIFICATION.json'),
      repo.readJson('devtrack/sessions.json'),
      repo.readJson('devtrack/evidence.json'),
      repo.readText('docs/ACCEPTANCE_TESTS.md'),
      repo.readJson('package.json'),
    ]);
  const tickets = backlog.tickets;
  const acceptance = parseAcceptance(acceptanceMd);
  const decisions = decisionsRaw.decisions.map((row) =>
    Object.fromEntries(decisionsRaw.columns.map((c, i) => [c, row[i]])),
  );
  const adrFiles = (await repo.list('decisions', { exts: ['.md'] })).filter((f) => /ADR-\d+/.test(f));
  const adrs = [];
  for (const f of adrFiles) adrs.push(parseAdr(await repo.readText(f), f));
  const devlog = await loadDevlog(repo);

  const evidenceBySubject = new Map();
  for (const rec of evidence.records) {
    for (const s of rec.subjects) {
      if (!evidenceBySubject.has(s)) evidenceBySubject.set(s, []);
      evidenceBySubject.get(s).push(rec);
    }
  }

  const count = (list, key) =>
    list.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});

  const sum = (key) => tickets.reduce((n, t) => n + t[key], 0);
  const windows = SPRINT_WINDOWS.map((w) => {
    const items = tickets.filter((t) => windowOf(t.id) === w);
    const low = items.reduce((n, t) => n + t.hoursLow, 0);
    const high = items.reduce((n, t) => n + t.hoursHigh, 0);
    const capacity = (w.days[1] - w.days[0] + 1) * HOURS_PER_DAY;
    return { ...w, tickets: items.map((t) => t.id), low, high, capacity };
  });
  // The final window also carries the delivery reserve (docs/SPRINT_PLAN.md: "SC-016 and reserve").
  windows[windows.length - 1].reserve = backlog.engineeringHours.reserve;

  const cpLow = criticalPath(tickets, (t) => t.hoursLow);
  const cpHigh = criticalPath(tickets, (t) => t.hoursHigh);
  const foundationIds = ['SC-001', 'SC-002', 'SC-003', 'SC-004', 'SC-005'];
  const foundation = tickets.filter((t) => foundationIds.includes(t.id));

  return {
    version: pkg.version,
    backlog,
    tickets,
    acceptance,
    decisions,
    adrs,
    calendar,
    verification,
    sessions: sessions.sessions,
    evidence: evidence.records,
    evidenceBySubject,
    devlog,
    derived: {
      ticketStatusCounts: count(tickets, 'status'),
      acceptanceStatusCounts: count(acceptance, 'status'),
      decisionStatusCounts: count(decisions, 'status'),
      hours: {
        low: sum('hoursLow'),
        high: sum('hoursHigh'),
        reserve: backlog.engineeringHours.reserve,
        totalLow: sum('hoursLow') + backlog.engineeringHours.reserve,
        totalHigh: sum('hoursHigh') + backlog.engineeringHours.reserve,
      },
      windows,
      criticalPath: { low: cpLow, high: cpHigh },
      depth: dependencyDepth(tickets),
      foundation: {
        ids: foundationIds,
        low: foundation.reduce((n, t) => n + t.hoursLow, 0),
        high: foundation.reduce((n, t) => n + t.hoursHigh, 0),
      },
    },
  };
}
