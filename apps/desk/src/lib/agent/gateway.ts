import 'server-only';
import { validateAgentRequest, type AgentRequest } from '@sc/contracts';
import { parseAuthorization } from '../agent-tokens';
import { pgCode, withAgent, type AgentBinding, type Tx } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { runPublishJob } from '../publishing/executor';
import { API_CSP, clientAddressFrom, isValidRequestId, resolveRequestId } from '../security';
import { SECTIONS } from '../vocab';
import { Semaphore, WindowCounter } from './limits';
import {
  decodeCursor,
  encodeCursor,
  failedChecks,
  isContentId,
  JOB_STATES,
  payloadHash,
  PUBLISH_JOB_STATES,
  toAgentSources,
  UUID,
  type AgentSourceRow,
  type GateResult,
} from './shape';

// Draft-only agent gateway v1 (first slice of SC-009). Layers, in order:
//   1. transport: POST, application/json, bounded body
//   2. authentication: bearer token verified inside the database (revocation is immediate)
//   3. contract: the kit's JSON Schema (unknown tools such as posts.publish never get further)
//   4. authorization: token scopes, then Row Level Security for every object
//   5. tool: reads with server-side redaction; drafts.propose with durable idempotency;
//      drafts.publish through the database's publishing policy and checks (ADR-005)
// Every outcome is written to the audit trail in the same transaction as the work. A publication
// is sent to Ghost only after that transaction commits (the job is durable first).

const MAX_BODY_BYTES = 512 * 1024;
const SCHEMA_VERSION = '1.0';

type Outcome = 'allowed' | 'denied' | 'error';

interface Result {
  status: number;
  body: Record<string, unknown>;
  outcome: Outcome;
  code?: string;
  subject?: string;
  headers?: Record<string, string>;
  /** Work that must happen only after the request's transaction committed (a queued publication). */
  afterCommit?: () => Promise<{ status: number; body: Record<string, unknown> }>;
}

class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function json(status: number, body: unknown, requestId: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': API_CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      ...extra,
    },
  });
}

