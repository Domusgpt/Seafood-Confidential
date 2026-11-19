import { markdownToHtml } from './markdown';

/** The parts of a story a reader sees. */
export interface StoryText {
  title: string;
  dek: string | null;
  bodyMarkdown: string;
}

// The database refuses agent text with contact details before anything is queued; this second
// look runs on the text as rendered for readers (and on link targets), so a Markdown trick that
// slipped past the source check still cannot reach the public site under an agent's name.
const CONTACT_PATTERNS = [
  /[A-Za-z0-9._%+-]+[@＠][A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /(\+?1[-. ]?)?\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}/,
  /\+(?=(?:[^0-9\n]{0,2}[0-9]){9})[0-9]{1,3}(?:[ .-]?\(?[0-9]{1,4}\)?){2,6}/,
];
const BLOCK_END = /<\/(p|li|h[1-6]|blockquote|pre|td|th|tr)>|<br\s*\/?>|<hr\s*\/?>/gi;

/** The story as a reader sees it: rendered, tags removed without inventing spaces, entities decoded. */
export function readerText(story: StoryText): string {
  const html = markdownToHtml(story.bodyMarkdown);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  const body = html
    .replace(BLOCK_END, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!,
    );
  return [story.title, story.dek ?? '', body, ...hrefs]
    .join('\n')
    .replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, '');
}

export function showsContactDetails(story: StoryText): boolean {
  const text = readerText(story);
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}
