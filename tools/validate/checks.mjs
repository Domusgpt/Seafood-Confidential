// Kit and repository integrity checks. Each check returns { name, errors: [], warnings: [], notes: [] }.
// These turn the packet's "reviewed" claims into repeatable, automated evidence.
import { createHash } from 'node:crypto';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseCsvObjects } from '../lib/csv.mjs';
import { relativeLinks, parseFrontMatter } from '../lib/markdown.mjs';
import {
  TICKET_STATUSES,
  ACCEPTANCE_STATUSES,
  DECISION_STATUSES,
  parseAcceptance,
  criticalPath,
} from '../lib/project.mjs';

const result = (name) => ({ name, errors: [], warnings: [], notes: [] });
const SECTIONS = ['On the Water', 'At the Farm', 'The Trade', 'Rules and Reality', 'At the Table', 'Voices'];

/** planning/BACKLOG.json — identity, vocabulary, dependency graph, totals; BACKLOG.csv parity. */
export async function checkBacklog(repo) {
  const r = result('Backlog (planning/BACKLOG.json + BACKLOG.csv)');
  const backlog = await repo.readJson('planning/BACKLOG.json');
  const tickets = backlog.tickets ?? [];
  const ids = new Set();
  for (const t of tickets) {
    if (!/^SC-\d{3}$/.test(t.id)) r.errors.push(`${t.id}: id must match SC-###`);
    if (ids.has(t.id)) r.errors.push(`${t.id}: duplicate id`);
    ids.add(t.id);
    if (!TICKET_STATUSES.includes(t.status))
      r.errors.push(`${t.id}: status "${t.status}" not in ${TICKET_STATUSES.join('/')}`);
    if (!['P0', 'P1', 'P2'].includes(t.priority))
      r.errors.push(`${t.id}: priority "${t.priority}" not P0/P1/P2`);
    if (!(
      Number.isFinite(t.hoursLow) &&
      Number.isFinite(t.hoursHigh) &&
      t.hoursLow > 0 &&
      t.hoursLow <= t.hoursHigh
    ))
      r.errors.push(`${t.id}: hours must satisfy 0 < low ≤ high (got ${t.hoursLow}–${t.hoursHigh})`);
    if (!Array.isArray(t.acceptance) || t.acceptance.length === 0)
      r.errors.push(`${t.id}: acceptance criteria missing`);
  }
  for (const t of tickets)
    for (const d of t.dependencies ?? []) {
      if (!ids.has(d)) r.errors.push(`${t.id}: depends on unknown ticket ${d}`);
      if (d === t.id) r.errors.push(`${t.id}: depends on itself`);
    }
  if (!r.errors.length) {
    try {
      const cp = criticalPath(tickets, (t) => t.hoursHigh);
      r.notes.push(
        `dependency graph is acyclic; critical path (high) ${cp.path.join(' → ')} = ${cp.hours} h`,
      );
    } catch (err) {
      r.errors.push(err.message);
    }
  }
  const low = tickets.reduce((n, t) => n + t.hoursLow, 0);
  const high = tickets.reduce((n, t) => n + t.hoursHigh, 0);
  const eh = backlog.engineeringHours ?? {};
  if (low !== eh.low || high !== eh.high)
    r.errors.push(`ticket hours sum ${low}–${high} ≠ engineeringHours ${eh.low}–${eh.high}`);
  else
    r.notes.push(
      `${tickets.length} tickets; hours ${low}–${high} + ${eh.reserve} reserve = ${low + eh.reserve}–${high + eh.reserve}`,
    );

  // CSV parity: the CSV is the importable view of the JSON (docs/DEVELOPMENT_KIT.md).
  const csv = parseCsvObjects(await repo.readText('planning/BACKLOG.csv'));
  if (csv.length !== tickets.length)
    r.errors.push(`BACKLOG.csv has ${csv.length} rows; JSON has ${tickets.length}`);
  for (const t of tickets) {
    const row = csv.find((c) => c.ID === t.id);
    if (!row) {
      r.errors.push(`BACKLOG.csv: missing ${t.id}`);
      continue;
    }
    const expect = {
      Priority: t.priority,
      Title: t.title,
      Status: t.status,
      'Hours low': String(t.hoursLow),
      'Hours high': String(t.hoursHigh),
      Dependencies: (t.dependencies ?? []).join('; '),
      Owner: t.owner,
      Scope: t.scope,
      Acceptance: (t.acceptance ?? []).join(' | '),
    };
    for (const [col, val] of Object.entries(expect))
      if ((row[col] ?? '') !== val)
        r.errors.push(`BACKLOG.csv ${t.id} ${col}: "${row[col]}" ≠ JSON "${val}"`);
  }
  return r;
}

