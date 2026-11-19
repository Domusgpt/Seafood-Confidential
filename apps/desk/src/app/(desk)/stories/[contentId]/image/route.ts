import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession, type StaffSession } from '@/lib/auth';
import { PG, pgCode, withStaff } from '@/lib/db';
import { env } from '@/lib/env';
import { FOCUS } from '@/lib/images/focus';
import { ImageError, MAX_UPLOAD_BYTES, processImage } from '@/lib/images/process';
import { logger } from '@/lib/logger';

// A story's lead image (v0.7.0).
//   GET  shows staff the current image (a WebP rendition), for the story page.
//   POST attaches a new one: an ordinary form post, so it works without JavaScript.
// Uploads come here rather than through a Server Action so the other actions, the public pitch
// form among them, keep their 1 MB body limit. The staff session, the request's origin and its size
// are checked before the body is read; the database checks the rights record and every rendition.

const CONTENT_ID = /^SC-[0-9]{4}-[0-9]{3,}$/;

const fields = z.object({
  alt: z.string().trim().min(5).max(300),
  caption: z.string().trim().max(400).optional(),
  rightsId: z.uuid(),
  focus: z.enum(Object.keys(FOCUS) as [string, ...string[]]).default('center'),
});

const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

async function staff(): Promise<StaffSession | null> {
  const session = await getSession();
  return session.state === 'staff' ? session : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  if (!CONTENT_ID.test(contentId)) return new NextResponse(null, { status: 404, headers: HEADERS });
  const session = await staff();
  if (!session) return new NextResponse(null, { status: 401, headers: HEADERS });
  const body = await withStaff({ claims: session.claims, requestId: session.requestId }, async (tx) => {
    const [row] = await tx<{ body: Buffer | null }[]>`
      select app.story_image_preview((select id from app.editorial_items where content_id = ${contentId}), 800) as body
    `;
    return row?.body ?? null;
  });
  if (!body) return new NextResponse(null, { status: 404, headers: HEADERS });
  return new NextResponse(new Uint8Array(body), {
    headers: { ...HEADERS, 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=60' },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  const desk = env().DESK_SITE_URL.replace(/\/+$/, '');
  if (!CONTENT_ID.test(contentId)) return new NextResponse(null, { status: 404, headers: HEADERS });
  const back = (outcome: string) =>
    NextResponse.redirect(`${desk}/stories/${contentId}?image=${outcome}#image`, {
      status: 303,
      headers: HEADERS,
    });

  // Same-origin form posts only (the session cookie is SameSite=Lax too).
  if (request.headers.get('origin') !== new URL(desk).origin)
    return new NextResponse(null, { status: 403, headers: HEADERS });
  const session = await staff();
  if (!session) return NextResponse.redirect(`${desk}/sign-in`, { status: 303, headers: HEADERS });
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length > MAX_UPLOAD_BYTES + 64 * 1024) return back('too_large');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('unreadable');
  }
  const file = form.get('image');
  const parsed = fields.safeParse({
    alt: form.get('alt'),
    caption: form.get('caption') || undefined,
    rightsId: form.get('rightsId'),
    focus: form.get('focus') || undefined,
  });
  if (!(file instanceof File) || file.size === 0) return back('no_file');
  if (!parsed.success)
    return back(parsed.error.issues.some((i) => i.path[0] === 'alt') ? 'alt' : 'incomplete');
  const { alt, caption, rightsId, focus } = parsed.data;
  const [fx, fy] = FOCUS[focus];

  let original: Buffer;
  let processed: Awaited<ReturnType<typeof processImage>>;
  try {
    original = Buffer.from(await file.arrayBuffer());
    processed = await processImage(original);
  } catch (error) {
    if (error instanceof ImageError) return back(error.code);
    logger.error({ request_id: session.requestId, err: (error as Error).message }, 'image processing failed');
    return back('error');
  }

  try {
    await withStaff(
      { claims: session.claims, requestId: session.requestId },
      (tx) => tx`
      select app.attach_story_image(
        (select id from app.editorial_items where content_id = ${contentId}), ${rightsId}, ${alt}, ${caption ?? null},
        ${fx}, ${fy}, ${processed.width}, ${processed.height}, ${processed.originalSha256}, ${processed.originalMediaType},
        ${tx.json(processed.renditions.map(({ format, width, height, sha256 }) => ({ format, width, height, sha256 })))},
        ${processed.renditions.map((r) => r.bytes)}::bytea[], ${original}
      )
    `,
    );
  } catch (error) {
    const code = pgCode(error);
    if (code === '55006') return back('busy');
    // The database's own refusals about the rights record are the editor's to fix; anything else
    // (a rendition that does not match its description) is a fault on our side.
    if (
      (code === PG.invalidParameter && /rights record/.test((error as Error).message)) ||
      code === PG.foreignKeyViolation
    )
      return back('rights');
    if (code === PG.checkViolation) return back('alt');
    if (code === PG.insufficientPrivilege) return back('role');
    logger.error(
      { request_id: session.requestId, pg_code: code, err: (error as Error).message },
      'image attach failed',
    );
    return back('error');
  }
  logger.info(
    { request_id: session.requestId, content_id: contentId, renditions: processed.renditions.length },
    'story image attached',
  );
  return back('attached');
}
