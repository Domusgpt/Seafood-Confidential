import 'server-only';
import type { Tx } from './db';
import type {
  AgentProcessing,
  AssetKind,
  Focus,
  Format,
  FormatHint,
  ItemStatus,
  PermittedUse,
  PitchStatus,
  ProposalStatus,
  Provenance,
  PublishAction,
  PublishJobStatus,
  RightsStatus,
  Section,
  SourceType,
} from './vocab';

// Read models for desk pages. Every function takes a transaction from withStaff/staffTx, so Row
// Level Security applies to all of them; nothing here widens access.

export interface ItemRow {
  id: string;
  contentId: string;
  title: string;
  summary: string | null;
  section: Section;
  format: Format;
  label: string;
  focus: Focus | null;
  status: ItemStatus;
  dueOn: Date | null;
  assignedEditorId: string | null;
  assignedEditorName: string | null;
  authorDisplay: string | null;
  region: string[];
  species: string[];
  ghostPostId: string | null;
  slug: string | null;
  publishedAt: Date | null;
  publishedVia: 'staff' | 'agent' | null;
  publishedByName: string | null;
  publishedRevision: number | null;
  publicUrl: string | null;
  textRevision: number;
  /** Placeholder content an operator loaded for a preview site (docs/LAUNCH_PREVIEW.md). */
  isSample: boolean;
  pitchId: string | null;
  pitchReceipt: string | null;
  updatedAt: Date;
  sourceCount: number;
  rightsPending: number;
  rightsBlocked: number;
  rightsMissingCredit: number;
  proposalsWaiting: number;
}

const ITEM_SELECT = (tx: Tx) => tx`
  select i.id, i.content_id, i.title, i.summary, i.section, i.format, i.label, i.focus, i.status,
         i.due_on, i.assigned_editor_id, e.display_name as assigned_editor_name, i.author_display,
         i.region, i.species, i.ghost_post_id, i.slug, i.published_at, i.published_via,
         pb.display_name as published_by_name, i.published_revision, i.public_url, i.is_sample,
         coalesce((select a.revision from app.articles a where a.item_id = i.id), 0) as text_revision,
         i.pitch_id, p.receipt_code as pitch_receipt, i.updated_at,
         (select count(*)::int from app.sources s where s.item_id = i.id) as source_count,
         (select count(*)::int from app.asset_rights r where r.item_id = i.id and r.status = 'pending') as rights_pending,
         (select count(*)::int from app.asset_rights r where r.item_id = i.id and r.status in ('restricted', 'rejected')) as rights_blocked,
         (select count(*)::int from app.asset_rights r
            where r.item_id = i.id and r.status = 'cleared' and coalesce(btrim(r.credit_line), '') = '') as rights_missing_credit,
         (select count(*)::int from app.draft_proposals d where d.item_id = i.id and d.status = 'proposed') as proposals_waiting
  from app.editorial_items i
  left join app.principals e on e.id = i.assigned_editor_id
  left join app.principals pb on pb.id = i.published_by
  left join app.pitches p on p.id = i.pitch_id
`;

export async function listItems(
  tx: Tx,
  filter: { status?: ItemStatus; section?: Section; active?: boolean } = {},
): Promise<ItemRow[]> {
  return tx<ItemRow[]>`
    ${ITEM_SELECT(tx)}
    where (${filter.status ?? null}::text is null or i.status = ${filter.status ?? null})
      and (${filter.section ?? null}::text is null or i.section = ${filter.section ?? null})
      and (${filter.active ?? false} = false or i.status not in ('published', 'withdrawn'))
    order by i.due_on asc nulls last, i.content_id desc
    limit 500
  `;
}

export async function getItem(tx: Tx, contentId: string): Promise<ItemRow | null> {
  const rows = await tx<ItemRow[]>`${ITEM_SELECT(tx)} where i.content_id = ${contentId}`;
  return rows[0] ?? null;
}

export interface SourceRow {
  id: string;
  sourceCode: string;
  sourceType: SourceType;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedOn: Date | null;
  accessedOn: Date | null;
  claimSupported: string | null;
  locationInSource: string | null;
  agentProcessing: AgentProcessing;
  privateContact: string | null;
  privateNotes: string | null;
  publicCitation: boolean;
}

export function listSources(tx: Tx, itemId: string) {
  return tx<SourceRow[]>`
    select id, source_code, source_type, title, publisher, url, published_on, accessed_on, claim_supported,
           location_in_source, agent_processing, private_contact, private_notes, public_citation
    from app.sources where item_id = ${itemId} order by source_code
  `;
}

export interface RightsRow {
  id: string;
  assetLabel: string;
  assetKind: AssetKind;
  provenance: Provenance;
  ownerName: string | null;
  license: string | null;
  creditLine: string | null;
  permittedUses: PermittedUse[];
  restrictions: string | null;
  status: RightsStatus;
  consentReference: string | null;
}

