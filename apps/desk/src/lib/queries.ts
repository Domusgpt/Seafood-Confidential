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
         i.region, i.species, i.ghost_post_id, i.pitch_id, p.receipt_code as pitch_receipt, i.updated_at,
         (select count(*)::int from app.sources s where s.item_id = i.id) as source_count,
         (select count(*)::int from app.asset_rights r where r.item_id = i.id and r.status = 'pending') as rights_pending,
         (select count(*)::int from app.asset_rights r where r.item_id = i.id and r.status in ('restricted', 'rejected')) as rights_blocked,
         (select count(*)::int from app.asset_rights r
            where r.item_id = i.id and r.status = 'cleared' and coalesce(btrim(r.credit_line), '') = '') as rights_missing_credit,
         (select count(*)::int from app.draft_proposals d where d.item_id = i.id and d.status = 'proposed') as proposals_waiting
  from app.editorial_items i
  left join app.principals e on e.id = i.assigned_editor_id
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
}

export function listSources(tx: Tx, itemId: string) {
  return tx<SourceRow[]>`
    select id, source_code, source_type, title, publisher, url, published_on, accessed_on, claim_supported,
           location_in_source, agent_processing, private_contact, private_notes
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
