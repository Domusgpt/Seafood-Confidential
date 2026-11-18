import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader, StatusBadge, formatDate, isoDay } from '@/components/ui';
import { staffTx } from '@/lib/auth';
import { nextAction, newsroomToday } from '@/lib/next-action';
import { listItems } from '@/lib/queries';
import { ITEM_STATUSES, SECTIONS, type ItemStatus, type Section } from '@/lib/vocab';

export const metadata: Metadata = { title: 'Stories' };

export default async function StoriesPage({ searchParams }: PageProps<'/stories'>) {
  const params = await searchParams;
  const status =
    typeof params.status === 'string' && Object.hasOwn(ITEM_STATUSES, params.status)
      ? (params.status as ItemStatus)
      : undefined;
  const section =
    typeof params.section === 'string' && Object.hasOwn(SECTIONS, params.section)
      ? (params.section as Section)
      : undefined;
  const showAll = params.view === 'all';
  const items = await staffTx((tx) => listItems(tx, { status, section, active: !showAll && !status }));
  const today = newsroomToday();

  return (
    <>
      <PageHeader
        eyebrow="Editorial queue"
        title="Stories"
        description="Every editorial item, its owner and the one thing that moves it forward. Drafting and publishing happen in Ghost."
        actions={
          <Link className="button" href="/stories/new">
            Commission a story
          </Link>
        }
      />
      <form className="card" method="get" aria-label="Filter stories">
        <div className="form__grid form__grid--2">
          <div className="field">
            <label className="field__label" htmlFor="filter-status">
              Status
            </label>
            <select id="filter-status" name="status" className="select" defaultValue={status ?? ''}>
              <option value="">Active (not published or withdrawn)</option>
              {Object.entries(ITEM_STATUSES).map(([value, s]) => (
                <option key={value} value={value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="filter-section">
              Section
            </label>
            <select id="filter-section" name="section" className="select" defaultValue={section ?? ''}>
              <option value="">All sections</option>
              {Object.entries(SECTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <button type="submit" className="button button--secondary button--small">
            Apply filters
          </button>
          <Link className="small" href="/stories?view=all">
            Show everything, including published
          </Link>
        </div>
      </form>
      {items.length === 0 ? (
        <EmptyState>
          No stories match. Accept a pitch under <Link href="/contributors">Contributors</Link> or commission
          one directly.
        </EmptyState>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">
                Editorial items with status, owner, due date and next action
              </caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Story</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Due</th>
                  <th scope="col">Next action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const action = nextAction({ ...item, dueOn: isoDay(item.dueOn), today });
                  return (
                    <tr key={item.id}>
                      <td className="id mono">{item.contentId}</td>
                      <td>
                        <Link className="table__primary" href={`/stories/${item.contentId}`}>
                          {item.title}
                        </Link>
                        <div className="small muted">{SECTIONS[item.section]}</div>
                      </td>
                      <td>
                        <StatusBadge
                          tone={ITEM_STATUSES[item.status].tone}
                          label={ITEM_STATUSES[item.status].label}
                        />
                      </td>
                      <td>{item.assignedEditorName ?? <span className="muted">Unassigned</span>}</td>
                      <td className="num">{formatDate(item.dueOn)}</td>
                      <td>
                        <StatusBadge tone={action.tone} label={action.title} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
