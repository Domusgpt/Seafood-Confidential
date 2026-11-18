'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { hasRole, staffTx } from '@/lib/auth';
import { pgCode, PG } from '@/lib/db';
import type { FormState } from '@/lib/form-state';
import { logger } from '@/lib/logger';
import { auditRefusal, refuseIn } from '@/lib/refusals';
import { getRequestId } from '@/lib/request';
import {
  fieldErrors,
  formToObject,
  ghostLinkSchema,
  itemFieldsSchema,
  itemUpdateSchema,
  proposalReviewSchema,
  rightsSchema,
  sourceSchema,
  splitTags,
} from '@/lib/validation';
import { labelForFormat } from '@/lib/vocab';

// Every action re-checks the staff session (staffTx → requireStaff) and runs under Row Level
// Security; a forged form field can only reach rows the signed-in principal could already change.

/** For button-style actions without form state: a refused change is logged, never thrown at the page. */
async function quietly(label: string, subject: string | null, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    unstable_rethrow(error); // let redirects (for example an expired session) through
    await auditRefusal(label, subject, error);
  }
}

function failure(error: unknown, requestId: string, fallback: string): FormState {
  unstable_rethrow(error); // let redirects (for example an expired session) through
  const code = pgCode(error);
  if (code === PG.insufficientPrivilege)
    return { status: 'error', message: 'Your role cannot make this change.' };
  if (code === PG.uniqueViolation)
    return { status: 'error', message: 'That value is already used by another record.' };
  if (code === PG.checkViolation)
    return { status: 'error', message: 'One of the values is outside what the desk accepts.' };
  logger.error({ request_id: requestId, pg_code: code, err: (error as Error)?.message }, fallback);
  return { status: 'error', message: `${fallback} (reference ${requestId}).` };
}

const RELEASE_STATES = new Set(['ready_for_release', 'published']);

export async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = itemFieldsSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: 'error',
      message: 'Check the story details.',
      errors: fieldErrors(parsed.error),
      values,
    };
  const v = parsed.data;
  let contentId: string;
  try {
    contentId = await staffTx(async (tx) => {
      const [row] = await tx<{ contentId: string }[]>`
        insert into app.editorial_items (
          content_id, title, summary, section, format, label, focus, due_on, assigned_editor_id,
          author_display, region, species, created_by
        ) values (
          app.next_content_id(), ${v.title}, ${v.summary ?? null}, ${v.section}, ${v.format}, ${labelForFormat(v.format)},
          ${v.focus ?? null}, ${v.dueOn ?? null}, coalesce(${v.assignedEditorId ?? null}::uuid, app.current_staff_principal()),
          ${v.authorDisplay ?? null}, ${splitTags(v.region)}, ${splitTags(v.species)}, app.current_staff_principal()
        )
        returning content_id
      `;
      return row.contentId;
    });
  } catch (error) {
    return { ...failure(error, await getRequestId(), 'The story could not be created'), values };
  }
  revalidatePath('/stories');
  redirect(`/stories/${contentId}`);
}

export async function updateItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = itemUpdateSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: 'error',
      message: 'Check the story details.',
      errors: fieldErrors(parsed.error),
      values,
    };
  const v = parsed.data;
  try {
    return await staffTx(async (tx, session) => {
      if (RELEASE_STATES.has(v.status)) {
        // Release gate: Ghost link, at least one source, every asset cleared with a credit line.
        const [gate] = await tx<{ ghost: boolean; sources: number; uncleared: number }[]>`
          select (i.ghost_post_id is not null) as ghost,
                 (select count(*)::int from app.sources s where s.item_id = i.id) as sources,
                 (select count(*)::int from app.asset_rights r where r.item_id = i.id
                    and (r.status <> 'cleared' or coalesce(btrim(r.credit_line), '') = '')) as uncleared
          from app.editorial_items i where i.id = ${v.itemId}
        `;
        const problems = [
          gate && !gate.ghost ? 'link the Ghost post' : null,
          gate && gate.sources === 0 ? 'record at least one source' : null,
          gate && gate.uncleared > 0 ? `clear rights and credit lines for ${gate.uncleared} asset(s)` : null,
        ].filter(Boolean);
        if (!gate || problems.length) {
          return {
            status: 'error',
            message: `Before marking this ${v.status === 'published' ? 'Published' : 'Ready for release'}, ${problems.join(', ')}.`,
            errors: { status: 'Release requirements are not met yet.' },
            values,
          } satisfies FormState;
        }
      }
      const rows = await tx`
        update app.editorial_items set
          title = ${v.title}, summary = ${v.summary ?? null}, section = ${v.section}, format = ${v.format},
          label = ${labelForFormat(v.format)}, focus = ${v.focus ?? null}, due_on = ${v.dueOn ?? null},
          assigned_editor_id = ${v.assignedEditorId ?? null}, author_display = ${v.authorDisplay ?? null},
          region = ${splitTags(v.region)}, species = ${splitTags(v.species)}, status = ${v.status}
        where id = ${v.itemId}
        returning content_id
      `;
      if (rows.length === 0)
        return {
          status: 'error',
          message: 'That story no longer exists or is not visible to you.',
        } satisfies FormState;
      logger.info(
        { request_id: session.requestId, item: rows[0].contentId, status: v.status },
        'item updated',
      );
      revalidatePath(`/stories/${rows[0].contentId}`);
      return { status: 'ok', message: 'Story details saved.' } satisfies FormState;
    });
  } catch (error) {
    return { ...failure(error, await getRequestId(), 'The story could not be saved'), values };
  }
}

