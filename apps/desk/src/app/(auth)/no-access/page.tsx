import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { signOut } from '../actions';

export const metadata: Metadata = { title: 'No desk access' };

// A verified sign-in without an active staff principal (a reader, a disabled or unassigned
// account). Nothing operational is rendered or fetched here.
export default async function NoAccessPage() {
  const session = await getSession();
  if (session.state === 'signed_out') redirect('/sign-in');
  if (session.state === 'staff') redirect('/');
  return (
    <main id="main" className="page page--narrow" tabIndex={-1}>
      <div className="page-header__text">
        <p className="eyebrow">Signed in without desk access</p>
        <h1>This account cannot use the desk</h1>
        <p className="lede">
          You are signed in, but this account has no active staff role. If you should have access, ask the
          desk owner to add or restore your role. Being a newsletter member or a contributor does not grant
          desk access.
        </p>
      </div>
      <form action={signOut}>
        <button type="submit" className="button button--secondary">
          Sign out
        </button>
      </form>
    </main>
  );
}
