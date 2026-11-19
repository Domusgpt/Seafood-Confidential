import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyGoogleIdToken } from './google-oidc';

// The scheduler's token check, against keys made here (no network): only a Google-issued RS256 token
// for this exact address and service account, with a verified email, is accepted.

const AUDIENCE = 'https://desk.example.test/api/publishing/sweep';
const INVOKER = 'sc-desk-scheduler@project.iam.gserviceaccount.com';
let keys: ReturnType<typeof createLocalJWKSet>;
let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  keys = createLocalJWKSet({ keys: [jwk] });
  otherKey = (await generateKeyPair('RS256')).privateKey as CryptoKey;
});

async function token(patch: Partial<JWTPayload> = {}, opts: { key?: CryptoKey; expires?: string } = {}) {
  return new SignJWT({ email: INVOKER, email_verified: true, ...patch })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer((patch.iss as string) ?? 'https://accounts.google.com')
    .setAudience((patch.aud as string) ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.expires ?? '5m')
    .sign(opts.key ?? privateKey);
}

const expectation = { audience: AUDIENCE, email: INVOKER };

describe('verifyGoogleIdToken', () => {
  it('accepts a Google-issued token for this address and service account', async () => {
    await expect(verifyGoogleIdToken(await token(), expectation, keys)).resolves.toBeUndefined();
  });

  it.each([
    ['another audience', { aud: 'https://desk.example.test/api/agent/v1' }],
    ['another service account', { email: 'someone@project.iam.gserviceaccount.com' }],
    ['an unverified email', { email_verified: false }],
    ['another issuer', { iss: 'https://evil.example' }],
  ])('refuses %s', async (_label, patch) => {
    await expect(verifyGoogleIdToken(await token(patch), expectation, keys)).rejects.toThrow();
  });

  it('refuses an expired token and one signed by another key', async () => {
    await expect(
      verifyGoogleIdToken(await token({}, { expires: '-1m' }), expectation, keys),
    ).rejects.toThrow();
    await expect(
      verifyGoogleIdToken(await token({}, { key: otherKey }), expectation, keys),
    ).rejects.toThrow();
  });

  it('refuses a symmetric (HS256) token, whatever it claims', async () => {
    const hs = await new SignJWT({ email: INVOKER, email_verified: true })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('a-shared-secret-that-is-long-enough-for-hs256'));
    await expect(verifyGoogleIdToken(hs, expectation, keys)).rejects.toThrow();
  });
});