export function listRights(tx: Tx, itemId: string) {
  return tx<RightsRow[]>`
    select id, asset_label, asset_kind, provenance, owner_name, license, credit_line, permitted_uses,
           restrictions, status, consent_reference
    from app.asset_rights where item_id = ${itemId} order by created_at
  `;
}

export interface StoryImageRow {
  id: string;
  altText: string;
  caption: string | null;
  focalX: string;
  focalY: string;
  width: number;
  height: number;
  createdAt: Date;
  rightsId: string;
  rightsLabel: string;
  creditLine: string | null;
  rightsStatus: RightsStatus;
  provenance: Provenance;
  assetKind: AssetKind;
  permittedUses: PermittedUse[];
  /** The live site shows this image. */
  live: boolean;
}

/** The story's current lead image, and whether the live site still shows an earlier one. */
export async function getStoryImage(tx: Tx, itemId: string) {
  const [image] = await tx<StoryImageRow[]>`
    select s.id, s.alt_text, s.caption, s.focal_x, s.focal_y, s.width, s.height, s.created_at,
           ar.id as rights_id, ar.asset_label as rights_label, ar.credit_line, ar.status as rights_status,
           ar.provenance, ar.asset_kind, ar.permitted_uses, (i.published_image_id = s.id) as live
    from app.story_images s
    join app.asset_rights ar on ar.id = s.asset_rights_id
    join app.editorial_items i on i.id = s.item_id
    where s.item_id = ${itemId} and s.superseded_at is null
  `;
  const [pin] = await tx<{ pinned: boolean }[]>`
    select published_image_id is not null as pinned from app.editorial_items where id = ${itemId}
  `;
  return { image: image ?? null, liveShowsEarlier: Boolean(pin?.pinned) && !image?.live };
}

export interface ProposalRow {
  id: string;
  agentName: string;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  sourceIds: string[];
  editorNotes: string | null;
  status: ProposalStatus;
  requestId: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewerName: string | null;
}

export function listProposals(tx: Tx, itemId: string) {
  return tx<ProposalRow[]>`
    select d.id, a.display_name as agent_name, d.title, d.summary, d.body_markdown, d.source_ids, d.editor_notes,
           d.status, d.request_id, d.created_at, d.reviewed_at, r.display_name as reviewer_name
    from app.draft_proposals d
    join app.principals a on a.id = d.principal_id
    left join app.principals r on r.id = d.reviewed_by
    where d.item_id = ${itemId}
    order by d.created_at desc
  `;
}

export interface GrantRow {
  principalId: string;
  agentName: string;
  agentStatus: string;
  grantedAt: Date;
}

export function listItemGrants(tx: Tx, itemId: string) {
  return tx<GrantRow[]>`
    select g.principal_id, p.display_name as agent_name, p.status as agent_status, g.granted_at
    from app.agent_item_grants g join app.principals p on p.id = g.principal_id
    where g.item_id = ${itemId} order by p.display_name
  `;
}

export interface PrincipalRow {
  id: string;
  displayName: string;
  status: string;
  roles: string[];
}

export function listStaff(tx: Tx) {
  return tx<PrincipalRow[]>`
    select p.id, p.display_name, p.status,
           array(select a.role from app.staff_assignments a where a.principal_id = p.id and a.revoked_at is null order by a.role) as roles
    from app.principals p
    where p.kind = 'human'
    order by p.status = 'active' desc, p.display_name
  `;
}

export function listAgents(tx: Tx) {
  return tx<PrincipalRow[]>`
    select p.id, p.display_name, p.status, '{}'::text[] as roles
    from app.principals p where p.kind = 'agent'
    order by p.status = 'active' desc, p.display_name
  `;
}

export interface PitchRow {
  id: string;
  receiptCode: string;
  submittedAt: Date;
  submitterName: string;
  submitterEmail: string;
  affiliation: string | null;
  subject: string;
  readerQuestion: string;
  firsthandBasis: string;
  formatHint: FormatHint | null;
  interestsDisclosure: string | null;
  status: PitchStatus;
  dispositionNote: string | null;
  dispositionAt: Date | null;
  dispositionByName: string | null;
  itemContentId: string | null;
}

const PITCH_SELECT = (tx: Tx) => tx`
  select p.id, p.receipt_code, p.submitted_at, p.submitter_name, p.submitter_email, p.affiliation, p.subject,
         p.reader_question, p.firsthand_basis, p.format_hint, p.interests_disclosure, p.status,
         p.disposition_note, p.disposition_at, d.display_name as disposition_by_name, i.content_id as item_content_id
  from app.pitches p
  left join app.principals d on d.id = p.disposition_by
  left join app.editorial_items i on i.id = p.item_id
`;

