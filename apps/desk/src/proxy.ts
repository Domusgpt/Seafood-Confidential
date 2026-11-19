import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce, REQUEST_ID_HEADER, resolveRequestId } from '@/lib/security';

// Proxy (Next 16; Node runtime) for every HTML route: correlation ID, nonce CSP and Supabase session
// refresh. It is not the authorization boundary: every page, Server Action and route handler checks
// the signed-in principal itself, and Row Level Security decides in the database.
export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const nonce = createNonce();
  const https = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === 'development', https });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the Supabase session cookie when one exists (Server Components cannot write cookies).
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (url && key && hasAuthCookie) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });
    await supabase.auth.getClaims();
  }

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except framework assets, the machine APIs (they set their own headers and
      // authenticate on their own: agent tokens, the scheduler's signed token) and health.
      source: '/((?!_next/static|_next/image|api/agent|api/publishing|api/health|favicon.ico|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
