// Charts for the hub, following the dataviz method: thin marks (≤ 24px), one baseline, solid hairline
// grids, a legend for ≥ 2 series plus selective direct labels, values never gated behind hover (every
// chart ships a table-view twin), text in text tokens, status as icon + label.
//
// Bar charts are HTML/CSS: bars scale with the container while text stays at real CSS sizes on every
// screen (SVG text would shrink or grow with the viewBox). The dependency graph is SVG in a scroll region.
import { escapeHtml as esc } from './html.mjs';

const fmtH = (n) => `${n} h`;
const pct = (v, max) => `${((v / max) * 100).toFixed(3)}%`;

/** Effort range (low → high) per sprint window against an 8 h/day capacity marker. */
export function effortChart(windows, { id = 'effort' } = {}) {
  const max =
    Math.ceil(Math.max(...windows.map((w) => Math.max(w.high + (w.reserve ?? 0), w.capacity))) / 10) * 10;
  const rows = windows.map((w) => {
    const over = w.high - w.capacity;
    const tip = `${w.label}: ${w.tickets.join(', ')}. Estimate ${w.low}–${w.high} h${w.reserve ? ` plus ${w.reserve} h reserve` : ''}; capacity ${w.capacity} h.`;
    const segments = [
      `<span class="hbar-seg hbar-mark${w.high > w.low || w.reserve ? '' : ' is-end'}" style="left:0;width:${pct(w.low, max)}"></span>`,
    ];
    if (w.high > w.low)
      segments.push(
        `<span class="hbar-seg hbar-range${w.reserve ? '' : ' is-end'}" style="left:calc(${pct(w.low, max)} + 2px);width:calc(${pct(w.high - w.low, max)} - 2px)"></span>`,
      );
    if (w.reserve)
      segments.push(
        `<span class="hbar-seg hbar-reserve is-end" style="left:calc(${pct(w.high, max)} + 2px);width:calc(${pct(w.reserve, max)} - 2px)"></span>`,
      );
    return `<div class="hbar" role="listitem" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
      <div class="hbar-label"><span class="hbar-name">${esc(w.label)}</span><span class="hbar-sub">${esc(w.tickets[0])}${w.tickets.length > 1 ? `–${esc(w.tickets.at(-1))}` : ''}</span></div>
      <div class="hbar-track" style="--ticks:${max / 10}" aria-hidden="true">${segments.join('')}<span class="hbar-ref" style="left:${pct(w.capacity, max)}"></span></div>
      <div class="hbar-value">${w.low}–${w.high} h${w.reserve ? ` + ${w.reserve}` : ''}${over > 0 ? `<span class="hbar-flag">▲ ${over} h over at high</span>` : ''}</div>
    </div>`;
  });
  const table = `<table class="data-table">
    <caption class="visually-hidden">Effort by sprint window</caption>
    <thead><tr><th scope="col">Window</th><th scope="col">Tickets</th><th scope="col">Low</th><th scope="col">High</th><th scope="col">Reserve</th><th scope="col">Capacity</th><th scope="col">Headroom at high</th></tr></thead>
    <tbody>${windows
      .map((w) => {
        const headroom = w.capacity - w.high - (w.reserve ?? 0);
        return `<tr><th scope="row">${esc(w.label)}</th><td>${w.tickets.join(', ')}</td><td class="num">${fmtH(w.low)}</td><td class="num">${fmtH(w.high)}</td><td class="num">${w.reserve ? fmtH(w.reserve) : '—'}</td><td class="num">${fmtH(w.capacity)}</td><td class="num">${headroom < 0 ? '−' : ''}${fmtH(Math.abs(headroom))}</td></tr>`;
      })
      .join('')}</tbody></table>`;
  return figure({
    id,
    title: 'Estimated effort per sprint window',
    subtitle: 'Hours, low to high estimate, against 8 h/day capacity for one developer',
    legend: [
      ['mark', 'Low estimate'],
      ['mark-range', 'Range to high estimate'],
      ['mark-reserve', 'Delivery reserve'],
      ['capacity', 'Window capacity'],
    ],
    body: `<div class="hbars" role="list" aria-label="Effort by sprint window">${rows.join('')}${axis(max, (v) => v)}</div>`,
    table,
    note: 'Day ranges are the planning envelope from docs/SPRINT_PLAN.md; dependencies, not days, are authoritative.',
  });
}