/** editorial/SIX_WEEK_CALENDAR.json — structure, sections, CSV parity. */
export async function checkCalendar(repo) {
  const r = result('Editorial calendar (SIX_WEEK_CALENDAR.json + .csv)');
  const weeks = await repo.readJson('editorial/SIX_WEEK_CALENDAR.json');
  if (!Array.isArray(weeks)) {
    r.errors.push('calendar JSON must be an array of weeks');
    return r;
  }
  weeks.forEach((w, i) => {
    if (w.week !== i + 1) r.errors.push(`entry ${i}: week ${w.week} out of sequence`);
    if (!SECTIONS.includes(w.section))
      r.errors.push(`week ${w.week}: section "${w.section}" is not a launch section`);
    if (!(w.estimated_hours_min <= w.estimated_hours_max)) r.errors.push(`week ${w.week}: hours min > max`);
    if (w.publication_date)
      r.warnings.push(
        `week ${w.week}: publication_date set (${w.publication_date}); confirm it was founder-approved`,
      );
  });
  const csv = parseCsvObjects(await repo.readText('editorial/SIX_WEEK_CALENDAR.csv'));
  if (csv.length !== weeks.length) r.errors.push(`CSV has ${csv.length} rows; JSON has ${weeks.length}`);
  for (const w of weeks) {
    const row = csv.find((c) => Number(c.week) === w.week);
    if (!row) {
      r.errors.push(`CSV missing week ${w.week}`);
      continue;
    }
    for (const [k, v] of Object.entries(w))
      if (String(row[k] ?? '') !== String(v))
        r.errors.push(`CSV week ${w.week} ${k}: "${row[k]}" ≠ JSON "${v}"`);
  }
  if (!r.errors.length) r.notes.push(`${weeks.length} weeks; JSON and CSV identical; sections valid`);
  return r;
}

/** planning/WORKBOOK_DECISIONS.json — founder decision register. */
export async function checkDecisions(repo) {
  const r = result('Founder decisions (WORKBOOK_DECISIONS.json)');
  const d = await repo.readJson('planning/WORKBOOK_DECISIONS.json');
  const cols = d.columns ?? [];
  if (cols.join() !== 'id,decision,owner,choice,status,needed_by,dependency')
    r.errors.push(`unexpected columns: ${cols.join(', ')}`);
  const seen = new Set();
  for (const row of d.decisions ?? []) {
    const [id, , , , status] = row;
    if (row.length !== cols.length) r.errors.push(`${id}: expected ${cols.length} fields`);
    if (!/^D\d{2}$/.test(id)) r.errors.push(`${id}: id must match D##`);
    if (seen.has(id)) r.errors.push(`${id}: duplicate`);
    seen.add(id);
    if (!DECISION_STATUSES.includes(status))
      r.errors.push(`${id}: status "${status}" not in ${DECISION_STATUSES.join('/')}`);
  }
  if (!r.errors.length) r.notes.push(`${seen.size} decisions; statuses valid`);
  return r;
}

/** docs/ACCEPTANCE_TESTS.md — IDs contiguous, statuses valid, PASS/FAIL backed by evidence. */
export async function checkAcceptance(repo) {
  const r = result('Acceptance matrix (docs/ACCEPTANCE_TESTS.md)');
  const rows = parseAcceptance(await repo.readText('docs/ACCEPTANCE_TESTS.md'));
  const evidence = (await repo.readJson('devtrack/evidence.json')).records ?? [];
  rows.forEach((row, i) => {
    const expected = `AT-${String(i + 1).padStart(2, '0')}`;
    if (row.id !== expected) r.errors.push(`row ${i + 1}: id ${row.id}, expected ${expected}`);
    if (!ACCEPTANCE_STATUSES.includes(row.status))
      r.errors.push(`${row.id}: status "${row.status}" not in ${ACCEPTANCE_STATUSES.join('/')}`);
    if (['PASS', 'FAIL'].includes(row.status)) {
      const backing = evidence.filter((e) => e.subjects.includes(row.id) && e.kind === 'test');
      if (!backing.length)
        r.errors.push(`${row.id}: marked ${row.status} without a devtrack evidence record of kind "test"`);
    }
  });
  const counts = rows.reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});
  if (!r.errors.length)
    r.notes.push(
      `${rows.length} scenarios: ${Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}`,
    );
  return r;
}