export async function linkGhostPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = ghostLinkSchema.safeParse({ ...values, ghostPost: values.ghostPost ?? '' });
  if (!parsed.success)
    return {
      status: 'error',
      message: 'Check the Ghost reference.',
      errors: fieldErrors(parsed.error),
      values,
    };
  try {
    return await staffTx(async (tx) => {
      const rows = await tx`
        update app.editorial_items set ghost_post_id = ${parsed.data.ghostPost}, ghost_updated_at = now()
        where id = ${parsed.data.itemId} returning content_id
      `;
      if (rows.length === 0)
        return { status: 'error', message: 'That story is not visible to you.' } satisfies FormState;
      revalidatePath(`/stories/${rows[0].contentId}`);
      return {
        status: 'ok',
        message: parsed.data.ghostPost ? 'Ghost post linked.' : 'Ghost link removed.',
      } satisfies FormState;
    });
  } catch (error) {
    unstable_rethrow(error);
    if (pgCode(error) === PG.uniqueViolation) {
      return {
        status: 'error',
        message:
          'That Ghost post is already linked to another story. Each Ghost post maps to one editorial item.',
        errors: { ghostPost: 'Already linked to another story.' },
        values,
      };
    }
    return { ...failure(error, await getRequestId(), 'The Ghost link could not be saved'), values };
  }
}

export async function addSource(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = sourceSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: 'error',
      message: 'Check the source record.',
      errors: fieldErrors(parsed.error),
      values,
    };
  const s = parsed.data;
  try {
    return await staffTx(async (tx) => {
      const rows = await tx`
        insert into app.sources (
          item_id, source_code, source_type, title, publisher, url, published_on, accessed_on, claim_supported,
          location_in_source, agent_processing, private_contact, private_notes, created_by
        ) values (
          ${s.itemId}, ${s.sourceCode}, ${s.sourceType}, ${s.title}, ${s.publisher ?? null}, ${s.url ?? null},
          ${s.publishedOn ?? null}, ${s.accessedOn ?? null}, ${s.claimSupported ?? null}, ${s.locationInSource ?? null},
          ${s.agentProcessing}, ${s.privateContact ?? null}, ${s.privateNotes ?? null}, app.current_staff_principal()
        )
        returning (select content_id from app.editorial_items where id = item_id) as content_id
      `;
      revalidatePath(`/stories/${rows[0].contentId}`);
      return { status: 'ok', message: `Source ${s.sourceCode} recorded.` } satisfies FormState;
    });
  } catch (error) {
    unstable_rethrow(error);
    if (pgCode(error) === PG.uniqueViolation) {
      return {
        status: 'error',
        message: 'This story already has a source with that ID.',
        errors: { sourceCode: 'Already used on this story.' },
        values,
      };
    }
    return { ...failure(error, await getRequestId(), 'The source could not be saved'), values };
  }
}