/** Ranked horizontal bars of monthly-equivalent cost; allowances drawn as low + range. */
export function costChart(items, { id = 'costs' } = {}) {
  const max = Math.ceil(Math.max(...items.map((i) => i.high)) / 10) * 10;
  const money = (it) => (it.low === it.high ? `$${it.low}` : `$${it.low}–${it.high}`);
  const rows = items.map((it) => {
    const tip = `${it.label}: ${money(it)} per month equivalent (${it.basis}).`;
    const range = it.high > it.low;
    return `<div class="hbar hbar-wide" role="listitem" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
      <div class="hbar-label"><span class="hbar-name">${esc(it.label)}</span></div>
      <div class="hbar-track" style="--ticks:${max / 10}" aria-hidden="true"><span class="hbar-seg hbar-mark${range ? '' : ' is-end'}" style="left:0;width:${pct(it.low, max)}"></span>${range ? `<span class="hbar-seg hbar-range is-end" style="left:calc(${pct(it.low, max)} + 2px);width:calc(${pct(it.high - it.low, max)} - 2px)"></span>` : ''}</div>
      <div class="hbar-value">${money(it)}</div>
    </div>`;
  });
  const table = `<table class="data-table"><caption class="visually-hidden">Monthly operating cost by line item</caption>
    <thead><tr><th scope="col">Line item</th><th scope="col">Monthly equivalent</th><th scope="col">Billing basis</th></tr></thead>
    <tbody>${items.map((it) => `<tr><th scope="row">${esc(it.label)}</th><td class="num">${money(it).replace('–', '–$')}</td><td>${esc(it.basis)}</td></tr>`).join('')}</tbody></table>`;
  return figure({
    id,
    title: 'Proposed monthly operating cost',
    subtitle: 'USD, monthly equivalent, ranked by high value; allowances shown as a range',
    legend: [
      ['mark', 'Committed or low value'],
      ['mark-range', 'Allowance range to high value'],
    ],
    body: `<div class="hbars" role="list" aria-label="Monthly operating cost by line item">${rows.join('')}${axis(max, (v) => `$${v}`, 'hbar-wide')}</div>`,
    table,
    note: 'Prices checked 17 November 2026 and re-checked 18 November 2026. Taxes, labor, equipment, theme purchases and overages excluded.',
  });
}

function axis(max, fmt, extra = '') {
  const ticks = [];
  for (let v = 0; v <= max; v += 10) ticks.push(`<span style="left:${pct(v, max)}">${fmt(v)}</span>`);
  return `<div class="hbar hbar-axis ${extra}" aria-hidden="true"><div></div><div class="hbar-ticks">${ticks.join('')}</div><div></div></div>`;
}

/** Wrap a title into at most two lines of `width` characters, with an ellipsis if it overflows. */
function twoLines(text, width = 21) {
  const words = text.split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if (`${cur} ${w}`.length <= width) lines[lines.length - 1] = `${cur} ${w}`;
    else if (lines.length < 2) lines.push(w);
    else {
      lines[1] = `${lines[1]} ${w}`;
      break;
    }
  }
  if (lines[1] && lines[1].length > width) lines[1] = `${lines[1].slice(0, width - 1).trimEnd()}…`;
  if (lines[0].length > width) lines[0] = `${lines[0].slice(0, width - 1)}…`;
  return lines;
}

/**
 * Layered dependency graph with the critical path emphasised (emphasis form: one accent, rest muted).
 * Columns are dependency depth; rows within a column are ordered by the barycentre heuristic (a few
 * down/up sweeps) to reduce edge crossings.
 */