/** contracts/agent-tools.schema.json compiles and behaves as specified on the example corpus. */
export async function checkAgentContract(repo) {
  const r = result('Agent request contract (contracts/agent-tools.schema.json)');
  const schema = await repo.readJson('contracts/agent-tools.schema.json');
  // Strict mode except strictRequired: the kit's schema (valid JSON Schema 2020-12) requires
  // idempotencyKey inside if/then branches without redeclaring it there (see docs/KIT_AUDIT.md).
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    r.errors.push(`schema does not compile: ${err.message}`);
    return r;
  }
  const files = await repo.list('contracts/examples', { exts: ['.json'] });
  let valid = 0;
  let invalid = 0;
  for (const f of files) {
    const doc = await repo.readJson(f);
    const ok = validate(doc.request);
    const want = f.includes('/valid/') ? true : f.includes('/invalid/') ? false : null;
    if (want === null) {
      r.errors.push(`${f}: examples must live under examples/valid or examples/invalid`);
      continue;
    }
    if (ok !== want)
      r.errors.push(
        `${f}: expected ${want ? 'VALID' : 'INVALID'} but schema said ${ok ? 'valid' : 'invalid'}` +
          (ok ? '' : ` (${ajv.errorsText(validate.errors)})`),
      );
    if (!doc.why) r.warnings.push(`${f}: add a "why" explaining the scenario`);
    want ? (valid += 1) : (invalid += 1);
  }
  if (files.length === 0) r.warnings.push('no contract examples found under contracts/examples');
  if (!r.errors.length)
    r.notes.push(
      `schema compiles (JSON Schema 2020-12, strict); ${valid} valid + ${invalid} invalid examples behave as expected`,
    );
  return r;
}

/** fixtures/example-article.json must stay an unpublishable fixture (AGENTS.md). */
export async function checkFixture(repo) {
  const r = result('Fixture guard (fixtures/example-article.json)');
  const f = await repo.readJson('fixtures/example-article.json');
  if (f.fixtureOnly !== true) r.errors.push('fixtureOnly must be true');
  if (f.publishable !== false) r.errors.push('publishable must be false');
  if (f.ghostPostId !== null) r.errors.push('fixture must not reference a real Ghost post');
  if (f.distribution?.web !== 'not_authorized' || f.distribution?.newsletter !== 'not_authorized')
    r.errors.push('fixture distribution must stay not_authorized for web and newsletter');
  if (f.review?.humanApproval !== false) r.errors.push('fixture must not carry human approval');
  if (!r.errors.length) r.notes.push('fixture is clearly unpublishable test data');
  return r;
}

/** packet/SHA256SUMS — founder originals are byte-identical to what was delivered. */
export async function checkPacket(repo) {
  const r = result('Founder packet integrity (packet/SHA256SUMS)');
  const sums = (await repo.readText('packet/SHA256SUMS')).trim().split('\n');
  for (const line of sums) {
    const [hash, file] = line.split(/\s+\*?/);
    if (!repo.exists(`packet/${file}`)) {
      r.errors.push(`missing packet/${file}`);
      continue;
    }
    const actual = createHash('sha256')
      .update(await repo.readBytes(`packet/${file}`))
      .digest('hex');
    if (actual !== hash)
      r.errors.push(`packet/${file}: sha256 ${actual.slice(0, 12)}… ≠ recorded ${hash.slice(0, 12)}…`);
  }
  if (!r.errors.length) r.notes.push(`${sums.length} files match their recorded SHA-256`);
  return r;
}

/** Every relative Markdown link in the repository resolves. */
export async function checkLinks(repo) {
  const r = result('Markdown relative links');
  const files = await repo.list('.', { exts: ['.md'] });
  let count = 0;
  for (const f of files) {
    const text = await repo.readText(f);
    for (const target of relativeLinks(text)) {
      count += 1;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f), decodeURI(target)));
      if (resolved.startsWith('..') || !repo.exists(resolved)) r.errors.push(`${f}: broken link → ${target}`);
    }
  }
  if (!r.errors.length) r.notes.push(`${count} relative links across ${files.length} Markdown files resolve`);
  return r;
}

