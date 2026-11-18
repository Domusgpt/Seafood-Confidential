import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, Stat, StatusBadge, formatDateTime } from '@/components/ui';
import { hasRole, staffTx } from '@/lib/auth';
import { env } from '@/lib/env';
import { getPublishingPolicy, listPublishJobs } from '@/lib/queries';
import { AGENT_GATES, PUBLISH_ACTIONS, PUBLISH_JOB_STATUSES, PUBLISH_WARNINGS } from '@/lib/vocab';
import { runQueuedJobs, stopAgentPublishing } from './actions';

export const metadata: Metadata = { title: 'Publishing' };

// The publishing log (ADR-005): every publication by people and agents, what the checks said, and
// one place to stop agent publishing.
export default async function PublishingPage() {
  const { jobs, policy, canRun } = await staffTx(async (tx, session) => ({
    jobs: await listPublishJobs(tx, { limit: 60 }),
    policy: await getPublishingPolicy(tx),
    canRun: hasRole(session, 'owner', 'managing_editor'),
  }));
  const queued = jobs.filter((j) => j.status === 'queued').length;
  const site = env().SITE_PUBLIC_URL;

  return (
    <>
      <PageHeader
        eyebrow="Public site and newsletter"
        title="Publishing"
        description={
          <>
            Everything published, updated or taken down, by people and by agents.{' '}
            <a className="external" href={site} target="_blank" rel="noopener noreferrer">
              Open the public site
            </a>
          </>
        }
        actions={
          policy.agentsMayPublish ? (
            <form action={stopAgentPublishing}>
              <button type="submit" className="button button--danger">
                Stop agent publishing
              </button>
            </form>
          ) : (
            <Link className="button button--secondary" href="/settings#publishing">
              Agent publishing is off
            </Link>
          )
        }
      />

      <div className="stats">
        <Stat value={policy.publishedStories} label="Stories live" />
        <Stat
          value={`${policy.agentPublishedToday} / ${policy.agentDailyLimit}`}
          label="Agent publications today"
        />
        <Stat value={policy.openJobs} label="Running or queued" />
        <Stat value={policy.needsAttention} label="Need attention" />
      </div>

      {canRun && queued > 0 ? (
        <form action={runQueuedJobs} className="row">
          <button type="submit" className="button button--secondary">
            Run {queued} queued job{queued === 1 ? '' : 's'} now
          </button>
        </form>
      ) : null}

      <Card
        title="Recent publishing"
        note="Newest first. Refused agent requests show the checks that failed; nothing was published for them."
      >
        {jobs.length === 0 ? (
          <EmptyState>Nothing published yet.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">Publish jobs, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Story</th>
                  <th scope="col">What</th>
                  <th scope="col">Who</th>
                  <th scope="col">Result</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const failed = j.gateResults.filter((g) => !g.pass);
                  return (
                    <tr key={j.id}>
                      <td className="small">{formatDateTime(j.createdAt)}</td>
                      <td>
                        <Link href={`/stories/${j.contentId}#publishing`} className="table__primary">
                          {j.itemTitle}
                        </Link>
                        <div className="small muted mono">{j.contentId}</div>
                      </td>
                      <td>
                        {PUBLISH_ACTIONS[j.action]}
                        {j.sendEmail ? ' + email' : ''}
                      </td>
                      <td>
                        {j.requestedVia === 'agent' ? (
                          <StatusBadge tone="info" label={`Agent: ${j.requesterName}`} />
                        ) : (
                          j.requesterName
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          tone={PUBLISH_JOB_STATUSES[j.status].tone}
                          label={PUBLISH_JOB_STATUSES[j.status].label}
                        />
                      </td>
                      <td className="small">
                        {failed.length ? (
                          <ul className="compact-list">
                            {failed.map((g) => (
                              <li key={g.gate}>
                                {AGENT_GATES[g.gate] ?? g.gate}: {g.detail}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {j.acknowledgedWarnings.length ? (
                          <div className="muted">
                            Confirmed despite:{' '}
                            {j.acknowledgedWarnings.map((w) => PUBLISH_WARNINGS[w] ?? w).join(' ')}
                          </div>
                        ) : null}
                        {j.outcomeMessage && !failed.length ? <div>{j.outcomeMessage}</div> : null}
                        {j.publicUrl && j.status === 'succeeded' ? (
                          <a
                            className="external"
                            href={j.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
