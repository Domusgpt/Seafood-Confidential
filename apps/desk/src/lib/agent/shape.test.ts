import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  decodeCursor,
  encodeCursor,
  payloadHash,
  toAgentSources,
  type AgentSourceRow,
} from './shape';

describe('canonical payload hashing (idempotency)', () => {
  it('ignores key order but not values', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 2], c: null } })).toBe('{"a":{"c":null,"d":[3,2]},"b":1}');
    const a = payloadHash('drafts.propose', {
      briefId: 'SC-2026-001',
      content: { title: 'T', bodyMarkdown: 'B', sourceIds: [] },
    });
    const b = payloadHash('drafts.propose', {
      content: { sourceIds: [], bodyMarkdown: 'B', title: 'T' },
      briefId: 'SC-2026-001',
    });
    const c = payloadHash('drafts.propose', {
      briefId: 'SC-2026-001',
      content: { title: 'T2', bodyMarkdown: 'B', sourceIds: [] },
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds the tool name', () => {
    expect(payloadHash('drafts.propose', {})).not.toBe(payloadHash('drafts.revise', {}));
  });
});

describe('cursors', () => {
  it('round-trips and rejects forgeries', () => {
    expect(decodeCursor(encodeCursor('SC-2026-014'))).toBe('SC-2026-014');
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('not-base64-json')).toBe('invalid');
    expect(decodeCursor(Buffer.from(JSON.stringify({ after: "x' or 1=1" })).toString('base64url'))).toBe(
      'invalid',
    );
  });
});

describe('server-side redaction (AT-06)', () => {
  const row = (code: string, agentProcessing: AgentSourceRow['agentProcessing']) =>
    ({
      sourceCode: code,
      sourceType: 'interview',
      title: `Title ${code}`,
      publisher: 'Publisher',
      url: 'https://example.test/doc',
      publishedOn: new Date('2026-01-02T00:00:00Z'),
      accessedOn: null,
      claimSupported: 'Claim',
      locationInSource: 'p. 4',
      agentProcessing,
      // Columns an agent must never receive, even if a query ever selected them by mistake.
      privateContact: 'phone 555-0100',
      privateNotes: 'confidential',
    }) as AgentSourceRow;

  it('passes permitted sources, reduces redacted ones and drops staff-only ones', () => {
    const out = toAgentSources([row('SRC-A-01', 'yes'), row('SRC-B-01', 'redacted'), row('SRC-C-01', 'no')]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ sourceId: 'SRC-A-01', redacted: false, publishedOn: '2026-01-02' });
    expect(out[1]).toEqual({ sourceId: 'SRC-B-01', sourceType: 'interview', redacted: true });
    const text = JSON.stringify(out);
    expect(text).not.toContain('555-0100');
    expect(text).not.toContain('confidential');
    expect(text).not.toContain('SRC-C-01');
  });
});
