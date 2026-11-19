import { handleAgentRequest } from '@/lib/agent/gateway';
import { API_CSP } from '@/lib/security';

// POST /api/agent/v1: the draft-only agent gateway. See docs/DESK.md for the request and response
// envelopes and contracts/agent-tools.schema.json for the request contract.
export async function POST(request: Request) {
  return handleAgentRequest(request);
}

function methodNotAllowed() {
  return Response.json(
    {
      schemaVersion: '1.0',
      ok: false,
      error: { code: 'method_not_allowed', message: 'Use POST with an application/json body.' },
    },
    {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store', 'Content-Security-Policy': API_CSP },
    },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
