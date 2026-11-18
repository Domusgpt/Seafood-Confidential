// Agent request contract shared by the desk gateway, tests and (later) an MCP adapter.
// The schema is the kit's canonical file (contracts/agent-tools.schema.json); this package never copies it.
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../../../contracts/agent-tools.schema.json' with { type: 'json' };

export const agentRequestSchema = schema;

/** Every tool the v1 contract defines. Nothing here publishes, sends, approves or exports. */
export const AGENT_TOOLS = Object.freeze([
  'briefs.list',
  'items.read',
  'drafts.propose',
  'drafts.revise',
  'social.propose',
  'jobs.read',
]);

/** Tools that change state; each requires an idempotency key (enforced by the schema). */
export const WRITE_TOOLS = Object.freeze(['drafts.propose', 'drafts.revise', 'social.propose']);

let compiled;
function validator() {
  if (!compiled) {
    // strictRequired is relaxed because the kit schema requires idempotencyKey inside if/then
    // branches without redeclaring it (valid JSON Schema; docs/KIT_AUDIT.md K-06).
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
    compiled = ajv.compile(schema);
  }
  return compiled;
}

/**
 * Validate an agent request body against the contract.
 * @param {unknown} body
 * @returns {{ ok: true, request: any } | { ok: false, errors: { path: string, keyword: string, message: string }[] }}
 */
export function validateAgentRequest(body) {
  const validate = validator();
  if (validate(body)) return { ok: true, request: body };
  return {
    ok: false,
    errors: (validate.errors ?? []).slice(0, 20).map((e) => ({
      path: e.instancePath || '/',
      keyword: e.keyword,
      message: e.message ?? 'invalid',
    })),
  };
}
