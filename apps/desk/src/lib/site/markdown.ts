import MarkdownIt from 'markdown-it';

// Story text is Markdown. Raw HTML in it is escaped, never passed through, and links are limited to
// http(s) and mailto, so nothing a writer or an agent types can run script on the public site.

const md = new MarkdownIt({ html: false, linkify: false, typographer: true, breaks: false });
const SAFE_LINK = /^(https?:|mailto:)/i;
md.validateLink = (url: string) => SAFE_LINK.test(url.trim());

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('rel', 'noopener nofollow');
  return defaultLinkOpen(tokens, idx, options, env, self);
};
// Story headings start at h2 (the page title is the only h1).
md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const level = Math.min(6, Math.max(2, Number(tokens[idx].tag.slice(1)) + 1));
  tokens[idx].tag = `h${level}`;
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.heading_close = (tokens, idx, options, _env, self) => {
  const level = Math.min(6, Math.max(2, Number(tokens[idx].tag.slice(1)) + 1));
  tokens[idx].tag = `h${level}`;
  return self.renderToken(tokens, idx, options);
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function markdownToHtml(markdown: string): string {
  return md.render(markdown).trim();
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
