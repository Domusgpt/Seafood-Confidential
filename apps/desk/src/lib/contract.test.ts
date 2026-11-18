import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_TOOLS, validateAgentRequest } from '@sc/contracts';

// The gateway's first layer is the kit's contract. Every executable example must behave as labelled.
const root = path.resolve(__dirname, '../../../../contracts/examples');
const load = (dir: string) =>
  readdirSync(path.join(root, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      example: JSON.parse(readFileSync(path.join(root, dir, f), 'utf8')) as { request: unknown },
    }));

describe('agent request contract', () => {
  it.each(load('valid'))('accepts $file', ({ example }) => {
    expect(validateAgentRequest(example.request).ok).toBe(true);
  });

  it.each(load('invalid'))('rejects $file', ({ example }) => {
    expect(validateAgentRequest(example.request).ok).toBe(false);
  });

  it('defines no publish, send, approve or export tool', () => {
    for (const tool of AGENT_TOOLS) expect(tool).not.toMatch(/publish|send|approve|export|delete|member/);
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, [], 'briefs.list', 42, true]) expect(validateAgentRequest(body).ok).toBe(false);
  });
});
