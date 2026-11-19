import Anthropic from '@anthropic-ai/sdk';

// The lab reads its own key variable first, so a key added for the lab is never picked up as the
// credentials of another tool in the same environment (for example a Claude Code cloud session).
// It also ignores ANTHROPIC_BASE_URL, which hosts can set for their own routing, unless the
// lab-specific SC_AGENT_LAB_BASE_URL says otherwise (used by the offline check below).
export const LAB_KEY_VARIABLE = 'SC_AGENT_LAB_API_KEY';
export const LAB_BASE_URL_VARIABLE = 'SC_AGENT_LAB_BASE_URL';
const KEY_VARIABLES = [LAB_KEY_VARIABLE, 'ANTHROPIC_API_KEY'] as const;
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export interface LabCredentials {
  /** Name of the variable the key came from; the key itself is never printed. */
  variable: (typeof KEY_VARIABLES)[number];
  key: string;
}

export function findLabKey(env: NodeJS.ProcessEnv = process.env): LabCredentials | null {
  for (const variable of KEY_VARIABLES) {
    const key = env[variable]?.trim();
    if (key) return { variable, key };
  }
  return null;
}

export const MISSING_KEY_HELP = `No Anthropic API key found. Set ${LAB_KEY_VARIABLE} (or ANTHROPIC_API_KEY) to a key from https://platform.claude.com/settings/keys.
In a Claude Code cloud session, add it under the environment's Environment variables (not Network secrets) and start a new session; see apps/agent-lab/README.md.`;

export function createLabClient(env: NodeJS.ProcessEnv = process.env): Anthropic {
  const found = findLabKey(env);
  if (!found) throw new Error(MISSING_KEY_HELP);
  return new Anthropic({
    apiKey: found.key,
    baseURL: env[LAB_BASE_URL_VARIABLE]?.trim() || DEFAULT_BASE_URL,
    maxRetries: 2,
  });
}

/** The API's own error message, without the status code and JSON wrapper the SDK adds. */
function apiMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === 'string' ? body.error.message : error.message;
}

/** Explains an API failure in terms of what to fix, without echoing request details or the key. */
export function explainApiError(error: unknown, model: string): string {
  if (error instanceof Anthropic.AuthenticationError)
    return 'The key was rejected (401). Check that the whole key was copied and that it has not been deleted or disabled.';
  if (error instanceof Anthropic.PermissionDeniedError)
    return `The key is not allowed to use ${model} (403). Check the workspace's model access in the Console.`;
  if (error instanceof Anthropic.NotFoundError)
    return `${model} is not available to this key (404). Try --model claude-sonnet-5-5.`;
  if (error instanceof Anthropic.RateLimitError)
    return 'Rate limited (429). Wait a minute and try again, or check the workspace rate limits.';
  if (error instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(apiMessage(error)))
    return `The key works but its organization cannot be billed (400): ${apiMessage(error)} Check Plans & Billing in the Console.`;
  if (error instanceof Anthropic.APIConnectionError)
    return 'Could not reach the Claude API. Check the network (in a cloud session, the environment must allow api.anthropic.com).';
  if (error instanceof Anthropic.APIError)
    return `Claude API error ${error.status ?? ''}: ${apiMessage(error)}`;
  return (error as Error).message;
}

export interface KeyCheck {
  ok: boolean;
  variable: string | null;
  lines: string[];
}

/**
 * Confirms the key and model before credits are spent on a run. Step 1 (model lookup) is free.
 * Step 2, only with billingProbe, sends one tiny message (16 output tokens at most), which costs
 * well under a cent and proves the organization can be billed.
 */
export async function checkKey(opts: {
  model: string;
  billingProbe: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<KeyCheck> {
  const env = opts.env ?? process.env;
  const found = findLabKey(env);
  if (!found) return { ok: false, variable: null, lines: [MISSING_KEY_HELP] };
  const client = createLabClient(env);
  const lines = [`Key found in ${found.variable}.`];
  try {
    const info = await client.models.retrieve(opts.model);
    lines.push(`Model available: ${info.display_name} (${info.id}).`);
  } catch (error) {
    lines.push(explainApiError(error, opts.model));
    return { ok: false, variable: found.variable, lines };
  }
  if (!opts.billingProbe) return { ok: true, variable: found.variable, lines };
  try {
    const reply = await client.messages.create({
      model: opts.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    lines.push(
      `Billing works: one probe request used ${reply.usage.input_tokens} input and ${reply.usage.output_tokens} output tokens (well under a cent).`,
    );
    return { ok: true, variable: found.variable, lines };
  } catch (error) {
    lines.push(explainApiError(error, opts.model));
    return { ok: false, variable: found.variable, lines };
  }
}
