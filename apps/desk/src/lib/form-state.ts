// Shared by Server Actions and the client form components (kept free of zod so it stays tiny).
export type FieldErrors = Record<string, string>;

export interface FormState {
  status: 'idle' | 'error' | 'ok';
  message?: string;
  errors?: FieldErrors;
  /** Submitted values echoed back after a validation error so the form can be re-filled. */
  values?: Record<string, unknown>;
  /** Extra payload for a successful action (for example a receipt code or a one-time token). */
  result?: Record<string, string>;
}

export const idleState: FormState = { status: 'idle' };
