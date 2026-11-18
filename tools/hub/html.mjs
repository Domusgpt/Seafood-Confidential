// HTML helpers shared by the hub renderers.
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** GitHub-style heading slug. */
export const headingSlug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

const ICONS = {
  planned: '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  ready:
    '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
  in_progress:
    '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/>',
  blocked:
    '<circle cx="8" cy="8" r="6" fill="currentColor"/><rect x="4.5" y="7" width="7" height="2" fill="var(--surface)"/>',
  done: '<circle cx="8" cy="8" r="6" fill="currentColor"/><path d="M5 8.2l2 2 4-4.4" fill="none" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  fail: '<circle cx="8" cy="8" r="6" fill="currentColor"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round"/>',
  discussing:
    '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5H8z" fill="currentColor"/>',
  deferred: '<rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor"/>',
  info: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="7.2" y="7" width="1.6" height="4.5" fill="currentColor"/><circle cx="8" cy="4.9" r="1" fill="currentColor"/>',
};

const STATUS_MAP = {
  // kit tickets
  planned: ['planned', 'neutral', 'Planned'],
  ready: ['ready', 'progress', 'Ready'],
  in_progress: ['in_progress', 'progress', 'In progress'],
  blocked: ['blocked', 'critical', 'Blocked'],
  done: ['done', 'good', 'Done'],
  // acceptance
  UNRUN: ['planned', 'neutral', 'UNRUN'],
  BLOCKED: ['blocked', 'serious', 'BLOCKED'],
  PASS: ['done', 'good', 'PASS'],
  FAIL: ['fail', 'critical', 'FAIL'],
  // decisions
  Proposed: ['planned', 'neutral', 'Proposed'],
  Discussing: ['discussing', 'warning', 'Discussing'],
  Decided: ['done', 'good', 'Decided'],
  Deferred: ['deferred', 'neutral', 'Deferred'],
  // ADRs and evidence
  Accepted: ['done', 'good', 'Accepted'],
  Superseded: ['deferred', 'neutral', 'Superseded'],
  pass: ['done', 'good', 'pass'],
  fail: ['fail', 'critical', 'fail'],
  info: ['info', 'progress', 'info'],
  // workstreams, dev log entries, editorial calendar
  'in progress': ['in_progress', 'progress', 'In progress'],
  'in-progress': ['in_progress', 'progress', 'In progress'],
  complete: ['done', 'good', 'Complete'],
  not_commissioned: ['planned', 'neutral', 'Not commissioned'],
};

/** Status badge: icon + label, never color alone. */
export function badge(status) {
  const [icon, tone, label] = STATUS_MAP[status] ?? ['planned', 'neutral', String(status)];
  return `<span class="badge tone-${tone}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">${ICONS[icon]}</svg>${escapeHtml(label)}</span>`;
}
