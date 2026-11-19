// Small, dependency-free helpers for reading the kit's Markdown structures.
import { parse as parseYaml } from 'yaml';

/** Split a table row on unescaped pipes, ignoring pipes inside `code spans`. */
function splitRow(line) {
  const cells = [];
  let cur = '';
  let inCode = false;
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i += 1;
    } else if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const isDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

/**
 * Extract every GFM table in a document. Each table records the nearest preceding heading.
 * @returns {{heading: string, header: string[], rows: string[][], line: number}[]}
 */
export function extractTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  let heading = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      heading = h[2].trim();
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitRow(lines[j]));
        j += 1;
      }
      tables.push({ heading, header, rows, line: i + 1 });
      i = j - 1;
    }
  }
  return tables;
}

/** Table rows as objects keyed by header text. */
export function tableObjects(table) {
  return table.rows.map((r) => Object.fromEntries(table.header.map((h, j) => [h, r[j] ?? ''])));
}

/** Parse leading YAML front matter. Returns { data, body }. */
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = parseYaml(m[1], { schema: 'core' }) ?? {};
  return { data, body: text.slice(m[0].length) };
}

/** First level-one heading, else first heading, else fallback. */
export function firstHeading(markdown, fallback = '') {
  const h1 = /^#\s+(.+)$/m.exec(markdown);
  if (h1) return h1[1].trim();
  const any = /^#{1,6}\s+(.+)$/m.exec(markdown);
  return any ? any[1].trim() : fallback;
}

/** Relative link targets in a Markdown document (excludes URLs, anchors, mailto). */
export function relativeLinks(markdown) {
  const out = [];
  const re = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  while ((m = re.exec(withoutCode))) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    out.push(target.split('#')[0]);
  }
  return out.filter(Boolean);
}
