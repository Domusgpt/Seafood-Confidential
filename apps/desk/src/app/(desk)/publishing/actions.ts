'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { hasRole, requireStaff, staffTx } from '@/lib/auth';
import { pgCode, PG } from '@/lib/db';
import type { FormState } from '@/lib/form-state';
import { logger } from '@/lib/logger';
import { runPendingJobs, runPublishJob } from '@/lib/publishing/executor';
import { auditRefusal } from '@/lib/refusals';
import { getRequestId } from '@/lib/request';
import { SECTIONS, type Section } from '@/lib/vocab';

// Writing and publishing (ADR-005). Every action re-checks the staff session and runs under Row
// Level Security; the database decides who may publish and what needs a confirmation.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_ID = /^SC-[0-9]{4}-[0-9]{3,}$/;

function revalidateStory(contentId: string) {
  if (CONTENT_ID.test(contentId)) revalidatePath(`/stories/${contentId}`);
  revalidatePath('/publishing');
  revalidatePath('/stories');
  revalidatePath('/');
}

/** Messages raised by the publishing functions are written for people; others are not shown. */
function dbMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? '';
  return message.length < 200
    ? message.charAt(0).toUpperCase() + message.slice(1)
    : 'The change was refused.';
}

const articleSchema = z.object({
  itemId: z.string().regex(UUID),
  contentId: z.string().regex(CONTENT_ID),
  expectedRevision: z.coerce.number().int().min(0),
  title: z.string().trim().min(3, 'Give the story a headline of at least 3 characters.').max(180),
  dek: z.string().trim().max(300, 'Keep the summary under 300 characters.').optional(),
  byline: z.string().trim().max(200).optional(),
  body: z.string().min(1, 'Write the story text.').max(100_000),
  sourceCodes: z.array(z.string().max(44)).max(100).default([]),
});

export async function saveArticle(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    itemId: String(formData.get('itemId') ?? ''),
    contentId: String(formData.get('contentId') ?? ''),
    expectedRevision: String(formData.get('expectedRevision') ?? '0'),
    title: String(formData.get('title') ?? ''),
    dek: String(formData.get('dek') ?? ''),
    byline: String(formData.get('byline') ?? ''),
    body: String(formData.get('body') ?? ''),
    sourceCodes: formData.getAll('sourceCodes').map(String),
  };
  const parsed = articleSchema.safeParse(values);
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { status: 'error', message: 'Check the story text.', errors, values };
  }
  const v = parsed.data;
  try {
    const revision = await staffTx(async (tx) => {
      const [row] = await tx<{ revision: number }[]>`
        select app.save_article(${v.itemId}, ${v.title}, ${v.dek || null}, ${v.body}, ${v.byline || null},
                                ${v.sourceCodes}, ${v.expectedRevision}) as revision
      `;
      return row.revision;
    });
    revalidateStory(v.contentId);
    return { status: 'ok', message: `Saved as revision ${revision}.` };
  } catch (error) {
    unstable_rethrow(error);
    const code = pgCode(error);
    if (code === 'SC409')
      return {
        status: 'error',
        message: `Someone saved a newer version while you were editing. Nothing was overwritten. Copy your changes, reload the page and merge them. (${dbMessage(error)})`,
        values,
      };
    if (code === PG.invalidParameter) return { status: 'error', message: dbMessage(error), values };
    if (code === PG.insufficientPrivilege)
      return { status: 'error', message: 'Your role cannot write here.', values };
    const requestId = await getRequestId();
    logger.error({ request_id: requestId, pg_code: code }, 'article save failed');
    return { status: 'error', message: `The story could not be saved (reference ${requestId}).`, values };
  }
}

export async function adoptProposal(formData: FormData) {
  const proposalId = String(formData.get('proposalId') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  const expected = Number(formData.get('expectedRevision') ?? '0');
  if (!UUID.test(proposalId) || !Number.isInteger(expected)) return;
  try {
    await staffTx((tx) => tx`select app.adopt_proposal(${proposalId}, ${expected})`);
  } catch (error) {
    unstable_rethrow(error);
    await auditRefusal('article.adopt', proposalId, error);
  }
  revalidateStory(contentId);
}

const publishSchema = z.object({
  itemId: z.string().regex(UUID),
  contentId: z.string().regex(CONTENT_ID),
  action: z.enum(['publish', 'republish', 'unpublish']),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,128}$/),
  sendEmail: z.boolean(),
  acknowledged: z.array(z.string().regex(/^[a-z_]{3,40}$/)).max(20),
});

