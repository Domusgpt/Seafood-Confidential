import { createHash } from 'node:crypto';
import { escapeHtml as esc, markdownToHtml, markdownToText } from './markdown';

// Builds the whole public site from the publishable snapshot (ADR-005). Every build is complete, so
// a deploy is idempotent: publishing the same snapshot twice gives the same site, and a retry after
// a timeout can never duplicate a story. Pure: no I/O, so it is unit tested directly.

export const SECTION_NAMES = {
  on_the_water: 'On the Water',
  at_the_farm: 'At the Farm',
  the_trade: 'The Trade',
  rules_and_reality: 'Rules and Reality',
  at_the_table: 'At the Table',
  voices: 'Voices',
} as const;
export type SectionKey = keyof typeof SECTION_NAMES;

export interface SiteSource {
  sourceCode: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedOn: string | null;
}

export interface SiteStory {
  contentId: string;
  slug: string;
  title: string;
  dek: string | null;
  bodyMarkdown: string;
  byline: string | null;
  section: SectionKey;
  label: 'reporting' | 'opinion' | 'sponsored';
  format: string;
  aiGenerated: boolean;
  revision: number;
  publishedAt: string;
  updatedAt: string;
  sources: SiteSource[];
}

export interface SiteSnapshot {
  disclosure: string;
  stories: SiteStory[];
}

export interface SiteConfig {
  siteName: string;
  tagline: string;
  /** Absolute base URL of the public site, without a trailing slash. */
  publicUrl: string;
  /** Kit form ID for the signup form; null hides the form. */
  kitFormId: string | null;
  /** Where readers pitch a story (the desk's public form); null hides the link. */
  pitchUrl: string | null;
  builtAt: string;
  /**
   * A preview build (staging, or a site shown before launch): every page carries this notice and
   * asks search engines not to index it, and robots.txt disallows everything. Null for the real site.
   */
  preview?: string | null;
}

export interface SiteFile {
  path: string;
  body: Buffer;
  contentType: string;
}

const sectionSlug = (s: SectionKey) => s.replace(/_/g, '-');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The public Content-Security-Policy; the static host sends the same value as a header. */
export const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  'form-action https://app.kit.com',
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'America/New_York',
});
const day = (iso: string) => dateFmt.format(new Date(iso));

export function storyPath(story: Pick<SiteStory, 'slug'>): string {
  if (!SLUG.test(story.slug)) throw new Error(`unsafe slug: ${story.slug}`);
  return `/stories/${story.slug}/`;
}

function bylineFor(story: SiteStory): string {
  if (story.byline) return story.byline;
  return story.aiGenerated ? 'Seafood Confidential AI desk' : 'Seafood Confidential';
}

function labelBadge(story: SiteStory): string {
  if (story.label === 'opinion') return '<span class="label label--opinion">Opinion</span>';
  if (story.label === 'sponsored') return '<span class="label label--sponsored">Sponsored</span>';
  return '';
}

const AI_ICON =
  '<svg class="label__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 7.2v4.2" class="ico-stroke" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="4.8" r="1.05" class="ico-fill"/></svg>';

function aiBadge(story: SiteStory): string {
  return story.aiGenerated ? `<span class="label label--ai">${AI_ICON}Written by an AI agent</span>` : '';
}

interface PageInput {
  config: SiteConfig;
  assetVersion: string;
  title: string;
  description: string;
  path: string;
  body: string;
  type?: 'website' | 'article';
  home?: boolean;
  publishedAt?: string;
}

