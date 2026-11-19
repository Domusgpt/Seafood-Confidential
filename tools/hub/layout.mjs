// Page shell for the project hub.
import { createHash } from 'node:crypto';
import { escapeHtml as esc } from './html.mjs';

export const NAV = [
  { href: 'index.html', label: 'Overview', key: 'overview' },
  { href: 'backlog.html', label: 'Backlog', key: 'backlog' },
  { href: 'acceptance.html', label: 'Acceptance', key: 'acceptance' },
  { href: 'decisions.html', label: 'Decisions', key: 'decisions' },
  { href: 'editorial.html', label: 'Editorial', key: 'editorial' },
  { href: 'visual-codex.html', label: 'Visual codex', key: 'codex' },
  { href: 'docs/index.html', label: 'Docs', key: 'docs' },
  { href: 'devlog/index.html', label: 'Dev log', key: 'devlog' },
];

// Applies a remembered theme before first paint (no flash). Allowed by hash in the CSP.
export const THEME_BOOT =
  "try{var t=localStorage.getItem('sc-hub-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}";
const bootHash = createHash('sha256').update(THEME_BOOT).digest('base64');

export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'sha256-" + bootHash + "'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function page({ title, description, rel = '', current, body, build }) {
  const nav = NAV.map(
    (n) =>
      `<li><a href="${rel}${n.href}"${n.key === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`,
  ).join('');
  const previews = build.previewsIndex
    ? `<a href="${rel}${build.previewsIndex}">All branch previews</a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#102B3A">
<title>${esc(title)} · Seafood Confidential project hub</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${rel}assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${rel}assets/fonts/fraunces-latin-full-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${rel}assets/tokens.css">
<link rel="stylesheet" href="${rel}assets/hub.css">
<script>${THEME_BOOT}</script>
<script src="${rel}assets/hub.js" defer></script>
<script src="${rel}assets/waterfront-gl.js" defer></script>
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="masthead">
  <canvas data-bathymetry aria-hidden="true"></canvas>
  <div class="masthead-inner">
    <div class="masthead-top">
      <p class="wordmark"><a href="${rel}index.html">Seafood Confidential</a></p>
      <button class="theme-toggle" type="button" data-theme-toggle>Theme: system</button>
    </div>
    <hr class="masthead-rule">
    <p class="tagline">Seafood, from the people who know it.</p>
    <div class="hub-meta">
      <span>Project hub</span>
      <span>v${esc(build.version)}</span>
      <span>Branch <code>${esc(build.branch)}</code></span>
      <a href="${esc(build.commitUrl)}">Commit <code>${esc(build.shortCommit)}</code></a>
      <span>Built ${esc(build.builtDisplay)}</span>
      ${previews}
    </div>
  </div>
</header>
<nav class="site-nav" aria-label="Hub sections"><ul>${nav}</ul></nav>
<main id="content" tabindex="-1">
${body}
</main>
<footer class="site-footer"><div>
  <p>Planning hub generated from <a href="${esc(build.treeUrl)}">${esc(build.branch)}</a> at <a href="${esc(build.commitUrl)}">${esc(build.shortCommit)}</a>. The publication and the operations desk run only as a preview, not launched (docs/LAUNCH_PREVIEW.md); an acceptance scenario is UNRUN until an evidence record says otherwise.</p>
  <p>© 2026 the Seafood Confidential founders. All rights reserved. Type: Fraunces and Source Sans 3 (SIL Open Font License 1.1). The brand concept image is an AI-generated exploration, not final artwork or documentary photography.</p>
</div></footer>
</body>
</html>
`;
}

export const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#102B3A"/><text x="32" y="43" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="700" text-anchor="middle" fill="#F3EFE5">SC</text><rect x="14" y="49" width="36" height="2.5" fill="#B64D35"/></svg>
`;
