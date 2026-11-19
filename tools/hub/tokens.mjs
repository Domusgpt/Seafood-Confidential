// Compiles brand/tokens.json into CSS custom properties and asserts the declared contrast pairs.
import { contrastRatio, apcaLc } from '../lib/color.mjs';

/** Resolve a value that may be a {group.path} reference (references can chain). */
export function resolveValue(tokens, value) {
  const lookup = (ref) => {
    const path = ref.replace(/^\{|\}$/g, '').split('.');
    let node = tokens;
    for (const key of path) {
      node = node?.[key];
      if (node === undefined) throw new Error(`tokens: unresolved reference ${ref}`);
    }
    return typeof node === 'object' ? node.$value : node;
  };
  const resolve = (v) => (typeof v === 'string' && /^\{[^}]+\}$/.test(v) ? resolve(lookup(v)) : v);
  return resolve(value);
}

export function resolveTokens(tokens) {
  const lookup = (ref) => {
    const path = ref.replace(/^\{|\}$/g, '').split('.');
    let node = tokens;
    for (const key of path) {
      node = node?.[key];
      if (node === undefined) throw new Error(`tokens: unresolved reference ${ref}`);
    }
    return typeof node === 'object' ? node.$value : node;
  };
  const resolve = (v) => (typeof v === 'string' && v.startsWith('{') ? resolve(lookup(v)) : v);
  const themes = {};
  for (const [name, roles] of Object.entries(tokens.theme)) {
    themes[name] = Object.fromEntries(
      Object.entries(roles).map(([role, v]) => [role, resolve(v).toUpperCase()]),
    );
  }
  const status = Object.fromEntries(
    Object.entries(tokens.color.status)
      .filter(([k]) => !k.startsWith('$'))
      .map(([k, v]) => [k, v.$value.toUpperCase()]),
  );
  return { themes, status };
}

export function contrastReport(tokens) {
  const { themes } = resolveTokens(tokens);
  return tokens.contrast.pairs.map((p) => {
    const fg = themes[p.theme][p.text];
    const bg = themes[p.theme][p.on];
    if (!fg || !bg)
      throw new Error(`tokens: contrast pair ${p.theme}.${p.text} on ${p.on} references an unknown role`);
    const ratio = contrastRatio(fg, bg);
    return { ...p, fg, bg, ratio, lc: apcaLc(fg, bg), pass: ratio >= p.min };
  });
}

const vars = (roles, prefix = '') =>
  Object.entries(roles)
    .map(([k, v]) => `  --${prefix}${k}: ${v};`)
    .join('\n');

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const plain = (group) => Object.entries(group ?? {}).filter(([k]) => !k.startsWith('$'));

/** Space, radius and motion: one set for every theme. */
function scaleVars(tokens) {
  const lines = [];
  for (const [k, v] of plain(tokens.space)) lines.push(`  --space-${k}: ${v};`);
  for (const [k, v] of plain(tokens.radius)) lines.push(`  --radius-${k}: ${v};`);
  const m = tokens.motion;
  if (m) {
    for (const [k, v] of plain(m.duration)) lines.push(`  --motion-duration-${kebab(k)}: ${v}ms;`);
    for (const [k, v] of plain(m.ease)) {
      lines.push(`  --motion-ease-${kebab(k)}: ${v.css};`);
      lines.push(`  --motion-gsap-ease-${kebab(k)}: ${v.gsap};`);
    }
    for (const [k, v] of plain(m.distance)) lines.push(`  --motion-distance-${kebab(k)}: ${v};`);
    for (const [k, v] of plain(m.parallax)) lines.push(`  --motion-parallax-${kebab(k)}: ${v};`);
    lines.push(`  --motion-stagger: ${m.stagger};`);
    lines.push(`  --motion-media-scale: ${m.mediaScale};`);
    const std = m.presets?.standard ?? { scale: 1, speed: 1 };
    lines.push(`  --motion-scale: ${std.scale};`, `  --motion-speed: ${std.speed};`);
  }
  return lines.join('\n');
}

/** Elevation for one theme: its highlight and shadow colours, then the levels that use them. */
function elevationVars(tokens, theme, indent = '  ') {
  const e = tokens.elevation?.[theme];
  if (!e) return '';
  return plain(e)
    .map(([k, v]) => `${indent}--elevation-${k}: ${resolveValue(tokens, v)};`)
    .join('\n');
}

function motionPresets(tokens) {
  return plain(tokens.motion?.presets)
    .map(
      ([name, p]) =>
        `:root[data-motion='${name}'] {\n  --motion-scale: ${p.scale};\n  --motion-speed: ${p.speed};\n}`,
    )
    .join('\n');
}

export function tokensCss(tokens) {
  const { themes, status } = resolveTokens(tokens);
  const font = (key) => tokens.typography[key].$value.map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(', ');
  const statusVars = vars(status, 'status-');
  const mast = vars(themes.masthead, 'masthead-');
  return `/* Generated from brand/tokens.json by tools/hub/tokens.mjs. Do not edit by hand. */
:root {
  color-scheme: light;
${vars(themes.light)}
${statusVars}
${mast}
  --font-display: ${font('display')};
  --font-text: ${font('text')};
  --font-mono: ${font('mono')};
${scaleVars(tokens)}
${elevationVars(tokens, 'light')}
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme='light'])) {
    color-scheme: dark;
${vars(themes.dark).replace(/^/gm, '  ')}
${elevationVars(tokens, 'dark', '    ')}
  }
}
:root[data-theme='dark'] {
  color-scheme: dark;
${vars(themes.dark)}
${elevationVars(tokens, 'dark')}
}
${motionPresets(tokens)}
`;
}