function errorBody(requestId: string, code: string, message: string, details?: unknown) {
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId,
    ok: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

async function readBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES)
    throw new GatewayError(
      413,
      'payload_too_large',
      `Request bodies are limited to ${MAX_BODY_BYTES} bytes.`,
    );
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new GatewayError(
        413,
        'payload_too_large',
        `Request bodies are limited to ${MAX_BODY_BYTES} bytes.`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function audit(
  tx: Tx,
  action: string,
  outcome: Outcome,
  subject: string | null,
  requestId: string,
  details: Record<string, unknown>,
) {
  await tx`select app.record_audit(${action}, 'agent_tool', ${subject}, ${outcome}, ${requestId}, ${JSON.stringify(details)}::jsonb)`;
}

// Pre-database guards (per instance). Missing or malformed tokens never reach the database; failed
// authentications are limited per client address; database work is capped so staff pages keep
// connections even under a flood.
const failedAuthByClient = new WindowCounter(20, 60_000);
const gatewaySlots = new Semaphore(4, 32);
const BEARER_CHALLENGE = { 'WWW-Authenticate': 'Bearer realm="sc-desk-agents"' };

export async function handleAgentRequest(request: Request): Promise<Response> {
  const started = performance.now();
  const transportId = resolveRequestId(request.headers.get('x-request-id'));
  const client = clientAddressFrom(request.headers.get('x-forwarded-for'), env().DESK_TRUSTED_PROXY_HOPS);
  const reject = (
    requestId: string,
    status: number,
    code: string,
    message: string,
    extra: Record<string, string> = {},
  ) => {
    logger.info(
      { request_id: requestId, status, code, ms: Math.round(performance.now() - started) },
      'agent request rejected',
    );
    return json(status, errorBody(requestId, code, message), requestId, extra);
  };

  // 1. Transport. Logged, not audited: nothing here is attributable to an agent.
  let body: unknown;
  try {
    if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) {
      throw new GatewayError(415, 'unsupported_media_type', 'Send the request as application/json.');
    }
    const raw = await readBody(request);
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GatewayError(400, 'invalid_json', 'The request body is not valid JSON.');
    }
  } catch (error) {
    const e = error as GatewayError;
    return reject(transportId, e.status ?? 400, e.code ?? 'invalid_request', e.message);
  }

  // Correlate with the contract's requestId only when it is well formed (strictly checked later).
  const claimedId = (body as { requestId?: unknown } | null)?.requestId;
  const requestId = isValidRequestId(claimedId) ? claimedId : transportId;

  // 2. Pre-database guards: no token shape, no database work.
  const token = parseAuthorization(request.headers.get('authorization'));
  if (!token) {
    return reject(
      requestId,
      401,
      'unauthenticated',
      'A valid, unrevoked agent token is required.',
      BEARER_CHALLENGE,
    );
  }
  if (failedAuthByClient.blocked(client)) {
    return reject(requestId, 429, 'rate_limited', 'Too many failed authentications. Retry later.', {
      'Retry-After': '60',
    });
  }
  const release = await gatewaySlots.acquire();
  if (!release) {
    return reject(
      requestId,
      503,
      'busy',
      'The gateway is busy. Retry shortly with the same idempotency key.',
      {
        'Retry-After': '5',
      },
    );
  }

  // 3. Authentication inside the database, then budget, contract, scope and the tool itself.
  let result: Result;
  try {
    result = await withAgent(
      { requestId, tokenPrefix: token.prefix, tokenHash: token.hash },
      async (tx, agent) => {
        const tool =
          typeof (body as { tool?: unknown })?.tool === 'string'
            ? String((body as { tool: string }).tool).slice(0, 64)
            : 'unknown';
        if (!agent) {
          failedAuthByClient.hit(client);
          await audit(tx, 'agent.authenticate', 'denied', tool, requestId, {
            reason: 'invalid_or_revoked_token',
            token_prefix: token.prefix,
          });
          return {
            status: 401,
            outcome: 'denied',
            code: 'unauthenticated',
            headers: BEARER_CHALLENGE,
            body: errorBody(requestId, 'unauthenticated', 'A valid, unrevoked agent token is required.'),
          } satisfies Result;
        }
        // Per-agent budget, counted from the audit trail inside the database (one row per request).
        const [budget] = await tx<{ remaining: number }[]>`
        select app.agent_rate_remaining(${env().DESK_AGENT_RATE_PER_MINUTE}, 60) as remaining
      `;
        if (budget.remaining <= 0) {
          await audit(tx, `agent.${tool}`, 'denied', tool, requestId, { reason: 'rate_limited' });
          return {
            status: 429,
            outcome: 'denied',
            code: 'rate_limited',
            headers: { 'Retry-After': '60' },
            body: errorBody(
              requestId,
              'rate_limited',
              'Too many requests for this agent. Retry after a minute.',
            ),
          } satisfies Result;
        }
        const validation = validateAgentRequest(body);
        if (!validation.ok) {
          await audit(tx, `agent.${tool}`, 'denied', tool, requestId, {
            reason: 'contract_violation',
            errors: validation.errors.slice(0, 5),
          });
          return {
            status: 400,
            outcome: 'denied',
            code: 'contract_violation',
            body: errorBody(
              requestId,
              'contract_violation',
              'The request does not match the agent contract (schema version 1.0).',
              validation.errors,
            ),
          } satisfies Result;
        }
        const req = validation.request;
        // The desk stores and shows request IDs, so they must also be safe identifiers.
        if (!isValidRequestId(req.requestId)) {
          await audit(tx, `agent.${req.tool}`, 'denied', req.tool, requestId, {
            reason: 'invalid_request_id',
          });
          return {
            status: 400,
            outcome: 'denied',
            code: 'invalid_request_id',
            body: errorBody(
              requestId,
              'invalid_request_id',
              'requestId may contain only letters, digits and . _ : - (8 to 128 characters).',
            ),
          } satisfies Result;
        }
        if (!agent.scopes.includes(req.tool)) {
          await audit(tx, `agent.${req.tool}`, 'denied', req.tool, requestId, {
            reason: 'insufficient_scope',
          });
          return {
            status: 403,
            outcome: 'denied',
            code: 'insufficient_scope',
            body: errorBody(
              requestId,
              'insufficient_scope',
              `This token is not allowed to call ${req.tool}.`,
            ),
          } satisfies Result;
        }
        try {
          const out = await tx.savepoint((sp) => runTool(sp as unknown as Tx, agent, req));
          await audit(tx, `agent.${req.tool}`, out.outcome, out.subject ?? null, requestId, {
            status: out.status,
            code: out.code ?? null,
          });
          return out;
        } catch (error) {
          if (error instanceof GatewayError) {
            const outcome: Outcome = error.status >= 500 ? 'error' : 'denied';
            await audit(tx, `agent.${req.tool}`, outcome, req.tool, requestId, {
              status: error.status,
              code: error.code,
            });
            return {
              status: error.status,
              outcome,
              code: error.code,
              body: errorBody(requestId, error.code, error.message, error.details),
            } satisfies Result;
          }
          logger.error(
            { request_id: requestId, tool: req.tool, err: (error as Error).message },
            'agent tool failed',
          );
          await audit(tx, `agent.${req.tool}`, 'error', req.tool, requestId, {
            status: 500,
            code: 'internal_error',
          });
          return {
            status: 500,
            outcome: 'error',
            code: 'internal_error',
            body: errorBody(requestId, 'internal_error', 'The request failed. Nothing was changed.'),
          } satisfies Result;
        }
      },
    );
  } catch (error) {
    logger.error({ request_id: requestId, err: (error as Error).message }, 'agent gateway unavailable');
    return json(
      503,
      errorBody(
        requestId,
        'unavailable',
        'The desk could not process the request. Retry later with the same idempotency key.',
      ),
      requestId,
      { 'Retry-After': '5' },
    );
  } finally {
    release();
  }

  if (result.afterCommit) {
    try {
      const next = await result.afterCommit();
      result = { ...result, status: next.status, body: next.body };
    } catch (error) {
      logger.error({ request_id: requestId, err: (error as Error).message }, 'post-commit step failed');
      // The job is durable; the agent can follow it with jobs.read.
    }
  }

  logger.info(
    {
      request_id: requestId,
      status: result.status,
      outcome: result.outcome,
      code: result.code,
      token_prefix: token.prefix,
      ms: Math.round(performance.now() - started),
    },
    'agent request',
  );
  return json(result.status, result.body, requestId, result.headers ?? {});
}

