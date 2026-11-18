import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ActionForm,
  CheckboxField,
  CheckboxGroup,
  Hidden,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { PublishControls } from '@/components/publish-controls';
import { Callout, Card, EmptyState, StatusBadge, formatDate, formatDateTime, isoDay } from '@/components/ui';
import { hasRole, staffTx } from '@/lib/auth';
import { env } from '@/lib/env';
import { nextAction, newsroomToday, type ActionTarget } from '@/lib/next-action';
import { markdownToHtml } from '@/lib/site/markdown';
import {
  getArticle,
  getItem,
  listPublishJobs,
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
  PUBLISH_ACTIONS,
  PUBLISH_JOB_STATUSES,
  RIGHTS_STATUSES,
  SECTIONS,
  SOURCE_TYPES,
} from '@/lib/vocab';
import {
  addRights,
  addSource,
  deleteSource,
  grantAgent,
  reviewProposal,
  revokeAgentGrant,
  setRightsStatus,
  setSourceCitation,
  updateItem,
} from '../actions';
import { ItemFields } from '../item-fields';
import { adoptProposal, cancelJob, requestPublish, retryJob, saveArticle } from '../../publishing/actions';

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
    const [sources, rights, proposals, grants, staff, agents, article, jobs] = await Promise.all([
      listSources(tx, item.id),
      listRights(tx, item.id),
      listProposals(tx, item.id),
      listItemGrants(tx, item.id),
      listStaff(tx),
      listAgents(tx),
      getArticle(tx, item.id),
      listPublishJobs(tx, { itemId: item.id, limit: 5 }),
    ]);
    return { item, sources, rights, proposals, grants, staff, agents, article, jobs, session };
  });
  if (!data) notFound();
  const { item, sources, rights, proposals, grants, staff, agents, article, jobs, session } = data;
  const canManageAgents = hasRole(session, 'owner', 'managing_editor');
  const canPublish = canManageAgents;
  const newsletterReady = Boolean(env().KIT_API_KEY);
  const openJob = jobs.find(
    (j) => j.status === 'queued' || j.status === 'running' || j.status === 'needs_attention',
  );
  const textAhead = item.publishedRevision !== null && item.textRevision > item.publishedRevision;
  const action = nextAction({ ...item, dueOn: isoDay(item.dueOn), today: newsroomToday() });
  const staffOptions = Object.fromEntries(
    staff.filter((s) => s.status === 'active' && s.roles.length > 0).map((s) => [s.id, s.displayName]),
  );
  const grantable = agents.filter(
    (a) => a.status === 'active' && !grants.some((g) => g.principalId === a.id),
  );

  const targetLink = (target: ActionTarget) => {
    switch (target) {
      case 'text':
        return <a href="#text">Go to the story text</a>;
      case 'publishing':
        return <a href="#publishing">Go to publishing</a>;
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
            id="text"
            title="Story text"
            note="Write in Markdown: ## for a subheading, **bold**, - for a list, [words](https://…) for a link. Every save is kept; if someone saved after you opened the page, your save is refused so nothing is lost."
          >
            {article ? (
              <p className="small muted" data-testid="article-revision">
                Revision {article.revision}, saved by {article.updatedByName} on{' '}
                {formatDateTime(article.updatedAt)}
                {article.aiGenerated
                  ? ' · started from an agent proposal (labelled as AI-written on the site)'
                  : ''}
              </p>
            ) : null}
            <ActionForm action={saveArticle} label="Story text">
              <Hidden name="itemId" value={item.id} />
              <Hidden name="contentId" value={item.contentId} />
              <Hidden name="expectedRevision" value={String(article?.revision ?? 0)} />
              <TextField
                name="title"
                label="Headline"
                maxLength={180}
                defaultValue={article?.title ?? item.title}
              />
              <TextAreaField
                name="dek"
                label="Summary under the headline"
                optional
                rows={2}
                maxLength={300}
                defaultValue={article?.dek ?? item.summary ?? ''}
              />
              <TextField
                name="byline"
                label="Byline"
                optional
                maxLength={200}
                defaultValue={article?.byline ?? item.authorDisplay ?? ''}
                hint="Leave empty for “Seafood Confidential”."
              />
              <TextAreaField
                name="body"
                label="Story"
                rows={18}
                maxLength={100000}
                defaultValue={article?.bodyMarkdown ?? ''}
                className="field--prose"
              />
              {sources.length ? (
                <CheckboxGroup
                  name="sourceCodes"
                  legend="Sources this text relies on"
                  options={Object.fromEntries(
                    sources.map((s) => [s.sourceCode, `${s.sourceCode}: ${s.title}`]),
                  )}
                  defaultValues={article?.sourceCodes ?? []}
                  hint="Only sources marked citable are listed under the published story."
                />
              ) : null}
              <div>
                <SubmitButton small>Save the text</SubmitButton>
              </div>
            </ActionForm>
            {article ? (
              <details>
                <summary className="link-button">Preview the saved text</summary>
                <div
                  className="preview prose"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(article.bodyMarkdown) }}
                />
              </details>
            ) : null}
          </Card>

          <Card
            id="publishing"
            title="Publishing"
            note="Publishing rebuilds the public site with this story. Emailing subscribers is a separate choice. Owners and managing editors publish; everyone can write."
          >
            <dl className="facts">
              <dt>On the site</dt>
              <dd data-testid="publish-state">
                {item.status === 'published' && item.publicUrl ? (
                  <>
                    Published {item.publishedAt ? formatDateTime(item.publishedAt) : ''}
                    {item.publishedVia === 'agent'
                      ? ` by the agent ${item.publishedByName ?? ''}`
                      : item.publishedByName
                        ? ` by ${item.publishedByName}`
                        : ''}
                    {' · '}
                    <a
                      className="external"
                      href={item.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="public-url"
                    >
                      {item.publicUrl}
                    </a>
                  </>
                ) : (
                  'Not published'
                )}
              </dd>
              {item.status === 'published' ? (
                <>
                  <dt>Live version</dt>
                  <dd>
                    Revision {item.publishedRevision ?? '—'}
                    {textAhead
                      ? ` (the text is now at revision ${item.textRevision}: update the published story when it is ready)`
                      : ''}
                  </dd>
                </>
              ) : null}
            </dl>
            {openJob ? (
              <Callout
                tone={PUBLISH_JOB_STATUSES[openJob.status].tone}
                title={`${PUBLISH_ACTIONS[openJob.action]}: ${PUBLISH_JOB_STATUSES[openJob.status].label}`}
              >
                <p>{openJob.outcomeMessage ?? 'Waiting to run.'}</p>
                {canPublish && openJob.status !== 'running' ? (
                  <div className="row">
                    <form action={retryJob}>
                      <input type="hidden" name="jobId" value={openJob.id} />
                      <input type="hidden" name="contentId" value={item.contentId} />
                      <button type="submit" className="button button--small">
                        {openJob.status === 'queued' ? 'Run it now' : 'Retry'}
                      </button>
                    </form>
                    <form action={cancelJob}>
                      <input type="hidden" name="jobId" value={openJob.id} />
                      <input type="hidden" name="contentId" value={item.contentId} />
                      <button type="submit" className="button button--secondary button--small">
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : null}
              </Callout>
            ) : canPublish ? (
              <PublishControls
                action={requestPublish}
                itemId={item.id}
                contentId={item.contentId}
                idempotencyKey={randomUUID()}
                isPublished={item.status === 'published'}
                hasText={Boolean(article)}
                textAhead={textAhead}
                newsletterReady={newsletterReady}
              />
            ) : (
              <p className="small muted">
                Owners and managing editors publish. You can write and save the text.
              </p>
            )}
            {jobs.length ? (
              <details>
                <summary className="link-button">Publishing history ({jobs.length})</summary>
                <ul className="rows">
                  {jobs.map((j) => (
                    <li key={j.id} className="rows__item">
                      <span className="rows__title">
                        {PUBLISH_ACTIONS[j.action]}
                        {j.sendEmail ? ' with email' : ''} ·{' '}
                        {j.requestedVia === 'agent' ? `agent ${j.requesterName}` : j.requesterName}
                      </span>
                      <StatusBadge
                        tone={PUBLISH_JOB_STATUSES[j.status].tone}
                        label={PUBLISH_JOB_STATUSES[j.status].label}
                      />
                      <span className="rows__meta">
                        {formatDateTime(j.createdAt)}
                        {j.outcomeMessage ? ` · ${j.outcomeMessage}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
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
                      <th scope="col">Public</th>
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
                        <td>
                          <form action={setSourceCitation} className="stack stack--tight">
                            <input type="hidden" name="sourceId" value={s.id} />
                            <input type="hidden" name="contentId" value={item.contentId} />
                            <input type="hidden" name="citable" value={s.publicCitation ? 'false' : 'true'} />
                            <StatusBadge
                              tone={s.publicCitation ? 'good' : 'neutral'}
                              label={s.publicCitation ? 'Citable' : 'Not cited'}
                            />
                            <button type="submit" className="link-button small">
                              {s.publicCitation ? 'Stop citing' : 'Cite publicly'}
                              <span className="visually-hidden"> {s.sourceCode}</span>
                            </button>
                          </form>
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
                  <div className="form__wide">
                    <CheckboxField
                      name="publicCitation"
                      label="Cite it publicly: its title, publisher and link appear under the published story"
                      hint="Leave unticked for confidential interviews and private documents."
                    />
                  </div>
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
            note="Use a proposal as the story text to edit and publish it yourself. Agents publish on their own only where Settings allows."
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
                  {(p.status === 'proposed' || p.status === 'accepted') && !article ? (
                    <form action={adoptProposal} className="row">
                      <input type="hidden" name="proposalId" value={p.id} />
                      <input type="hidden" name="contentId" value={item.contentId} />
                      <input type="hidden" name="expectedRevision" value="0" />
                      <button type="submit" className="button button--small">
                        Use as the story text
                      </button>
                    </form>
                  ) : null}
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
                options={Object.fromEntries(
                  Object.entries(ITEM_STATUSES)
                    .filter(([k]) => (item.status === 'published' ? k === 'published' : k !== 'published'))
                    .map(([k, v]) => [k, v.label]),
                )}
                defaultValue={item.status}
                hint={
                  item.status === 'published'
                    ? 'This story is live. Update it or take it off the site from the Publishing panel; the status follows.'
                    : 'Publishing sets Published. Change the others by hand to track the workflow.'
                }
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
