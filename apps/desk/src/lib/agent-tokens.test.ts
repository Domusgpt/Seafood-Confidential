import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateAgentToken,
  hashSecret,
  parseAgentToken,
  parseAuthorization,
  tokenPrefixOf,
} from './agent-tokens';

describe('agent tokens', () => {
  it('round-trips: the parsed hash matches the stored hash', () => {
    const issued = generateAgentToken();
    expect(issued.token).toMatch(/^sca_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
    expect(parseAgentToken(issued.token)).toEqual({ prefix: issued.prefix, hash: issued.hash });
    expect(parseAuthorization(`Bearer ${issued.token}`)).toEqual({
      prefix: issued.prefix,
      hash: issued.hash,
    });
    expect(tokenPrefixOf(issued.token)).toBe(issued.prefix);
  });

  it('stores only SHA-256 of the secret part (matches the database fixtures)', () => {
    const secret = 'A'.repeat(43);
    expect(hashSecret(secret)).toBe(createHash('sha256').update(secret).digest('hex'));
    expect(parseAgentToken(`sca_abcdefgh_${secret}`)?.hash).toBe(hashSecret(secret));
  });

  it('is unique per issue', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateAgentToken().token));
    expect(tokens.size).toBe(50);
  });

  it('rejects malformed credentials', () => {
    for (const bad of [
      null,
      '',
      'sca_ABCDEFGH_' + 'A'.repeat(43),
      'sca_abcdefg_' + 'A'.repeat(43),
      'sca_abcdefgh_' + 'A'.repeat(42),
      'sca_abcdefgh_' + 'A'.repeat(44),
      'sk_abcdefgh_' + 'A'.repeat(43),
      'sca_abcdefgh_' + 'A'.repeat(42) + '!',
    ]) {
      expect(parseAgentToken(bad)).toBeNull();
    }
    expect(parseAuthorization('Basic dXNlcjpwYXNz')).toBeNull();
    expect(parseAuthorization('Bearer')).toBeNull();
    expect(parseAuthorization(null)).toBeNull();
  });
});
