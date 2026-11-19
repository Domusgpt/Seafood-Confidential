// Minimal RFC 4180 CSV parser: quoted fields, embedded commas/newlines, doubled quotes, CRLF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (quoted) throw new Error('CSV: unterminated quoted field');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parse CSV into objects keyed by the header row. */
export function parseCsvObjects(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((r, idx) => {
    if (r.length !== header.length) {
      throw new Error(`CSV row ${idx + 2}: expected ${header.length} fields, found ${r.length}`);
    }
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}