export function listPitches(tx: Tx, view: 'open' | 'decided' | 'all') {
  return tx<PitchRow[]>`
    ${PITCH_SELECT(tx)}
    where (${view} = 'all'
           or (${view} = 'open' and p.status in ('new', 'needs_info'))
           or (${view} = 'decided' and p.status in ('accepted', 'declined')))
    order by p.status = 'new' desc, p.submitted_at desc
    limit 300
  `;
}

export async function getPitch(tx: Tx, receiptCode: string): Promise<PitchRow | null> {
  const rows = await tx<PitchRow[]>`${PITCH_SELECT(tx)} where p.receipt_code = ${receiptCode}`;
  return rows[0] ?? null;
}

export interface AuditRow {
  occurredAt: Date;
  actorKind: string;
  actorName: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  outcome: string;
  requestId: string | null;
}

export function recentAudit(tx: Tx, limit = 100) {
  return tx<AuditRow[]>`select * from app.recent_audit_events(${limit})`;
}

export interface CredentialRow {
  credentialId: string;
  principalId: string;
  agentName: string;
  agentStatus: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expired: boolean;
}

export function listCredentials(tx: Tx) {
  return tx<CredentialRow[]>`
    select *, (expires_at is not null and expires_at <= now()) as expired from app.list_agent_credentials()
  `;
}

export interface ArticleRow {
  title: string;
  dek: string | null;
  bodyMarkdown: string;
  byline: string | null;
  sourceCodes: string[];
  aiGenerated: boolean;
  revision: number;
  humanEditedAt: Date | null;
  updatedAt: Date;
  updatedByName: string;
}

export async function getArticle(tx: Tx, itemId: string): Promise<ArticleRow | null> {
  const rows = await tx<ArticleRow[]>`
    select a.title, a.dek, a.body_markdown, a.byline, a.source_codes, a.ai_generated, a.revision,
           a.human_edited_at, a.updated_at, p.display_name as updated_by_name
    from app.articles a join app.principals p on p.id = a.updated_by
    where a.item_id = ${itemId}
  `;
  return rows[0] ?? null;
}

export interface PublishJobRow {
  id: string;
  contentId: string;
  itemTitle: string;
  action: PublishAction;
  status: PublishJobStatus;
  requestedVia: 'staff' | 'agent';
  requesterName: string;
  sendEmail: boolean;
  outcomeMessage: string | null;
  publicUrl: string | null;
  gateResults: { gate: string; pass: boolean; detail: string }[];
  acknowledgedWarnings: string[];
  attempts: number;
  createdAt: Date;
  finishedAt: Date | null;
}

export function listPublishJobs(tx: Tx, opts: { itemId?: string; limit?: number } = {}) {
  return tx<PublishJobRow[]>`
    select j.id, i.content_id, i.title as item_title, j.action, j.status, j.requested_via,
           r.display_name as requester_name, j.send_email, j.outcome_message, j.public_url, j.gate_results,
           j.acknowledged_warnings, j.attempts, j.created_at, j.finished_at
    from app.publish_jobs j
    join app.editorial_items i on i.id = j.item_id
    join app.principals r on r.id = j.requested_by
    where (${opts.itemId ?? null}::uuid is null or j.item_id = ${opts.itemId ?? null})
    order by j.created_at desc
    limit ${opts.limit ?? 50}
  `;
}

export interface PublishingPolicy {
  agentsMayPublish: boolean;
  agentsMayEmail: boolean;
  agentDailyLimit: number;
  minSources: number;
  disclosureText: string;
  updatedAt: Date;
  updatedByName: string | null;
  lanes: { section: Section; agentsMayPublish: boolean }[];
  agentPublishedToday: number;
  openJobs: number;
  needsAttention: number;
  publishedStories: number;
}

export async function getPublishingPolicy(tx: Tx): Promise<PublishingPolicy> {
  const [policy] = await tx<Omit<PublishingPolicy, 'lanes'>[]>`
    select p.agents_may_publish, p.agents_may_email, p.agent_daily_limit, p.min_sources, p.disclosure_text,
           p.updated_at, u.display_name as updated_by_name,
           (select count(*)::int from app.publish_jobs j where j.requested_via = 'agent'
              and j.status in ('queued', 'running', 'succeeded', 'needs_attention')
              and j.created_at > now() - interval '24 hours') as agent_published_today,
           (select count(*)::int from app.publish_jobs j where j.status in ('queued', 'running')) as open_jobs,
           (select count(*)::int from app.publish_jobs j where j.status = 'needs_attention') as needs_attention,
           (select count(*)::int from app.editorial_items i where i.status = 'published') as published_stories
    from app.publishing_policy p left join app.principals u on u.id = p.updated_by
  `;
  const lanes = await tx<{ section: Section; agentsMayPublish: boolean }[]>`
    select section, agents_may_publish from app.publishing_lanes
    order by array_position(array['on_the_water','at_the_farm','the_trade','rules_and_reality','at_the_table','voices'], section)
  `;
  return { ...policy, lanes };
}
