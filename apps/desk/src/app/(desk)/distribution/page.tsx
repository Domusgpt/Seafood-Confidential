import type { Metadata } from 'next';
import { Card, PageHeader, StatusBadge } from '@/components/ui';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Distribution' };

// Ticket IDs and titles from planning/BACKLOG.json.
const PLANNED = [
  {
    ticket: 'SC-008',
    title: 'Read-only review snapshots and stale detection',
    detail:
      'Freeze the exact draft an editor approved, so later changes are visible before anything is promoted.',
  },
  {
    ticket: 'SC-010',
    title: 'Two-channel social drafts and Buffer adapter',
    detail:
      'Prepare channel copy from a reviewed snapshot as Buffer drafts. A person approves and schedules.',
  },
  {
    ticket: 'SC-004',
    title: 'Newsletter and reader account journey',
    detail:
      'Set up in Ghost. Whether a story is emailed stays a separate human decision; the desk never sends.',
  },
];

export default async function DistributionPage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        eyebrow="Not built yet"
        title="Distribution"
        description="Newsletter and social distribution are not part of this release. Nothing on this page sends, schedules or publishes anything."
      />
      <Card
        title="Planned next"
        note="From planning/BACKLOG.json. Each keeps a person in charge of every send."
      >
        <ul className="rows">
          {PLANNED.map((p) => (
            <li key={p.ticket} className="rows__item">
              <span className="rows__title">{p.title}</span>
              <StatusBadge tone="neutral" label={`Planned · ${p.ticket}`} />
              <span className="rows__meta">{p.detail}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
