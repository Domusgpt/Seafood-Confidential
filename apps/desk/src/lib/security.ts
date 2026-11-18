// Request-independent security helpers shared by the proxy, route handlers and tests.
// No server-only import: src/proxy.ts and unit tests use these too, and nothing here is secret.

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** Accept an upstream request ID only when it is well formed (no log injection); otherwise mint one. */
export function resolveRequestId(inbound: string | null | undefined): string {
  if (inbound && REQUEST_ID_PATTERN.test(inbound)) return inbound;
  return `req_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/** 128 bits of randomness, base64 encoded, for a per-response CSP nonce. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export interface CspOptions {
  nonce: string;
  dev: boolean;
  https: boolean;
}

/**
 * Strict nonce-based policy for HTML responses. The browser never talks to Supabase or Ghost
 * directly (all calls are server-side), so connect-src stays 'self'.
 */
export function buildCsp({ nonce, dev, https }: CspOptions): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? ` 'unsafe-eval'` : ''}`,
    // Development injects unnonced <style> tags for hot reload; production styles are files.
    dev ? `style-src 'self' 'unsafe-inline'` : `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self'`,
  ];
  if (https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Policy for JSON responses: nothing may load, nothing may frame. */
export const API_CSP = `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`;

/**
 * Only same-site relative paths survive as post-sign-in destinations ("/stories", not
 * "//evil.example" or "https://evil.example" or "/\\evil").
 */
export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value) || value.length > 512) return fallback;
  return value;
}

/**
 * The client address for throttling. Each trusted proxy appends the address it received the request
 * from to X-Forwarded-For, so only the entry `trustedHops` from the right is trustworthy; anything to
 * its left is client-controlled. With no trusted proxy (0) the header is entirely client-controlled
 * (Next.js only fills it when absent), so every client shares one 'direct' bucket. A request that did
 * not pass through all expected proxies lands in a shared 'unverified' bucket.
 */
export function clientAddressFrom(forwardedFor: string | null, trustedHops: number): string {
  const hops = Math.floor(trustedHops);
  if (!(hops >= 1)) return 'direct';
  const entries = (forwardedFor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length < hops) return 'unverified';
  return entries[entries.length - hops].slice(0, 64);
}
