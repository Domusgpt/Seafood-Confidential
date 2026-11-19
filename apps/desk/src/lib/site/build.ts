import { createHash } from 'node:crypto';
import { escapeHtml as esc, markdownToHtml, markdownToText, typeset } from './markdown';

// Builds the whole public site from the publishable snapshot (ADR-005). Every build is complete, so
// a deploy is idempotent: publishing the same snapshot twice gives the same site, and a retry after
// a timeout can never duplicate a story. Pure: no I/O, so it is unit tested directly. Image bytes are
// passed in by the caller (mediaRefs lists the files a snapshot needs).
//
// Look and motion follow the sc-visual-codex skill (v0.7.0): layered depth from one light source,
// a parallax masthead built from the bathymetry motif, and scroll-linked reveals that reverse when
// the reader scrolls back. Every page works without JavaScript; motion is an enhancement that the
// reader can turn off, and that prefers-reduced-motion turns off.

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

/** One encoded rendition of a story image. Its file is served at mediaPath(variant). */
export interface SiteImageVariant {
  format: 'avif' | 'webp';
  width: number;
  height: number;
  /** SHA-256 of the encoded bytes (hex): the file's name, so a rendition is cached forever. */
  sha256: string;
}

/** A story's lead image, cleared for the web (asset_rights), with its credit and provenance. */
export interface SiteImage {
  id: string;
  alt: string;
  caption: string | null;
  credit: string;
  provenance: 'documentary' | 'illustrative' | 'generated';
  kind: 'photo' | 'illustration' | 'graphic';
  width: number;
  height: number;
  /** Where the subject sits (0–1 from the left and top), so crops keep it in frame. */
  focalX: number;
  focalY: number;
  variants: SiteImageVariant[];
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
  /** Placeholder content for a preview site (operator-loaded); never allowed on the real site. */
  isSample?: boolean;
  /** The lead image, when the story has one whose rights are cleared for the web. */
  heroImage?: SiteImage | null;
  revision: number;
  publishedAt: string;
  updatedAt: string;
  sources: SiteSource[];
}

export interface SiteSnapshot {
  disclosure: string;
  stories: SiteStory[];
}

/** A standing page of the publication (About, How we work), written in Markdown in the repository. */
export interface SitePage {
  slug: string;
  title: string;
  description: string;
  bodyMarkdown: string;
  /** Position in the footer, lowest first. */
  order: number;
}

/** Paths a standing page may not take, because stories, sections and assets live there. */
const RESERVED_PAGE_SLUGS = new Set([
  'stories',
  'sections',
  'assets',
  'media',
  'feed.xml',
  'sitemap.xml',
  '404.html',
]);

export const MOTION_PRESETS = ['calm', 'standard', 'expressive', 'off'] as const;
export type MotionPreset = (typeof MOTION_PRESETS)[number];

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
  /** Motion preset from brand/tokens.json (motion.presets); 'off' ships a still site. */
  motion?: MotionPreset;
  /** Footer links to the standing pages; filled in by buildSite. */
  pageLinks?: { href: string; label: string }[];
}

export interface SiteFile {
  path: string;
  body: Buffer;
  contentType: string;
}

const sectionSlug = (s: SectionKey) => s.replace(/_/g, '-');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

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

/** Where a rendition is served. Content-addressed, so the host can cache it for a year. */
export function mediaPath(v: Pick<SiteImageVariant, 'sha256' | 'format'>): string {
  if (!SHA256.test(v.sha256)) throw new Error('unsafe media hash');
  if (v.format !== 'avif' && v.format !== 'webp') throw new Error('unsafe media format');
  return `/media/${v.sha256.slice(0, 32)}.${v.format}`;
}

export interface MediaRef {
  path: string;
  imageId: string;
  format: SiteImageVariant['format'];
  width: number;
  sha256: string;
}

