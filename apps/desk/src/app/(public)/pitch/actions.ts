'use server';

import { randomBytes } from 'node:crypto';
import { withAnon, pgCode, PG } from '@/lib/db';
import type { FormState } from '@/lib/form-state';
import { intakeClientHash } from '@/lib/intake';
import { logger } from '@/lib/logger';
import { getClientAddress, getRequestId } from '@/lib/request';
import { fieldErrors, formToObject, pitchSchema } from '@/lib/validation';

// Public pitch intake (SC-006). Runs as the anon role: it can call app.submit_pitch and nothing
// else, so this route cannot read, list or enumerate submissions. Text only: no uploads.
export async function submitPitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const requestId = await getRequestId();
  const values = formToObject(formData);
  delete values.website;

  // Honeypot: pretend to succeed so automated senders learn nothing; store nothing.
  const honeypot = formData.get('website');
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    logger.info({ request_id: requestId }, 'pitch honeypot triggered');
    return { status: 'ok', result: { receipt: `P-${randomBytes(5).toString('hex').toUpperCase()}` } };
  }

  const parsed = pitchSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Some answers need another look.',
      errors: fieldErrors(parsed.error),
      values,
    };
  }
  const p = parsed.data;
  const clientHash = intakeClientHash(await getClientAddress());
  try {
    const receipt = await withAnon({ requestId }, async (tx) => {
      const [row] = await tx<{ receipt: string | null }[]>`
        select app.submit_pitch(
          ${clientHash}, ${p.name}, ${p.email}, ${p.affiliation ?? null}, ${p.subject},
          ${p.readerQuestion}, ${p.firsthandBasis}, ${p.formatHint ?? null}, ${p.interests ?? null},
          true, ${requestId}
        ) as receipt
      `;
      return row.receipt;
    });
    if (!receipt) {
      logger.warn({ request_id: requestId }, 'pitch intake throttled');
      return {
        status: 'error',
        message:
          'We have received several pitches from your connection in the last hour. Please try again later.',
        values,
      };
    }
    logger.info({ request_id: requestId }, 'pitch received');
    return { status: 'ok', result: { receipt } };
  } catch (error) {
    const code = pgCode(error);
    logger.error({ request_id: requestId, pg_code: code }, 'pitch intake failed');
    if (code === PG.checkViolation || code === PG.invalidParameter) {
      return {
        status: 'error',
        message: 'Some answers are outside what we can accept. Shorten them and try again.',
        values,
      };
    }
    return {
      status: 'error',
      message: `We could not save your pitch. Please try again later (reference ${requestId}).`,
      values,
    };
  }
}