export async function requestPublish(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = publishSchema.safeParse({
    itemId: formData.get('itemId'),
    contentId: formData.get('contentId'),
    action: formData.get('publishAction'),
    idempotencyKey: formData.get('idempotencyKey'),
    sendEmail: formData.get('sendEmail') === 'on',
    acknowledged: formData.getAll('acknowledged').map(String),
  });
  if (!parsed.success)
    return { status: 'error', message: 'The publishing request was incomplete. Reload and try again.' };
  const v = parsed.data;
  const hash = createHash('sha256')
    .update(JSON.stringify([v.action, v.itemId, v.sendEmail, [...v.acknowledged].sort()]))
    .digest('hex');
  const session = await requireStaff();
  let job: { jobId: string | null; jobStatus: string; warnings: string[] };
  try {
    job = await staffTx(async (tx) => {
      const [row] = await tx<{ jobId: string | null; jobStatus: string; warnings: string[] }[]>`
        select job_id, job_status, warnings
        from app.staff_request_publish(${v.itemId}, ${v.action}, ${v.sendEmail}, ${v.acknowledged},
                                       ${v.idempotencyKey}, ${hash}, ${session.requestId})
      `;
      return row;
    });
  } catch (error) {
    unstable_rethrow(error);
    const code = pgCode(error);
    await auditRefusal(`publish.${v.action}`, v.itemId, error);
    if (code === PG.insufficientPrivilege)
      return { status: 'error', message: 'Only owners and managing editors publish.' };
    if (code === 'SC409')
      return { status: 'error', message: 'Another publish job for this story is still open. See it below.' };
    if (code === PG.invalidParameter) return { status: 'error', message: dbMessage(error) };
    return { status: 'error', message: 'The request was refused.' };
  }
  if (job.jobStatus === 'needs_confirmation') {
    return {
      status: 'error',
      message: 'Check these before publishing. You can go ahead anyway.',
      result: { warnings: job.warnings.join(','), action: v.action, sendEmail: v.sendEmail ? 'on' : '' },
    };
  }
  const run = await runPublishJob(job.jobId!, { kind: 'staff', claims: session.claims }, session.requestId);
  revalidateStory(v.contentId);
  if (run.status === 'succeeded')
    return { status: 'ok', message: run.message, result: run.publicUrl ? { url: run.publicUrl } : {} };
  if (run.status === 'busy' || run.status === 'not_claimed')
    return {
      status: 'ok',
      message: 'Queued behind another publication. It will run automatically; check back in a minute.',
    };
  return { status: 'error', message: run.message };
}

export async function retryJob(formData: FormData) {
  const jobId = String(formData.get('jobId') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!UUID.test(jobId)) return;
  const session = await requireStaff();
  try {
    const [row] = await staffTx((tx) => tx<{ ok: boolean }[]>`select app.retry_publish_job(${jobId}) as ok`);
    if (row.ok) await runPublishJob(jobId, { kind: 'staff', claims: session.claims }, session.requestId);
  } catch (error) {
    unstable_rethrow(error);
    await auditRefusal('publish.retry', jobId, error);
  }
  revalidateStory(contentId);
}

export async function cancelJob(formData: FormData) {
  const jobId = String(formData.get('jobId') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!UUID.test(jobId)) return;
  try {
    await staffTx((tx) => tx`select app.cancel_publish_job(${jobId})`);
  } catch (error) {
    unstable_rethrow(error);
    await auditRefusal('publish.cancel', jobId, error);
  }
  revalidateStory(contentId);
}

export async function runQueuedJobs() {
  const session = await requireStaff();
  if (!hasRole(session, 'owner', 'managing_editor')) return;
  await runPendingJobs(session.requestId, 5);
  revalidatePath('/publishing');
}

export async function stopAgentPublishing() {
  try {
    await staffTx((tx) => tx`select app.stop_agent_publishing()`);
  } catch (error) {
    unstable_rethrow(error);
    await auditRefusal('publishing.stop', null, error);
  }
  revalidatePath('/publishing');
  revalidatePath('/settings');
}

const policySchema = z.object({
  agentsMayPublish: z.boolean(),
  agentsMayEmail: z.boolean(),
  agentDailyLimit: z.coerce.number().int().min(0, 'Use 0 to 50.').max(50, 'Use 0 to 50.'),
  minSources: z.coerce.number().int().min(1, 'Use 1 to 10.').max(10, 'Use 1 to 10.'),
  disclosureText: z.string().trim().min(20, 'Write at least 20 characters.').max(600),
  lanes: z.array(z.enum(Object.keys(SECTIONS) as [Section, ...Section[]])),
});

export async function savePublishingPolicy(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    agentsMayPublish: formData.get('agentsMayPublish') === 'on',
    agentsMayEmail: formData.get('agentsMayEmail') === 'on',
    agentDailyLimit: formData.get('agentDailyLimit'),
    minSources: formData.get('minSources'),
    disclosureText: String(formData.get('disclosureText') ?? ''),
    lanes: formData.getAll('lanes').map(String),
  };
  const parsed = policySchema.safeParse(values);
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { status: 'error', message: 'Check the publishing settings.', errors };
  }
  const v = parsed.data;
  try {
    await staffTx(async (tx) => {
      await tx`select app.set_publishing_policy(${v.agentsMayPublish}, ${v.agentsMayEmail}, ${v.agentDailyLimit},
                                                ${v.minSources}, ${v.disclosureText})`;
      const lanes = await tx<{ section: Section; agentsMayPublish: boolean }[]>`
        select section, agents_may_publish from app.publishing_lanes
      `;
      for (const lane of lanes) {
        const open = v.lanes.includes(lane.section);
        if (open !== lane.agentsMayPublish)
          await tx`select app.set_publishing_lane(${lane.section}, ${open})`;
      }
    });
  } catch (error) {
    unstable_rethrow(error);
    if (pgCode(error) === PG.insufficientPrivilege)
      return { status: 'error', message: 'Only owners change the publishing settings.' };
    await auditRefusal('publishing.policy', null, error);
    return { status: 'error', message: 'The settings could not be saved.' };
  }
  revalidatePath('/settings');
  revalidatePath('/publishing');
  return { status: 'ok', message: 'Publishing settings saved.' };
}
