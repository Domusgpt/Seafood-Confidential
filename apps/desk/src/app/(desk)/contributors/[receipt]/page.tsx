import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, Hidden, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { Card, PageHeader, StatusBadge, formatDateTime } from '@/components/ui';
import { staffTx } from '@/lib/auth';
import { getPitch, listStaff } from '@/lib/queries';
import { FORMAT_HINTS, FORMATS, PITCH_DECISIONS, PITCH_STATUSES, SECTIONS } from '@/lib/vocab';
import { disposePitch } from '../actions';

const RECEIPT = /^P-[0-9A-F]{10}$/;

export async function generateMetadata({ params }: PageProps<'/contributors/[receipt]'>): Promise<Metadata> {
  const { receipt } = await params;
  return { title: RECEIPT.test(receipt) ? `Pitch ${receipt}` : 'Pitch' };
}

export default async function PitchPage({ params }: PageProps<'/contributors/[receipt]'>) {
  const { receipt } = await params;
  if (!RECEIPT.test(receipt)) notFound();
  const data = await staffTx(async (tx, session) => {
    const pitch = await getPitch(tx, receipt);
    return pitch ? { pitch, staff: await listStaff(tx), me: session.principal.id } : null;
  });
  if (!data) notFound();
  const { pitch, staff, me } = data;
  const open = pitch.status === 'new' || pitch.status === 'needs_info';
  const staffOptions = Object.fromEntries(
    staff.filter((s) => s.status === 'active' && s.roles.length > 0).map((s) => [s.id, s.displayName]),
  );

  return (
    <>
      <PageHeader
        eyebrow={`Pitch ${pitch.receiptCode}`}
        title={pitch.subject}
        actions={
          <Link className="button button--secondary" href="/contributors">
            Back to pitches
          </Link>
        }
      />
      <div className="grid grid--sidebar">
        <div className="stack">
          <Card title="The pitch">
            <dl className="facts">
              <dt>Reader question</dt>
              <dd>{pitch.readerQuestion}</dd>
              <dt>Firsthand basis</dt>
              <dd>{pitch.firsthandBasis}</dd>
              <dt>Format</dt>
              <dd>{pitch.formatHint ? FORMAT_HINTS[pitch.formatHint] : 'No preference'}</dd>
              <dt>Interests</dt>
              <dd>{pitch.interestsDisclosure ?? 'None declared'}</dd>
              <dt>Received</dt>
              <dd>{formatDateTime(pitch.submittedAt)}</dd>
            </dl>
          </Card>
          <Card title="Contributor" note="Private: staff only. Never shown to agents or on public pages.">
            <dl className="facts">
              <dt>Name</dt>
              <dd>{pitch.submitterName}</dd>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${pitch.submitterEmail}`}>{pitch.submitterEmail}</a>
              </dd>
              <dt>Affiliation</dt>
              <dd>{pitch.affiliation ?? '—'}</dd>
              <dt>Consent</dt>
              <dd>Agreed to be contacted about this pitch</dd>
            </dl>
          </Card>
        </div>
        <div className="stack">
          <Card title="Decision">
            <div className="row">
              <StatusBadge
                tone={PITCH_STATUSES[pitch.status].tone}
                label={PITCH_STATUSES[pitch.status].label}
              />
            </div>
            {pitch.dispositionAt ? (
              <p className="small">
                {pitch.dispositionByName ?? 'Staff'} on {formatDateTime(pitch.dispositionAt)}
                {pitch.dispositionNote ? `: “${pitch.dispositionNote}”` : ''}
              </p>
            ) : null}
            {pitch.itemContentId ? (
              <p>
                Commissioned as <Link href={`/stories/${pitch.itemContentId}`}>{pitch.itemContentId}</Link>.
              </p>
            ) : null}
            {open ? (
              <ActionForm action={disposePitch} label="Decide on this pitch">
                <Hidden name="pitchId" value={pitch.id} />
                <SelectField
                  name="decision"
                  label="Decision"
                  options={PITCH_DECISIONS}
                  placeholder="Choose a decision"
                />
                <TextAreaField
                  name="note"
                  label="Note"
                  optional
                  rows={3}
                  maxLength={2000}
                  hint="Internal. Not sent to the contributor."
                />
                <details>
                  <summary className="link-button">Story settings if accepted</summary>
                  <div className="stack">
                    <TextField
                      name="title"
                      label="Working title"
                      optional
                      maxLength={180}
                      defaultValue={pitch.subject.slice(0, 180)}
                    />
                    <SelectField name="section" label="Section" options={SECTIONS} defaultValue="voices" />
                    <SelectField
                      name="format"
                      label="Format"
                      options={FORMATS}
                      defaultValue="reported_feature"
                    />
                    <SelectField name="editorId" label="Owner" options={staffOptions} defaultValue={me} />
                  </div>
                </details>
                <div>
                  <SubmitButton pendingText="Saving decision…">Save decision</SubmitButton>
                </div>
              </ActionForm>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
