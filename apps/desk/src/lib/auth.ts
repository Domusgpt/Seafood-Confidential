import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { withStaff, type StaffClaims, type Tx } from './db';
import { getRequestId } from './request';
import { supabaseAuth } from './supabase';

// Data access layer for staff identity. Rendering a page is never the security boundary: every
// page, Server Action and route calls requireStaff() (or requireRole), and the database applies
// Row Level Security to whatever the bound identity asks for.

export type StaffRole = 'owner' | 'managing_editor' | 'editor';

export interface StaffPrincipal {
  id: string;
  displayName: string;
  roles: StaffRole[];
}

export type Session =
  | { state: 'signed_out' }
  | { state: 'no_access'; email?: string }
  | { state: 'staff'; claims: StaffClaims; principal: StaffPrincipal; requestId: string };

export const getSession = cache(async (): Promise<Session> => {
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as StaffClaims | undefined;
  if (error || !claims?.sub || claims.role !== 'authenticated') return { state: 'signed_out' };
  const requestId = await getRequestId();
  const principal = await withStaff({ claims, requestId }, async (tx) => {
    const rows = await tx<StaffPrincipal[]>`
      select p.id, p.display_name,
             array(select a.role from app.staff_assignments a
                   where a.principal_id = p.id and a.revoked_at is null order by a.role) as roles
      from app.principals p
      where p.id = app.current_staff_principal()
    `;
    return rows[0] ?? null;
  });
  if (!principal) return { state: 'no_access', email: claims.email };
  return { state: 'staff', claims, principal, requestId };
});

export type StaffSession = Extract<Session, { state: 'staff' }>;

export async function requireStaff(): Promise<StaffSession> {
  const session = await getSession();
  if (session.state === 'signed_out') redirect('/sign-in');
  if (session.state === 'no_access') redirect('/no-access');
  return session;
}

export function hasRole(session: StaffSession, ...roles: StaffRole[]): boolean {
  return session.principal.roles.some((r) => roles.includes(r));
}

/** Run fn with the staff identity bound (after requireStaff). */
export async function staffTx<T>(fn: (tx: Tx, session: StaffSession) => Promise<T>): Promise<T> {
  const session = await requireStaff();
  return withStaff({ claims: session.claims, requestId: session.requestId }, (tx) => fn(tx, session));
}
