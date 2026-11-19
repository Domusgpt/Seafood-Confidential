import MarkdownIt from 'markdown-it';

// Story text is Markdown. Raw HTML in it is escaped, never passed through, and links are limited to
// http(s), mailto and same-site paths (/about/, never //host), so nothing a writer or an agent types
// can run script on the public site. Agents are further limited to their cited sources' URLs by the
// database's publishing checks.

const md = new MarkdownIt({ html: false, linkify: false, typographer: true, breaks: false });
const SAFE_LINK = /^(https?:|mailto:|\/(?![\/\\]))/i;
md.validateLink = (url: string) => SAFE_LINK.test(url.trim());

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  // Links to other sites are not endorsed; links within our own site are ordinary links.
  if (/^(https?:|mailto:)/i.test(tokens[idx].attrGet('href') ?? ''))
    tokens[idx].attrSet('rel', 'noopener nofollow');
  return defaultLinkOpen(tokens, idx, options, env, self);
};
// The page title is the only h1, so the highest heading a writer uses becomes h2 and the rest keep
// their order below it: '# A' and '## A' both start at h2, with no skipped levels.
interface RenderEnv {
  headingShift?: number;
}
const shifted = (tag: string, env: RenderEnv) =>
  `h${Math.min(6, Math.max(2, Number(tag.slice(1)) + (env.headingShift ?? 1)))}`;
md.renderer.rules.heading_open = (tokens, idx, options, env: RenderEnv, self) => {
  tokens[idx].tag = shifted(tokens[idx].tag, env);
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.heading_close = (tokens, idx, options, env: RenderEnv, self) => {
  tokens[idx].tag = shifted(tokens[idx].tag, env);
  return self.renderToken(tokens, idx, options);
};

/** Typographic apostrophes inside words (boat's → boat’s), as Markdown bodies already get. */
export function typeset(value: string): string {
  return value.replace(/(\p{L}|\p{N})'(?=\p{L})/gu, '$1\u2019');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function markdownToHtml(markdown: string): string {
  const env: RenderEnv = {};
  const tokens = md.parse(markdown, env);
  const levels = tokens.filter((t) => t.type === 'heading_open').map((t) => Number(t.tag.slice(1)));
  env.headingShift = levels.length ? 2 - Math.min(...levels) : 0;
  return md.renderer.render(tokens, md.options, env).trim();
}

/** Plain text for descriptions and feeds: Markdown rendered, tags stripped, whitespace collapsed. */
export function markdownToText(markdown: string, max = 300): string {
  const text = markdownToHtml(markdown)
    .replace(/<[^>]+>/g, ' ')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!,
    )
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
