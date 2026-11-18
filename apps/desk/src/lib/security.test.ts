import { describe, expect, it } from 'vitest';
import {
  buildCsp,
  clientAddressFrom,
  createNonce,
  isValidRequestId,
  resolveRequestId,
  safeNextPath,
} from './security';

describe('request IDs', () => {
  it('keeps a well-formed upstream ID and replaces anything else', () => {
    expect(resolveRequestId('req-abc-123456')).toBe('req-abc-123456');
    for (const bad of [
      null,
      '',
      'short',
      'has space in it',
      'line\nbreak-injection',
      'x'.repeat(129),
      '<script>alert(1)</script>',
    ]) {
      expect(resolveRequestId(bad)).toMatch(/^req_[0-9a-f]{32}$/);
    }
    expect(isValidRequestId('req-12345678')).toBe(true);
    expect(isValidRequestId(42)).toBe(false);
  });
});

describe('content security policy', () => {
  it('is strict in production', () => {
    const csp = buildCsp({ nonce: 'abc123==', dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-abc123=='");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('only relaxes what local development needs', () => {
    const csp = buildCsp({ nonce: 'n', dev: true, https: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('mints unpredictable 128-bit nonces', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe('safeNextPath (no open redirects after sign-in)', () => {
  it.each([
    ['/stories', '/stories'],
    ['/stories/SC-2026-001?from=pitch', '/stories/SC-2026-001?from=pitch'],
    ['https://evil.example/', '/'],
    ['//evil.example/', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['/ok\nSet-Cookie: x', '/'],
    [null, '/'],
    ['', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('clientAddressFrom (intake throttling)', () => {
  it('trusts nothing without a proxy: every client shares one bucket', () => {
    expect(clientAddressFrom('203.0.113.9', 0)).toBe('direct');
    expect(clientAddressFrom(null, 0)).toBe('direct');
  });

  it('takes the entry the nearest trusted proxy appended and ignores what a client prepends', () => {
    expect(clientAddressFrom('1.1.1.1, 203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientAddressFrom('6.6.6.6, 198.51.100.4, 10.0.0.2', 2)).toBe('198.51.100.4');
  });

  it('puts requests that skipped the expected proxies in a shared bucket', () => {
    expect(clientAddressFrom('198.51.100.4', 3)).toBe('unverified');
    expect(clientAddressFrom('', 1)).toBe('unverified');
  });
});
