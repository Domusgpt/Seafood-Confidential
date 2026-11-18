// Page bodies for the project hub. Every number shown is derived from a canonical source at build time.
import { escapeHtml as esc, badge } from './html.mjs';
import { effortChart, costChart, dependencyGraph } from './charts.mjs';
import { extractTables, tableObjects } from '../lib/markdown.mjs';
import { TICKET_STATUS_LABEL } from '../lib/project.mjs';
import { displayInZone, displayDate } from '../lib/time.mjs';
import { contrastReport, resolveTokens } from './tokens.mjs';
import { contrastRatio } from '../lib/color.mjs';

const tile = (label, value, note, meter) => `<div class="tile">
  <span class="tile-label">${esc(label)}</span>
  <span class="tile-value">${value}</span>
  ${note ? `<span class="tile-note">${note}</span>` : ''}
  ${meter !== undefined ? `<div class="meter" role="img" aria-label="${esc(`${Math.round(meter * 100)}% complete`)}"><span style="width:${Math.max(0, Math.min(100, meter * 100)).toFixed(1)}%"></span></div>` : ''}
</div>`;

const evidenceLinks = (project, id, rel) =>
  (project.evidenceBySubject.get(id) ?? [])
    .map((e) => `<a href="${rel}devlog/evidence.html#${e.id}">${e.id}</a>`)
    .join(', ');

