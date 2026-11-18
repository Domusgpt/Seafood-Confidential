'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { staffTx } from '@/lib/auth';
import { pgCode, PG } from '@/lib/db';
import type { FormState } from '@/lib/form-state';
import { logger } from '@/lib/logger';
import { dispositionSchema, fieldErrors, formToObject } from '@/lib/validation';

// Pitch disposition (SC-006 → SC-007). app.dispose_pitch runs as the signed-in staff member
// (SECURITY INVOKER), locks the pitch row, creates the editorial item on acceptance and audits.
export async function disposePitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = dispositionSchema.safeParse(values);
  if (!parsed.success)
    return { status: 'error', message: 'Check the decision.', errors: fieldErrors(parsed.error), values };
  const d = parsed.data;
  let contentId: string | null = null;
  let receipt = '';
  try {
    const result = await staffTx(async (tx, session) => {
      const [row] = await tx<{ itemId: string | null }[]>`
        select app.dispose_pitch(
          ${d.pitchId}, ${d.decision}, ${d.note ?? null}, ${d.title ?? null}, ${d.section ?? null},
          ${d.format ?? null}, ${d.editorId ?? null}, ${session.requestId}
        ) as item_id
      `;
      const [info] = await tx<{ receiptCode: string; contentId: string | null }[]>`
        select p.receipt_code, i.content_id
        from app.pitches p left join app.editorial_items i on i.id = ${row.itemId}
        where p.id = ${d.pitchId}
      `;
      logger.info(
        { request_id: session.requestId, decision: d.decision, receipt: info.receiptCode },
        'pitch decided',
      );
      return info;
    });
    contentId = result.contentId;
    receipt = result.receiptCode;
  } catch (error) {
    unstable_rethrow(error);
    const code = pgCode(error);
    if (code === PG.alreadyDecided)
      return {
        status: 'error',
        message: 'This pitch was already decided, possibly by another editor. Reload to see the decision.',
      };
    if (code === PG.insufficientPrivilege)
      return { status: 'error', message: 'Your role cannot decide pitches.' };
    if (code === PG.noData) return { status: 'error', message: 'That pitch no longer exists.' };
    logger.error({ pg_code: code, err: (error as Error)?.message }, 'pitch decision failed');
    return { status: 'error', message: 'The decision could not be saved. Try again.', values };
  }
  revalidatePath('/contributors');
  if (contentId) redirect(`/stories/${contentId}?from=pitch`);
  revalidatePath(`/contributors/${receipt}`);
  return {
    status: 'ok',
    message: d.decision === 'declined' ? 'Pitch declined.' : 'Marked as needing more information.',
  };
}
