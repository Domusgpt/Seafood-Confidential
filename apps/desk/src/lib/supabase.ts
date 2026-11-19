import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';

/**
 * Supabase client for authentication only (sign-in, session verification, sign-out). Desk data
 * never goes through the Data API: it is read through src/lib/db.ts under Row Level Security.
 */
export async function supabaseAuth() {
  const cookieStore = await cookies();
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = env();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, which cannot write cookies; the proxy refreshes them.
        }
      },
    },
  });
}
