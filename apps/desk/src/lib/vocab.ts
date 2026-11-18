// Editorial vocabulary shared by forms, validation, views and the agent gateway. Values mirror the
// database check constraints in supabase/migrations/20261118180000_desk_foundation.sql; display
// names follow editorial/EDITORIAL_PLAYBOOK.md.

export const SECTIONS = {
  on_the_water: 'On the Water',
  at_the_farm: 'At the Farm',
  the_trade: 'The Trade',
  rules_and_reality: 'Rules and Reality',
  at_the_table: 'At the Table',
  voices: 'Voices',
} as const;
export type Section = keyof typeof SECTIONS;

export const FORMATS = {
  reported_feature: 'Reported feature',
  explainer: 'Explainer',
  interview: 'Interview',
  first_person: 'First-person account',
  opinion: 'Opinion',
  sponsored: 'Sponsored contribution',
} as const;
export type Format = keyof typeof FORMATS;

export const FOCI = {
  fishery: 'Fishery',
  aquaculture: 'Aquaculture',
  both: 'Fishery and aquaculture',
} as const;
export type Focus = keyof typeof FOCI;

export type Tone = 'neutral' | 'info' | 'good' | 'warning' | 'serious' | 'critical';

export const ITEM_STATUSES = {
  commissioned: { label: 'Commissioned', tone: 'info' },
  drafting: { label: 'Drafting', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  changes_requested: { label: 'Changes requested', tone: 'serious' },
  ready_for_release: { label: 'Ready for release', tone: 'good' },
  published: { label: 'Published', tone: 'good' },
  on_hold: { label: 'On hold', tone: 'warning' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type ItemStatus = keyof typeof ITEM_STATUSES;

export const PITCH_STATUSES = {
  new: { label: 'New', tone: 'info' },
  needs_info: { label: 'Needs information', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'good' },
  declined: { label: 'Declined', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type PitchStatus = keyof typeof PITCH_STATUSES;

export const PITCH_DECISIONS = {
  accepted: 'Accept and commission',
  needs_info: 'Ask for more information',
  declined: 'Decline',
} as const;
export type PitchDecision = keyof typeof PITCH_DECISIONS;

export const FORMAT_HINTS = {
  article: 'Written article',
  dispatch: 'Short dispatch',
  interview: 'Interview',
  audio: 'Audio',
  photographs: 'Photographs',
  other: 'Something else',
} as const;
export type FormatHint = keyof typeof FORMAT_HINTS;

export const SOURCE_TYPES = {
  official_document: 'Official document',
  primary_research: 'Primary research',
  interview: 'Interview',
  direct_record: 'Direct record',
  firsthand_observation: 'Firsthand observation',
  calculation: 'Calculation',
  secondary_reporting: 'Secondary reporting',
  other: 'Other',
} as const;
export type SourceType = keyof typeof SOURCE_TYPES;

export const AGENT_PROCESSING = {
  no: 'Staff only',
  redacted: 'Agents see a redacted entry',
  yes: 'Agents may use',
} as const;
export type AgentProcessing = keyof typeof AGENT_PROCESSING;

export const ASSET_KINDS = {
  photo: 'Photo',
  illustration: 'Illustration',
  graphic: 'Graphic',
  audio: 'Audio',
  video: 'Video',
  document: 'Document',
  other: 'Other',
} as const;
export type AssetKind = keyof typeof ASSET_KINDS;

export const PROVENANCE = {
  documentary: 'Documentary',
  illustrative: 'Illustrative',
  generated: 'Generated',
} as const;
export type Provenance = keyof typeof PROVENANCE;

export const RIGHTS_STATUSES = {
  pending: { label: 'Pending', tone: 'warning' },
  cleared: { label: 'Cleared', tone: 'good' },
  restricted: { label: 'Restricted', tone: 'serious' },
  rejected: { label: 'Rejected', tone: 'critical' },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type RightsStatus = keyof typeof RIGHTS_STATUSES;

export const PERMITTED_USES = {
  web: 'Web',
  newsletter: 'Newsletter',
  social: 'Social',
  podcast: 'Podcast',
  print: 'Print',
} as const;
export type PermittedUse = keyof typeof PERMITTED_USES;

export const PROPOSAL_STATUSES = {
  proposed: { label: 'Waiting for review', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type ProposalStatus = keyof typeof PROPOSAL_STATUSES;

export const STAFF_ROLES = {
  owner: 'Owner',
  managing_editor: 'Managing editor',
  editor: 'Editor',
} as const;

export const AGENT_SCOPES = {
  'briefs.list': 'List granted briefs',
  'items.read': 'Read granted items (redacted)',
  'drafts.propose': 'Propose drafts',
  'drafts.revise': 'Revise drafts (not available in v1)',
  'social.propose': 'Propose social copy (not available in v1)',
  'jobs.read': 'Read job status',
} as const;
export type AgentScope = keyof typeof AGENT_SCOPES;

/** The label a format implies (database constraint editorial_items_label_matches_format). */
export function labelForFormat(format: Format): 'reporting' | 'opinion' | 'sponsored' {
  if (format === 'opinion') return 'opinion';
  if (format === 'sponsored') return 'sponsored';
  return 'reporting';
}

export function keysOf<T extends Record<string, unknown>>(record: T) {
  return Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];
}