const AGENT_READABLE_OUTCOMES = new Set<keyof typeof PUBLISH_JOB_STATES>([
  'succeeded',
  'cancelled',
  'refused',
]);

function ok(requestId: string, tool: string, data: Record<string, unknown>) {
  return { schemaVersion: SCHEMA_VERSION, requestId, ok: true, tool, result: data };
}

async function runTool(tx: Tx, agent: AgentBinding, req: AgentRequest): Promise<Result> {
  switch (req.tool) {
    case 'briefs.list': {
      const after = decodeCursor(req.arguments.cursor);
      if (after === 'invalid')
        throw new GatewayError(400, 'invalid_cursor', 'The cursor is not one this server issued.');
      const limit = req.arguments.limit ?? 20;
      const rows = await tx<
        {
          contentId: string;
          title: string;
          summary: string | null;
          section: string;
          format: string;
          status: string;
          dueOn: Date | null;
        }[]
      >`
        select content_id, title, summary, section, format, status, due_on
        from app.editorial_items
        where (${after}::text is null or content_id > ${after})
          and status not in ('published', 'withdrawn')
        order by content_id
        limit ${limit + 1}
      `;
      const page = rows.slice(0, limit);
      return {
        status: 200,
        outcome: 'allowed',
        body: ok(req.requestId, req.tool, {
          briefs: page.map((r) => ({
            briefId: r.contentId,
            title: r.title,
            summary: r.summary,
            section: r.section,
            format: r.format,
            status: r.status,
            dueOn: r.dueOn ? r.dueOn.toISOString().slice(0, 10) : null,
          })),
          nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].contentId) : null,
        }),
      };
    }

    case 'items.read': {
      const itemId = req.arguments.itemId;
      if (!isContentId(itemId))
        throw new GatewayError(404, 'not_found', 'No such item is available to this agent.');
      const [item] = await tx<
        {
          id: string;
          contentId: string;
          title: string;
          summary: string | null;
          section: string;
          format: string;
          label: string;
          focus: string | null;
          status: string;
          region: string[];
          species: string[];
          dueOn: Date | null;
          ghostPostId: string | null;
        }[]
      >`
        select id, content_id, title, summary, section, format, label, focus, status, region, species, due_on, ghost_post_id
        from app.editorial_items where content_id = ${itemId}
      `;
      if (!item) throw new GatewayError(404, 'not_found', 'No such item is available to this agent.');
      // Redaction happens in SQL (app.agent_item_sources); toAgentSources re-checks the shape.
      const sources = await tx<AgentSourceRow[]>`
        select source_code, source_type, title, publisher, url, published_on, accessed_on, claim_supported,
               location_in_source, case when redacted then 'redacted' else 'yes' end as agent_processing
        from app.agent_item_sources(${item.id})
      `;
      return {
        status: 200,
        outcome: 'allowed',
        subject: item.contentId,
        body: ok(req.requestId, req.tool, {
          item: {
            itemId: item.contentId,
            title: item.title,
            summary: item.summary,
            section: item.section,
            format: item.format,
            label: item.label,
            focus: item.focus,
            status: item.status,
            region: item.region,
            species: item.species,
            dueOn: item.dueOn ? item.dueOn.toISOString().slice(0, 10) : null,
            ghostLinked: item.ghostPostId !== null,
          },
          sources: toAgentSources(sources),
        }),
      };
    }

    case 'drafts.propose': {
      const { briefId, content } = req.arguments;
      if (!isContentId(briefId))
        throw new GatewayError(404, 'not_found', 'No such brief is available to this agent.');
      const [item] = await tx<{ id: string; status: string }[]>`
        select id, status from app.editorial_items where content_id = ${briefId}
      `;
      if (!item) throw new GatewayError(404, 'not_found', 'No such brief is available to this agent.');
      if (item.status === 'published' || item.status === 'withdrawn') {
        throw new GatewayError(409, 'brief_closed', 'This brief no longer accepts proposals.');
      }
      if (content.section !== undefined && !Object.hasOwn(SECTIONS, content.section)) {
        throw new GatewayError(422, 'unknown_section', 'content.section must be one of the desk sections.', {
          allowed: Object.keys(SECTIONS),
        });
      }
      // Never accept invented citations: every source ID must exist on this brief and be visible.
      const visible = await tx<{ sourceCode: string }[]>`
        select source_code from app.agent_item_sources(${item.id})
      `;
      const known = new Set(visible.map((s) => s.sourceCode));
      const unknown = [...new Set(content.sourceIds)].filter((id) => !known.has(id));
      if (unknown.length) {
        throw new GatewayError(
          422,
          'unknown_source_ids',
          'Cite only source IDs returned by items.read for this brief.',
          { unknown: unknown.slice(0, 20) },
        );
      }
      const hash = payloadHash(req.tool, req.arguments);
      const inserted = await tx<{ id: string }[]>`
        insert into app.draft_proposals (
          item_id, principal_id, idempotency_key, payload_hash, request_id, title, summary, body_markdown,
          section, source_ids, editor_notes
        ) values (
          ${item.id}, ${agent.principalId}, ${req.idempotencyKey}, ${hash}, ${req.requestId}, ${content.title},
          ${content.summary ?? null}, ${content.bodyMarkdown}, ${content.section ?? null}, ${[...new Set(content.sourceIds)]},
          ${content.editorNotes ?? null}
        )
        on conflict (principal_id, idempotency_key) do nothing
        returning id
      `;
      if (inserted.length) {
        return {
          status: 201,
          outcome: 'allowed',
          subject: briefId,
          body: ok(req.requestId, req.tool, {
            draftId: inserted[0].id,
            jobId: inserted[0].id,
            status: 'proposed',
            replayed: false,
          }),
        };
      }
      const [existing] = await tx<{ id: string; payloadHash: string; status: string }[]>`
        select id, payload_hash, status from app.draft_proposals
        where principal_id = ${agent.principalId} and idempotency_key = ${req.idempotencyKey}
      `;
      if (existing && existing.payloadHash === hash) {
        return {
          status: 200,
          outcome: 'allowed',
          code: 'replayed',
          subject: briefId,
          body: ok(req.requestId, req.tool, {
            draftId: existing.id,
            jobId: existing.id,
            status: existing.status,
            replayed: true,
          }),
        };
      }
      throw new GatewayError(
        409,
        'idempotency_conflict',
        'This idempotency key was already used with a different request. Use a new key for new content.',
      );
    }

    case 'drafts.publish': {
      const { draftId } = req.arguments;
      const sendEmail = req.arguments.sendEmail ?? false;
      if (!UUID.test(draftId))
        throw new GatewayError(404, 'not_found', 'No such proposal belongs to this agent.');
      const hash = payloadHash(req.tool, { draftId, sendEmail });
      let row: { jobId: string; jobStatus: string; replayed: boolean; gateResults: GateResult[] } | undefined;
      try {
        [row] = await tx<
          { jobId: string; jobStatus: string; replayed: boolean; gateResults: GateResult[] }[]
        >`
          select job_id, job_status, replayed, gate_results
          from app.agent_request_publish(${draftId}, ${sendEmail}, ${req.idempotencyKey}, ${hash}, ${req.requestId})
        `;
      } catch (error) {
        const code = pgCode(error);
        if (code === 'P0002')
          throw new GatewayError(404, 'not_found', 'No such proposal belongs to this agent.');
        if (code === 'SC409')
          throw new GatewayError(
            409,
            'idempotency_conflict',
            'This idempotency key was already used with a different request. Use a new key for a new request.',
          );
        if (code === '23505')
          throw new GatewayError(
            409,
            'publish_in_progress',
            'A publication of this story is already in progress.',
          );
        if (code === '42501')
          throw new GatewayError(403, 'insufficient_scope', 'This token is not allowed to publish.');
        throw error;
      }
      const job = row!;
      if (job.jobStatus === 'refused') {
        // Returned, not thrown: the refused job and its audit row must commit (they count against
        // the agent's daily refusal budget, and jobs.read can show them).
        return {
          status: 422,
          outcome: 'denied',
          code: 'publish_refused',
          subject: job.jobId,
          body: errorBody(
            req.requestId,
            'publish_refused',
            'The publishing checks refused this proposal. Nothing was sent. Fix the failed checks and submit a new proposal.',
            { jobId: job.jobId, failedChecks: failedChecks(job.gateResults), replayed: job.replayed },
          ),
        };
      }
      const accepted = {
        status: job.replayed ? 200 : 202,
        outcome: 'allowed' as const,
        code: job.replayed ? 'replayed' : undefined,
        subject: job.jobId,
        body: ok(req.requestId, req.tool, {
          jobId: job.jobId,
          state: PUBLISH_JOB_STATES[job.jobStatus as keyof typeof PUBLISH_JOB_STATES]?.state ?? job.jobStatus,
          replayed: job.replayed,
        }),
      };
      if (job.jobStatus !== 'queued') return accepted;
      return {
        ...accepted,
        afterCommit: async () => {
          const run = await runPublishJob(
            job.jobId,
            { kind: 'agent', principalId: agent.principalId },
            req.requestId,
          );
          // Agents see the outcome in their own terms; editors see the operational detail on the
          // Publishing page. Anything not final yet is followed with jobs.read.
          const pending = {
            busy: 'queued',
            error: 'queued',
            not_claimed: 'running',
            lost: 'running',
          } as const;
          const state =
            run.status in pending
              ? pending[run.status as keyof typeof pending]
              : PUBLISH_JOB_STATES[run.status as keyof typeof PUBLISH_JOB_STATES].state;
          const message =
            run.status === 'succeeded' || run.status === 'cancelled'
              ? run.message
              : run.status in pending
                ? 'Accepted; follow the job with jobs.read.'
                : PUBLISH_JOB_STATES[run.status as keyof typeof PUBLISH_JOB_STATES].message;
          return {
            status: run.status === 'succeeded' ? 201 : 202,
            body: ok(req.requestId, req.tool, {
              jobId: job.jobId,
              state,
              message,
              publicUrl: run.status === 'succeeded' ? run.publicUrl : null,
              replayed: job.replayed,
            }),
          };
        },
      };
    }

    case 'jobs.read': {
      const jobId = req.arguments.jobId;
      if (!UUID.test(jobId)) {
        throw new GatewayError(404, 'not_found', 'No such job is visible to this agent.');
      }
      const [publication] = await tx<
        {
          id: string;
          status: keyof typeof PUBLISH_JOB_STATES;
          outcomeMessage: string | null;
          publicUrl: string | null;
          gateResults: GateResult[];
          createdAt: Date;
          startedAt: Date | null;
          finishedAt: Date | null;
        }[]
      >`
        select id, status, outcome_message, public_url, gate_results, created_at, started_at, finished_at
        from app.publish_jobs where id = ${jobId}
      `;
      if (publication) {
        const state = PUBLISH_JOB_STATES[publication.status];
        return {
          status: 200,
          outcome: 'allowed',
          subject: publication.id,
          body: ok(req.requestId, req.tool, {
            jobId: publication.id,
            kind: 'publication',
            state: state.state,
            // Failure details are written for editors (hosting and database errors); agents get
            // the plain state message for those, and the recorded message otherwise.
            message:
              (AGENT_READABLE_OUTCOMES.has(publication.status) && publication.outcomeMessage) ||
              state.message,
            publicUrl: publication.publicUrl,
            failedChecks: failedChecks(publication.gateResults),
            updatedAt: (
              publication.finishedAt ??
              publication.startedAt ??
              publication.createdAt
            ).toISOString(),
          }),
        };
      }
      const [job] = await tx<
        { id: string; status: keyof typeof JOB_STATES; reviewedAt: Date | null; createdAt: Date }[]
      >`
        select id, status, reviewed_at, created_at from app.draft_proposals where id = ${jobId}
      `;
      if (!job) throw new GatewayError(404, 'not_found', 'No such job is visible to this agent.');
      const state = JOB_STATES[job.status];
      return {
        status: 200,
        outcome: 'allowed',
        subject: job.id,
        body: ok(req.requestId, req.tool, {
          jobId: job.id,
          kind: 'draft_proposal',
          state: state.state,
          message: state.message,
          updatedAt: (job.reviewedAt ?? job.createdAt).toISOString(),
        }),
      };
    }

    case 'drafts.revise':
    case 'social.propose':
      throw new GatewayError(
        501,
        'not_available',
        `${req.tool} is part of the contract but not available in gateway v1. It depends on review snapshots (SC-008) and durable jobs (SC-011).`,
      );
  }
}
