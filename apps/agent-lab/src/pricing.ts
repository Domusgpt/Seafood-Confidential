// Anthropic first-party list prices per million tokens (claude-api skill table, cached 2026-11-03).
// Cache writes are billed at 1.25x input (5-minute TTL); cache reads at the listed rate.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  requests: number;
}

export const emptyUsage = (): Usage => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  requests: 0,
});

export function addUsage(total: Usage, u: Partial<Record<keyof Usage, number | null>>) {
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  total.requests += 1;
}

/** Estimated list-price cost in USD; null when the model is not in the table. */
export function costUsd(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (
    (u.input_tokens * p.input +
      u.cache_creation_input_tokens * p.input * 1.25 +
      u.cache_read_input_tokens * p.cacheRead +
      u.output_tokens * p.output) /
    1_000_000
  );
}
