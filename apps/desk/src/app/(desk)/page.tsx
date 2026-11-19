import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Card,
  EmptyState,
  PageHeader,
  Stat,
  StatusBadge,
  formatDate,
  formatDateTime,
  isoDay,
} from '@/components/ui';
import { hasRole, staffTx } from '@/lib/auth';
import { nextAction, newsroomToday } from '@/lib/next-action';
import { listItems, listPitches, type AuditRow } from '@/lib/queries';
import { ITEM_STATUSES, PITCH_STATUSES } from '@/lib/vocab';

export const metadata: Metadata = { title: 'Today' };

// The private home answers four questions (docs/PRODUCT_SPEC.md): what is due, what needs a
// decision, what changed after review, and what failed. Rows name an owner and link to the work.
export default async function TodayPage() {
  const today = newsroomToday();
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 7);
  const horizonDay = horizon.toISOString().slice(0, 10);

  const data = await staffTx(async (tx, session) => {
    const [items, pitches, proposals] = await Promise.all([
      listItems(tx, { active: true }),
      listPitches(tx, 'open'),
      tx<{ id: string; title: string; agentName: string; contentId: string; createdAt: Date }[]>`
        select d.id, d.title, a.display_name as agent_name, i.content_id, d.created_at
        from app.draft_proposals d
        join app.principals a on a.id = d.principal_id
        join app.editorial_items i on i.id = d.item_id
        where d.status = 'proposed' order by d.created_at limit 20
      `,
    ]);
    const canAudit = hasRole(session, 'owner', 'managing_editor');
    let failures: AuditRow[] = [];
    if (canAudit) {
      failures = await tx<AuditRow[]>`
        select * from app.recent_audit_events(50, true)
        where occurred_at > now() - interval '7 days'
        limit 10
      `;
    }
    return { items, pitches, proposals, canAudit, failures, name: session.principal.displayName };
  });

  const due = data.items
    .map((item) => ({ item, action: nextAction({ ...item, dueOn: isoDay(item.dueOn), today }) }))
    .filter(({ item }) => {
      const d = isoDay(item.dueOn);
      return d !== null && d <= horizonDay;
    });
  const unassigned = data.items.filter((i) => !i.assignedEditorId).length;
  const blocked = data.items.filter(
    (i) => nextAction({ ...i, dueOn: isoDay(i.dueOn), today }).blocked,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow={formatDate(today)}
        title="Today"
        description={`Good to see you, ${data.name}. Here is what needs you.`}
      />

      <div className="stat-row" role="list" aria-label="Desk summary">
        <div role="listitem">
          <Stat value={due.length} label="Due within 7 days" />
        </div>
        <div role="listitem">
          <Stat value={data.pitches.length + data.proposals.length} label="Waiting for a decision" />
        </div>
        <div role="listitem">
          <Stat value={blocked} label="Blocked by sources or rights" />
        </div>
        <div role="listitem">
          <Stat value={unassigned} label="Without an owner" />
        </div>
      </div>

      <div className="grid grid--2">
        <Card title="What is due?" note="Active stories due in the next seven days, earliest first.">
          {due.length === 0 ? (
            <EmptyState>Nothing is due this week.</EmptyState>
          ) : (
            <ul className="rows">
              {due.map(({ item, action }) => (
                <li key={item.id} className="rows__item">
                  <Link className="rows__title" href={`/stories/${item.contentId}`}>
                    {item.title}
                  </Link>
                  <StatusBadge tone={action.tone} label={action.title} />
                  <span className="rows__meta">
                    <span className="mono">{item.contentId}</span>
                    <span>Due {formatDate(item.dueOn)}</span>
                    <span>Owner: {item.assignedEditorName ?? 'Unassigned'}</span>
                    <span>{ITEM_STATUSES[item.status].label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="What needs a decision?"
          note="Guest pitches and agent draft proposals waiting for an editor."
        >
          {data.pitches.length + data.proposals.length === 0 ? (
            <EmptyState>No decisions are waiting.</EmptyState>
          ) : (
            <ul className="rows">
              {data.pitches.slice(0, 10).map((p) => (
                <li key={p.id} className="rows__item">
                  <Link className="rows__title" href={`/contributors/${p.receiptCode}`}>
                    Pitch: {p.subject}
                  </Link>
                  <StatusBadge tone={PITCH_STATUSES[p.status].tone} label={PITCH_STATUSES[p.status].label} />
                  <span className="rows__meta">
                    <span className="mono">{p.receiptCode}</span>
                    <span>From {p.submitterName}</span>
                    <span>{formatDateTime(p.submittedAt)}</span>
                  </span>
                </li>
              ))}
              {data.proposals.map((d) => (
                <li key={d.id} className="rows__item">
                  <Link className="rows__title" href={`/stories/${d.contentId}#proposals`}>
                    Draft proposal: {d.title}
                  </Link>
                  <StatusBadge tone="info" label="Agent proposal" />
                  <span className="rows__meta">
                    <span className="mono">{d.contentId}</span>
                    <span>From {d.agentName}</span>
                    <span>{formatDateTime(d.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="What changed after review?"
          note="Compares the current draft with the reviewed snapshot."
        >
          <EmptyState>
            Review snapshots are not built yet (planned in SC-008). Until then the desk cannot detect
            post-review changes, so this panel stays empty rather than guessing.
          </EmptyState>
        </Card>

        <Card
          title="What failed?"
          note="Denied or failed events in the last seven days: agent requests with a token, throttled pitches and refused desk actions."
        >
          {!data.canAudit ? (
            <EmptyState>Owners and managing editors see failures here.</EmptyState>
          ) : data.failures.length === 0 ? (
            <EmptyState>Nothing failed in the last seven days.</EmptyState>
          ) : (
            <ul className="rows">
              {data.failures.map((f, index) => (
                <li key={`${f.requestId}-${index}`} className="rows__item">
                  <span className="rows__title">{f.action}</span>
                  <StatusBadge
                    tone={f.outcome === 'error' ? 'critical' : 'serious'}
                    label={f.outcome === 'error' ? 'Error' : 'Denied'}
                  />
                  <span className="rows__meta">
                    <span>{formatDateTime(f.occurredAt)}</span>
                    <span>{f.actorName ?? f.actorKind}</span>
                    {f.requestId ? <span className="mono">{f.requestId}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.canAudit ? (
            <p className="small">
              <Link href="/settings#audit">Open the audit trail</Link>
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
