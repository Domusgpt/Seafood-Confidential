// Compiles brand/tokens.json into CSS custom properties and asserts the declared contrast pairs.
import { contrastRatio, apcaLc } from '../lib/color.mjs';

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
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme='light'])) {
    color-scheme: dark;
${vars(themes.dark).replace(/^/gm, '  ')}
  }
}
:root[data-theme='dark'] {
  color-scheme: dark;
${vars(themes.dark)}
}
`;
}
