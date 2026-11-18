import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveRequestId, safeNextPath } from '@/lib/security';
import { supabaseAuth } from '@/lib/supabase';

// Magic-link landing. Two link shapes arrive here, and both are verified on the server before the
// session cookie is set and the user is sent to a same-site path only:
//   - token_hash + type, from our template (supabase/templates/magic_link.html; needs custom SMTP);
//   - code, from Supabase's default template, which verifies the link first and redirects here
//     with a one-time PKCE code. The code verifier cookie set when the link was requested must be
//     present, so this works in the browser that asked for the link.
const ALLOWED_TYPES: EmailOtpType[] = ['email', 'magiclink'];

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const code = params.get('code');
  const type = params.get('type') as EmailOtpType | null;
  const next = safeNextPath(params.get('next'));
  const base = env().DESK_SITE_URL;

  if (tokenHash && type && ALLOWED_TYPES.includes(type) && /^[A-Za-z0-9_-]{8,256}$/.test(tokenHash)) {
    const supabase = await supabaseAuth();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      logger.info({ request_id: requestId }, 'sign-in link verified');
      return NextResponse.redirect(new URL(next, base), { status: 303 });
    }
    logger.info({ request_id: requestId, auth_error: error.code ?? error.name }, 'sign-in link rejected');
  } else if (code && /^[A-Za-z0-9-]{8,128}$/.test(code)) {
    const supabase = await supabaseAuth();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      logger.info({ request_id: requestId }, 'sign-in code exchanged');
      return NextResponse.redirect(new URL(next, base), { status: 303 });
    }
    logger.info({ request_id: requestId, auth_error: error.code ?? error.name }, 'sign-in code rejected');
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', base), { status: 303 });
}
