'use client';

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { idleState, type FormState } from '@/lib/form-state';

// Accessible forms on top of React 19 form actions. ActionForm owns the action state; fields read
// their error and the echoed value from context, so Server Components can compose forms freely.
// Fields remount after every submission (React resets uncontrolled forms after an action) and are
// re-filled from the echoed values when validation fails.

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const FormContext = createContext<{ state: FormState; formId: string }>({ state: idleState, formId: 'form' });

export function ActionForm({
  action,
  children,
  className = 'form',
  successMessage,
  label,
  renderResult,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  label?: string;
  renderResult?: 'token' | 'receipt';
}) {
  const [state, formAction] = useActionState(action, idleState);
  const formId = useId();
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const receipt = renderResult === 'receipt' && state.status === 'ok' ? state.result?.receipt : undefined;
  useEffect(() => {
    if (receipt) receiptHeading.current?.focus();
  }, [receipt]);
  if (receipt) {
    return (
      <div className="stack" role="status">
        <h2 ref={receiptHeading} tabIndex={-1}>
          Thank you. Your pitch is in the queue.
        </h2>
        <p>
          Your receipt code is{' '}
          <strong className="mono" data-testid="pitch-receipt">
            {receipt}
          </strong>
          . Keep it if you write to us about this pitch.
        </p>
        <p>
          An editor reads every pitch. If we want to take it further we will email you. We do not publish your
          contact details or share them with automated tools.
        </p>
      </div>
    );
  }
  const submission = JSON.stringify([state.status, state.message, state.errors, state.result]);
  const errorCount = Object.keys(state.errors ?? {}).length;
  return (
    <FormContext.Provider value={{ state, formId }}>
      <form action={formAction} className={className} aria-label={label} noValidate>
        {state.status === 'error' ? (
          <div className="notice notice--error" role="alert">
            {state.message ?? 'Something needs attention.'}
            {errorCount > 0
              ? ` Check the ${errorCount === 1 ? 'highlighted field' : `${errorCount} highlighted fields`}.`
              : null}
          </div>
        ) : null}
        {state.status === 'ok' && (state.message || successMessage) ? (
          <div className="notice notice--ok" role="status">
            {state.message ?? successMessage}
          </div>
        ) : null}
        {state.status === 'ok' && renderResult === 'token' && state.result?.token ? (
          <div className="stack" role="status">
            <p>
              <strong>Copy this token now.</strong> It is shown once and only its hash is stored. Anyone
              holding it can act as this agent until you revoke it.
            </p>
            <code className="secret" data-testid="issued-token">
              {state.result.token}
            </code>
          </div>
        ) : null}
        <div key={submission} className="form">
          {children}
        </div>
      </form>
    </FormContext.Provider>
  );
}

function useField(name: string, defaultValue?: string) {
  const { state, formId } = useContext(FormContext);
  const id = `${formId}-${name}`;
  const error = state.errors?.[name];
  const echoed = state.status === 'error' ? state.values?.[name] : undefined;
  const value = typeof echoed === 'string' ? echoed : defaultValue;
  return { id, error, value, hintId: `${id}-hint`, errorId: `${id}-error`, state };
}

function Label({ id, label, optional }: { id: string; label: string; optional?: boolean }) {
  return (
    <label className="field__label" htmlFor={id}>
      {label}
      {optional ? <span className="field__optional"> (optional)</span> : null}
    </label>
  );
}

function Help({
  hint,
  hintId,
  error,
  errorId,
}: {
  hint?: ReactNode;
  hintId: string;
  error?: string;
  errorId: string;
}) {
  return (
    <>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId}>
          <span aria-hidden="true">✕</span> {error}
        </p>
      ) : null}
    </>
  );
}

function describedBy(hint: unknown, error: unknown, hintId: string, errorId: string) {
  return [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
}

interface BaseFieldProps {
  name: string;
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  defaultValue?: string;
  className?: string;
}

export function TextField({
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  ...props
}: BaseFieldProps & {
  type?: 'text' | 'email' | 'url' | 'date' | 'number';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'url' | 'numeric';
  maxLength?: number;
}) {
  const f = useField(props.name, props.defaultValue);
  return (
    <div className={`field ${props.className ?? ''}`}>
      <Label id={f.id} label={props.label} optional={props.optional} />
      <input
        id={f.id}
        name={props.name}
        type={type}
        className="input"
        defaultValue={f.value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required={!props.optional}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={describedBy(props.hint, f.error, f.hintId, f.errorId)}
      />
      <Help hint={props.hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  );
}

export function TextAreaField({
  rows = 4,
  maxLength,
  ...props
}: BaseFieldProps & { rows?: number; maxLength?: number }) {
  const f = useField(props.name, props.defaultValue);
  return (
    <div className={`field ${props.className ?? ''}`}>
      <Label id={f.id} label={props.label} optional={props.optional} />
      <textarea
        id={f.id}
        name={props.name}
        className="textarea"
        rows={rows}
        maxLength={maxLength}
        defaultValue={f.value}
        required={!props.optional}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={describedBy(props.hint, f.error, f.hintId, f.errorId)}
      />
      <Help hint={props.hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  );
}

export function SelectField({
  options,
  placeholder,
  ...props
}: BaseFieldProps & { options: Record<string, string>; placeholder?: string }) {
  const f = useField(props.name, props.defaultValue);
  return (
    <div className={`field ${props.className ?? ''}`}>
      <Label id={f.id} label={props.label} optional={props.optional} />
      <select
        id={f.id}
        name={props.name}
        className="select"
        defaultValue={f.value ?? ''}
        required={!props.optional}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={describedBy(props.hint, f.error, f.hintId, f.errorId)}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <Help hint={props.hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultChecked?: boolean;
}) {
  const f = useField(name);
  const echoed = f.state.status === 'error' ? f.state.values?.[name] === 'on' : defaultChecked;
  return (
    <div className="field">
      <div className="checkbox">
        <input
          id={f.id}
          type="checkbox"
          name={name}
          defaultChecked={echoed}
          aria-invalid={f.error ? true : undefined}
          aria-describedby={describedBy(hint, f.error, f.hintId, f.errorId)}
        />
        <label htmlFor={f.id}>{label}</label>
      </div>
      <Help hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  );
}

export function CheckboxGroup({
  name,
  legend,
  options,
  defaultValues = [],
  hint,
}: {
  name: string;
  legend: string;
  options: Record<string, string>;
  defaultValues?: string[];
  hint?: ReactNode;
}) {
  const f = useField(name);
  const echoed = f.state.status === 'error' ? f.state.values?.[name] : undefined;
  const checked = Array.isArray(echoed) ? (echoed as string[]) : defaultValues;
  return (
    <fieldset className="fieldset" aria-describedby={describedBy(hint, f.error, f.hintId, f.errorId)}>
      <legend>{legend}</legend>
      <div className="checkbox-group">
        {Object.entries(options).map(([value, text]) => (
          <div className="checkbox" key={value}>
            <input
              id={`${f.id}-${value}`}
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={checked.includes(value)}
            />
            <label htmlFor={`${f.id}-${value}`}>{text}</label>
          </div>
        ))}
      </div>
      <Help hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </fieldset>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function SubmitButton({
  children,
  pendingText = 'Saving…',
  variant = 'primary',
  small,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  small?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const cls = ['button', variant !== 'primary' ? `button--${variant}` : '', small ? 'button--small' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="submit"
      className={cls}
      aria-disabled={pending}
      disabled={pending}
      name={name}
      value={value}
    >
      {pending ? pendingText : children}
    </button>
  );
}