export function dependencyGraph(tickets, depth, critical, { id = 'deps', statusLabel = (s) => s } = {}) {
  const colW = 156;
  const nodeW = 140;
  const nodeH = 60;
  const gapY = 16;
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const children = new Map(tickets.map((t) => [t.id, []]));
  for (const t of tickets) for (const d of t.dependencies) children.get(d).push(t.id);
  const cols = [];
  for (const t of tickets) (cols[depth.get(t.id)] ??= []).push(t.id);
  const maxRows = Math.max(...cols.map((c) => c.length));
  const height = maxRows * (nodeH + gapY) + gapY;
  const yOf = new Map();
  const place = () =>
    cols.forEach((list) => {
      const offset = (height - list.length * (nodeH + gapY)) / 2;
      list.forEach((tid, i) => yOf.set(tid, offset + i * (nodeH + gapY) + gapY / 2));
    });
  place();
  const bary = (ids) => ids.reduce((n, x) => n + yOf.get(x), 0) / ids.length;
  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (let d = 1; d < cols.length; d += 1) {
      cols[d].sort(
        (a, b) => bary(byId.get(a).dependencies) - bary(byId.get(b).dependencies) || a.localeCompare(b),
      );
      place();
    }
    for (let d = cols.length - 2; d >= 0; d -= 1) {
      cols[d].sort((a, b) => {
        const ca = children.get(a);
        const cb = children.get(b);
        return (
          (ca.length ? bary(ca) : yOf.get(a)) - (cb.length ? bary(cb) : yOf.get(b)) || a.localeCompare(b)
        );
      });
      place();
    }
  }
  const width = cols.length * colW - (colW - nodeW) + 16;
  const xOf = (tid) => depth.get(tid) * colW + 8;
  const onPath = new Set(critical.path);
  const criticalEdge = (a, b) => {
    const i = critical.path.indexOf(a);
    return i !== -1 && critical.path[i + 1] === b;
  };
  const edges = [];
  for (const t of tickets)
    for (const dep of t.dependencies) {
      const x1 = xOf(dep) + nodeW;
      const y1 = yOf.get(dep) + nodeH / 2;
      const x2 = xOf(t.id);
      const y2 = yOf.get(t.id) + nodeH / 2;
      const mx = (x1 + x2) / 2;
      edges.push(
        `<path class="dep-edge${criticalEdge(dep, t.id) ? ' is-critical' : ''}" data-from="${dep}" data-to="${t.id}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" />`,
      );
    }
  // Draw critical edges last so they sit above the muted ones.
  edges.sort((a, b) => Number(a.includes('is-critical')) - Number(b.includes('is-critical')));
  const nodes = tickets.map((t) => {
    const [l1, l2] = twoLines(t.title);
    const tip = `${t.id} ${t.title}. ${statusLabel(t.status)}. ${t.hoursLow}–${t.hoursHigh} h. Depends on: ${t.dependencies.join(', ') || 'nothing'}.`;
    return `<g class="dep-node${onPath.has(t.id) ? ' is-critical' : ''} status-${t.status}" data-id="${t.id}" tabindex="0" role="listitem" aria-label="${esc(tip)}" data-tip="${esc(tip)}" transform="translate(${xOf(t.id)},${yOf.get(t.id)})">
      <rect width="${nodeW}" height="${nodeH}" rx="8" />
      <text class="dep-id" x="11" y="19">${t.id}<tspan class="dep-hours" dx="7">${t.hoursLow}–${t.hoursHigh} h</tspan></text>
      <text class="dep-title" x="11" y="37">${esc(l1)}</text>
      ${l2 ? `<text class="dep-title" x="11" y="51">${esc(l2)}</text>` : ''}
    </g>`;
  });
  const table = `<table class="data-table"><caption class="visually-hidden">Ticket dependencies</caption>
    <thead><tr><th scope="col">Ticket</th><th scope="col">Depends on</th><th scope="col">Hours</th><th scope="col">On critical path</th></tr></thead>
    <tbody>${tickets.map((t) => `<tr><th scope="row">${t.id} ${esc(t.title)}</th><td>${t.dependencies.join(', ') || '—'}</td><td class="num">${t.hoursLow}–${t.hoursHigh}</td><td>${onPath.has(t.id) ? 'Yes' : '—'}</td></tr>`).join('')}</tbody></table>`;
  return figure({
    id,
    title: 'Dependency graph and critical path',
    subtitle: `Critical path at high estimates: ${critical.path.join(' → ')} (${critical.hours} h of work in sequence)`,
    legend: [
      ['critical', 'Critical path'],
      ['edge', 'Other dependency'],
      ['progress', 'In progress (outline)'],
    ],
    body: `<p class="scroll-hint">Scroll sideways to see the whole graph →</p><div class="scroll-x" tabindex="0" role="region" aria-label="Dependency graph, scrollable"><svg class="viz viz-deps" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="list" aria-label="Dependency graph of ${tickets.length} tickets">${edges.join('')}${nodes.join('')}</svg></div>`,
    table,
    note: 'With one developer the schedule is bounded by total effort; the critical path shows how much a second contributor could compress calendar time. Hover or focus a ticket to highlight its dependencies.',
  });
}

function figure({ id, title, subtitle, legend, body, table, note }) {
  const keys = legend
    .map(([k, label]) => `<li><span class="key key-${k}" aria-hidden="true"></span>${esc(label)}</li>`)
    .join('');
  return `<figure class="viz-figure" id="${id}">
    <figcaption>
      <span class="viz-title">${esc(title)}</span>
      <span class="viz-subtitle">${esc(subtitle)}</span>
    </figcaption>
    <ul class="viz-legend" aria-label="Legend">${keys}</ul>
    ${body}
    <details class="viz-table"><summary>Table view</summary><div class="table-wrap" tabindex="0" role="region" aria-label="Chart data table">${table}</div></details>
    ${note ? `<p class="viz-note">${esc(note)}</p>` : ''}
  </figure>`;
}
