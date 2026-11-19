import { describe, expect, it } from 'vitest';
import { extractGhostPostId, ghostEditorUrl, ghostNewPostUrl } from './ghost';

const ID = '0123456789abcdef01234567';

describe('Ghost references', () => {
  it('accepts a bare post ID or a pasted editor URL', () => {
    expect(extractGhostPostId(ID)).toBe(ID);
    expect(extractGhostPostId(`  ${ID}  `)).toBe(ID);
    expect(extractGhostPostId(`https://news.example/ghost/#/editor/post/${ID}`)).toBe(ID);
    expect(extractGhostPostId(`https://news.example/ghost/#/editor/post/${ID}/`)).toBe(ID);
  });

  it('rejects anything that is not a Ghost object ID', () => {
    for (const bad of [
      '',
      'not-an-id',
      ID.toUpperCase(),
      `${ID}0`,
      'https://news.example/ghost/#/editor/post/xyz',
      `javascript:${ID}`,
    ]) {
      expect(extractGhostPostId(bad)).toBeNull();
    }
  });

  it('builds the exact native editor link only for valid IDs', () => {
    expect(ghostEditorUrl('http://localhost:2368/', ID)).toBe(
      `http://localhost:2368/ghost/#/editor/post/${ID}`,
    );
    expect(ghostEditorUrl(undefined, ID)).toBeNull();
    expect(ghostEditorUrl('http://localhost:2368', 'nope')).toBeNull();
    expect(ghostNewPostUrl('http://localhost:2368')).toBe('http://localhost:2368/ghost/#/editor/post');
  });
});
