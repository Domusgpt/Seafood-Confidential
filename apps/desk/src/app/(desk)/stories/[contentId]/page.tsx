import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ActionForm,
  CheckboxGroup,
  Hidden,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { Callout, Card, EmptyState, StatusBadge, formatDate, formatDateTime, isoDay } from '@/components/ui';
import { hasRole, staffTx } from '@/lib/auth';
import { env } from '@/lib/env';
import { ghostEditorUrl, ghostNewPostUrl } from '@/lib/ghost';
import { nextAction, newsroomToday, type ActionTarget } from '@/lib/next-action';
import {
  getItem,
  listAgents,
  listItemGrants,
  listProposals,
  listRights,
  listSources,
  listStaff,
} from '@/lib/queries';
import {
  AGENT_PROCESSING,
  ASSET_KINDS,
  FORMATS,
  ITEM_STATUSES,
  PERMITTED_USES,
  PROPOSAL_STATUSES,
  PROVENANCE,
  RIGHTS_STATUSES,
  SECTIONS,
  SOURCE_TYPES,
} from '@/lib/vocab';
import {
  addRights,
  addSource,
  deleteSource,
  grantAgent,
  linkGhostPost,
  reviewProposal,
  revokeAgentGrant,
  setRightsStatus,
  updateItem,
} from '../actions';
import { ItemFields } from '../item-fields';

const CONTENT_ID = /^SC-[0-9]{4}-[0-9]{3,}$/;

export async function generateMetadata({ params }: PageProps<'/stories/[contentId]'>): Promise<Metadata> {
  const { contentId } = await params;
  return { title: CONTENT_ID.test(contentId) ? contentId : 'Story' };
}

