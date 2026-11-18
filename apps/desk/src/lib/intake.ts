import 'server-only';
import { createHmac } from 'node:crypto';
import { env } from './env';
import { newsroomToday } from './next-action';

/**
 * Keyed, daily-rotating fingerprint of the client address for intake throttling. The address
 * itself is never stored; without INTAKE_HASH_SECRET the hash cannot be reversed or linked across
 * days.
 */
export function intakeClientHash(address: string, now = new Date()): string {
  return createHmac('sha256', env().INTAKE_HASH_SECRET)
    .update(`${newsroomToday(now)}|${address}`)
    .digest('hex');
}
