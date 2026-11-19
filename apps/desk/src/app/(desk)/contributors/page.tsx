import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader, StatusBadge, formatDateTime } from '@/components/ui';
import { staffTx } from '@/lib/auth';
import { listPitches } from '@/lib/queries';
import { PITCH_STATUSES } from '@/lib/vocab';

export const metadata: Metadata = { title: 'Contributors' };

const VIEWS = { open: 'Waiting for a decision', decided: 'Decided', all: 'All pitches' } as const;

export default async function ContributorsPage({ searchParams }: PageProps<'/contributors'>) {
  const params = await searchParams;
  const view = (
    typeof params.view === 'string' && Object.hasOwn(VIEWS, params.view) ? params.view : 'open'
  ) as keyof typeof VIEWS;
  const pitches = await staffTx((tx) => listPitches(tx, view));
  return (
    <>
      <PageHeader
        eyebrow="Guest pitches"
        title="Contributors"
        description="Pitches from the public form. Contact details are visible to staff only. Accepting a pitch commissions a story."
        actions={
          <a className="button button--secondary" href="/pitch" target="_blank" rel="noopener">
            Open the public pitch form
          </a>
        }
      />
      <nav aria-label="Pitch views" className="row">
        {Object.entries(VIEWS).map(([key, label]) => (
          <Link
            key={key}
            href={`/contributors?view=${key}`}
            className={`button button--small ${key === view ? '' : 'button--secondary'}`}
            aria-current={key === view ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {pitches.length === 0 ? (
        <EmptyState>
          {view === 'open'
            ? 'No pitches are waiting. New pitches from the public form appear here.'
            : 'Nothing here yet.'}
        </EmptyState>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">{VIEWS[view]}</caption>
              <thead>
                <tr>
                  <th scope="col">Receipt</th>
                  <th scope="col">Pitch</th>
                  <th scope="col">From</th>
                  <th scope="col">Received</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {pitches.map((p) => (
                  <tr key={p.id}>
                    <td className="id mono">{p.receiptCode}</td>
                    <td>
                      <Link className="table__primary" href={`/contributors/${p.receiptCode}`}>
                        {p.subject}
                      </Link>
                      <div className="small muted">{p.readerQuestion}</div>
                    </td>
                    <td>
                      {p.submitterName}
                      {p.affiliation ? <div className="small muted">{p.affiliation}</div> : null}
                    </td>
                    <td className="num">{formatDateTime(p.submittedAt)}</td>
                    <td>
                      <StatusBadge
                        tone={PITCH_STATUSES[p.status].tone}
                        label={PITCH_STATUSES[p.status].label}
                      />
                      {p.itemContentId ? (
                        <div className="small">
                          <Link href={`/stories/${p.itemContentId}`}>{p.itemContentId}</Link>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
