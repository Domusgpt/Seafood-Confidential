import type { Metadata } from 'next';
import { ActionForm, CheckboxGroup, Hidden, SubmitButton, TextField } from '@/components/form';
import { Card, EmptyState, PageHeader, StatusBadge, formatDateTime } from '@/components/ui';
import { hasRole, staffTx } from '@/lib/auth';
import {
  listAgents,
  listCredentials,
  listStaff,
  recentAudit,
  type AuditRow,
  type CredentialRow,
} from '@/lib/queries';
import { AGENT_SCOPES, STAFF_ROLES } from '@/lib/vocab';
import { createAgent, issueToken, revokeCredential, setAgentStatus } from './actions';

export const metadata: Metadata = { title: 'Settings' };

// Scopes the v1 gateway serves; the others exist in the contract but answer "not available".
const V1_SCOPES = {
  'briefs.list': AGENT_SCOPES['briefs.list'],
  'items.read': AGENT_SCOPES['items.read'],
  'drafts.propose': AGENT_SCOPES['drafts.propose'],
  'jobs.read': AGENT_SCOPES['jobs.read'],
};

export default async function SettingsPage() {
  const data = await staffTx(async (tx, session) => {
    const isOwner = hasRole(session, 'owner');
    const canAudit = hasRole(session, 'owner', 'managing_editor');
    const [staff, agents] = await Promise.all([listStaff(tx), listAgents(tx)]);
    let credentials: CredentialRow[] = [];
    let audit: AuditRow[] = [];
    if (canAudit) [credentials, audit] = await Promise.all([listCredentials(tx), recentAudit(tx, 100)]);
    return { session, isOwner, canAudit, staff, agents, credentials, audit };
  });
  const { session, isOwner, canAudit, staff, agents, credentials, audit } = data;

  return (
    <>
      <PageHeader
        eyebrow="Desk administration"
        title="Settings"
        description="People, agents and the audit trail."
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
                hint="Grant only what the agent needs. Publishing and sending do not exist as scopes."
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