/** Every image file the snapshot's pages reference: the caller loads these bytes for buildSite. */
export function mediaRefs(snapshot: SiteSnapshot): MediaRef[] {
  const refs = new Map<string, MediaRef>();
  for (const s of snapshot.stories)
    for (const v of s.heroImage?.variants ?? [])
      refs.set(mediaPath(v), {
        path: mediaPath(v),
        imageId: s.heroImage!.id,
        format: v.format,
        width: v.width,
        sha256: v.sha256,
      });
  return [...refs.values()];
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

function sampleBadge(story: SiteStory): string {
  return story.isSample ? '<span class="label label--sample">Sample</span>' : '';
}

function eyebrow(story: SiteStory): string {
  return `<p class="eyebrow"><a href="/sections/${sectionSlug(story.section)}/">${esc(SECTION_NAMES[story.section])}</a>${labelBadge(story)}${aiBadge(story)}${sampleBadge(story)}</p>`;
}

const SAMPLE_NOTE =
  '<aside class="sample-note" aria-label="About this sample"><p><strong>Sample story.</strong> Placeholder text that shows how a story looks on the site. It is not reporting, and it will be removed before launch.</p></aside>';

/** Words a reader gets through in a minute, for the "min read" estimate. */
const WORDS_PER_MINUTE = 230;
const readingMinutes = (markdown: string) =>
  Math.max(
    1,
    Math.round(markdownToText(markdown, 200_000).split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE),
  );

// ---------- Images ----------

/** Focal point as one of five steps per axis (classes in site.css; no inline styles under the CSP). */
const focusStep = (n: number) => Math.min(4, Math.max(0, Math.round((Number.isFinite(n) ? n : 0.5) * 4)));

function picture(
  img: SiteImage,
  sizes: string,
  opts: { eager?: boolean; decorative?: boolean } = {},
): string {
  const byWidth = (format: SiteImageVariant['format']) =>
    img.variants.filter((v) => v.format === format).sort((a, b) => a.width - b.width);
  const srcset = (list: SiteImageVariant[]) => list.map((v) => `${mediaPath(v)} ${v.width}w`).join(', ');
  const webp = byWidth('webp');
  const avif = byWidth('avif');
  const fallback = [...webp].reverse().find((v) => v.width <= 1280) ?? webp[0];
  if (!fallback) return '';
  return `<picture>${avif.length ? `<source type="image/avif" srcset="${srcset(avif)}" sizes="${sizes}">` : ''}<source type="image/webp" srcset="${srcset(webp)}" sizes="${sizes}"><img src="${mediaPath(fallback)}" width="${fallback.width}" height="${fallback.height}" alt="${opts.decorative ? '' : esc(img.alt)}" class="fx-${focusStep(img.focalX)} fy-${focusStep(img.focalY)}" decoding="async"${opts.eager ? ' fetchpriority="high"' : ' loading="lazy"'}></picture>`;
}

/** The drawn plate a story without a photo shows: the section over depth contours. Decorative. */
function plate(story: SiteStory): string {
  return `<div class="plate plate--${sectionSlug(story.section)}" aria-hidden="true"><span class="plate__name">${esc(SECTION_NAMES[story.section])}</span></div>`;
}

function provenanceTag(img: SiteImage): string {
  if (img.provenance === 'generated') return ' <span class="label label--provenance">Generated image</span>';
  if (img.provenance === 'illustrative' || img.kind !== 'photo')
    return ' <span class="label label--provenance">Illustration</span>';
  return '';
}

// ---------- Page shell ----------

interface PageInput {
  config: SiteConfig;
  assetVersion: string;
  title: string;
  description: string;
  path: string;
  body: string;
  type?: 'website' | 'article';
  home?: boolean;
  /** Section pages and story pages mark their section in the navigation. */
  section?: SectionKey;
  /** Story pages show reading progress under the navigation. */
  progress?: boolean;
  publishedAt?: string;
  image?: SiteImage | null;
}

function ogImage(p: PageInput): string {
  const img = p.image;
  const v = img?.variants
    .filter((x) => x.format === 'webp')
    .sort((a, b) => Math.abs(a.width - 1200) - Math.abs(b.width - 1200))[0];
  if (!img || !v) return '';
  const url = `${p.config.publicUrl}${mediaPath(v)}`;
  return `\n<meta property="og:image" content="${esc(url)}">\n<meta property="og:image:width" content="${v.width}">\n<meta property="og:image:height" content="${v.height}">\n<meta property="og:image:alt" content="${esc(img.alt)}">\n<meta name="twitter:card" content="summary_large_image">`;
}

function layout(p: PageInput): string {
  const { config } = p;
  const canonical = `${config.publicUrl}${p.path}`;
  const motion: MotionPreset = MOTION_PRESETS.includes(config.motion as MotionPreset)
    ? (config.motion as MotionPreset)
    : 'standard';
  const sections = (Object.keys(SECTION_NAMES) as SectionKey[])
    .map(
      (s) =>
        `<li><a href="/sections/${sectionSlug(s)}/"${s === p.section ? ' aria-current="page"' : ''}>${esc(SECTION_NAMES[s])}</a></li>`,
    )
    .join('');
  const v = p.assetVersion;
  return `<!doctype html>
<html lang="en" data-motion="${motion}" data-motion-preset="${motion}">
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
  }${ogImage(p)}
<link rel="preload" href="/assets/fonts/fraunces-latin-full-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/tokens.css?v=${v}">
<link rel="stylesheet" href="/assets/site.css?v=${v}">
<script src="/assets/motion-boot.js?v=${v}"></script>
<script src="/assets/vendor/gsap.min.js?v=${v}" defer></script>
<script src="/assets/vendor/ScrollTrigger.min.js?v=${v}" defer></script>
<script src="/assets/motion.js?v=${v}" defer></script>${
    p.home ? `\n<script src="/assets/waterfront-gl.js?v=${v}" defer></script>` : ''
  }
</head>
<body>
<a class="skip-link" href="#main">Skip to the content</a>${
    config.preview
      ? `\n<p class="preview-banner" role="note"><strong>Preview.</strong> ${esc(config.preview)}</p>`
      : ''
  }
<header class="masthead${p.home ? ' masthead--home' : ''}" data-masthead>
  <div class="masthead__layer masthead__layer--deep" data-depth="deep" aria-hidden="true">${p.home ? '<canvas data-bathymetry></canvas>' : ''}</div>
  <div class="masthead__layer masthead__layer--contours" data-depth="mid" aria-hidden="true"></div>
  <div class="masthead__layer masthead__layer--glow" data-depth="near" aria-hidden="true"></div>
  <div class="masthead-inner" data-depth="type">
    <p class="wordmark"><a href="/">${esc(config.siteName)}</a></p>
    <hr class="masthead-rule">
    <p class="tagline">${esc(config.tagline)}</p>
  </div>
</header>
<nav class="sections" aria-label="Sections"><ul>${sections}</ul>${
    p.progress ? '<div class="progress" aria-hidden="true"><span class="progress__bar"></span></div>' : ''
  }</nav>
<main id="main" tabindex="-1">
${p.body}
</main>
<footer class="site-footer">
  <div class="site-footer__layer" aria-hidden="true"></div>
  <div class="site-footer__inner">
    <p class="site-footer__mark"><a href="/">${esc(config.siteName)}</a></p>
    ${signup(config, 'footer')}
    <div class="site-footer__links">${(config.pageLinks ?? [])
      .map((l) => `\n      <a href="${esc(l.href)}">${esc(l.label)}</a>`)
      .join('')}
      <a href="/feed.xml">RSS feed</a>${
        config.pitchUrl ? `\n      <a href="${esc(config.pitchUrl)}">Pitch us a story</a>` : ''
      }
    </div>
    <div class="site-footer__row">
      <p class="small">© ${new Date(config.builtAt).getUTCFullYear()} ${esc(config.siteName)}. Stories written by AI agents are labelled as such. Photographs are credited where they appear. Type: Fraunces and Source Sans 3 (SIL Open Font License 1.1).</p>
      <button type="button" class="motion-toggle" data-motion-toggle aria-pressed="true" hidden>Animation: on</button>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

function signup(config: SiteConfig, place: 'footer' | 'article'): string {
  if (!config.kitFormId || !/^[0-9]{1,12}$/.test(config.kitFormId)) return '';
  const id = `signup-${place}`;
  return `<form class="signup" action="https://app.kit.com/forms/${config.kitFormId}/subscriptions" method="post"${place === 'article' ? ' data-reveal' : ''}>
      <p class="signup__title" id="${id}-title">Get new stories by email</p>
      <p class="signup__note" id="${id}-note">Free. One email when we publish something worth your time. Unsubscribe any time.</p>
      <div class="signup__row">
        <label class="visually-hidden" for="${id}-email">Email address</label>
        <input id="${id}-email" class="signup__input" type="email" name="email_address" autocomplete="email" required aria-describedby="${id}-note">
        <button class="signup__button" type="submit">Subscribe</button>
      </div>
    </form>`;
}

// ---------- Cards and the lead feature ----------

const CARD_SIZES = '(min-width: 1080px) 360px, (min-width: 720px) 46vw, calc(100vw - 32px)';

function storyCard(story: SiteStory, opts: { heading?: 'h2' | 'h3'; compact?: boolean } = {}): string {
  const tag = opts.heading ?? 'h3';
  const media = story.heroImage
    ? `<div class="media-frame" data-media>${picture(story.heroImage, CARD_SIZES, { decorative: true })}</div>`
    : plate(story);
  return `<article class="card${opts.compact ? ' card--compact' : ''}" data-reveal>
  <div class="card__media">${media}</div>
  <div class="card__body">
  ${eyebrow(story)}
  <${tag} class="card__title"><a href="${storyPath(story)}">${esc(typeset(story.title))}</a></${tag}>
  ${story.dek && !opts.compact ? `<p class="card__dek">${esc(typeset(story.dek))}</p>` : ''}
  <p class="meta"><span>${esc(bylineFor(story))}</span><time datetime="${esc(story.publishedAt)}">${esc(day(story.publishedAt))}</time></p>
  </div>
</article>`;
}

function feature(story: SiteStory): string {
  const media = story.heroImage
    ? `<div class="media-frame media-frame--feature" data-media>${picture(story.heroImage, '(min-width: 1100px) 760px, calc(100vw - 32px)', { eager: true, decorative: true })}</div>`
    : plate(story);
  return `<article class="feature">
  <div class="feature__media">${media}</div>
  <div class="feature__panel" data-tilt>
    ${eyebrow(story)}
    <h2 class="feature__title" id="lead-title"><a href="${storyPath(story)}">${esc(typeset(story.title))}</a></h2>
    ${story.dek ? `<p class="feature__dek">${esc(typeset(story.dek))}</p>` : ''}
    <p class="meta"><span>${esc(bylineFor(story))}</span><time datetime="${esc(story.publishedAt)}">${esc(day(story.publishedAt))}</time><span>${readingMinutes(story.bodyMarkdown)} min read</span></p>
  </div>
</article>`;
}

// ---------- Pages ----------

function homePage(snapshot: SiteSnapshot, config: SiteConfig, v: string): string {
  const [lead, ...rest] = snapshot.stories;
  const body = lead
    ? `<div class="wrap">
  <h1 class="visually-hidden">Latest stories</h1>
  <section class="lead" aria-labelledby="lead-title">${feature(lead)}</section>
  ${rest.length ? `<section aria-labelledby="more-heading"><h2 id="more-heading" class="rule-heading" data-reveal>More stories</h2><div class="grid">${rest.map((s) => storyCard(s)).join('\n')}</div></section>` : ''}
</div>`
    : `<div class="wrap wrap--empty"><h1 class="page-title">Coming soon</h1><p class="lede">The first stories are on their way.${config.kitFormId ? ' Subscribe to hear when they land.' : ''}</p>${signup(config, 'article')}</div>`;
  return layout({
    config,
    assetVersion: v,
    title: config.siteName,
    description: `${config.siteName}: ${config.tagline}`,
    path: '/',
    body,
    home: true,
    image: lead?.heroImage ?? null,
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
    section,
    body: `<header class="section-hero" data-masthead>
  <div class="section-hero__layer" data-depth="mid" aria-hidden="true"></div>
  <div class="wrap section-hero__inner" data-depth="type">
    <p class="eyebrow eyebrow--light">Section</p>
    <h1 class="page-title section-hero__title">${esc(name)}</h1>
    <p class="section-hero__count">${stories.length === 1 ? '1 story' : `${stories.length} stories`}</p>
  </div>
</header>
<div class="wrap">
  ${stories.length ? `<div class="grid">${stories.map((s) => storyCard(s, { heading: 'h2' })).join('\n')}</div>` : '<p class="lede">No stories in this section yet.</p>'}
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

function heroFigure(img: SiteImage): string {
  return `<figure class="hero" data-reveal>
    <div class="media-frame media-frame--hero" data-media>${picture(img, '(min-width: 1240px) 1180px, calc(100vw - 32px)', { eager: true })}</div>
    <figcaption class="hero__caption">${img.caption ? `<span class="hero__text">${esc(img.caption)}</span> ` : ''}<span class="credit">${esc(img.credit)}</span>${provenanceTag(img)}</figcaption>
  </figure>`;
}

/** Up to three other stories: the same section first, then the newest. */
function related(story: SiteStory, all: SiteStory[]): SiteStory[] {
  const others = all.filter((s) => s.contentId !== story.contentId);
  return [
    ...others.filter((s) => s.section === story.section),
    ...others.filter((s) => s.section !== story.section),
  ].slice(0, 3);
}

function storyPage(story: SiteStory, snapshot: SiteSnapshot, config: SiteConfig, v: string): string {
  const updated =
    new Date(story.updatedAt).getTime() - new Date(story.publishedAt).getTime() > 60 * 60 * 1000
      ? ` <span class="meta__updated">Updated <time datetime="${esc(story.updatedAt)}">${esc(day(story.updatedAt))}</time></span>`
      : '';
  const sources = story.sources.length
    ? `<section class="sources" aria-labelledby="sources-heading" data-reveal><h2 id="sources-heading">Sources</h2><ul>${story.sources.map(sourceItem).join('')}</ul></section>`
    : '';
  const disclosure = story.aiGenerated
    ? `<aside class="disclosure" aria-label="How this story was written" data-reveal><p class="disclosure__title">${AI_ICON}How this story was written</p><p>${esc(snapshot.disclosure)}</p></aside>`
    : '';
  const more = related(story, snapshot.stories);
  return layout({
    config,
    assetVersion: v,
    title: story.title,
    description: story.dek ?? markdownToText(story.bodyMarkdown, 200),
    path: storyPath(story),
    type: 'article',
    section: story.section,
    progress: true,
    publishedAt: story.publishedAt,
    image: story.heroImage ?? null,
    body: `<article class="story${story.label === 'reporting' && !story.aiGenerated ? ' story--dropcap' : ''}">
  <header class="story__header">
    ${eyebrow(story)}
    <h1 class="story__title">${esc(typeset(story.title))}</h1>
    ${story.dek ? `<p class="story__dek">${esc(typeset(story.dek))}</p>` : ''}
    <p class="meta"><span>By ${esc(bylineFor(story))}</span><time datetime="${esc(story.publishedAt)}">${esc(day(story.publishedAt))}</time><span>${readingMinutes(story.bodyMarkdown)} min read</span>${updated}</p>
  </header>
  ${story.heroImage ? heroFigure(story.heroImage) : ''}
  ${story.isSample ? SAMPLE_NOTE : ''}
  <div class="story__body">
${markdownToHtml(story.bodyMarkdown)}
  </div>
  ${disclosure}
  ${sources}
  ${signup(config, 'article')}
</article>${
      more.length
        ? `\n<section class="related wrap" aria-labelledby="related-heading"><h2 id="related-heading" class="rule-heading" data-reveal>More from the waterfront</h2><div class="grid grid--related">${more.map((s) => storyCard(s, { compact: true })).join('\n')}</div></section>`
        : ''
    }`,
  });
}

function standingPage(page: SitePage, config: SiteConfig, v: string): string {
  // The one placeholder pages may use: the desk's public pitch form differs per environment.
  const body = page.bodyMarkdown.replaceAll('{{pitch_url}}', config.pitchUrl ?? '/');
  return layout({
    config,
    assetVersion: v,
    title: page.title,
    description: page.description,
    path: `/${page.slug}/`,
    body: `<article class="story page">
  <header class="story__header">
    <h1 class="story__title">${esc(page.title)}</h1>
    <p class="story__dek">${esc(page.description)}</p>
  </header>
  <div class="story__body">
${markdownToHtml(body)}
  </div>
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
    body: `<div class="wrap wrap--empty"><h1 class="page-title">We could not find that page</h1><p class="lede">It may have moved or been taken down. <a href="/">See the latest stories</a>.</p></div>`,
  });
}

const xml = (s: string) => esc(s);

function feed(snapshot: SiteSnapshot, config: SiteConfig): string {
  const items = snapshot.stories
    .slice(0, 30)
    .map(
      (s) => `  <item>
    <title>${xml(s.isSample ? `Sample: ${s.title}` : s.title)}</title>
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

function sitemap(
  snapshot: SiteSnapshot,
  config: SiteConfig,
  sections: SectionKey[],
  pages: SitePage[],
): string {
  const urls = [
    `${config.publicUrl}/`,
    ...pages.map((p) => `${config.publicUrl}/${p.slug}/`),
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

/**
 * Check each image file against the snapshot: every referenced rendition must be present, with bytes
 * whose SHA-256 matches its name, so a page never points at a missing or substituted image.
 */
function checkedMedia(snapshot: SiteSnapshot, media: SiteFile[]): SiteFile[] {
  const byPath = new Map(media.map((m) => [m.path, m]));
  return mediaRefs(snapshot).map((ref) => {
    const file = byPath.get(ref.path);
    if (!file)
      throw new Error(`missing image file ${ref.path} (${ref.imageId}, ${ref.format} ${ref.width}w)`);
    if (createHash('sha256').update(file.body).digest('hex') !== ref.sha256)
      throw new Error(`image file ${ref.path} does not match its hash`);
    return {
      path: ref.path,
      body: file.body,
      contentType: ref.format === 'avif' ? 'image/avif' : 'image/webp',
    };
  });
}

export function buildSite(
  snapshot: SiteSnapshot,
  baseConfig: SiteConfig,
  assets: SiteFile[],
  pages: SitePage[] = [],
  media: SiteFile[] = [],
): SiteFile[] {
  // Placeholder stories exist to show a preview; they can never reach the real site.
  if (!baseConfig.preview && snapshot.stories.some((s) => s.isSample))
    throw new Error(
      'Sample stories can only appear on a preview site. Take them down (docs/LAUNCH_PREVIEW.md) before publishing to the real site.',
    );
  for (const page of pages)
    if (!SLUG.test(page.slug) || RESERVED_PAGE_SLUGS.has(page.slug))
      throw new Error(`unsafe page slug: ${page.slug}`);
  const orderedPages = [...pages].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const config: SiteConfig = {
    ...baseConfig,
    pageLinks: orderedPages.map((p) => ({ href: `/${p.slug}/`, label: p.title })),
  };
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
    text('/sitemap.xml', sitemap(ordered, config, sections, orderedPages), 'application/xml; charset=utf-8'),
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
    ...orderedPages.map((p) => text(`/${p.slug}/index.html`, standingPage(p, config, v), html)),
    ...assets,
    ...checkedMedia(ordered, media),
  ];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`duplicate site path ${f.path}`);
    seen.add(f.path);
  }
  return files;
}
