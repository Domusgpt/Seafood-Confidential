import 'server-only';
import postgres from 'postgres';
import { env } from './env';

// The desk connects as desk_app: a NOINHERIT login role with no privileges of its own. Every unit of
// work runs in a transaction that first switches to the API role for the caller and binds the
// caller's identity, so Row Level Security decides what each query can see (ADR-003). A query issued
// outside these helpers runs as desk_app and fails closed.

export type Tx = postgres.TransactionSql;

export interface StaffClaims {
  sub: string;
  role: string;
  email?: string;
  aal?: string;
  session_id?: string;
  exp?: number;
}

declare global {
  var __scDeskSql: postgres.Sql | undefined;
}

function pool(): postgres.Sql {
  if (!globalThis.__scDeskSql) {
    const config = env();
    globalThis.__scDeskSql = postgres(config.DESK_DATABASE_URL, {
      max: config.DESK_DB_POOL_MAX,
      prepare: config.DESK_DB_PREPARE,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.camel,
      connection: {
        application_name: 'sc-desk',
        statement_timeout: 10_000,
        idle_in_transaction_session_timeout: 15_000,
      },
    });
  }
  return globalThis.__scDeskSql;
}

async function bind(tx: Tx, requestId: string, claims: string, agentPrincipal: string) {
  await tx`
    select set_config('request.jwt.claims', ${claims}, true),
           set_config('app.agent_principal_id', ${agentPrincipal}, true),
           set_config('app.request_id', ${requestId}, true)
  `;
}

/** Run fn as a signed-in staff member. Claims must come from a verified Supabase session. */
export function withStaff<T>(
  ctx: { claims: StaffClaims; requestId: string },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({
    sub: ctx.claims.sub,
    role: 'authenticated',
    email: ctx.claims.email,
    aal: ctx.claims.aal,
    session_id: ctx.claims.session_id,
  });
  return pool().begin(async (tx) => {
    await bind(tx, ctx.requestId, claims, '');
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

/** Run fn as the public intake role (anon); only app.submit_pitch is executable there. */
export function withAnon<T>(ctx: { requestId: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return pool().begin(async (tx) => {
    await bind(tx, ctx.requestId, '', '');
    await tx`set local role anon`;
    return fn(tx);
  }) as Promise<T>;
}

export interface AgentBinding {
  principalId: string;
  scopes: string[];
  credentialId: string;
}

/**
 * Run fn as an agent. The token is verified inside the database (prefix + SHA-256 of the secret);
 * an unknown, expired or revoked credential gets fn(tx, null) with no principal bound, so the caller
 * can record the denial in the same committed transaction.
 */
export function withAgent<T>(
  ctx: { requestId: string; tokenPrefix: string | null; tokenHash: string | null },
  fn: (tx: Tx, agent: AgentBinding | null) => Promise<T>,
): Promise<T> {
  return pool().begin(async (tx) => {
    await bind(tx, ctx.requestId, '', '');
    await tx`set local role desk_agent`;
    let agent: AgentBinding | null = null;
    if (ctx.tokenPrefix && ctx.tokenHash) {
      const rows = await tx<AgentBinding[]>`
        select principal_id, scopes, credential_id
        from app.authenticate_agent(${ctx.tokenPrefix}, ${ctx.tokenHash})
      `;
      agent = rows[0] ?? null;
    }
    return fn(tx, agent);
  }) as Promise<T>;
}

export async function closePool() {
  await globalThis.__scDeskSql?.end({ timeout: 5 });
  globalThis.__scDeskSql = undefined;
}

/** Postgres error codes the desk maps to user-facing outcomes. */
export const PG = {
  insufficientPrivilege: '42501',
  checkViolation: '23514',
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  invalidParameter: '22023',
  noData: 'P0002',
  alreadyDecided: 'SC409',
} as const;

export function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}
