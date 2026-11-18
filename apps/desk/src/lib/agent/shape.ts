import { createHash } from 'node:crypto';

// Pure helpers for the agent gateway: canonical payload hashing, cursors and redaction. No database
// or framework imports, so they are unit tested directly.

/** JSON with object keys sorted at every level (arrays keep their order). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** What an idempotency key protects: the tool and its arguments (not the per-attempt requestId). */
export function payloadHash(tool: string, args: unknown): string {
  return createHash('sha256')
    .update(canonicalJson({ tool, arguments: args }))
    .digest('hex');
}

const CONTENT_ID = /^SC-[0-9]{4}-[0-9]{3,}$/;

export function isContentId(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_ID.test(value);
}

/** Opaque keyset cursor over content IDs. */
export function encodeCursor(contentId: string): string {
  return Buffer.from(JSON.stringify({ after: contentId }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): string | null | 'invalid' {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { after?: unknown };
    return isContentId(parsed.after) ? parsed.after : 'invalid';
  } catch {
    return 'invalid';
  }
}

export interface AgentSourceRow {
  sourceCode: string;
  sourceType: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedOn: Date | null;
  accessedOn: Date | null;
  claimSupported: string | null;
  locationInSource: string | null;
  agentProcessing: 'yes' | 'redacted' | 'no';
}

export type AgentSource =
  | {
      sourceId: string;
      sourceType: string;
      title: string;
      publisher: string | null;
      url: string | null;
      publishedOn: string | null;
      accessedOn: string | null;
      claimSupported: string | null;
      locationInSource: string | null;
      redacted: false;
    }
  | { sourceId: string; sourceType: string; redacted: true };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Server-side redaction (AT-06). "redacted" sources reveal only that a source exists and its type;
 * "no" sources never reach this function (Row Level Security hides them) and are dropped if they do.
 */
export function toAgentSources(rows: AgentSourceRow[]): AgentSource[] {
  return rows
    .filter((r) => r.agentProcessing === 'yes' || r.agentProcessing === 'redacted')
    .map((r) =>
      r.agentProcessing === 'redacted'
        ? { sourceId: r.sourceCode, sourceType: r.sourceType, redacted: true as const }
        : {
            sourceId: r.sourceCode,
            sourceType: r.sourceType,
            title: r.title,
            publisher: r.publisher,
            url: r.url,
            publishedOn: day(r.publishedOn),
            accessedOn: day(r.accessedOn),
            claimSupported: r.claimSupported,
            locationInSource: r.locationInSource,
            redacted: false as const,
          },
    );
}

export const JOB_STATES = {
  proposed: {
    state: 'waiting_for_review',
    message: 'The draft proposal is waiting for an editor to review it.',
  },
  accepted: {
    state: 'accepted',
    message: 'An editor accepted the proposal and continues the work in the desk.',
  },
  rejected: { state: 'rejected', message: 'An editor rejected the proposal. Nothing from it will be used.' },
  published: { state: 'published', message: 'The proposal was published.' },
} as const;

/** Publish job states as agents see them (ADR-005). */
export const PUBLISH_JOB_STATES = {
  queued: { state: 'queued', message: 'Waiting to be published.' },
  running: { state: 'running', message: 'Being published now.' },
  succeeded: { state: 'succeeded', message: 'Done.' },
  failed: { state: 'failed', message: 'The publication did not happen. Nothing was changed.' },
  needs_attention: {
    state: 'needs_attention',
    message: 'The outcome is uncertain; an editor will check the publication. Do not retry.',
  },
  refused: { state: 'refused', message: 'Refused by the automated publishing checks; nothing was sent.' },
  cancelled: { state: 'cancelled', message: 'Cancelled before it ran.' },
} as const;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface GateResult {
  gate: string;
  pass: boolean;
  detail: string;
}

/** The checks that failed, in the order the database evaluated them. */
export function failedChecks(gates: GateResult[]): { check: string; detail: string }[] {
  return gates.filter((g) => !g.pass).map((g) => ({ check: g.gate, detail: g.detail }));
}
