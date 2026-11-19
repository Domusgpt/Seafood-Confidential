#!/usr/bin/env node
// Generate site-src/contours.svg: nautical depth contours (the bathymetry motif, sc-visual-codex) as
// vector line art for the public site's parallax layers. Deterministic (seeded), so the committed file
// can be rebuilt byte for byte: `node scripts/build-contours.mjs`. The SVG is used as a CSS mask, so
// its colour comes from the theme; every fifth line is an index contour, drawn heavier. Presentation
// attributes only (no <style>), so the site's strict CSP never has to allow inline styles.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../site-src/contours.svg');

const W = 1600;
const H = 900;
const COLS = 200;
const ROWS = 113;

// mulberry32: a small, stable PRNG so the art never changes between builds.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261118);

// A seabed: a few broad basins and banks plus gentle ridges.
const bumps = Array.from({ length: 9 }, () => ({
  x: rand() * W,
  y: rand() * H,
  r: 180 + rand() * 420,
  h: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.9),
}));
const depth = (x, y) => {
  let z = 0.35 * Math.sin(x / 260 + 0.6) * Math.cos(y / 210 - 0.4) + 0.18 * Math.sin((x + y) / 140);
  for (const b of bumps) z += b.h * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r));
  return z;
};

const field = [];
for (let j = 0; j <= ROWS; j++) {
  const row = [];
  for (let i = 0; i <= COLS; i++) row.push(depth((i / COLS) * W, (j / ROWS) * H));
  field.push(row);
}
let min = Infinity;
let max = -Infinity;
for (const row of field)
  for (const v of row) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

const LEVELS = 30;
const lerp = (a, b, t) => a + (b - a) * t;
const pt = (i, j) => [(i / COLS) * W, (j / ROWS) * H];

/** Marching squares for one level: returns line segments. */
function segments(level) {
  const segs = [];
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const v = [field[j][i], field[j][i + 1], field[j + 1][i + 1], field[j + 1][i]];
      const p = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
      const edge = (a, b) => {
        const t = (level - v[a]) / (v[b] - v[a]);
        return [lerp(p[a][0], p[b][0], t), lerp(p[a][1], p[b][1], t)];
      };
      const code = (v[0] > level) | ((v[1] > level) << 1) | ((v[2] > level) << 2) | ((v[3] > level) << 3);
      const e = [() => edge(0, 1), () => edge(1, 2), () => edge(2, 3), () => edge(3, 0)];
      const table = {
        1: [[3, 0]],
        2: [[0, 1]],
        3: [[3, 1]],
        4: [[1, 2]],
        5: [
          [3, 0],
          [1, 2],
        ],
        6: [[0, 2]],
        7: [[3, 2]],
        8: [[2, 3]],
        9: [[0, 2]],
        10: [
          [0, 1],
          [2, 3],
        ],
        11: [[1, 2]],
        12: [[1, 3]],
        13: [[0, 1]],
        14: [[3, 0]],
      };
      for (const [a, b] of table[code] ?? []) segs.push([e[a](), e[b]()]);
    }
  return segs;
}

/** Join segments into polylines by matching endpoints. */
function polylines(segs) {
  const key = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const ends = new Map();
  segs.forEach((s, idx) => {
    for (const k of [key(s[0]), key(s[1])]) {
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(idx);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const line = [segs[s][0], segs[s][1]];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir === 1 ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) ?? []).find((n) => !used[n]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segs[next];
        const other = key(a) === key(tip) ? b : a;
        if (dir === 1) line.push(other);
        else line.unshift(other);
      }
    }
    if (line.length > 6) lines.push(line);
  }
  return lines;
}

/** Ramer–Douglas–Peucker simplification. */
function simplify(points, eps) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= eps) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), eps).slice(0, -1), ...simplify(points.slice(index), eps)];
}

const fmt = (n) => (Math.round(n * 10) / 10).toString();

/** A smooth path through the points (Catmull-Rom converted to cubic Béziers). */
function smoothPath(pts) {
  const p = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}
const paths = [];
for (let l = 1; l < LEVELS; l++) {
  const level = min + ((max - min) * l) / LEVELS;
  const d = polylines(segments(level))
    .map((line) => simplify(line, 1.4))
    .filter((line) => line.length > 2)
    .map(smoothPath)
    .join('');
  if (d) paths.push(`<path stroke-width="${l % 5 === 0 ? '2.3' : '1.1'}" d="${d}"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<!-- Seafood Confidential bathymetry contours. Generated by apps/desk/scripts/build-contours.mjs; do not edit by hand. -->
<g fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round">
${paths.join('\n')}
</g>
</svg>
`;
await writeFile(out, svg);
console.log(
  `wrote ${path.relative(process.cwd(), out)} (${(svg.length / 1024).toFixed(1)} KB, ${paths.length} levels)`,
);
