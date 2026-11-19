import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvObjects } from './csv.mjs';
import { extractTables, tableObjects, parseFrontMatter, relativeLinks } from './markdown.mjs';
import { contrastRatio, apcaLc, wcagLevels } from './color.mjs';
import { criticalPath, dependencyDepth, parseAcceptance, parseAdr } from './project.mjs';
import { isoInZone } from './time.mjs';
import { slugify, branchSlug } from './slug.mjs';

test('CSV: quoted commas, doubled quotes, CRLF and embedded newlines', () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\nline2",\r\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', 'line1\nline2', ''],
  ]);
  assert.throws(() => parseCsv('a,"open'), /unterminated/);
  assert.throws(() => parseCsvObjects('a,b\n1,2,3\n'), /expected 2 fields/);
});

test('Markdown tables: pipes inside code spans and escaped pipes stay in the cell', () => {
  const md = '# Doc\n\n## Section\n\n| A | B |\n|---|---|\n| `x | y` | a \\| b |\n| 2 | 3 |\n';
  const [t] = extractTables(md);
  assert.equal(t.heading, 'Section');
  assert.deepEqual(tableObjects(t), [
    { A: '`x | y`', B: 'a | b' },
    { A: '2', B: '3' },
  ]);
});

test('Front matter keeps ISO timestamps as strings (YAML core schema)', () => {
  const { data, body } = parseFrontMatter('---\nrecordedAt: 2026-11-18T11:00:00-05:00\nturn: 2\n---\n# Hi\n');
  assert.equal(data.recordedAt, '2026-11-18T11:00:00-05:00');
  assert.equal(data.turn, 2);
  assert.equal(body, '# Hi\n');
});

test('relativeLinks ignores URLs, anchors and code', () => {
  const md = '[a](docs/A.md) [b](https://x.y) [c](#top) `[d](no.md)` ![e](../img.png)\n```\n[f](g.md)\n```';
  assert.deepEqual(relativeLinks(md), ['docs/A.md', '../img.png']);
});

test('WCAG contrast matches published reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
  // Brand facts recorded in the visual codex.
  assert.equal(contrastRatio('#B64D35', '#F3EFE5').toFixed(2), '4.46');
  assert.equal(contrastRatio('#7FA59A', '#F3EFE5').toFixed(2), '2.36');
  assert.equal(wcagLevels(4.46).aaNormal, false);
  assert.equal(wcagLevels(4.46).aaLarge, true);
});

test('APCA Lc agrees with the dataviz validator outputs recorded in S01', () => {
  // Values computed with the dataviz skill's validate_palette.js apca() on 2026-11-18.
  assert.equal(Math.round(apcaLc('#102B3A', '#F3EFE5')), 92);
  assert.equal(Math.round(apcaLc('#F3EFE5', '#102B3A')), -94);
  assert.equal(Math.round(apcaLc('#B64D35', '#F3EFE5')), 65);
  assert.equal(apcaLc('#808080', '#808080'), 0);
});

const T = (id, deps, low, high) => ({ id, dependencies: deps, hoursLow: low, hoursHigh: high });

test('critical path follows the longest weighted chain', () => {
  const tickets = [
    T('SC-001', [], 4, 6),
    T('SC-002', ['SC-001'], 10, 10),
    T('SC-003', ['SC-001'], 2, 2),
    T('SC-004', ['SC-002', 'SC-003'], 1, 1),
  ];
  const cp = criticalPath(tickets, (t) => t.hoursHigh);
  assert.deepEqual(cp.path, ['SC-001', 'SC-002', 'SC-004']);
  assert.equal(cp.hours, 17);
  assert.deepEqual([...dependencyDepth(tickets).values()], [0, 1, 1, 2]);
});

test('critical path rejects dependency cycles', () => {
  const tickets = [T('SC-001', ['SC-002'], 1, 1), T('SC-002', ['SC-001'], 1, 1)];
  assert.throws(() => criticalPath(tickets, (t) => t.hoursHigh), /cycle/);
});

test('acceptance and ADR parsers read the kit formats', () => {
  const rows = parseAcceptance(
    '| ID | Scenario | Required observed outcome | Status |\n|---|---|---|---|\n| AT-01 | s | o | UNRUN |\n',
  );
  assert.deepEqual(rows, [{ id: 'AT-01', scenario: 's', outcome: 'o', status: 'UNRUN' }]);
  const adr = parseAdr(
    '# ADR 009 thing\n\nDate: November 18, 2026. Status: accepted for tooling.\n',
    'decisions/ADR-009-x.md',
  );
  assert.equal(adr.status, 'Accepted');
  assert.equal(adr.date, 'November 18, 2026');
});

test('timestamps carry the New York offset across daylight saving', () => {
  assert.equal(isoInZone(new Date('2026-11-18T16:14:52Z')), '2026-11-18T11:14:52-05:00');
  assert.equal(isoInZone(new Date('2026-07-04T13:05:00Z')), '2026-07-04T09:05:00-04:00');
});

test('branch slugs are stable and URL-safe', () => {
  assert.equal(branchSlug('claude/intelligent-cannon-d1nqq6'), 'claude-intelligent-cannon-d1nqq6');
  assert.equal(branchSlug('Fix/V1.2_hotfix--x/'), 'fix-v12-hotfix-x');
  assert.equal(branchSlug('///'), 'branch');
  assert.match(slugify('Résumé & notes'), /^resume-notes$/);
});