function layout(p: PageInput): string {
  const { config } = p;
  const canonical = `${config.publicUrl}${p.path}`;
  const sections = (Object.keys(SECTION_NAMES) as SectionKey[])
    .map((s) => `<li><a href="/sections/${sectionSlug(s)}/">${esc(SECTION_NAMES[s])}</a></li>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(SITE_CSP.replace("; frame-ancestors 'none'", ''))}">
<meta name="referrer" content="strict-origin-when-cross-origin">${
    config.preview ? '\n<meta name="robots" content="noindex, nofollow">' : ''
  }
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#102B3A">
<title>${esc(p.home ? `${config.siteName}: ${config.tagline}` : `${p.title} · ${config.siteName}`)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" type="application/rss+xml" title="${esc(config.siteName)}" href="/feed.xml">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:type" content="${p.type ?? 'website'}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(canonical)}">${
    p.publishedAt ? `\n<meta property="article:published_time" content="${esc(p.publishedAt)}">` : ''
  }
<link rel="preload" href="/assets/fonts/fraunces-latin-full-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/tokens.css?v=${p.assetVersion}">
<link rel="stylesheet" href="/assets/site.css?v=${p.assetVersion}">${
    p.home ? `\n<script src="/assets/waterfront-gl.js?v=${p.assetVersion}" defer></script>` : ''
  }
</head>
<body>
<a class="skip-link" href="#main">Skip to the content</a>${
    config.preview
      ? `\n<p class="preview-banner" role="note"><strong>Preview.</strong> ${esc(config.preview)}</p>`
      : ''
  }
<header class="masthead${p.home ? ' masthead--home' : ''}">
  ${p.home ? '<canvas data-bathymetry aria-hidden="true"></canvas>' : ''}
  <div class="masthead-inner">
    <p class="wordmark"><a href="/">${esc(config.siteName)}</a></p>
    <hr class="masthead-rule">
    <p class="tagline">${esc(config.tagline)}</p>
  </div>
</header>
<nav class="sections" aria-label="Sections"><ul>${sections}</ul></nav>
<main id="main" tabindex="-1">
${p.body}
</main>
<footer class="site-footer">
  <div class="site-footer__inner">
    ${signup(config, 'footer')}
    <div class="site-footer__links">
      <a href="/feed.xml">RSS feed</a>${
        config.pitchUrl ? `\n      <a href="${esc(config.pitchUrl)}">Pitch us a story</a>` : ''
      }
    </div>
    <p class="small">© ${new Date(config.builtAt).getUTCFullYear()} ${esc(config.siteName)}. Stories written by AI agents are labelled as such. Type: Fraunces and Source Sans 3 (SIL Open Font License 1.1).</p>
  </div>
</footer>
</body>
</html>
`;
}

function signup(config: SiteConfig, place: 'footer' | 'article'): string {
  if (!config.kitFormId || !/^[0-9]{1,12}$/.test(config.kitFormId)) return '';
  const id = `signup-${place}`;
  return `<form class="signup" action="https://app.kit.com/forms/${config.kitFormId}/subscriptions" method="post">
      <p class="signup__title" id="${id}-title">Get new stories by email</p>
      <p class="signup__note" id="${id}-note">Free. One email when we publish something worth your time. Unsubscribe any time.</p>
      <div class="signup__row">
        <label class="visually-hidden" for="${id}-email">Email address</label>
        <input id="${id}-email" class="signup__input" type="email" name="email_address" autocomplete="email" required aria-describedby="${id}-note">
        <button class="signup__button" type="submit">Subscribe</button>
      </div>
    </form>`;
}

function storyCard(story: SiteStory, lead = false): string {
  const tag = lead ? 'h2' : 'h3';
  return `<article class="card${lead ? ' card--lead' : ''}">
  <p class="eyebrow"><a href="/sections/${sectionSlug(story.section)}/">${esc(SECTION_NAMES[story.section])}</a>${labelBadge(story)}${aiBadge(story)}</p>
  <${tag} class="card__title"><a href="${storyPath(story)}">${esc(story.title)}</a></${tag}>
  ${story.dek ? `<p class="card__dek">${esc(story.dek)}</p>` : ''}
  <p class="meta"><span>${esc(bylineFor(story))}</span><time datetime="${esc(story.publishedAt)}">${esc(day(story.publishedAt))}</time></p>
</article>`;
}

function homePage(snapshot: SiteSnapshot, config: SiteConfig, v: string): string {
  const [lead, ...rest] = snapshot.stories;
  const body = lead
    ? `<div class="wrap">
  <h1 class="visually-hidden">Latest stories</h1>
  <section class="lead" aria-label="Top story">${storyCard(lead, true)}</section>
  ${rest.length ? `<section aria-labelledby="more-heading"><h2 id="more-heading" class="rule-heading">More stories</h2><div class="grid">${rest.map((s) => storyCard(s)).join('\n')}</div></section>` : ''}
</div>`
    : `<div class="wrap"><h1 class="page-title">Coming soon</h1><p class="lede">The first stories are on their way.${config.kitFormId ? ' Subscribe to hear when they land.' : ''}</p>${signup(config, 'article')}</div>`;
  return layout({
    config,
    assetVersion: v,
    title: config.siteName,
    description: `${config.siteName}: ${config.tagline}`,
    path: '/',
    body,
    home: true,
  });
}

function sectionPage(section: SectionKey, stories: SiteStory[], config: SiteConfig, v: string): string {
  const name = SECTION_NAMES[section];
  return layout({
    config,
    assetVersion: v,
    title: name,
    description: `${name} stories from ${config.siteName}.`,
    path: `/sections/${sectionSlug(section)}/`,
    body: `<div class="wrap">
  <p class="eyebrow">Section</p>
  <h1 class="page-title">${esc(name)}</h1>
  ${stories.length ? `<div class="grid">${stories.map((s) => storyCard(s)).join('\n')}</div>` : '<p class="lede">No stories in this section yet.</p>'}
</div>`,
  });
}

function sourceItem(s: SiteSource): string {
  const title =
    s.url && /^https?:\/\//i.test(s.url)
      ? `<a href="${esc(s.url)}" rel="noopener nofollow">${esc(s.title)}</a>`
      : esc(s.title);
  const meta = [s.publisher, s.publishedOn ? day(`${s.publishedOn}T12:00:00Z`) : null].filter(
    Boolean,
  ) as string[];
  return `<li>${title}${meta.length ? `<span class="sources__meta">${meta.map(esc).join(' · ')}</span>` : ''}</li>`;
}

function storyPage(story: SiteStory, snapshot: SiteSnapshot, config: SiteConfig, v: string): string {
  const updated =
    new Date(story.updatedAt).getTime() - new Date(story.publishedAt).getTime() > 60 * 60 * 1000
      ? ` <span class="meta__updated">Updated <time datetime="${esc(story.updatedAt)}">${esc(day(story.updatedAt))}</time></span>`
      : '';
  const sources = story.sources.length
    ? `<section class="sources" aria-labelledby="sources-heading"><h2 id="sources-heading">Sources</h2><ul>${story.sources.map(sourceItem).join('')}</ul></section>`
    : '';
  const disclosure = story.aiGenerated
    ? `<aside class="disclosure" aria-label="How this story was written"><p class="disclosure__title">${AI_ICON}How this story was written</p><p>${esc(snapshot.disclosure)}</p></aside>`
    : '';
  return layout({
    config,
    assetVersion: v,
    title: story.title,
    description: story.dek ?? markdownToText(story.bodyMarkdown, 200),
    path: storyPath(story),
    type: 'article',
    publishedAt: story.publishedAt,
    body: `<article class="story">
  <header class="story__header">
    <p class="eyebrow"><a href="/sections/${sectionSlug(story.section)}/">${esc(SECTION_NAMES[story.section])}</a>${labelBadge(story)}${aiBadge(story)}</p>
    <h1 class="story__title">${esc(story.title)}</h1>
    ${story.dek ? `<p class="story__dek">${esc(story.dek)}</p>` : ''}
    <p class="meta"><span>By ${esc(bylineFor(story))}</span><time datetime="${esc(story.publishedAt)}">${esc(day(story.publishedAt))}</time>${updated}</p>
  </header>
  <div class="story__body">
${markdownToHtml(story.bodyMarkdown)}
  </div>
  ${disclosure}
  ${sources}
  ${signup(config, 'article')}
</article>`,
  });
}

function notFoundPage(config: SiteConfig, v: string): string {
  return layout({
    config,
    assetVersion: v,
    title: 'Page not found',
    description: 'This page does not exist or was taken down.',
    path: '/404.html',
    body: `<div class="wrap"><h1 class="page-title">We could not find that page</h1><p class="lede">It may have moved or been taken down. <a href="/">See the latest stories</a>.</p></div>`,
  });
}

const xml = (s: string) => esc(s);

function feed(snapshot: SiteSnapshot, config: SiteConfig): string {
  const items = snapshot.stories
    .slice(0, 30)
    .map(
      (s) => `  <item>
    <title>${xml(s.title)}</title>
    <link>${xml(`${config.publicUrl}${storyPath(s)}`)}</link>
    <guid isPermaLink="false">${xml(`seafood-confidential:${s.contentId}`)}</guid>
    <pubDate>${new Date(s.publishedAt).toUTCString()}</pubDate>
    <category>${xml(SECTION_NAMES[s.section])}</category>
    <description>${xml(s.dek ?? markdownToText(s.bodyMarkdown, 300))}${s.aiGenerated ? xml(' (Written by an AI agent.)') : ''}</description>
  </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xml(config.siteName)}</title>
  <link>${xml(`${config.publicUrl}/`)}</link>
  <description>${xml(config.tagline)}</description>
  <language>en-us</language>
  <lastBuildDate>${new Date(config.builtAt).toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

function sitemap(snapshot: SiteSnapshot, config: SiteConfig, sections: SectionKey[]): string {
  const urls = [
    `${config.publicUrl}/`,
    ...sections.map((s) => `${config.publicUrl}/sections/${sectionSlug(s)}/`),
    ...snapshot.stories.map((s) => `${config.publicUrl}${storyPath(s)}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xml(u)}</loc></url>`).join('\n')}
</urlset>
`;
}

const text = (path: string, body: string, contentType: string): SiteFile => ({
  path,
  body: Buffer.from(body, 'utf8'),
  contentType,
});

/** A short content hash of the static assets, used to bust caches when they change. */
export function assetVersion(assets: SiteFile[]): string {
  const h = createHash('sha256');
  for (const a of [...assets].sort((x, y) => x.path.localeCompare(y.path))) h.update(a.path).update(a.body);
  return h.digest('hex').slice(0, 10);
}

export function buildSite(snapshot: SiteSnapshot, config: SiteConfig, assets: SiteFile[]): SiteFile[] {
  const v = assetVersion(assets);
  const stories = [...snapshot.stories].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.contentId.localeCompare(b.contentId),
  );
  const ordered: SiteSnapshot = { ...snapshot, stories };
  const html = 'text/html; charset=utf-8';
  const sections = Object.keys(SECTION_NAMES) as SectionKey[];
  const files: SiteFile[] = [
    text('/index.html', homePage(ordered, config, v), html),
    text('/404.html', notFoundPage(config, v), html),
    text('/feed.xml', feed(ordered, config), 'application/rss+xml; charset=utf-8'),
    text('/sitemap.xml', sitemap(ordered, config, sections), 'application/xml; charset=utf-8'),
    text(
      '/robots.txt',
      config.preview
        ? 'User-agent: *\nDisallow: /\n'
        : `User-agent: *\nAllow: /\nSitemap: ${config.publicUrl}/sitemap.xml\n`,
      'text/plain; charset=utf-8',
    ),
    ...sections.map((s) =>
      text(
        `/sections/${sectionSlug(s)}/index.html`,
        sectionPage(
          s,
          stories.filter((x) => x.section === s),
          config,
          v,
        ),
        html,
      ),
    ),
    ...stories.map((s) => text(`${storyPath(s)}index.html`, storyPage(s, ordered, config, v), html)),
    ...assets,
  ];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`duplicate site path ${f.path}`);
    seen.add(f.path);
  }
  return files;
}
