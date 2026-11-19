import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

// Verifies Google-signed OIDC ID tokens, such as the one Cloud Scheduler attaches when it calls the
// publishing sweep (docs/LAUNCH_PREVIEW.md). A token is accepted only when Google signed it (RS256,
// keys from Google's published certificates), it was issued for this exact address, it is fresh, and
// it names the one service account allowed to call, with a verified email.

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_CERTS = new URL('https://www.googleapis.com/oauth2/v3/certs');

let googleKeys: JWTVerifyGetKey | undefined;

export interface IdTokenExpectation {
  /** The exact URL the caller was configured to call (the token's audience). */
  audience: string;
  /** The service account allowed to call. */
  email: string;
}

export async function verifyGoogleIdToken(
  token: string,
  expect: IdTokenExpectation,
  keys: JWTVerifyGetKey = (googleKeys ??= createRemoteJWKSet(GOOGLE_CERTS, {
    cooldownDuration: 30_000,
    cacheMaxAge: 6 * 60 * 60 * 1000,
  })),
): Promise<void> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: GOOGLE_ISSUERS,
    audience: expect.audience,
    algorithms: ['RS256'],
    clockTolerance: 30,
    maxTokenAge: '1h',
  });
  if (payload.email !== expect.email || payload.email_verified !== true)
    throw new Error('the token names another identity');
}
