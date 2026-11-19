import { createHash, randomBytes } from 'node:crypto';

// Agent bearer tokens: sca_<8-char prefix>_<43-char secret>. The prefix identifies the credential
// (safe to log and show); only SHA-256(secret) is stored. Dependency-free so the operator CLI
// (scripts/agent.ts) can import it directly.

const PREFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_PATTERN = /^sca_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export interface ParsedToken {
  prefix: string;
  hash: string;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateAgentToken(): { token: string; prefix: string; hash: string } {
  const bytes = randomBytes(8);
  let prefix = '';
  for (const b of bytes) prefix += PREFIX_ALPHABET[b % PREFIX_ALPHABET.length];
  const secret = randomBytes(32).toString('base64url');
  return { token: `sca_${prefix}_${secret}`, prefix, hash: hashSecret(secret) };
}

export function parseAgentToken(value: string | null | undefined): ParsedToken | null {
  const match = TOKEN_PATTERN.exec(value ?? '');
  if (!match) return null;
  return { prefix: match[1], hash: hashSecret(match[2]) };
}

/** Parse an `Authorization: Bearer sca_…` header. Anything else is treated as no credential. */
export function parseAuthorization(header: string | null | undefined): ParsedToken | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? parseAgentToken(match[1]) : null;
}

/** The non-secret part of a token, for display and logs. */
export function tokenPrefixOf(value: string): string | null {
  return TOKEN_PATTERN.exec(value)?.[1] ?? null;
}
