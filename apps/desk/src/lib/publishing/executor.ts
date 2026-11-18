import 'server-only';
import path from 'node:path';
import { pgCode, withPublisher, type PublisherActor } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { loadSiteAssets } from '../site/assets';
import { buildSite, storyPath, type SiteConfig, type SiteSnapshot } from '../site/build';
import {
  DeployError,
  FirebaseHostingDestination,
  googleAccessToken,
  LocalDirectoryDestination,
  type Destination,
} from '../site/deploy';
import { KitClient, KitError } from '../site/kit';
import { showsContactDetails } from '../site/contact';
import { escapeHtml, markdownToHtml } from '../site/markdown';

// Runs publish jobs (ADR-005, SC-011). The job was created, and its checks passed, in the database;
// this module rebuilds the site from the database's snapshot, deploys it and, when asked, schedules
// the newsletter. Order and failure handling:
//   1. claim: one site build at a time; agent jobs are re-checked in full; the claim token fences
//      every later step, so a worker that lost its lease can no longer read, email or record
//   2. build the full site and deploy it, renewing the lease meanwhile and confirming it right
//      before the release. Deploys are full snapshots, so an uncertain outcome is simply retried
//   3. newsletter, at most once: the database records the attempt before the request (and refuses
//      a second one), so a retry after an uncertain outcome never sends again
//   4. record the outcome; then run any job that queued up meanwhile
// Nothing here throws to the caller: a failure leaves the job durable in the database, where the
// Publishing page shows it and the next run or a retry picks it up.

interface ClaimedJob {
  jobId: string;
  claimToken: string;
  action: 'publish' | 'republish' | 'unpublish';
  sendEmail: boolean;
  requestedVia: 'staff' | 'agent';
  requestId: string;
  attempt: number;
  emailAttempted: boolean;
  item: { id: string; contentId: string; slug: string | null; section: string };
}

type ClaimAnswer =
  ClaimedJob | { busy: true } | { cancelled: true; message: string } | { failed: true; message: string };

export interface JobRunResult {
  /**
   * succeeded / failed / needs_attention / cancelled: the job's recorded outcome.
   * busy: another build holds the site; the job stays queued and runs next.
   * not_claimed: nothing to run (already finished, or another worker is running it).
   * lost: this worker lost the job to another run, which finishes it.
   * error: the desk could not reach the database; the job stays queued.
   */
  status:
    'succeeded' | 'failed' | 'needs_attention' | 'cancelled' | 'busy' | 'not_claimed' | 'lost' | 'error';
  message: string;
  publicUrl: string | null;
}

/** Leases last five minutes in the database; renewing every minute leaves a wide margin. */
const LEASE_RENEW_MS = 60_000;

export function siteConfig(): SiteConfig {
  const config = env();
  return {
    siteName: 'Seafood Confidential',
    tagline: 'Seafood, from the people who know it.',
    publicUrl: config.SITE_PUBLIC_URL.replace(/\/+$/, ''),
    kitFormId: config.KIT_FORM_ID ?? null,
    pitchUrl: `${config.DESK_SITE_URL.replace(/\/+$/, '')}/pitch`,
    builtAt: new Date().toISOString(),
  };
}

export function destinationFromEnv(): Destination {
  const config = env();
  if (config.SITE_DESTINATION === 'firebase') {
    if (!config.FIREBASE_SITE_ID)
      throw new DeployError('Set FIREBASE_SITE_ID to deploy to Firebase Hosting.', false);
    return new FirebaseHostingDestination({
      siteId: config.FIREBASE_SITE_ID,
      getAccessToken: () => googleAccessToken(),
    });
  }
  return new LocalDirectoryDestination(path.resolve(config.SITE_OUTPUT_DIR));
}

