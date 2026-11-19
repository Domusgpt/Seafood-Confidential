import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  ActionForm,
  CheckboxField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { FORMAT_HINTS } from '@/lib/vocab';
import { submitPitch } from './actions';

export const metadata: Metadata = {
  title: 'Pitch a story',
  description:
    'Pitch a story to Seafood Confidential: tell us what readers need to know and how you know it.',
  robots: { index: true, follow: true },
};

export default async function PitchPage() {
  // Render per request so the CSP nonce reaches the page's scripts.
  await connection();
  return (
    <>
      <header className="public-header">
        <div className="public-header__inner">
          <span className="wordmark">
            <span className="wordmark__name">Seafood Confidential</span>
          </span>
          <p className="tagline">Seafood, from the people who know it.</p>
        </div>
      </header>
      <main id="main" className="page page--narrow" tabIndex={-1}>
        <div className="page-header__text">
          <p className="eyebrow">Contribute</p>
          <h1>Pitch a story</h1>
          <p className="lede">
            We publish fishers, farmers, processors, buyers, cooks and researchers writing about work they
            know firsthand. Tell us the question a reader has and why you are the person to answer it. An
            editor reads every pitch.
          </p>
        </div>
        <section className="card" aria-labelledby="pitch-form-heading">
          <h2 id="pitch-form-heading" className="visually-hidden">
            Pitch form
          </h2>
          <ActionForm action={submitPitch} label="Pitch a story" renderResult="receipt">
            <div className="form__grid form__grid--2">
              <TextField name="name" label="Your name" autoComplete="name" maxLength={120} />
              <TextField
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                hint="Only editors see it. We use it to reply about this pitch."
              />
              <TextField
                name="affiliation"
                label="Where you work or fish"
                optional
                maxLength={200}
                className="form__wide"
                hint="A boat, farm, company, co-op, agency or institution, if relevant."
              />
            </div>
            <TextField name="subject" label="Working title or subject" maxLength={200} />
            <TextAreaField
              name="readerQuestion"
              label="What would a reader want to know?"
              maxLength={1000}
              rows={3}
              hint="One question your piece answers, in plain words."
            />
            <TextAreaField
              name="firsthandBasis"
              label="How do you know?"
              maxLength={2000}
              rows={5}
              hint="Your firsthand experience, records or research. Please do not paste confidential documents here."
            />
            <SelectField
              name="formatHint"
              label="Format you have in mind"
              optional
              options={FORMAT_HINTS}
              placeholder="No preference"
            />
            <TextAreaField
              name="interests"
              label="Commercial interests"
              optional
              maxLength={1000}
              rows={3}
              hint="Any business relationship a reader should know about (an employer, a client, a product you sell)."
            />
            <div className="honeypot" aria-hidden="true">
              <label htmlFor="pitch-website">Leave this field empty</label>
              <input id="pitch-website" type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <CheckboxField
              name="consent"
              label="Seafood Confidential may contact me by email about this pitch."
              hint="We keep pitches private to the editors. Declined pitches are not published."
            />
            <div>
              <SubmitButton pendingText="Sending…">Send pitch</SubmitButton>
            </div>
          </ActionForm>
        </section>
        <p className="small muted">
          No attachments: if we take your pitch further, an editor will arrange how to receive photos or
          documents and record permission and credit for each one.
        </p>
      </main>
    </>
  );
}
