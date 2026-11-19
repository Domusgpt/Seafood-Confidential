import { DESK_VERSION } from '@/lib/env';
import { API_CSP } from '@/lib/security';

// Liveness only: no configuration, dependencies or identities are disclosed.
export function GET() {
  return Response.json(
    { status: 'ok', service: 'sc-desk', version: DESK_VERSION },
    { headers: { 'Cache-Control': 'no-store', 'Content-Security-Policy': API_CSP } },
  );
}
