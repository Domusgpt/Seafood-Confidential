import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { verifyGoogleIdToken } from '@/lib/google-oidc';
import { logger } from '@/lib/logger';
import { runPendingJobs } from '@/lib/publishing/executor';
import { resolveRequestId } from '@/lib/security';

// Scheduled publishing sweep. Cloud Scheduler calls this every few minutes with a Google-signed ID
// token, and it runs publish jobs that are waiting: queued behind a busy build, or left running by a
// worker that stopped. Only a token for the configured service account and this exact address is
// accepted; with no invoker configured the route answers 404, as if it did not exist.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const config = env();
  if (!config.PUBLISH_SWEEP_INVOKER)
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: HEADERS });

  const token = BEARER.exec(request.headers.get('authorization') ?? '')?.[1];
  try {
    if (!token) throw new Error('no bearer token');
    await verifyGoogleIdToken(token, {
      audience: `${config.DESK_SITE_URL.replace(/\/+$/, '')}/api/publishing/sweep`,
      email: config.PUBLISH_SWEEP_INVOKER,
    });
  } catch (error) {
    // The reason class only; never the token.
    logger.warn(
      { request_id: requestId, reason: (error as { code?: string }).code ?? (error as Error).message },
      'publish sweep refused',
    );
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: HEADERS });
  }

  const ran = await runPendingJobs(requestId, 10);
  logger.info({ request_id: requestId, ran }, 'publish sweep');
  return NextResponse.json({ ok: true, ran }, { headers: HEADERS });
}
