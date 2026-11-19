import { createHash, randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { SITE_CSP, type SiteFile } from './build';

// Where the built site goes (ADR-005). Every deploy is a full snapshot, so repeating one is safe.
//   local    → a directory, swapped in atomically (development, tests, or any static file server)
//   firebase → Firebase Hosting through its REST API (production; free tier, CDN, own domain)

export class DeployError extends Error {
  constructor(
    message: string,
    /** True when the release may have happened before the failure (a retry redeploys the same site). */
    readonly outcomeUnknown: boolean,
  ) {
    super(message);
    this.name = 'DeployError';
  }
}

export interface DeployResult {
  version: string;
}

export interface DeployOptions {
  /** Stops the deploy before it changes the live site (for example when the job lost its claim). */
  signal?: AbortSignal;
  /**
   * Runs immediately before the one step that changes the live site; throwing stops the deploy
   * with nothing released. The publisher uses it to confirm it still holds the job.
   */
  beforeRelease?: () => Promise<void>;
}

export interface Destination {
  readonly name: 'local' | 'firebase';
  deploy(files: SiteFile[], opts?: DeployOptions): Promise<DeployResult>;
}

/** Everything before the release is reversible; failures there leave the live site untouched. */
async function confirmRelease(opts: DeployOptions): Promise<void> {
  const stopIfAborted = () => {
    const stopped = abortMessage(opts.signal);
    if (stopped) throw new DeployError(stopped, false);
  };
  stopIfAborted();
  try {
    await opts.beforeRelease?.();
  } catch (error) {
    if (error instanceof DeployError) throw error;
    throw new DeployError(`Release stopped: ${(error as Error).message}`, false);
  }
  stopIfAborted();
}

function abortMessage(signal: AbortSignal | undefined): string | null {
  if (!signal?.aborted) return null;
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason.message : 'The deploy was stopped.';
}

/** Response headers the static host sends with every file (the local server mirrors them). */
export const SITE_HEADERS: Record<string, string> = {
  'Content-Security-Policy': SITE_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function manifestHash(files: SiteFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path)))
    h.update(f.path).update(createHash('sha256').update(f.body).digest());
  return h.digest('hex').slice(0, 16);
}

function safeRelative(p: string): string {
  const rel = p.replace(/^\/+/, '');
  if (!rel || rel.split('/').some((seg) => seg === '..' || seg === '' || seg.startsWith('.')))
    throw new Error(`unsafe site path ${p}`);
  return rel;
}

export class LocalDirectoryDestination implements Destination {
  readonly name = 'local' as const;
  constructor(private readonly dir: string) {}

  async deploy(files: SiteFile[], opts: DeployOptions = {}): Promise<DeployResult> {
    const target = path.resolve(this.dir);
    const staging = `${target}.next-${randomBytes(4).toString('hex')}`;
    const retired = `${target}.old-${randomBytes(4).toString('hex')}`;
    try {
      for (const f of files) {
        const out = path.join(staging, safeRelative(f.path));
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, f.body);
      }
      await writeFile(path.join(staging, '.site-version'), manifestHash(files));
      await confirmRelease(opts);
      await rename(target, retired).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
      await rename(staging, target);
      await rm(retired, { recursive: true, force: true });
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      if (error instanceof DeployError) throw error;
      const stopped = abortMessage(opts.signal);
      throw new DeployError(stopped ?? `Writing the site failed: ${(error as Error).message}`, false);
    }
    return { version: `local-${manifestHash(files)}` };
  }
}

