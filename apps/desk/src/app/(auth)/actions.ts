'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import type { FormState } from '@/lib/form-state';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request';
import { supabaseAuth } from '@/lib/supabase';
import { fieldErrors, formToObject, signInSchema } from '@/lib/validation';

// The response is identical whether or not the address belongs to staff (no account enumeration).
// Supabase sign-ups are disabled; only existing users receive a link.
const NEUTRAL = {
  builtin:
    'If that address belongs to a desk account, a sign-in link is on its way. Open it in this browser within 15 minutes.',
  custom:
    'If that address belongs to a desk account, a sign-in link is on its way. It expires in 15 minutes.',
};

export async function requestMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the email address.',
      errors: fieldErrors(parsed.error),
      values,
    };
  }
  const requestId = await getRequestId();
  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${env().DESK_SITE_URL}/auth/confirm` },
  });
  if (error) {
    // Unknown addresses also land here; log the class of failure, never the address.
    logger.info({ request_id: requestId, auth_error: error.code ?? error.name }, 'magic link not sent');
  } else {
    logger.info({ request_id: requestId }, 'magic link sent');
  }
  return { status: 'ok', message: NEUTRAL[env().DESK_AUTH_EMAIL] };
}

export async function signOut() {
  const supabase = await supabaseAuth();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/sign-in?signed_out=1');
}
