import 'server-only';
import path from 'node:path';
import { withPublisher, type PublisherActor } from '../db';
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
import { escapeHtml, markdownToHtml } from '../site/markdown';

// Runs publish jobs (ADR-005, SC-011). The job was created, and its checks passed, in the database;
// this module rebuilds the site from the database's snapshot, deploys it and, when asked, schedules
// the newsletter. Order and failure handling:
//   1. claim (one site build at a time; agent jobs re-check the master switch and human work)
//   2. build the full site and deploy it — idempotent, so an uncertain outcome is simply retried
//   3. newsletter, at most once: the attempt is recorded before the request, and a retry after an
//      uncertain outcome never sends again (an editor checks Kit instead)
//   4. record the outcome; then run any job that queued up meanwhile

interface ClaimedJob {
  jobId: string;
  action: 'publish' | 'republish' | 'unpublish';
  sendEmail: boolean;
  requestedVia: 'staff' | 'agent';
  requestId: string;
  attempt: number;
  emailAttempted: boolean;
  item: { id: string; contentId: string; slug: string | null; section: string };
}

export interface JobRunResult {
  status: 'succeeded' | 'failed' | 'needs_attention' | 'not_claimed' | 'busy';
  message: string;
  publicUrl: string | null;
}

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

async function runOne(jobId: string, actor: PublisherActor, requestId: string): Promise<JobRunResult> {
  const claim = await withPublisher({ requestId, actor }, async (tx) => {
    const [row] = await tx<{ job: (ClaimedJob & { busy?: undefined }) | { busy: true } | null }[]>`
      select app.claim_publish_job(${jobId}) as job
    `;
    return row?.job ?? null;
  });
  if (!claim) return { status: 'not_claimed', message: 'Nothing to run.', publicUrl: null };
  if ('busy' in claim && claim.busy) {
    return {
      status: 'busy',
      message: 'Another publication is being built; this one is queued.',
      publicUrl: null,
    };
  }
  const job = claim as ClaimedJob;

  const finish = async (
    status: 'succeeded' | 'failed' | 'needs_attention',
    siteDeployed: boolean,
    publicUrl: string | null,
    version: string | null,
    newsletterId: string | null,
    message: string,
  ): Promise<JobRunResult> => {
    await withPublisher(
      { requestId, actor },
      (tx) => tx`
      select app.complete_publish_job(
        ${job.jobId}, ${status}, ${siteDeployed}, ${publicUrl}, ${version}, ${newsletterId}, ${message}
      )
    `,
    );
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
  let deployed: { version: string };
  try {
    snapshot = await withPublisher({ requestId, actor }, async (tx) => {
      const [row] = await tx<
        { snapshot: SiteSnapshot }[]
      >`select app.site_snapshot(${job.jobId}) as snapshot`;
      return row.snapshot;
    });
    const assets = await loadSiteAssets(path.resolve(env().SITE_ASSETS_DIR));
    const files = buildSite(snapshot, config, assets);
    deployed = await destinationFromEnv().deploy(files);
  } catch (error) {
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

  const story = snapshot.stories.find((s) => s.contentId === job.item.contentId) ?? null;
  const publicUrl = job.action === 'unpublish' || !story ? null : `${config.publicUrl}${storyPath(story)}`;
  const done = { publish: 'Published', republish: 'Updated the published story', unpublish: 'Unpublished' }[
    job.action
  ];

  if (!(job.sendEmail && job.action === 'publish' && story)) {
    return finish('succeeded', true, publicUrl, deployed.version, null, `${done}.`);
  }
  if (job.emailAttempted) {
    return finish(
      'succeeded',
      true,
      publicUrl,
      deployed.version,
      null,
      `${done}. The newsletter was not sent again: an earlier attempt may have gone out, so check Kit before sending it by hand.`,
    );
  }
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
  try {
    await withPublisher({ requestId, actor }, (tx) => tx`select app.mark_email_attempt(${job.jobId})`);
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
 * Publishing page.
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

/** Run up to `max` waiting jobs, oldest first, each attributed to the system. */
export async function runPendingJobs(requestId: string, max = 5): Promise<number> {
  let ran = 0;
  for (let i = 0; i < max; i++) {
    const next = await withPublisher({ requestId, actor: { kind: 'system' } }, async (tx) => {
      const [row] = await tx<{ id: string | null }[]>`select app.next_publish_job() as id`;
      return row?.id ?? null;
    });
    if (!next) break;
    const out = await runOne(next, { kind: 'system' }, requestId);
    if (out.status === 'busy' || out.status === 'not_claimed') break;
    ran += 1;
  }
  return ran;
}