export interface FirebaseOptions {
  siteId: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const HOSTING = 'https://firebasehosting.googleapis.com/v1beta1';
const UPLOAD = 'https://upload-firebasehosting.googleapis.com/upload';

/** Firebase Hosting deploy via the documented REST flow: version → populateFiles → upload → finalize → release. */
export class FirebaseHostingDestination implements Destination {
  readonly name = 'firebase' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: FirebaseOptions) {
    if (!/^[a-z0-9-]{3,63}$/.test(opts.siteId)) throw new Error('FIREBASE_SITE_ID is not a valid site ID.');
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private async call<T>(
    url: string,
    init: RequestInit,
    step: string,
    releasing = false,
    stop?: AbortSignal,
  ): Promise<T> {
    if (stop?.aborted) throw new DeployError(abortMessage(stop)!, false);
    const token = await this.opts.getAccessToken();
    let res: Response;
    try {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      res = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
        // The stop signal never interrupts the release itself: once sent, its outcome is awaited.
        signal: stop && !releasing ? AbortSignal.any([timeout, stop]) : timeout,
        redirect: 'error',
      });
    } catch (error) {
      const stopped = releasing ? null : abortMessage(stop);
      throw new DeployError(
        stopped ?? `Firebase Hosting did not answer (${step}): ${(error as Error).message}`,
        releasing,
      );
    }
    const body = await res.text();
    if (!res.ok) {
      let message = `${res.status}`;
      try {
        message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // status only
      }
      throw new DeployError(
        `Firebase Hosting refused ${step}: ${message.slice(0, 300)}`,
        releasing && res.status >= 500,
      );
    }
    return (body ? JSON.parse(body) : {}) as T;
  }

  async deploy(files: SiteFile[], opts: DeployOptions = {}): Promise<DeployResult> {
    const site = this.opts.siteId;
    const stop = opts.signal;
    const gz = files.map((f) => {
      const zipped = gzipSync(f.body, { level: 9 });
      return { path: f.path, zipped, hash: createHash('sha256').update(zipped).digest('hex') };
    });
    const version = await this.call<{ name: string }>(
      `${HOSTING}/sites/${site}/versions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            headers: [
              { glob: '**', headers: { ...SITE_HEADERS, 'Cache-Control': 'public, max-age=300' } },
              { glob: '/assets/**', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
              // Story images are named by their content hash, so they never change under one name.
              { glob: '/media/**', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
            ],
          },
        }),
      },
      'creating a version',
      false,
      stop,
    );
    const versionId = version.name.split('/').pop()!;
    const required = new Set<string>();
    let uploadUrl = '';
    for (let i = 0; i < gz.length; i += 1000) {
      const chunk = gz.slice(i, i + 1000);
      const out = await this.call<{ uploadRequiredHashes?: string[]; uploadUrl?: string }>(
        `${HOSTING}/sites/${site}/versions/${versionId}:populateFiles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: Object.fromEntries(chunk.map((f) => [f.path, f.hash])) }),
        },
        'listing the files',
        false,
        stop,
      );
      for (const h of out.uploadRequiredHashes ?? []) required.add(h);
      if (out.uploadUrl) uploadUrl = out.uploadUrl;
    }
    if (!uploadUrl) uploadUrl = `${UPLOAD}/sites/${site}/versions/${versionId}/files`;
    for (const f of gz.filter((x) => required.has(x.hash))) {
      required.delete(f.hash);
      await this.call(
        `${uploadUrl}/${f.hash}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(f.zipped),
        },
        `uploading ${f.path}`,
        false,
        stop,
      );
    }
    await this.call(
      `${HOSTING}/sites/${site}/versions/${versionId}?update_mask=status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FINALIZED' }),
      },
      'finalizing the version',
      false,
      stop,
    );
    await confirmRelease(opts);
    await this.call(
      `${HOSTING}/sites/${site}/releases?versionName=${encodeURIComponent(version.name)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      'releasing the version',
      true,
    );
    return { version: version.name };
  }
}

/**
 * An OAuth access token for Firebase Hosting. On Cloud Run the service account's token comes from
 * the metadata server (no key file anywhere). Elsewhere, GOOGLE_OAUTH_ACCESS_TOKEN can hold a
 * short-lived token (for example from `gcloud auth print-access-token`).
 */
export async function googleAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const fromEnv = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const res = await fetchImpl(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2_000) },
    );
    if (res.ok) {
      const token = (await res.json()) as { access_token?: string };
      if (token.access_token) return token.access_token;
    }
  } catch {
    // not on Google Cloud
  }
  throw new DeployError(
    'No Google credentials: run on Cloud Run with a service account that can deploy Firebase Hosting, or set GOOGLE_OAUTH_ACCESS_TOKEN.',
    false,
  );
}