export default async function StoryPage({ params }: PageProps<'/stories/[contentId]'>) {
  const { contentId } = await params;
  if (!CONTENT_ID.test(contentId)) notFound();
  const data = await staffTx(async (tx, session) => {
    const item = await getItem(tx, contentId);
    if (!item) return null;
    const [sources, rights, proposals, grants, staff, agents] = await Promise.all([
      listSources(tx, item.id),
      listRights(tx, item.id),
      listProposals(tx, item.id),
      listItemGrants(tx, item.id),
      listStaff(tx),
      listAgents(tx),
    ]);
    return { item, sources, rights, proposals, grants, staff, agents, session };
  });
  if (!data) notFound();
  const { item, sources, rights, proposals, grants, staff, agents, session } = data;
  const canManageAgents = hasRole(session, 'owner', 'managing_editor');
  const ghostAdmin = env().GHOST_ADMIN_URL;
  const editorUrl = ghostEditorUrl(ghostAdmin, item.ghostPostId);
  const action = nextAction({ ...item, dueOn: isoDay(item.dueOn), today: newsroomToday() });
  const staffOptions = Object.fromEntries(
    staff.filter((s) => s.status === 'active' && s.roles.length > 0).map((s) => [s.id, s.displayName]),
  );
  const grantable = agents.filter(
    (a) => a.status === 'active' && !grants.some((g) => g.principalId === a.id),
  );

  const targetLink = (target: ActionTarget) => {
    switch (target) {
      case 'ghost_editor':
        return editorUrl ? (
          <a className="external" href={editorUrl} target="_blank" rel="noopener noreferrer">
            Open in the Ghost editor
          </a>
        ) : null;
      case 'ghost_new': {
        const url = ghostNewPostUrl(ghostAdmin);
        return url ? (
          <a className="external" href={url} target="_blank" rel="noopener noreferrer">
            Start a Ghost draft
          </a>
        ) : (
          <span>Ghost admin URL is not configured</span>
        );
      }
      case 'sources':
        return <a href="#sources">Go to sources</a>;
      case 'rights':
        return <a href="#rights">Go to rights and credits</a>;
      case 'proposals':
        return <a href="#proposals">Go to proposals</a>;
      case 'details':
        return <a href="#details">Edit details</a>;
      default:
        return null;
    }
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header__text">
          <p className="eyebrow">
            <span className="mono">{item.contentId}</span> · {SECTIONS[item.section]}
          </p>
          <h1>{item.title}</h1>
          <div className="row">
            <StatusBadge tone={ITEM_STATUSES[item.status].tone} label={ITEM_STATUSES[item.status].label} />
            <StatusBadge tone="neutral" label={FORMATS[item.format]} />
            {item.label !== 'reporting' ? (
              <StatusBadge tone="warning" label={`Labelled ${item.label}`} />
            ) : null}
          </div>
        </div>
        <div className="page-header__actions">
          <Link className="button button--secondary" href="/stories">
            All stories
          </Link>
        </div>
      </header>

      <section aria-labelledby="next-action-heading">
        <h2 id="next-action-heading" className="visually-hidden">
          Next action
        </h2>
        <Callout
          tone={action.tone}
          title={`Next: ${action.title}`}
          meta={
            <>
              <span>Owner: {action.owner ?? 'Unassigned'}</span>
              <span>Due: {formatDate(item.dueOn)}</span>
              {targetLink(action.target)}
            </>
          }
        >
          <p>{action.detail}</p>
        </Callout>
      </section>

      <div className="grid grid--sidebar">
        <div className="stack">
          <Card
            id="ghost"
            title="Ghost post"
            note="The canonical article lives in Ghost. The desk stores only its post ID and never changes Ghost."
          >
            {item.ghostPostId ? (
              <dl className="facts">
                <dt>Post ID</dt>
                <dd className="mono">{item.ghostPostId}</dd>
                <dt>Editor</dt>
                <dd>
                  {editorUrl ? (
                    <a
                      className="external"
                      href={editorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="ghost-editor-link"
                    >
                      {editorUrl}
                    </a>
                  ) : (
                    'Set GHOST_ADMIN_URL to show the editor link.'
                  )}
                </dd>
              </dl>
            ) : (
              <EmptyState>Not linked to a Ghost post yet.</EmptyState>
            )}
            <ActionForm action={linkGhostPost} label="Link the Ghost post">
              <Hidden name="itemId" value={item.id} />
              <TextField
                name="ghostPost"
                label={item.ghostPostId ? 'Change the Ghost post' : 'Ghost post ID or editor URL'}
                optional
                defaultValue={item.ghostPostId ?? ''}
                hint="Paste the 24-character post ID or the address of the post in the Ghost editor. Clear the field to unlink."
              />
              <div>
                <SubmitButton small>Save Ghost link</SubmitButton>
              </div>
            </ActionForm>
          </Card>

          <Card
            id="sources"
            title={`Sources (${sources.length})`}
            note="Sources behind factual claims. Private contacts and notes are staff only and never reach agents or public pages."
          >
            {sources.length === 0 ? (
              <EmptyState>No sources recorded yet.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <caption className="visually-hidden">Source records for {item.contentId}</caption>
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Source</th>
                      <th scope="col">Supports</th>
                      <th scope="col">Agents</th>
                      <th scope="col">Staff only</th>
                      {canManageAgents ? (
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.id}>
                        <td className="id mono">{s.sourceCode}</td>
                        <td>
                          <span className="table__primary">
                            {s.url ? (
                              <a
                                className="external"
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                              >
                                {s.title}
                              </a>
                            ) : (
                              s.title
                            )}
                          </span>
                          <div className="small muted">
                            {SOURCE_TYPES[s.sourceType]}
                            {s.publisher ? ` · ${s.publisher}` : ''}
                            {s.publishedOn ? ` · ${formatDate(s.publishedOn)}` : ''}
                          </div>
                        </td>
                        <td className="small">
                          {s.claimSupported ?? <span className="muted">—</span>}
                          {s.locationInSource ? <div className="muted">At: {s.locationInSource}</div> : null}
                        </td>
                        <td>
                          <StatusBadge
                            tone={
                              s.agentProcessing === 'yes'
                                ? 'good'
                                : s.agentProcessing === 'redacted'
                                  ? 'warning'
                                  : 'neutral'
                            }
                            label={AGENT_PROCESSING[s.agentProcessing]}
                          />
                        </td>
                        <td className="small">
                          {s.privateContact || s.privateNotes ? (
                            <>
                              {s.privateContact ? <div>{s.privateContact}</div> : null}
                              {s.privateNotes ? <div className="muted">{s.privateNotes}</div> : null}
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        {canManageAgents ? (
                          <td>
                            <form action={deleteSource}>
                              <input type="hidden" name="sourceId" value={s.id} />
                              <input type="hidden" name="contentId" value={item.contentId} />
                              <button type="submit" className="button button--danger button--small">
                                Remove<span className="visually-hidden"> {s.sourceCode}</span>
                              </button>
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary className="link-button">Add a source</summary>
              <ActionForm action={addSource} label="Add a source">
                <Hidden name="itemId" value={item.id} />
                <div className="form__grid form__grid--2">
                  <TextField
                    name="sourceCode"
                    label="Source ID"
                    maxLength={44}
                    hint="For example SRC-NOAA-2026-01."
                  />
                  <SelectField
                    name="sourceType"
                    label="Type"
                    options={SOURCE_TYPES}
                    placeholder="Choose a type"
                  />
                  <TextField name="title" label="Title" maxLength={300} className="form__wide" />
                  <TextField name="publisher" label="Publisher" optional maxLength={200} />
                  <TextField name="url" label="Address" type="url" optional maxLength={2000} />
                  <TextField name="publishedOn" label="Published" type="date" optional />
                  <TextField name="accessedOn" label="Accessed" type="date" optional />
                  <TextAreaField
                    name="claimSupported"
                    label="Claim it supports"
                    optional
                    rows={2}
                    maxLength={2000}
                    className="form__wide"
                  />
                  <TextField
                    name="locationInSource"
                    label="Where in the source"
                    optional
                    maxLength={300}
                    hint="Page, table or timestamp."
                  />
                  <SelectField
                    name="agentProcessing"
                    label="May agents process it?"
                    options={AGENT_PROCESSING}
                    defaultValue="no"
                    hint="Default is staff only. Confidential sources must stay staff only."
                  />
                  <TextField
                    name="privateContact"
                    label="Private contact"
                    optional
                    maxLength={500}
                    hint="Staff only."
                  />
                  <TextAreaField
                    name="privateNotes"
                    label="Private notes"
                    optional
                    rows={2}
                    maxLength={4000}
                    hint="Staff only."
                  />
                </div>
                <div>
                  <SubmitButton small>Record source</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </Card>

          <Card
            id="rights"
            title={`Rights and credits (${rights.length})`}
            note="Every image, audio clip or document needs recorded permission, provenance and a credit line before release."
          >
            {rights.length === 0 ? (
              <EmptyState>No assets recorded. Text-only stories need none.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <caption className="visually-hidden">Rights records for {item.contentId}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col">Credit line</th>
                      <th scope="col">Permitted uses</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rights.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="table__primary">{r.assetLabel}</span>
                          <div className="small muted">
                            {ASSET_KINDS[r.assetKind]} · {PROVENANCE[r.provenance]}
                            {r.ownerName ? ` · ${r.ownerName}` : ''}
                            {r.license ? ` · ${r.license}` : ''}
                          </div>
                          {r.restrictions ? (
                            <div className="small">Restrictions: {r.restrictions}</div>
                          ) : null}
                        </td>
                        <td className="small">{r.creditLine ?? <span className="muted">Missing</span>}</td>
                        <td className="small">
                          {r.permittedUses.length ? (
                            r.permittedUses.map((u) => PERMITTED_USES[u]).join(', ')
                          ) : (
                            <span className="muted">None</span>
                          )}
                        </td>
                        <td>
                          <div className="stack">
                            <StatusBadge
                              tone={RIGHTS_STATUSES[r.status].tone}
                              label={RIGHTS_STATUSES[r.status].label}
                            />
                            <form action={setRightsStatus} className="row" key={`${r.id}-${r.status}`}>
                              <input type="hidden" name="rightsId" value={r.id} />
                              <input type="hidden" name="contentId" value={item.contentId} />
                              <label className="visually-hidden" htmlFor={`rights-status-${r.id}`}>
                                Change status for {r.assetLabel}
                              </label>
                              <select
                                id={`rights-status-${r.id}`}
                                name="status"
                                className="select"
                                defaultValue={r.status}
                              >
                                {Object.entries(RIGHTS_STATUSES).map(([value, s]) => (
                                  <option
                                    key={value}
                                    value={value}
                                    disabled={value === 'cleared' && !r.creditLine}
                                  >
                                    {s.label}
                                    {value === 'cleared' && !r.creditLine ? ' (needs a credit line)' : ''}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="button button--secondary button--small">
                                Update
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary className="link-button">Add a rights record</summary>
              <ActionForm action={addRights} label="Add a rights record">
                <Hidden name="itemId" value={item.id} />
                <div className="form__grid form__grid--2">
                  <TextField
                    name="assetLabel"
                    label="Asset"
                    maxLength={200}
                    hint="What it shows, e.g. Dock at dawn, Portland."
                    className="form__wide"
                  />
                  <SelectField
                    name="assetKind"
                    label="Kind"
                    options={ASSET_KINDS}
                    placeholder="Choose a kind"
                  />
                  <SelectField
                    name="provenance"
                    label="Provenance"
                    options={PROVENANCE}
                    placeholder="Choose provenance"
                    hint="Generated images are never presented as photographs."
                  />
                  <TextField name="ownerName" label="Rights holder" optional maxLength={200} />
                  <TextField name="license" label="License or agreement" optional maxLength={200} />
                  <TextField
                    name="creditLine"
                    label="Credit line"
                    optional
                    maxLength={300}
                    hint="Required once cleared."
                    className="form__wide"
                  />
                  <div className="form__wide">
                    <CheckboxGroup name="permittedUses" legend="Permitted uses" options={PERMITTED_USES} />
                  </div>
                  <TextAreaField
                    name="restrictions"
                    label="Restrictions"
                    optional
                    rows={2}
                    maxLength={1000}
                  />
                  <TextField
                    name="consentReference"
                    label="Consent reference"
                    optional
                    maxLength={500}
                    hint="Where the signed permission is kept."
                  />
                  <SelectField
                    name="status"
                    label="Status"
                    options={Object.fromEntries(
                      Object.entries(RIGHTS_STATUSES).map(([k, v]) => [k, v.label]),
                    )}
                    defaultValue="pending"
                  />
                </div>
                <div>
                  <SubmitButton small>Save rights record</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </Card>

          <Card
            id="proposals"
            title={`Agent draft proposals (${proposals.length})`}
            note="Agents can only propose. Accepting records your decision; the words still go into Ghost by a person."
          >
            {proposals.length === 0 ? (
              <EmptyState>No proposals. Grant an agent access to this item to receive drafts.</EmptyState>
            ) : (
              proposals.map((p) => (
                <article key={p.id} className="proposal" aria-label={`Proposal from ${p.agentName}`}>
                  <div className="row">
                    <StatusBadge
                      tone={PROPOSAL_STATUSES[p.status].tone}
                      label={PROPOSAL_STATUSES[p.status].label}
                    />
                    <span className="small muted">
                      {p.agentName} · {formatDateTime(p.createdAt)} · request{' '}
                      <span className="mono">{p.requestId}</span>
                    </span>
                  </div>
                  <details>
                    <summary>{p.title}</summary>
                    {p.summary ? <p className="small">{p.summary}</p> : null}
                    <p className="small muted">
                      Sources cited: {p.sourceIds.length ? p.sourceIds.join(', ') : 'none'}
                    </p>
                    {p.editorNotes ? <p className="small">Notes for the editor: {p.editorNotes}</p> : null}
                    <pre className="proposal__body">{p.bodyMarkdown}</pre>
                  </details>
                  {p.status === 'proposed' ? (
                    <form action={reviewProposal} className="row">
                      <input type="hidden" name="proposalId" value={p.id} />
                      <input type="hidden" name="contentId" value={item.contentId} />
                      <button type="submit" name="decision" value="accepted" className="button button--small">
                        Accept proposal
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="rejected"
                        className="button button--secondary button--small"
                      >
                        Reject
                      </button>
                    </form>
                  ) : (
                    <p className="small muted">
                      Reviewed by {p.reviewerName ?? 'staff'}{' '}
                      {p.reviewedAt ? `on ${formatDateTime(p.reviewedAt)}` : ''}
                    </p>
                  )}
                </article>
              ))
            )}
          </Card>
        </div>

        <div className="stack">
          <Card id="details" title="Details" headingLevel={2}>
            <ActionForm action={updateItem} label="Edit story details">
              <Hidden name="itemId" value={item.id} />
              <SelectField
                name="status"
                label="Operations status"
                options={Object.fromEntries(Object.entries(ITEM_STATUSES).map(([k, v]) => [k, v.label]))}
                defaultValue={item.status}
                hint="Desk workflow only. Ghost's own post status is never changed from here."
              />
              <ItemFields
                staff={staffOptions}
                defaults={{
                  title: item.title,
                  section: item.section,
                  format: item.format,
                  focus: item.focus ?? '',
                  dueOn: isoDay(item.dueOn) ?? '',
                  assignedEditorId: item.assignedEditorId ?? '',
                  authorDisplay: item.authorDisplay ?? '',
                  region: item.region.join(', '),
                  species: item.species.join(', '),
                  summary: item.summary ?? '',
                }}
              />
              <div>
                <SubmitButton small>Save details</SubmitButton>
              </div>
            </ActionForm>
            <dl className="facts small">
              <dt>Origin</dt>
              <dd>
                {item.pitchReceipt ? (
                  <Link href={`/contributors/${item.pitchReceipt}`}>Pitch {item.pitchReceipt}</Link>
                ) : (
                  'Commissioned directly'
                )}
              </dd>
              <dt>Updated</dt>
              <dd>{formatDateTime(item.updatedAt)}</dd>
            </dl>
          </Card>

          <Card
            title="Agent access"
            note="Agents see this item only when granted, and never see private source fields, pitches or rights records."
          >
            {grants.length === 0 ? (
              <p className="small muted">No agent can see this item.</p>
            ) : (
              <ul className="rows">
                {grants.map((g) => (
                  <li key={g.principalId} className="rows__item">
                    <span className="rows__title">{g.agentName}</span>
                    {canManageAgents ? (
                      <form action={revokeAgentGrant}>
                        <input type="hidden" name="principalId" value={g.principalId} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="contentId" value={item.contentId} />
                        <button type="submit" className="button button--danger button--small">
                          Remove<span className="visually-hidden"> access for {g.agentName}</span>
                        </button>
                      </form>
                    ) : (
                      <span />
                    )}
                    <span className="rows__meta">
                      Granted {formatDateTime(g.grantedAt)}
                      {g.agentStatus !== 'active' ? ` · agent ${g.agentStatus}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManageAgents && grantable.length > 0 ? (
              <form action={grantAgent} className="stack">
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="contentId" value={item.contentId} />
                <div className="field">
                  <label className="field__label" htmlFor="grant-agent">
                    Grant an agent access
                  </label>
                  <select id="grant-agent" name="principalId" className="select" required>
                    {grantable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <button type="submit" className="button button--secondary button--small">
                    Grant access
                  </button>
                </div>
              </form>
            ) : null}
            {!canManageAgents ? (
              <p className="small muted">Owners and managing editors grant agent access.</p>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
