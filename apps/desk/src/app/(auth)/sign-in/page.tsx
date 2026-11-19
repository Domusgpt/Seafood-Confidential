import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ActionForm, SubmitButton, TextField } from '@/components/form';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { requestMagicLink } from '../actions';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const session = await getSession();
  if (session.state === 'staff') redirect('/');
  const params = await searchParams;
  const linkError = params.error === 'link';
  const signedOut = params.signed_out === '1';
  const builtinMailer = env().DESK_AUTH_EMAIL === 'builtin';
  return (
    <>
      <header className="public-header">
        <div className="public-header__inner">
          <span className="wordmark">
            <span className="wordmark__name">Seafood Confidential</span>
            <span className="wordmark__desk">Operations desk</span>
          </span>
        </div>
      </header>
      <main id="main" className="page page--narrow" tabIndex={-1}>
        <div className="page-header__text">
          <p className="eyebrow">Staff only</p>
          <h1>Sign in to the desk</h1>
          <p className="lede">
            We email you a one-time sign-in link. There are no desk passwords to forget or leak.
          </p>
        </div>
        {linkError ? (
          <div className="notice notice--error" role="alert">
            That sign-in link is invalid or has expired. Request a new one below, and open it in this same
            browser.
          </div>
        ) : null}
        {signedOut ? (
          <div className="notice notice--ok" role="status">
            You are signed out.
          </div>
        ) : null}
        <section className="card" aria-labelledby="sign-in-heading">
          <h2 id="sign-in-heading" className="visually-hidden">
            Request a sign-in link
          </h2>
          <ActionForm action={requestMagicLink} label="Request a sign-in link">
            <TextField
              name="email"
              label="Work email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
            />
            <div>
              <SubmitButton pendingText="Sending…">Email me a sign-in link</SubmitButton>
            </div>
          </ActionForm>
        </section>
        <section className="sign-in-help" aria-labelledby="sign-in-help-heading">
          <h2 id="sign-in-help-heading">Getting the link to work</h2>
          <ul>
            {builtinMailer ? (
              <li>
                <strong>Open the email on this device, and the link in this browser.</strong> A link opened on
                another device or in another browser is refused.
              </li>
            ) : null}
            <li>It can take a minute or two to arrive. If it does not, check your spam or junk folder.</li>
            <li>Each link works once, for 15 minutes.</li>
            {builtinMailer ? (
              <li>
                The desk can send only about two sign-in emails an hour in total, so asking again straight
                away does not help. Wait half an hour before trying again.
              </li>
            ) : null}
          </ul>
        </section>
        <p className="small muted">
          Contributors do not need an account. To pitch a story, use the <a href="/pitch">pitch form</a>.
        </p>
      </main>
    </>
  );
}
