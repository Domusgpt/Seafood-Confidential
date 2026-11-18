import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { staffTx } from './auth';
import { pgCode, type Tx } from './db';
import { logger } from './logger';
import { getRequestId } from './request';

// Refused desk actions belong on the audit trail, not only in the logs. Inside a transaction that
// will commit, refuseIn records directly; after a failed transaction (rolled back), auditRefusal
// records in a fresh one.

export async function refuseIn(tx: Tx, action: string, subject: string | null, reason: string) {
  await tx`
    select app.record_audit(${`desk.${action}`}, 'desk_action', ${subject}, 'denied', null,
                            ${JSON.stringify({ reason })}::jsonb)
  `;
}

export async function auditRefusal(action: string, subject: string | null, error: unknown) {
  const requestId = await getRequestId();
  logger.warn({ request_id: requestId, pg_code: pgCode(error), action }, 'desk action refused');
  try {
    await staffTx((tx) => refuseIn(tx, action, subject, pgCode(error) ?? 'error'));
  } catch (auditError) {
    unstable_rethrow(auditError);
    logger.error({ request_id: requestId, action }, 'refusal could not be audited');
  }
}