/** devtrack + devlog: schemas, references, and the evidence rule from AGENTS.md. */
export async function checkTracking(repo) {
  const r = result('Delivery tracking (devtrack/ + devlog/)');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const load = async (rel) => ajv.compile(await repo.readJson(rel));
  const vSessions = await load('devtrack/schema/sessions.schema.json');
  const vEvidence = await load('devtrack/schema/evidence.schema.json');
  const vEntry = await load('devtrack/schema/devlog-entry.schema.json');
  const sessions = await repo.readJson('devtrack/sessions.json');
  const evidence = await repo.readJson('devtrack/evidence.json');
  if (!vSessions(sessions)) r.errors.push(`sessions.json: ${ajv.errorsText(vSessions.errors)}`);
  if (!vEvidence(evidence)) r.errors.push(`evidence.json: ${ajv.errorsText(vEvidence.errors)}`);

  const backlog = await repo.readJson('planning/BACKLOG.json');
  const ticketIds = new Set(backlog.tickets.map((t) => t.id));
  const atIds = new Set(parseAcceptance(await repo.readText('docs/ACCEPTANCE_TESTS.md')).map((a) => a.id));
  const sessionIds = new Set(sessions.sessions.map((s) => s.id));
  const workstreamIds = new Set(
    (await repo.readJson('devtrack/workstreams.json')).workstreams.map((w) => w.id),
  );
  const decisionIds = new Set(
    (await repo.readJson('planning/WORKBOOK_DECISIONS.json')).decisions.map((d) => d[0]),
  );
  const adrIds = new Set(
    (await repo.list('decisions', { exts: ['.md'] })).map((f) => /ADR-(\d{3})/.exec(f)?.[0]).filter(Boolean),
  );
  const known = (s) =>
    ticketIds.has(s) || atIds.has(s) || workstreamIds.has(s) || decisionIds.has(s) || adrIds.has(s);
  const evidenceIds = new Set();
  let lastId = 0;
  for (const e of evidence.records ?? []) {
    if (evidenceIds.has(e.id)) r.errors.push(`evidence ${e.id}: duplicate id`);
    evidenceIds.add(e.id);
    const n = Number(e.id.slice(3));
    if (n !== lastId + 1)
      r.errors.push(
        `evidence ${e.id}: ids must be sequential (expected EV-${String(lastId + 1).padStart(4, '0')})`,
      );
    lastId = n;
    if (!sessionIds.has(e.session)) r.errors.push(`evidence ${e.id}: unknown session ${e.session}`);
    for (const s of e.subjects) if (!known(s)) r.errors.push(`evidence ${e.id}: unknown subject ${s}`);
  }
  // Evidence rule: a ticket may only be "done" with at least one passing evidence record (AGENTS.md).
  for (const t of backlog.tickets)
    if (
      t.status === 'done' &&
      !(evidence.records ?? []).some((e) => e.subjects.includes(t.id) && e.result === 'pass')
    )
      r.errors.push(`${t.id}: marked done without a passing evidence record`);

  const entries = (await repo.list('devlog/entries', { exts: ['.md'] })).filter(
    (f) => !f.endsWith('README.md'),
  );
  for (const f of entries) {
    const { data } = parseFrontMatter(await repo.readText(f));
    if (!vEntry(data)) r.errors.push(`${f}: front matter ${ajv.errorsText(vEntry.errors)}`);
    if (data.session && !sessionIds.has(data.session)) r.errors.push(`${f}: unknown session ${data.session}`);
    for (const ev of data.evidence ?? [])
      if (!evidenceIds.has(ev)) r.errors.push(`${f}: unknown evidence ${ev}`);
    for (const t of data.tickets ?? []) if (!ticketIds.has(t)) r.errors.push(`${f}: unknown ticket ${t}`);
    const expectedName = `${String(data.recordedAt ?? '').slice(0, 10)}-${String(data.session ?? '').toLowerCase()}`;
    if (!path.posix.basename(f).startsWith(expectedName))
      r.warnings.push(`${f}: file name should start with ${expectedName}`);
  }
  for (const s of sessions.sessions)
    for (const d of s.devlog)
      if (!repo.exists(d)) r.errors.push(`session ${s.id}: devlog entry ${d} not found`);
  if (!r.errors.length)
    r.notes.push(
      `${sessions.sessions.length} session(s), ${evidenceIds.size} evidence record(s), ${entries.length} devlog entr${entries.length === 1 ? 'y' : 'ies'}`,
    );
  return r;
}

export const ALL_CHECKS = [
  checkBacklog,
  checkCalendar,
  checkDecisions,
  checkAcceptance,
  checkAgentContract,
  checkFixture,
  checkPacket,
  checkLinks,
  checkTracking,
];
