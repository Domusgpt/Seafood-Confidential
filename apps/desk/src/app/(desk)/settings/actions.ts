'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { generateAgentToken } from '@/lib/agent-tokens';
import { hasRole, staffTx } from '@/lib/auth';
import { pgCode, PG } from '@/lib/db';
import type { FormState } from '@/lib/form-state';
import { logger } from '@/lib/logger';
import { auditRefusal, refuseIn } from '@/lib/refusals';
import { agentCreateSchema, fieldErrors, formToObject } from '@/lib/validation';

// Agent principals and credentials (AT-07). The token is generated here, shown once in the action
// response and never logged; the database receives only its prefix and SHA-256 hash.

export async function createAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData, ['scopes']);
  const parsed = agentCreateSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: 'error',
      message: 'Check the agent details.',
      errors: fieldErrors(parsed.error),
      values,
    };
  const { name, scopes, expiresInDays } = parsed.data;
  const issued = generateAgentToken();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
  try {
    await staffTx(async (tx, session) => {
      if (!hasRole(session, 'owner'))
        throw Object.assign(new Error('owner only'), { code: PG.insufficientPrivilege });
      const [principal] = await tx<{ id: string }[]>`
        insert into app.principals (kind, display_name, created_by)
        values ('agent', ${name}, app.current_staff_principal())
        returning id
      `;
      await tx`select app.issue_agent_credential(${principal.id}, ${issued.prefix}, ${issued.hash}, ${scopes}, ${expiresAt})`;
      logger.info(
        { request_id: session.requestId, token_prefix: issued.prefix, scopes },
        'agent credential issued',
      );
    });
  } catch (error) {
    unstable_rethrow(error);
    if (pgCode(error) === PG.insufficientPrivilege) {
      await auditRefusal('createAgent', null, error);
      return { status: 'error', message: 'Only the owner can create agents and issue tokens.' };
    }
    logger.error({ pg_code: pgCode(error) }, 'agent creation failed');
    return { status: 'error', message: 'The agent could not be created.', values };
  }
  revalidatePath('/settings');
  return {
    status: 'ok',
    message: `Agent “${name}” created with token prefix ${issued.prefix}. Grant it access to specific stories from each story page.`,
    result: { token: issued.token },
  };
}

export async function issueToken(_prev: FormState, formData: FormData): Promise<FormState> {
  const principalId = String(formData.get('principalId') ?? '');
  const scopes = formData.getAll('scopes').map(String);
  if (!/^[0-9a-f-]{36}$/.test(principalId) || scopes.length === 0) {
    return {
      status: 'error',
      message: 'Choose the agent and at least one scope.',
      errors: { scopes: 'Choose at least one scope.' },
    };
  }
  const issued = generateAgentToken();
  try {
    await staffTx(async (tx, session) => {
      await tx`select app.issue_agent_credential(${principalId}, ${issued.prefix}, ${issued.hash}, ${scopes}, ${null})`;
      logger.info({ request_id: session.requestId, token_prefix: issued.prefix }, 'agent credential issued');
    });
  } catch (error) {
    unstable_rethrow(error);
    const code = pgCode(error);
    if (code === PG.insufficientPrivilege)
      return { status: 'error', message: 'Only the owner can issue tokens.' };
    if (code === PG.noData) return { status: 'error', message: 'That agent is not active.' };
    if (code === PG.checkViolation) return { status: 'error', message: 'One of the scopes is not allowed.' };
    return { status: 'error', message: 'The token could not be issued.' };
  }
  revalidatePath('/settings');
  return {
    status: 'ok',
    message: `New token issued with prefix ${issued.prefix}.`,
    result: { token: issued.token },
  };
}

export async function revokeCredential(formData: FormData): Promise<void> {
  const credentialId = String(formData.get('credentialId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(credentialId)) return;
  try {
    await staffTx(async (tx, session) => {
      const [row] = await tx<
        { revoked: boolean }[]
      >`select app.revoke_agent_credential(${credentialId}) as revoked`;
      logger.info(
        { request_id: session.requestId, credential_id: credentialId, revoked: row.revoked },
        'agent credential revoked',
      );
    });
  } catch (error) {
    unstable_rethrow(error);
    await auditRefusal('revokeCredential', credentialId, error);
  }
  revalidatePath('/settings');
}

/** Revoke an agent principal. Revocation is final and revokes every token it holds (database rule). */
export async function setAgentStatus(formData: FormData): Promise<void> {
  const principalId = String(formData.get('principalId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(principalId) || status !== 'revoked') return;
  try {
    await staffTx(async (tx, session) => {
      if (!hasRole(session, 'owner')) return refuseIn(tx, 'revokeAgent', principalId, 'role');
      await tx`update app.principals set status = 'revoked' where id = ${principalId} and kind = 'agent'`;
      logger.info({ request_id: session.requestId, principal_id: principalId }, 'agent revoked');
    });
  } catch (error) {
    unstable_rethrow(error);
    await auditRefusal('revokeAgent', principalId, error);
  }
  revalidatePath('/settings');
}