function newsletterHtml(story: SiteSnapshot['stories'][number], disclosure: string, url: string): string {
  const parts = [
    story.dek ? `<p><em>${escapeHtml(story.dek)}</em></p>` : '',
    markdownToHtml(story.bodyMarkdown),
    story.sources.length
      ? `<p><strong>Sources:</strong> ${story.sources.map((s) => escapeHtml(s.title)).join('; ')}</p>`
      : '',
    story.aiGenerated ? `<p><em>${escapeHtml(disclosure)}</em></p>` : '',
    `<p><a href="${escapeHtml(url)}">Read it on Seafood Confidential</a></p>`,
  ];
  return parts.filter(Boolean).join('\n');
}

class ClaimLostError extends DeployError {
  constructor() {
    super('Another run took over this publication before the release; it finishes the job.', false);
    this.name = 'ClaimLostError';
  }
}

/** Keeps the job's lease alive while it runs, and confirms the claim before irreversible steps. */
function holdLease(job: ClaimedJob, ctx: { requestId: string; actor: PublisherActor }) {
  const controller = new AbortController();
  let lost = false;
  const renew = async (): Promise<boolean> => {
    if (lost) return false;
    const held = await withPublisher(ctx, async (tx) => {
      const [row] = await tx<{ held: boolean }[]>`
        select app.renew_publish_lease(${job.jobId}, ${job.claimToken}) as held
      `;
      return row?.held === true;
    });
    if (!held) {
      lost = true;
      controller.abort(new ClaimLostError());
    }
    return held;
  };
  const timer = setInterval(() => {
    renew().catch((error: unknown) =>
      // A missed renewal is not fatal (the lease has minutes left); the release confirms again.
      logger.warn(
        { request_id: ctx.requestId, job_id: job.jobId, err: (error as Error).message },
        'publish lease renewal failed',
      ),
    );
  }, LEASE_RENEW_MS);
  timer.unref?.();
  return {
    signal: controller.signal,
    isLost: () => lost,
    /** Throws unless this run still holds the job (call right before changing the live site). */
    async confirm(): Promise<void> {
      if (!(await renew())) throw new ClaimLostError();
    },
    stop: () => clearInterval(timer),
  };
}

async function claimJob(
  jobId: string,
  ctx: { requestId: string; actor: PublisherActor },
): Promise<ClaimAnswer | null> {
  return withPublisher(ctx, async (tx) => {
    const [row] = await tx<{ job: ClaimAnswer | null }[]>`select app.claim_publish_job(${jobId}) as job`;
    return row?.job ?? null;
  });
}

async function runOne(jobId: string, actor: PublisherActor, requestId: string): Promise<JobRunResult> {
  const ctx = { requestId, actor };
  let claim: ClaimAnswer | null;
  try {
    claim = await claimJob(jobId, ctx);
  } catch (error) {
    logger.error(
      { request_id: requestId, job_id: jobId, err: (error as Error).message, pg_code: pgCode(error) },
      'publish job claim failed',
    );
    return {
      status: 'error',
      message: `The publication is saved but could not start (reference ${requestId}). It runs with the next publication, or from the Publishing page.`,
      publicUrl: null,
    };
  }
  if (!claim) return { status: 'not_claimed', message: 'Nothing to run.', publicUrl: null };
  if ('busy' in claim)
    return {
      status: 'busy',
      message: 'Another publication is being built; this one is queued.',
      publicUrl: null,
    };
  if ('cancelled' in claim) return { status: 'cancelled', message: claim.message, publicUrl: null };
  if ('failed' in claim) return { status: 'failed', message: claim.message, publicUrl: null };
  const job = claim;
  const lease = holdLease(job, ctx);
  try {
    return await runClaimed(job, ctx, lease);
  } finally {
    lease.stop();
  }
}