export async function deleteSource(formData: FormData): Promise<void> {
  const id = String(formData.get('sourceId') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await quietly('deleteSource', id, () =>
    staffTx(async (tx, session) => {
      if (!hasRole(session, 'owner', 'managing_editor')) return refuseIn(tx, 'deleteSource', id, 'role');
      await tx`delete from app.sources where id = ${id}`;
    }),
  );
  revalidatePath(`/stories/${contentId}`);
}

export async function addRights(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData, ['permittedUses']);
  const parsed = rightsSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: 'error',
      message: 'Check the rights record.',
      errors: fieldErrors(parsed.error),
      values,
    };
  const r = parsed.data;
  if (r.status === 'cleared' && !r.creditLine) {
    return {
      status: 'error',
      message: 'A cleared asset needs a credit line.',
      errors: { creditLine: 'Required when rights are cleared.' },
      values,
    };
  }
  try {
    return await staffTx(async (tx) => {
      const rows = await tx`
        insert into app.asset_rights (
          item_id, asset_label, asset_kind, provenance, owner_name, license, credit_line, permitted_uses,
          restrictions, status, consent_reference, created_by
        ) values (
          ${r.itemId}, ${r.assetLabel}, ${r.assetKind}, ${r.provenance}, ${r.ownerName ?? null}, ${r.license ?? null},
          ${r.creditLine ?? null}, ${r.permittedUses}, ${r.restrictions ?? null}, ${r.status},
          ${r.consentReference ?? null}, app.current_staff_principal()
        )
        returning (select content_id from app.editorial_items where id = item_id) as content_id
      `;
      revalidatePath(`/stories/${rows[0].contentId}`);
      return { status: 'ok', message: `Rights record for “${r.assetLabel}” saved.` } satisfies FormState;
    });
  } catch (error) {
    return { ...failure(error, await getRequestId(), 'The rights record could not be saved'), values };
  }
}

export async function setRightsStatus(formData: FormData): Promise<void> {
  const id = String(formData.get('rightsId') ?? '');
  const status = String(formData.get('status') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id) || !['pending', 'cleared', 'restricted', 'rejected'].includes(status))
    return;
  await quietly('setRightsStatus', id, () =>
    staffTx(async (tx) => {
      // Clearing requires a credit line (release gate); the update is a no-op otherwise.
      await tx`
      update app.asset_rights set status = ${status}
      where id = ${id} and (${status} <> 'cleared' or coalesce(btrim(credit_line), '') <> '')
    `;
    }),
  );
  revalidatePath(`/stories/${contentId}`);
}

export async function reviewProposal(formData: FormData): Promise<void> {
  const parsed = proposalReviewSchema.safeParse(formToObject(formData));
  const contentId = String(formData.get('contentId') ?? '');
  if (!parsed.success) return;
  await quietly('reviewProposal', parsed.data.proposalId, () =>
    staffTx(async (tx) => {
      await tx`
      update app.draft_proposals
      set status = ${parsed.data.decision}, reviewed_by = app.current_staff_principal(), reviewed_at = now()
      where id = ${parsed.data.proposalId} and status = 'proposed'
    `;
    }),
  );
  revalidatePath(`/stories/${contentId}`);
}

export async function grantAgent(formData: FormData): Promise<void> {
  const principalId = String(formData.get('principalId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(principalId) || !/^[0-9a-f-]{36}$/.test(itemId)) return;
  await quietly('grantAgent', itemId, () =>
    staffTx(async (tx, session) => {
      if (!hasRole(session, 'owner', 'managing_editor')) return refuseIn(tx, 'grantAgent', itemId, 'role');
      await tx`
      insert into app.agent_item_grants (principal_id, item_id, granted_by)
      values (${principalId}, ${itemId}, app.current_staff_principal())
      on conflict do nothing
    `;
    }),
  );
  revalidatePath(`/stories/${contentId}`);
}

export async function revokeAgentGrant(formData: FormData): Promise<void> {
  const principalId = String(formData.get('principalId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const contentId = String(formData.get('contentId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(principalId) || !/^[0-9a-f-]{36}$/.test(itemId)) return;
  await quietly('revokeAgentGrant', itemId, () =>
    staffTx(async (tx, session) => {
      if (!hasRole(session, 'owner', 'managing_editor'))
        return refuseIn(tx, 'revokeAgentGrant', itemId, 'role');
      await tx`delete from app.agent_item_grants where principal_id = ${principalId} and item_id = ${itemId}`;
    }),
  );
  revalidatePath(`/stories/${contentId}`);
}
