import type { Metadata } from 'next';
import {
  ActionForm,
  CheckboxField,
  CheckboxGroup,
  Hidden,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { Card, EmptyState, PageHeader, StatusBadge, formatDateTime } from '@/components/ui';
import { hasRole, staffTx } from '@/lib/auth';
import { env } from '@/lib/env';
import {
  listAgents,
  listCredentials,
  getPublishingPolicy,
  listStaff,
  recentAudit,
  type AuditRow,
  type CredentialRow,
} from '@/lib/queries';
import { AGENT_SCOPES, SECTIONS, STAFF_ROLES } from '@/lib/vocab';
import { savePublishingPolicy, stopAgentPublishing } from '../publishing/actions';
import { createAgent, issueToken, revokeCredential, setAgentStatus } from './actions';

export const metadata: Metadata = { title: 'Settings' };

// Scopes the gateway serves; the others exist in the contract but answer "not available".
const V1_SCOPES = {
  'briefs.list': AGENT_SCOPES['briefs.list'],
  'items.read': AGENT_SCOPES['items.read'],
  'drafts.propose': AGENT_SCOPES['drafts.propose'],
  'drafts.publish': AGENT_SCOPES['drafts.publish'],
  'jobs.read': AGENT_SCOPES['jobs.read'],
};

export default async function SettingsPage() {
  const data = await staffTx(async (tx, session) => {
    const isOwner = hasRole(session, 'owner');
    const canAudit = hasRole(session, 'owner', 'managing_editor');
    const [staff, agents, publishing] = await Promise.all([
      listStaff(tx),
      listAgents(tx),
      getPublishingPolicy(tx),
    ]);
    let credentials: CredentialRow[] = [];
    let audit: AuditRow[] = [];
    if (canAudit) [credentials, audit] = await Promise.all([listCredentials(tx), recentAudit(tx, 100)]);
    return { session, isOwner, canAudit, staff, agents, credentials, audit, publishing };
  });
  const { session, isOwner, canAudit, staff, agents, credentials, audit, publishing } = data;
  const config = env();
  const site = {
    publicUrl: config.SITE_PUBLIC_URL,
    destination: config.SITE_DESTINATION,
    newsletter: Boolean(config.KIT_API_KEY),
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk administration"
        title="Settings"
        description="People, publishing, agents and the audit trail."
      />

      <Card title="Your account">
        <dl className="facts">
          <dt>Name</dt>
          <dd>{session.principal.displayName}</dd>
          <dt>Signed in as</dt>
          <dd>{session.claims.email ?? '—'}</dd>
          <dt>Roles</dt>
          <dd>{session.principal.roles.map((r) => STAFF_ROLES[r]).join(', ')}</dd>
        </dl>
      </Card>

      <Card
        id="publishing"
        title="Publishing"
        note="Where stories go and what agents may publish on their own. People can always write and publish; these switches only govern agents."
        actions={
          publishing.agentsMayPublish ? (
            <form action={stopAgentPublishing}>
              <button type="submit" className="button button--danger button--small">
                Stop agent publishing now
              </button>
            </form>
          ) : null
        }
      >
        <dl className="facts">
          <dt>Public site</dt>
          <dd>
            <a className="external" href={site.publicUrl} target="_blank" rel="noopener noreferrer">
              {site.publicUrl}
            </a>{' '}
            ({site.destination === 'firebase' ? 'Firebase Hosting' : 'a local folder, for development'})
          </dd>
          <dt>Newsletter</dt>
          <dd>
            {site.newsletter
              ? 'Kit is connected; publishing can email subscribers when asked.'
              : 'Not connected (set KIT_API_KEY). Publishing never sends email.'}
          </dd>
          <dt>Agent publishing</dt>
          <dd>
            <StatusBadge
              tone={publishing.agentsMayPublish ? 'good' : 'neutral'}
              label={publishing.agentsMayPublish ? 'On' : 'Off'}
            />{' '}
            {publishing.agentPublishedToday} of {publishing.agentDailyLimit} agent publications in the last 24
            hours · open sections:{' '}
            {publishing.lanes
              .filter((l) => l.agentsMayPublish)
              .map((l) => SECTIONS[l.section])
              .join(', ') || 'none'}
          </dd>
        </dl>
        {isOwner ? (
          <details>
            <summary className="link-button">Change publishing settings</summary>
            <ActionForm action={savePublishingPolicy} label="Publishing settings">
              <CheckboxField
                name="agentsMayPublish"
                label="Agents may publish on their own"
                defaultChecked={publishing.agentsMayPublish}
                hint="Master switch. Off stops every agent publication at once, including queued ones. Anyone on staff can switch it off."
              />
              <CheckboxGroup
                name="lanes"
                legend="Sections open to agents"
                options={SECTIONS}
                defaultValues={publishing.lanes.filter((l) => l.agentsMayPublish).map((l) => l.section)}
                hint="Agents publish only explainers and reported features, only in these sections, and only after every automatic check passes."
              />
              <div className="form__grid form__grid--2">
                <TextField
                  name="agentDailyLimit"
                  label="Agent publications per day, at most"
                  type="number"
                  inputMode="numeric"
                  defaultValue={String(publishing.agentDailyLimit)}
                />
                <TextField
                  name="minSources"
                  label="Sources an agent story must cite, at least"
                  type="number"
                  inputMode="numeric"
                  defaultValue={String(publishing.minSources)}
                />
              </div>
              <CheckboxField
                name="agentsMayEmail"
                label="Agents may also email their stories to subscribers"
                defaultChecked={publishing.agentsMayEmail}
                hint="Email cannot be recalled once sent. Leave this off unless you trust the agent's lane completely."
              />
              <TextAreaField
                name="disclosureText"
                label="Note shown under every agent-written story"
                rows={3}
                maxLength={600}
                defaultValue={publishing.disclosureText}
              />
              <div>
                <SubmitButton small>Save publishing settings</SubmitButton>
              </div>
            </ActionForm>
          </details>
        ) : (
          <p className="small muted">Owners change these settings.</p>
        )}
      </Card>

      <Card
        title="Staff"
        note="Desk staff are separate from Ghost members and Ghost staff. Invitations are issued by the owner with the operator CLI in this release (docs/DESK.md)."
      >
        <div className="table-scroll">
          <table className="table">
            <caption className="visually-hidden">Staff principals and roles</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Roles</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="table__primary">{s.displayName}</td>
                  <td>
                    {s.roles.length ? (
                      s.roles.map((r) => STAFF_ROLES[r as keyof typeof STAFF_ROLES] ?? r).join(', ')
                    ) : (
                      <span className="muted">No active role</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge
                      tone={s.status === 'active' && s.roles.length ? 'good' : 'neutral'}
                      label={
                        s.status === 'active' && s.roles.length
                          ? 'Active'
                          : s.status === 'active'
                            ? 'No access'
                            : s.status
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        id="agents"
        title="Agents"
        note="Each agent is a named, revocable principal with scoped tokens. Agents can read granted stories and propose drafts; they cannot publish, send, approve or change permissions."
      >
        {agents.length === 0 ? (
          <EmptyState>No agents yet.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">Agent principals</caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Status</th>
                  {isOwner ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="table__primary">{a.displayName}</td>
                    <td>
                      <StatusBadge
                        tone={a.status === 'active' ? 'good' : 'neutral'}
                        label={
                          a.status === 'active' ? 'Active' : a.status === 'revoked' ? 'Revoked' : 'Disabled'
                        }
                      />
                    </td>
                    {isOwner ? (
                      <td>
                        {a.status === 'active' ? (
                          <form action={setAgentStatus}>
                            <input type="hidden" name="principalId" value={a.id} />
                            <input type="hidden" name="status" value="revoked" />
                            <button type="submit" className="button button--danger button--small">
                              Revoke agent<span className="visually-hidden"> {a.displayName}</span>
                            </button>
                          </form>
                        ) : (
                          <span className="small muted">All tokens stop working while revoked.</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isOwner ? (
          <details>
            <summary className="link-button">Create an agent</summary>
            <ActionForm action={createAgent} label="Create an agent" renderResult="token">
              <TextField
                name="name"
                label="Agent name"
                maxLength={120}
                hint="Name it for its job, e.g. Research assistant."
              />
              <CheckboxGroup
                name="scopes"
                legend="Scopes"
                options={V1_SCOPES}
                defaultValues={['briefs.list', 'items.read', 'drafts.propose', 'jobs.read']}
                hint="Grant only what the agent needs. Publishing works only where the publishing settings allow it; agents can never send email, approve or change permissions on their own."
              />
              <TextField
                name="expiresInDays"
                label="Token expires after (days)"
                type="number"
                optional
                inputMode="numeric"
                hint="Leave blank for no expiry; revoke at any time."
              />
              <div>
                <SubmitButton pendingText="Creating…">Create agent and issue token</SubmitButton>
              </div>
            </ActionForm>
          </details>
        ) : null}
      </Card>

      {canAudit ? (
        <Card
          id="tokens"
          title="Agent tokens"
          note="Tokens are shown once at issue time. Only a prefix and a hash are stored. Revocation takes effect on the next request."
        >
          {credentials.length === 0 ? (
            <EmptyState>No tokens issued.</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="visually-hidden">Agent tokens</caption>
                <thead>
                  <tr>
                    <th scope="col">Prefix</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Scopes</th>
                    <th scope="col">Last used</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((c) => {
                    const expired = c.expired;
                    return (
                      <tr key={c.credentialId}>
                        <td className="id mono">sca_{c.tokenPrefix}_…</td>
                        <td>{c.agentName}</td>
                        <td className="small">{c.scopes.join(', ')}</td>
                        <td className="num small">{formatDateTime(c.lastUsedAt)}</td>
                        <td>
                          {c.revokedAt ? (
                            <StatusBadge tone="neutral" label={`Revoked ${formatDateTime(c.revokedAt)}`} />
                          ) : expired ? (
                            <StatusBadge tone="neutral" label="Expired" />
                          ) : (
                            <form action={revokeCredential} className="row">
                              <StatusBadge tone="good" label="Active" />
                              <input type="hidden" name="credentialId" value={c.credentialId} />
                              <button type="submit" className="button button--danger button--small">
                                Revoke<span className="visually-hidden"> token {c.tokenPrefix}</span>
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {isOwner && agents.some((a) => a.status === 'active') ? (
            <details>
              <summary className="link-button">Issue another token for an agent</summary>
              <ActionForm action={issueToken} label="Issue a token" renderResult="token">
                <div className="field">
                  <label className="field__label" htmlFor="issue-agent">
                    Agent
                  </label>
                  <select id="issue-agent" name="principalId" className="select">
                    {agents
                      .filter((a) => a.status === 'active')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName}
                        </option>
                      ))}
                  </select>
                </div>
                <CheckboxGroup
                  name="scopes"
                  legend="Scopes"
                  options={V1_SCOPES}
                  defaultValues={['briefs.list', 'items.read', 'drafts.propose', 'jobs.read']}
                />
                <Hidden name="kind" value="rotate" />
                <div>
                  <SubmitButton pendingText="Issuing…">Issue token</SubmitButton>
                </div>
              </ActionForm>
            </details>
          ) : null}
        </Card>
      ) : null}

      {canAudit ? (
        <Card
          id="audit"
          title="Audit trail"
          note="Append-only. The last 100 events with actor, outcome and request ID."
        >
          {audit.length === 0 ? (
            <EmptyState>No events yet.</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="visually-hidden">Recent audit events</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Request</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((e, index) => (
                    <tr key={`${e.requestId}-${index}`}>
                      <td className="num small">{formatDateTime(e.occurredAt)}</td>
                      <td className="small">
                        {e.actorName ?? '—'} <span className="muted">({e.actorKind})</span>
                      </td>
                      <td className="small mono">{e.action}</td>
                      <td>
                        <StatusBadge
                          tone={
                            e.outcome === 'allowed' ? 'good' : e.outcome === 'denied' ? 'serious' : 'critical'
                          }
                          label={
                            e.outcome === 'allowed' ? 'Allowed' : e.outcome === 'denied' ? 'Denied' : 'Error'
                          }
                        />
                      </td>
                      <td className="small mono">{e.requestId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