async function runClaimed(
  job: ClaimedJob,
  ctx: { requestId: string; actor: PublisherActor },
  lease: ReturnType<typeof holdLease>,
): Promise<JobRunResult> {
  const { requestId } = ctx;
  const finish = async (
    status: 'succeeded' | 'failed' | 'needs_attention',
    siteDeployed: boolean,
    publicUrl: string | null,
    version: string | null,
    newsletterId: string | null,
    message: string,
  ): Promise<JobRunResult> => {
    try {
      await withPublisher(
        ctx,
        (tx) => tx`
          select app.complete_publish_job(
            ${job.jobId}, ${job.claimToken}, ${status}, ${siteDeployed}, ${publicUrl}, ${version},
            ${newsletterId}, ${message}
          )
        `,
      );
    } catch (error) {
      const lost = pgCode(error) === '55000';
      logger[lost ? 'warn' : 'error'](
        { request_id: requestId, job_id: job.jobId, status, err: (error as Error).message },
        lost ? 'publish job finished elsewhere' : 'publish job outcome not recorded',
      );
      // The lease expires and the job runs again; the site deploy is repeatable and the email
      // marker stops a second newsletter.
      return lost
        ? { status: 'lost', message: 'Another run took over this publication and finishes it.', publicUrl }
        : {
            status: 'error',
            message: `The outcome could not be recorded (reference ${requestId}). The desk retries the job automatically within minutes.`,
            publicUrl,
          };
    }
    logger.info(
      {
        request_id: requestId,
        job_id: job.jobId,
        action: job.action,
        via: job.requestedVia,
        status,
        attempt: job.attempt,
      },
      'publish job finished',
    );
    return { status, message, publicUrl };
  };

  const config = siteConfig();
  let snapshot: SiteSnapshot;
  try {
    snapshot = await withPublisher(ctx, async (tx) => {
      const [row] = await tx<{ snapshot: SiteSnapshot }[]>`
        select app.site_snapshot(${job.jobId}, ${job.claimToken}) as snapshot
      `;
      return row.snapshot;
    });
  } catch (error) {
    if (pgCode(error) === '55000')
      return {
        status: 'lost',
        message: 'Another run took over this publication and finishes it.',
        publicUrl: null,
      };
    logger.warn(
      { request_id: requestId, job_id: job.jobId, err: (error as Error).message },
      'site snapshot failed',
    );
    return finish(
      'failed',
      false,
      null,
      null,
      null,
      'The site could not be read for the build. Nothing changed; you can retry.',
    );
  }

  const story = snapshot.stories.find((s) => s.contentId === job.item.contentId) ?? null;
  if (job.requestedVia === 'agent' && story && showsContactDetails(story)) {
    logger.warn(
      { request_id: requestId, job_id: job.jobId },
      'agent story shows contact details after rendering',
    );
    return finish(
      'failed',
      false,
      null,
      null,
      null,
      'Stopped before publishing: the story as readers would see it contains what looks like an email address or a phone number. Nothing changed on the site; an editor needs to review the text.',
    );
  }

  let deployed: { version: string };
  try {
    const assets = await loadSiteAssets(path.resolve(env().SITE_ASSETS_DIR));
    const files = buildSite(snapshot, config, assets);
    deployed = await destinationFromEnv().deploy(files, {
      signal: lease.signal,
      beforeRelease: () => lease.confirm(),
    });
  } catch (error) {
    if (error instanceof ClaimLostError || lease.isLost())
      return {
        status: 'lost',
        message: 'Another run took over this publication and finishes it.',
        publicUrl: null,
      };
    const uncertain = error instanceof DeployError && error.outcomeUnknown;
    logger.warn(
      { request_id: requestId, job_id: job.jobId, err: (error as Error).message },
      'site deploy failed',
    );
    return finish(
      uncertain ? 'needs_attention' : 'failed',
      false,
      null,
      null,
      null,
      uncertain
        ? `${(error as Error).message} The site may already show the change; retrying redeploys the same site safely.`
        : `${(error as Error).message} Nothing changed on the site; you can retry.`,
    );
  }

  const publicUrl = job.action === 'unpublish' || !story ? null : `${config.publicUrl}${storyPath(story)}`;
  const done = { publish: 'Published', republish: 'Updated the published story', unpublish: 'Unpublished' }[
    job.action
  ];

  if (!(job.sendEmail && job.action === 'publish' && story)) {
    return finish('succeeded', true, publicUrl, deployed.version, null, `${done}.`);
  }
  const notResent = `${done}. The newsletter was not sent again: an earlier attempt may have gone out, so check Kit before sending it by hand.`;
  if (job.emailAttempted) return finish('succeeded', true, publicUrl, deployed.version, null, notResent);
  const kitKey = env().KIT_API_KEY;
  if (!kitKey) {
    return finish(
      'needs_attention',
      true,
      publicUrl,
      deployed.version,
      null,
      `${done}, but the newsletter is not connected (set KIT_API_KEY). No email was sent.`,
    );
  }
  let mayEmail: boolean;
  try {
    mayEmail = await withPublisher(ctx, async (tx) => {
      const [row] = await tx<{ ok: boolean }[]>`
        select app.mark_email_attempt(${job.jobId}, ${job.claimToken}) as ok
      `;
      return row?.ok === true;
    });
  } catch (error) {
    logger.warn(
      { request_id: requestId, job_id: job.jobId, err: (error as Error).message },
      'email marker failed',
    );
    return finish(
      'needs_attention',
      true,
      publicUrl,
      deployed.version,
      null,
      `${done}, but the newsletter could not be started. No email was sent; retry to send it.`,
    );
  }
  if (!mayEmail) return finish('succeeded', true, publicUrl, deployed.version, null, notResent);
  try {
    const broadcast = await new KitClient(kitKey).createBroadcast({
      subject: story.title,
      previewText: story.dek ?? '',
      html: newsletterHtml(story, snapshot.disclosure, publicUrl!),
      description: `${story.contentId} (${job.requestedVia})`,
      sendAt: new Date(Date.now() + 3 * 60 * 1000),
      emailTemplateId: env().KIT_EMAIL_TEMPLATE_ID ?? null,
      segmentId: env().KIT_SEGMENT_ID ?? null,
    });
    return finish(
      'succeeded',
      true,
      publicUrl,
      deployed.version,
      broadcast.id,
      `${done} and scheduled the newsletter to go out in about three minutes (Kit broadcast ${broadcast.id}).`,
    );
  } catch (error) {
    const uncertain = !(error instanceof KitError) || error.outcomeUnknown;
    return finish(
      uncertain ? 'needs_attention' : 'failed',
      true,
      publicUrl,
      deployed.version,
      null,
      uncertain
        ? `${done}, but Kit did not confirm the newsletter (${(error as Error).message}). Check Kit before sending it by hand; the desk will not resend it.`
        : `${done}, but Kit refused the newsletter: ${(error as Error).message} No email was sent.`,
    );
  }
}