/** Cost line items parsed from docs/LAUNCH_PACKET.md and reconciled with WORKBOOK_VERIFICATION.json. */
export function parseCosts(launchPacketMd, verification) {
  const table = extractTables(launchPacketMd).find(
    (t) => t.header[0] === 'Item' && t.header[1] === 'Monthly equivalent',
  );
  if (!table) throw new Error('LAUNCH_PACKET.md: cost table not found');
  const rows = tableObjects(table);
  const items = [];
  const optional = [];
  for (const r of rows) {
    const nums = [...r['Monthly equivalent'].matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    if (!nums.length || /^(Vendor base|Initial operating range)$/i.test(r.Item)) continue;
    const item = {
      label: r.Item,
      low: nums[0],
      high: nums[1] ?? nums[0],
      basis: r['Billing basis'].replace(/\s*\[S[\d,\s-]+\]\s*/g, '').trim(),
    };
    (/^Optional/i.test(r.Item) ? optional : items).push(item);
  }
  const low = items.reduce((n, i) => n + i.low, 0);
  const high = items.reduce((n, i) => n + i.high, 0);
  if (low !== verification.monthly_low || high !== verification.monthly_high)
    throw new Error(
      `cost table totals $${low}–$${high} do not match WORKBOOK_VERIFICATION.json $${verification.monthly_low}–$${verification.monthly_high}`,
    );
  items.sort((a, b) => b.high - a.high || b.low - a.low);
  return { items, optional, low, high };
}

export function overviewPage(project, costs, ctx) {
  const d = project.derived;
  const t = d.ticketStatusCounts;
  const a = d.acceptanceStatusCounts;
  const run = project.acceptance.length - (a.UNRUN ?? 0);
  const decided = d.decisionStatusCounts.Decided ?? 0;
  const session = project.sessions.at(-1);
  const latest = project.devlog.slice(0, 3);
  const packet = [
    ['Seafood_Confidential_Launch_Packet.pdf', '24-page founder plan (PDF)'],
    ['Seafood_Confidential_Launch_Packet.docx', 'Editable founder plan (Word)'],
    ['Seafood_Confidential_Sprint_Workbook.xlsx', 'Sprint, costs, calendar and decisions workbook'],
    ['START_HERE.txt', 'Packet cover note'],
  ];
  return `
<div class="page-head">
  <span class="eyebrow">Launch and development · status</span>
  <h1>Where Seafood Confidential stands</h1>
  <p class="lede">A practitioner-led publication about fisheries, aquaculture, trade and the people behind the food: Ghost for the publication and newsletter, a small private operations desk, and human-approved social distribution.</p>
</div>
<div class="notice" role="note">
  ${badge('info')}
  <p><strong>Planning stage.</strong> The repository holds the founder packet, specifications, tooling and tracking. No application has been built or deployed, no account has been purchased, and all ${project.acceptance.length} acceptance scenarios are UNRUN.</p>
</div>
<div class="kpis">
  ${tile('Kit tickets done', `${t.done ?? 0} of ${project.tickets.length}`, `${t.in_progress ?? 0} in progress · ${t.planned ?? 0} planned`, (t.done ?? 0) / project.tickets.length)}
  ${tile('Acceptance scenarios run', `${run} of ${project.acceptance.length}`, `${a.UNRUN ?? 0} UNRUN`, run / project.acceptance.length)}
  ${tile('Founder decisions made', `${decided} of ${project.decisions.length}`, 'All proposed, none decided', decided / project.decisions.length)}
  ${tile('Engineering estimate', `${d.hours.totalLow}–${d.hours.totalHigh} h`, `incl. ${d.hours.reserve} h reserve · ~20 working days`)}
  ${tile('Operating cost', `$${costs.low}–${costs.high}/mo`, `$${project.verification.annual_upfront} annual upfront`)}
</div>
<div class="grid grid-main-side">
  <section class="card" aria-labelledby="next-h">
    <span class="eyebrow">Next turn</span>
    <h2 id="next-h">Plan the foundation</h2>
    <p>The next working session enters plan mode with the <a href="${ctx.rel}docs/foundation-planning-brief.html">foundation planning brief</a>: complete SC-001, build the private operations shell (SC-005) and prepare local Ghost groundwork for SC-002 to SC-004. Foundation tickets estimate <strong>${d.foundation.low}–${d.foundation.high} h</strong>.</p>
    <p>Before building, the founders need answers on repository visibility, runtime and hosting, the TypeScript line, the social channels, and who owns which accounts. The brief lists every question with a recommendation.</p>
    <p><a href="${ctx.rel}docs/kit-audit.html">Kit audit</a> · <a href="${ctx.rel}docs/implementation-status.html">Implementation status</a> · <a href="${ctx.rel}backlog.html">Backlog and critical path</a></p>
  </section>
  <section class="card" aria-labelledby="session-h">
    <span class="eyebrow">Current session</span>
    <h2 id="session-h">${esc(session.id)}: ${esc(session.title)}</h2>
    <p>${esc(session.summary ?? '')}</p>
    <p><strong>Version</strong> ${esc(session.version)} · <strong>Branch</strong> <code class="id">${esc(session.branch)}</code><br><strong>Started</strong> ${esc(displayInZone(session.startedAt))}</p>
  </section>
</div>
<h2>Sprint shape</h2>
<div class="grid grid-2">
  ${effortChart(d.windows)}
  ${costChart(costs.items)}
</div>
<p class="viz-note">Optional, outside the operating range: ${costs.optional.map((o) => `${esc(o.label)} ($${o.low}${o.high > o.low ? `–${o.high}` : ''}/mo)`).join('; ')}. Development at an illustrative $100/h would be $${(d.hours.totalLow * 100).toLocaleString('en-US')}–$${(d.hours.totalHigh * 100).toLocaleString('en-US')}; that is arithmetic, not a quote.</p>
<div class="grid grid-2">
  <section aria-labelledby="log-h">
    <h2 id="log-h">Latest dev log</h2>
    ${latest.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">Entry</th><th scope="col">Recorded</th><th scope="col">Status</th></tr></thead><tbody>${latest.map((e) => `<tr><td><a href="${ctx.rel}devlog/${esc(ctx.devlogSlug(e))}.html">${esc(e.title)}</a><br><span class="id">${esc(e.id)} · ${esc(e.session)} · v${esc(e.version)}</span></td><td>${esc(displayInZone(e.recordedAt))}</td><td>${badge(e.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No entries yet.</p>'}
  </section>
  <section aria-labelledby="packet-h">
    <h2 id="packet-h">Founder packet</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">File</th><th scope="col">Contents</th></tr></thead><tbody>${packet.map(([f, desc]) => `<tr><td><a href="${esc(ctx.githubBlob(`packet/${f}`))}">${esc(f)}</a></td><td>${esc(desc)}</td></tr>`).join('')}</tbody></table></div>
    <p class="viz-note">Originals are preserved byte-for-byte with SHA-256 checksums in packet/SHA256SUMS. The Markdown sources render under <a href="${ctx.rel}docs/index.html">Docs</a>.</p>
  </section>
</div>`;
}

export function backlogPage(project, ctx) {
  const d = project.derived;
  const cp = new Set(d.criticalPath.high.path);
  const windows = d.windows
    .map((w) => {
      const cards = project.tickets
        .filter((t) => w.tickets.includes(t.id))
        .map((t) => {
          const ev = evidenceLinks(project, t.id, ctx.rel);
          return `<article class="ticket${cp.has(t.id) ? ' is-critical' : ''}" id="${t.id}">
            <div class="ticket-head"><span class="id">${t.id} · ${t.priority}${cp.has(t.id) ? ' · critical path' : ''}</span>${badge(t.status)}</div>
            <h3>${esc(t.title)}</h3>
            <p>${esc(t.scope)}</p>
            <dl>
              <dt>Estimate</dt><dd>${t.hoursLow}–${t.hoursHigh} h</dd>
              <dt>Depends on</dt><dd>${t.dependencies.map((x) => `<a href="#${x}">${x}</a>`).join(', ') || 'Nothing'}</dd>
              <dt>Owner</dt><dd>${esc(t.owner)}</dd>
              ${ev ? `<dt>Evidence</dt><dd>${ev}</dd>` : ''}
            </dl>
            <details><summary>Acceptance criteria (${t.acceptance.length})</summary><ul>${t.acceptance.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
          </article>`;
        })
        .join('');
      return `<section class="window" aria-labelledby="${w.id}-h">
        <div class="window-head"><h2 id="${w.id}-h">${esc(w.label)}</h2><span class="meta">${w.low}–${w.high} h estimated · ${w.capacity} h capacity${w.reserve ? ` · plus ${w.reserve} h reserve` : ''}</span></div>
        <div class="tickets">${cards}</div>
      </section>`;
    })
    .join('');
  return `
<div class="page-head">
  <span class="eyebrow">planning/BACKLOG.json · ${project.tickets.length} tickets</span>
  <h1>Backlog and critical path</h1>
  <p class="lede">Dependencies in the backlog are authoritative; day ranges are a planning envelope. Status changes only with evidence.</p>
</div>
<div class="kpis">
  ${tile('Ticket hours', `${d.hours.low}–${d.hours.high} h`, `+ ${d.hours.reserve} h reserve`)}
  ${tile('Critical path', `${d.criticalPath.low.hours}–${d.criticalPath.high.hours} h`, `${d.criticalPath.high.path.length} tickets in sequence`)}
  ${tile('Foundation (SC-001–005)', `${d.foundation.low}–${d.foundation.high} h`, 'Scope for the next plan')}
  ${tile('In progress', `${d.ticketStatusCounts.in_progress ?? 0}`, `${d.ticketStatusCounts.done ?? 0} done`)}
</div>
<div class="grid">
${dependencyGraph(project.tickets, d.depth, d.criticalPath.high, { statusLabel: (s) => TICKET_STATUS_LABEL[s] ?? s })}
${effortChart(d.windows, { id: 'effort-backlog' })}
</div>
${windows}`;
}

export function acceptancePage(project) {
  const rows = project.acceptance
    .map(
      (x) =>
        `<tr id="${x.id}"><td class="id">${x.id}</td><td>${esc(x.scenario)}</td><td>${esc(x.outcome)}</td><td>${badge(x.status)}</td><td>${evidenceLinks(project, x.id, '') || '—'}</td></tr>`,
    )
    .join('');
  const counts = project.derived.acceptanceStatusCounts;
  return `
<div class="page-head">
  <span class="eyebrow">docs/ACCEPTANCE_TESTS.md</span>
  <h1>Acceptance scenarios</h1>
  <p class="lede">Twenty-six planned checks. A scenario moves from UNRUN only with an evidence record naming the date, environment, commit, operator, steps and observed result.</p>
</div>
<div class="kpis">
  ${['UNRUN', 'PASS', 'FAIL', 'BLOCKED'].map((s) => tile(s, `${counts[s] ?? 0}`, null)).join('')}
</div>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table>
  <caption class="visually-hidden">Acceptance scenarios and their status</caption>
  <thead><tr><th scope="col">ID</th><th scope="col">Scenario</th><th scope="col">Required observed outcome</th><th scope="col">Status</th><th scope="col">Evidence</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p class="viz-note">Evidence record per test (docs/ACCEPTANCE_TESTS.md): date, environment, commit, operator, steps, observed result, evidence location, defect ID if any. Test production-affecting actions with test destinations first.</p>`;
}

export function decisionsPage(project, ctx) {
  const rows = project.decisions
    .map(
      (x) =>
        `<tr><td class="id">${esc(x.id)}</td><td><strong>${esc(x.decision)}</strong><br>${esc(x.choice)}</td><td>${esc(x.owner)}</td><td>${esc(x.needed_by)}</td><td>${badge(x.status)}</td></tr>`,
    )
    .join('');
  const adrs = project.adrs
    .map((a) => {
      const n = /ADR-(\d+)/.exec(a.file)?.[1];
      return `<tr><td class="id">ADR-${n}</td><td><a href="${ctx.rel}docs/adr-${n}.html">${esc(a.title)}</a></td><td>${esc(a.date)}</td><td>${badge(a.status)}<br><span class="tile-note">${esc(a.statusText)}</span></td></tr>`;
    })
    .join('');
  return `
<div class="page-head">
  <span class="eyebrow">planning/WORKBOOK_DECISIONS.json · decisions/</span>
  <h1>Decisions</h1>
  <p class="lede">Founder decisions stay Proposed until the founders decide. Engineering decisions are recorded as ADRs; product-shaping ADRs remain proposals for founder confirmation.</p>
</div>
<h2>Founder decisions</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table>
  <caption class="visually-hidden">Founder decisions</caption>
  <thead><tr><th scope="col">ID</th><th scope="col">Decision and proposed choice</th><th scope="col">Owner</th><th scope="col">Needed by</th><th scope="col">Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<h2>Architecture decision records</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table>
  <caption class="visually-hidden">Architecture decision records</caption>
  <thead><tr><th scope="col">ADR</th><th scope="col">Title</th><th scope="col">Date</th><th scope="col">Status</th></tr></thead>
  <tbody>${adrs}</tbody>
</table></div>
<p>Open questions for the next plan, each with a recommendation, are in the <a href="${ctx.rel}docs/foundation-planning-brief.html#questions-for-plan-mode">foundation planning brief</a>.</p>`;
}

export function editorialPage(project, sources) {
  const sections = tableObjects(
    extractTables(sources.launchPacket).find(
      (t) => t.header[0] === 'Section' && t.header[1] === 'Editorial purpose',
    ),
  );
  const rhythm = tableObjects(
    extractTables(sources.playbook).find(
      (t) => t.header[0] === 'Day' && t.header.includes('Completion condition'),
    ),
  );
  const weeks = project.calendar
    .map(
      (w) => `<article class="ticket">
        <div class="ticket-head"><span class="id">Week ${w.week} · ${esc(w.content_id)}</span>${badge('not_commissioned')}</div>
        <h3>${esc(w.title)}</h3>
        <p>${esc(w.reader_question)}</p>
        <dl>
          <dt>Section</dt><dd>${esc(w.section)}</dd>
          <dt>Format</dt><dd>${esc(w.format)}</dd>
          <dt>Owner</dt><dd>${esc(w.owner)}</dd>
          <dt>Effort</dt><dd>${w.estimated_hours_min}–${w.estimated_hours_max} h</dd>
        </dl>
        <details><summary>Sources, newsletter, social, podcast</summary><ul>
          <li><strong>Sources:</strong> ${esc(w.source_requirements)}</li>
          <li><strong>Newsletter:</strong> ${esc(w.newsletter)}</li>
          <li><strong>Social:</strong> ${esc(w.social)}</li>
          <li><strong>Podcast:</strong> ${esc(w.podcast)}</li>
        </ul></details>
      </article>`,
    )
    .join('');
  return `
<div class="page-head">
  <span class="eyebrow">editorial/ · first six weeks</span>
  <h1>Editorial plan</h1>
  <p class="lede">One useful original feature and one concise dispatch a week, with up to three social treatments per channel. Working titles are commissioning ideas, not reported findings.</p>
</div>
<div class="grid grid-2">
  <section class="card"><h2>Six launch sections</h2><div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">Section</th><th scope="col">Editorial purpose</th></tr></thead><tbody>${sections.map((s) => `<tr><th scope="row">${esc(s.Section)}</th><td>${esc(s['Editorial purpose'])}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="card"><h2>Weekly rhythm</h2><div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">Day</th><th scope="col">Work</th><th scope="col">Done when</th></tr></thead><tbody>${rhythm.map((r) => `<tr><th scope="row">${esc(r.Day)}</th><td>${esc(r.Work)}</td><td>${esc(r['Completion condition'])}</td></tr>`).join('')}</tbody></table></div>
  <p class="viz-note">Format labels: Reported feature · Explainer · Interview · First-person account · Opinion · Sponsored contribution. Planning timezone America/New_York until the founders choose otherwise.</p></section>
</div>
<h2>Six-week commissioning plan</h2>
<div class="tickets">${weeks}</div>`;
}

export function codexPage(tokens, ctx) {
  const { themes, status } = resolveTokens(tokens);
  const report = contrastReport(tokens);
  const brand = Object.entries(tokens.color.brand).map(([k, v]) => ({ name: k, ...v }));
  const chipText = (hex) =>
    contrastRatio('#F3EFE5', hex) >= contrastRatio('#102B3A', hex) ? '#F3EFE5' : '#102B3A';
  const swatch = (name, hex, desc) => `<div class="swatch">
    <div class="swatch-chip" style="background:${hex};color:${chipText(hex)}">Aa</div>
    <div class="swatch-body"><strong>${esc(name)}</strong><code>${hex}</code><br>${esc(desc ?? '')}</div></div>`;
  const pairs = report
    .map(
      (p) =>
        `<tr><td>${esc(p.theme)}</td><td>${esc(p.use)}</td><td><code>${esc(p.text)}</code> ${p.fg}</td><td><code>${esc(p.on)}</code> ${p.bg}</td><td class="num">${p.ratio.toFixed(2)}:1</td><td class="num">${p.lc.toFixed(0)}</td><td>${p.min >= 4.5 ? 'AA text' : '3:1 large/UI'}</td><td>${badge(p.pass ? 'pass' : 'fail')}</td></tr>`,
    )
    .join('');
  return `
<div class="page-head">
  <span class="eyebrow">brand/tokens.json · visual codex entry</span>
  <h1>Working Waterfront: visual codex</h1>
  <p class="lede">An independent trade journal with maritime character: credible on a buying desk, inviting at a kitchen table. Version 0.1 for founder review; the tokens below are the single source for this hub and future surfaces.</p>
</div>
<figure class="concept">
  <img src="${ctx.rel}assets/brand-concept-1536.jpg" srcset="${ctx.rel}assets/brand-concept-768.jpg 768w, ${ctx.rel}assets/brand-concept-1536.jpg 1536w" sizes="(min-width: 1180px) 1130px, 100vw" width="1536" height="1024" alt="Concept board: a heavy serif SEAFOOD CONFIDENTIAL wordmark with the tagline 'Seafood, from the people who know it', an SC monogram, an illustrated harbor with a fishing boat, net pens and oyster cages, podcast and social cover variants, and four color swatches.">
  <figcaption>Brand concept from the founder packet: an AI-generated visual exploration, not production artwork or documentary photography (editorial/BRAND_GUIDE.md).</figcaption>
</figure>
<h2>Brand colors</h2>
<div class="swatches">${brand.map((b) => swatch(b.name, b.$value, b.$description)).join('')}</div>
<div class="notice" role="note" style="margin-top:18px">${badge('info')}<p><strong>Computed, not assumed.</strong> Rust on salt measures 4.46:1, just under WCAG AA for body text, so small rust text uses <code>rust-text</code> ${themes.light['accent-text']}. Sea glass on salt measures 2.36:1: decorative only on paper, but 5.43:1 on ink.</p></div>
<h2>Theme roles</h2>
<div class="grid grid-2">
  <div class="swatches">${Object.entries(themes.light)
    .map(([k, v]) => swatch(`light · ${k}`, v, ''))
    .join('')}</div>
  <div class="swatches">${Object.entries(themes.dark)
    .map(([k, v]) => swatch(`dark · ${k}`, v, ''))
    .join('')}</div>
</div>
<h2>Contrast assertions</h2>
<p>The hub build fails if any pair below drops under its minimum. WCAG 2.2 ratios are normative here; APCA Lc is shown for reference (positive: dark on light).</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table>
  <thead><tr><th scope="col">Theme</th><th scope="col">Use</th><th scope="col">Text</th><th scope="col">On</th><th scope="col">Ratio</th><th scope="col">APCA Lc</th><th scope="col">Requirement</th><th scope="col">Result</th></tr></thead>
  <tbody>${pairs}</tbody>
</table></div>
<h2>Type</h2>
<div class="grid grid-2">
  <div class="card"><p class="specimen">Seafood<br>Confidential</p><p class="specimen-italic">Seafood, from the people who know it.</p><p class="viz-note">Fraunces variable, weight 860, SOFT 0, WONK 0, optical size 144 for the masthead; italic at optical size 36 for the tagline. SIL OFL 1.1, self-hosted.</p></div>
  <div class="card"><p style="font-size:1.25rem;margin-top:0">Explain the trade term that matters, then use it accurately.</p><p>Source Sans 3 variable carries body text, interface and every chart figure, including large numbers, which use proportional figures; tables use tabular figures. SIL OFL 1.1, self-hosted.</p><p class="viz-note">Fallbacks: Iowan Old Style, Palatino, Georgia for display; system-ui for text.</p></div>
</div>
<h2>Charts and status</h2>
<div class="grid grid-2">
  <div class="card"><ul class="viz-legend" style="flex-direction:column;gap:8px">
    <li><span class="key key-mark"></span><code>mark</code>: primary mark (harbor)</li>
    <li><span class="key key-mark-range"></span><code>mark-range</code>: estimate range, a lighter step of the same ramp; values always also in labels or the table view</li>
    <li><span class="key key-mark-reserve"></span><code>sea</code>: reserve or secondary context</li>
    <li><span class="key key-critical"></span><code>accent</code>: the one emphasized path or series (emphasis form)</li>
    <li><span class="key key-capacity"></span><code>ink</code>: reference lines such as capacity</li>
  </ul><p class="viz-note">Method: thin marks of 24px or less, one baseline, solid hairline grid, legend for two or more series, selective direct labels, a table view for every chart, no dual axes.</p></div>
  <div class="card"><p>${['planned', 'in_progress', 'done', 'blocked', 'UNRUN', 'PASS', 'FAIL', 'Discussing', 'Deferred'].map((s) => badge(s)).join(' &nbsp; ')}</p><p class="viz-note">Status colors are fixed (good ${status.good}, warning ${status.warning}, serious ${status.serious}, critical ${status.critical}) and always carry an icon and a label. Work in progress uses harbor, not a status color.</p></div>
</div>
<h2>Motif: bathymetry</h2>
<p>The masthead's moving contour field draws nautical depth contours in sea glass on ink, with every fifth line as an index contour. It is WebGL2 with a CSS fallback. It renders one static frame for reduced-motion users, pauses offscreen and in background tabs, and caps the pixel ratio for battery. A gradient scrim keeps the wordmark at full contrast. The motif is ready to reuse in a Ghost theme header or a newsletter banner as a rendered still.</p>
<p class="viz-note">Sources: <a href="${ctx.rel}docs/brand-guide.html">brand guide</a> · <a href="${esc(ctx.githubBlob('brand/tokens.json'))}">brand/tokens.json</a> · <a href="${esc(ctx.githubBlob('.claude/skills/sc-visual-codex/SKILL.md'))}">project skill: sc-visual-codex</a> · <a href="${esc(ctx.githubBlob('tools/hub/assets/shaders/bathymetry.frag'))}">bathymetry.frag</a></p>`;
}

export function docsIndexPage(index, ctx) {
  return `
<div class="page-head">
  <span class="eyebrow">Rendered from the repository</span>
  <h1>Documentation</h1>
  <p class="lede">Every specification, decision, template and policy in the repository, rendered for reading. GitHub remains the place to edit them.</p>
</div>
<div class="grid grid-3">${index.groups
    .map(
      (g) =>
        `<section class="card"><h2>${esc(g.title)}</h2><ul>${g.docs.map((d) => `<li><a href="${d.slug}.html">${esc(d.title)}</a></li>`).join('')}</ul></section>`,
    )
    .join('')}</div>`;
}

export function docPage(doc, html, index, ctx) {
  const nav = index.groups
    .map(
      (g) =>
        `<h2>${esc(g.title)}</h2><ul>${g.docs.map((d) => `<li><a href="${d.slug}.html"${d.slug === doc.slug ? ' aria-current="page"' : ''}>${esc(d.title)}</a></li>`).join('')}</ul>`,
    )
    .join('');
  return `<div class="docs-layout">
  <nav class="docs-nav" aria-label="Documents">${nav}</nav>
  <article class="prose">${html}
    <p class="doc-source">Source: <a href="${esc(ctx.githubBlob(doc.src))}">${esc(doc.src)}</a> on <code>${esc(ctx.build.branch)}</code>.</p>
  </article>
</div>`;
}

export function devlogIndexPage(project, ctx) {
  const rows = project.devlog
    .map(
      (e) =>
        `<tr><td><a href="${esc(ctx.devlogSlug(e))}.html">${esc(e.title)}</a><br><span class="id">${esc(e.id)}</span></td><td>${esc(e.session)} · turn ${esc(e.turn)}</td><td>v${esc(e.version)}</td><td>${esc(displayInZone(e.recordedAt))}</td><td>${esc(e.status)}</td></tr>`,
    )
    .join('');
  const sessions = project.sessions
    .map(
      (s) =>
        `<tr><td class="id">${esc(s.id)}</td><td>${esc(s.title)}</td><td>v${esc(s.version)}</td><td><code class="id">${esc(s.branch)}</code></td><td>${esc(displayInZone(s.startedAt))}</td><td>${esc(s.status)}</td><td>${s.pullRequest ? `<a href="${esc(s.pullRequest)}">PR</a>` : '—'}</td></tr>`,
    )
    .join('');
  return `
<div class="page-head">
  <span class="eyebrow">devlog/ · devtrack/</span>
  <h1>Dev log</h1>
  <p class="lede">A timestamped record of every working turn: what changed, what broke, what was observed, and what comes next. Times are America/New_York.</p>
</div>
<h2>Entries</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">Entry</th><th scope="col">Session</th><th scope="col">Version</th><th scope="col">Recorded</th><th scope="col">Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No entries yet.</td></tr>'}</tbody></table></div>
<h2>Sessions</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Version</th><th scope="col">Branch</th><th scope="col">Started</th><th scope="col">Status</th><th scope="col">Pull request</th></tr></thead><tbody>${sessions}</tbody></table></div>
<p><a href="evidence.html">Evidence log (${project.evidence.length} records)</a></p>`;
}

export function devlogEntryPage(entry, html, project) {
  const ev = (entry.evidence ?? []).map((id) => project.evidence.find((e) => e.id === id)).filter(Boolean);
  const meta = [
    ['Entry', entry.id],
    ['Session', `${entry.session}, turn ${entry.turn}`],
    ['Version', entry.version],
    ['Branch', entry.branch],
    ['Base commit', String(entry.baseCommit).slice(0, 12)],
    ['Started', displayInZone(entry.startedAt)],
    ['Recorded', displayInZone(entry.recordedAt)],
    ['Tickets', (entry.tickets ?? []).join(', ') || '—'],
    ['Workstreams', (entry.workstreams ?? []).join(', ') || '—'],
    ['Status', entry.status],
  ];
  return `<article class="prose" style="max-width:none">
  <div class="table-wrap" tabindex="0" role="region" aria-label="Entry details" style="max-width:78ch"><table><tbody>${meta.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
  <div style="max-width:78ch">${html}</div>
  ${ev.length ? `<h2>Evidence referenced</h2><div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">ID</th><th scope="col">Result</th><th scope="col">Summary</th><th scope="col">Observed</th></tr></thead><tbody>${ev.map((e) => `<tr><td class="id"><a href="evidence.html#${e.id}">${e.id}</a></td><td>${badge(e.result)}</td><td>${esc(e.summary)}</td><td>${esc(e.observed)}</td></tr>`).join('')}</tbody></table></div>` : ''}
</article>`;
}

export function evidencePage(project) {
  const rows = [...project.evidence]
    .reverse()
    .map(
      (e) =>
        `<tr id="${e.id}"><td class="id">${e.id}<br>${esc(e.session)}</td><td>${esc(displayDate(e.recordedAt))}<br><span class="tile-note">${esc(e.recordedAt)}</span></td><td>${e.subjects.map(esc).join(', ')}<br><span class="tile-note">${esc(e.kind)}</span></td><td>${badge(e.result)}</td><td><strong>${esc(e.summary)}</strong><br><span class="tile-note">Steps:</span> ${esc(e.steps)}<br><span class="tile-note">Observed:</span> ${esc(e.observed)}<br><span class="tile-note">Environment:</span> ${esc(e.environment)} · <span class="tile-note">Commit:</span> <code>${esc(e.commit.slice(0, 20))}</code>${e.location ? ` · <span class="tile-note">Location:</span> ${esc(e.location)}` : ''}</td></tr>`,
    )
    .join('');
  return `
<div class="page-head">
  <span class="eyebrow">devtrack/evidence.json</span>
  <h1>Evidence log</h1>
  <p class="lede">Append-only observations backing every status claim. A ticket becomes done, or a scenario PASS, only through a record here.</p>
</div>
<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr><th scope="col">ID</th><th scope="col">Recorded</th><th scope="col">Subjects</th><th scope="col">Result</th><th scope="col">Record</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
