import { describe, expect, it } from 'vitest';
import { readerText, showsContactDetails } from './contact';

// The rendered-text check that runs before an agent story is deployed (defense in depth behind
// the database's content checks).

const BODY =
  'Scallop landings in the Gulf of Maine rose by 12% in 2025, to 1,200 tonnes, and prices fell +3.5 cents. The 2025-2026 quota is set (see the state report).';

const story = (bodyMarkdown: string, title = 'Scallop season opens', dek: string | null = null) => ({
  title,
  dek,
  bodyMarkdown,
});

describe('showsContactDetails', () => {
  it('passes ordinary trade copy full of figures and dates', () => {
    expect(showsContactDetails(story(BODY))).toBe(false);
    expect(
      showsContactDetails(story('Prices rose +12.5 (2025) on the year; up +1.5 in Q3 2025 vs Q2.')),
    ).toBe(false);
  });

  it.each([
    ['a plain email address', 'Write to jane@example.com.'],
    ['an email hidden by a Markdown escape', 'Write to jane\\@example.com.'],
    ['an email split by emphasis', 'Write to jane@exa*mple*.com.'],
    ['an email split by an invisible character', 'Write to jane\u200B@example.com.'],
    ['an email only in a link target', 'Write to [the office](mailto:jane@example.com).'],
    ['a North American phone number', 'Call (207) 555-0134.'],
    ['a phone number hidden by escapes', 'Call 207\\-555\\-0134.'],
    ['an international phone number', 'The exporter is on +56 2 2345 6789.'],
  ])('catches %s', (_label, text) => {
    expect(showsContactDetails(story(`${BODY} ${text}`))).toBe(true);
  });

  it('checks the headline and summary too', () => {
    expect(showsContactDetails(story(BODY, 'Call 207-555-0134 for scallops'))).toBe(true);
    expect(showsContactDetails(story(BODY, 'Scallops', 'Ask jane@example.com'))).toBe(true);
  });
});

describe('readerText', () => {
  it('joins inline markup without inventing spaces and keeps paragraphs apart', () => {
    const text = readerText(story('One *two* three\n\nFour &amp; five'));
    expect(text).toContain('One two three');
    expect(text).toContain('Four & five');
    expect(text).not.toContain('<');
  });
});
