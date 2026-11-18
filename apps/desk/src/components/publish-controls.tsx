'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { idleState, type FormState } from '@/lib/form-state';
import { PUBLISH_WARNINGS } from '@/lib/vocab';

// Publish, update or unpublish one story (ADR-005). Warnings from the database come back first;
// the person reads them and can go ahead anyway. People are warned, never blocked.

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const WARNING_TEXT = PUBLISH_WARNINGS;

function Submit({
  children,
  name,
  value,
  variant = 'primary',
}: {
  children: string;
  name?: string;
  value?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  const cls =
    variant === 'primary'
      ? 'button'
      : variant === 'danger'
        ? 'button button--danger'
        : 'button button--secondary';
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={cls}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

export function PublishControls({
  action,
  itemId,
  contentId,
  idempotencyKey,
  isPublished,
  hasText,
  textAhead,
  newsletterReady,
}: {
  action: Action;
  itemId: string;
  contentId: string;
  idempotencyKey: string;
  isPublished: boolean;
  hasText: boolean;
  textAhead: boolean;
  newsletterReady: boolean;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const warnings = state.result?.warnings ? state.result.warnings.split(',').filter(Boolean) : [];
  const hidden = (
    <>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="contentId" value={contentId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </>
  );

  if (warnings.length) {
    return (
      <form action={formAction} className="stack" aria-label="Confirm publication">
        {hidden}
        <input type="hidden" name="publishAction" value={state.result?.action ?? 'publish'} />
        {state.result?.sendEmail ? <input type="hidden" name="sendEmail" value="on" /> : null}
        <div className="notice notice--warning" role="alert">
          <p className="notice__title">{state.message}</p>
          <ul>
            {warnings.map((w) => (
              <li key={w}>
                {WARNING_TEXT[w] ?? w}
                <input type="hidden" name="acknowledged" value={w} />
              </li>
            ))}
          </ul>
        </div>
        <div className="row">
          <Submit>Publish anyway</Submit>
          <a className="button button--secondary" href={`/stories/${contentId}#publishing`}>
            Not yet
          </a>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="stack" aria-label="Publish this story">
      {hidden}
      {state.status === 'error' ? (
        <div className="notice notice--error" role="alert">
          {state.message}
        </div>
      ) : null}
      {state.status === 'ok' ? (
        <div className="notice notice--ok" role="status">
          {state.message}{' '}
          {state.result?.url ? (
            <a className="external" href={state.result.url} target="_blank" rel="noopener noreferrer">
              Open the page
            </a>
          ) : null}
        </div>
      ) : null}
      {!hasText ? (
        <p className="small muted">Write the story text (or use an agent proposal) before publishing.</p>
      ) : isPublished ? (
        <div className="row">
          <Submit name="publishAction" value="republish" variant={textAhead ? 'primary' : 'secondary'}>
            Update the published story
          </Submit>
          <Submit name="publishAction" value="unpublish" variant="danger">
            Unpublish
          </Submit>
        </div>
      ) : (
        <>
          {newsletterReady ? (
            <div className="checkbox">
              <input id={`email-${itemId}`} type="checkbox" name="sendEmail" />
              <label htmlFor={`email-${itemId}`}>Also email it to newsletter subscribers</label>
            </div>
          ) : (
            <p className="small muted">
              The newsletter is not connected yet, so publishing does not send email.
            </p>
          )}
          <div className="row">
            <Submit name="publishAction" value="publish">
              Publish now
            </Submit>
          </div>
        </>
      )}
    </form>
  );
}