/**
 * Run a job, then any jobs that queued up behind it (for example while another build held the
 * site). Bounded, so a request never spins; leftovers run on the next publication or from the
 * Publishing page. Never throws.
 */
export async function runPublishJob(
  jobId: string,
  actor: PublisherActor,
  requestId: string,
): Promise<JobRunResult> {
  let result = await runOne(jobId, actor, requestId);
  for (let wait = 0; result.status === 'busy' && wait < 6; wait++) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await runOne(jobId, actor, requestId);
  }
  await runPendingJobs(requestId, 3);
  return result;
}

/** Run up to `max` waiting jobs, oldest first, each attributed to the system. Never throws. */
export async function runPendingJobs(requestId: string, max = 5): Promise<number> {
  let ran = 0;
  for (let i = 0; i < max; i++) {
    let next: string | null;
    try {
      next = await withPublisher({ requestId, actor: { kind: 'system' } }, async (tx) => {
        const [row] = await tx<{ id: string | null }[]>`select app.next_publish_job() as id`;
        return row?.id ?? null;
      });
    } catch (error) {
      logger.error({ request_id: requestId, err: (error as Error).message }, 'publish queue unavailable');
      break;
    }
    if (!next) break;
    const out = await runOne(next, { kind: 'system' }, requestId);
    if (out.status === 'busy' || out.status === 'not_claimed' || out.status === 'error') break;
    ran += 1;
  }
  return ran;
}
