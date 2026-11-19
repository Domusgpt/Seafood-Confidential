import { randomUUID } from 'node:crypto';

// Thin HTTP client for POST /api/agent/v1. Every call is recorded so scenarios can assert on what
// the agent actually did, independently of what the model says it did.

export interface GatewayCall {
  tool: string;
  status: number;
  code: string | null;
  requestId: string;
  args: unknown;
  ms: number;
}

export class Gateway {
  readonly calls: GatewayCall[] = [];
  private readonly baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  async call(tool: string, args: Record<string, unknown>, idempotencyKey?: string) {
    const requestId = `req-lab-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const body: Record<string, unknown> = { schemaVersion: '1.0', requestId, tool, arguments: args };
    if (idempotencyKey) body.idempotencyKey = idempotencyKey;
    const started = performance.now();
    const res = await fetch(`${this.baseUrl}/api/agent/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { code?: string } };
    this.calls.push({
      tool,
      status: res.status,
      code: json.error?.code ?? null,
      requestId,
      args,
      ms: Math.round(performance.now() - started),
    });
    return { status: res.status, body: json };
  }
}
