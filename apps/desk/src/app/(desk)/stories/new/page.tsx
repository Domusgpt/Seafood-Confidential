import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/form';
import { PageHeader } from '@/components/ui';
import { staffTx } from '@/lib/auth';
import { listStaff } from '@/lib/queries';
import { createItem } from '../actions';
import { ItemFields } from '../item-fields';

export const metadata: Metadata = { title: 'Commission a story' };

export default async function NewStoryPage() {
  const { staff, me } = await staffTx(async (tx, session) => ({
    staff: await listStaff(tx),
    me: session.principal.id,
  }));
  const staffOptions = Object.fromEntries(
    staff.filter((s) => s.status === 'active' && s.roles.length > 0).map((s) => [s.id, s.displayName]),
  );
  return (
    <>
      <PageHeader
        eyebrow="Stories"
        title="Commission a story"
        description="Creates an editorial item with the next content ID. Pitches accepted under Contributors become items automatically."
        actions={
          <Link className="button button--secondary" href="/stories">
            Back to stories
          </Link>
        }
      />
      <section className="card" aria-labelledby="new-story-heading">
        <h2 id="new-story-heading" className="visually-hidden">
          Story details
        </h2>
        <ActionForm action={createItem} label="Commission a story">
          <ItemFields staff={staffOptions} defaults={{ assignedEditorId: me }} />
          <div>
            <SubmitButton pendingText="Creating…">Create story</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
