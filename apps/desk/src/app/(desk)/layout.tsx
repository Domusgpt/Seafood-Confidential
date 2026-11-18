import Link from 'next/link';
import { DeskNav } from '@/components/nav';
import { requireStaff, staffTx } from '@/lib/auth';
import { DESK_VERSION } from '@/lib/env';
import { STAFF_ROLES } from '@/lib/vocab';
import { signOut } from '../(auth)/actions';

// Every route in this group requires an active staff principal. Pages and actions check again on
// their own (layouts do not re-run on every navigation and are not a security boundary).
export default async function DeskLayout({ children }: LayoutProps<'/'>) {
  const session = await requireStaff();
  const counts = await staffTx(async (tx) => {
    const [row] = await tx<{ pitches: number; proposals: number }[]>`
      select (select count(*)::int from app.pitches where status in ('new', 'needs_info')) as pitches,
             (select count(*)::int from app.draft_proposals where status = 'proposed') as proposals
    `;
    return row;
  });
  const roleLabel = session.principal.roles.map((r) => STAFF_ROLES[r]).join(', ');
  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Link className="wordmark" href="/">
            <span className="wordmark__name">Seafood Confidential</span>
            <span className="wordmark__desk">Operations desk</span>
          </Link>
          <div className="account">
            <div className="account__who">
              <span>{session.principal.displayName}</span>
              <span className="account__role">{roleLabel}</span>
            </div>
            <form action={signOut}>
              <button type="submit" className="button button--small button--on-dark">
                Sign out
              </button>
            </form>
          </div>
          <DeskNav counts={{ Contributors: counts.pitches, Stories: counts.proposals }} />
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <span>Seafood Confidential operations desk v{DESK_VERSION}</span>
          <span>Agents propose. People decide and publish in Ghost.</span>
        </div>
      </footer>
    </>
  );
}
