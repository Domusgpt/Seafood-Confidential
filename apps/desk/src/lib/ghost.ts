// Links into the native Ghost editor (SC-007: "exact native editor link"). The desk never writes to
// Ghost and never mirrors Ghost's post status: operations states stay in the desk.

export const GHOST_POST_ID = /^[0-9a-f]{24}$/;

export function ghostEditorUrl(adminUrl: string | undefined, postId: string | null): string | null {
  if (!adminUrl || !postId || !GHOST_POST_ID.test(postId)) return null;
  return `${adminUrl.replace(/\/+$/, '')}/ghost/#/editor/post/${postId}`;
}

export function ghostNewPostUrl(adminUrl: string | undefined): string | null {
  if (!adminUrl) return null;
  return `${adminUrl.replace(/\/+$/, '')}/ghost/#/editor/post`;
}

/**
 * Accept either a bare Ghost post ID or a pasted Ghost editor URL and return the post ID, or null.
 * Editors copy whatever their browser shows; the desk stores only the canonical ID.
 */
export function extractGhostPostId(input: string): string | null {
  const value = input.trim();
  if (GHOST_POST_ID.test(value)) return value;
  const match = value.match(/\/editor\/post\/([0-9a-f]{24})(?:[/?#]|$)/);
  return match ? match[1] : null;
}
