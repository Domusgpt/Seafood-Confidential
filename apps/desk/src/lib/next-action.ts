import type { ItemStatus, Tone } from './vocab';

// SC-007: every editorial item shows one next action with a named owner and the exact place on the
// page where the work happens (the story text or the publishing panel; ADR-005: stories are written
// and published from the desk). Pure function so it can be unit tested exhaustively.

export interface NextActionInput {
  status: ItemStatus;
  assignedEditorName: string | null;
  /** Revision of the story text, or 0 when nobody has written it yet. */
  textRevision: number;
  /** Revision that is live on the public site, when published. */
  publishedRevision: number | null;
  dueOn: string | null; // YYYY-MM-DD
  sourceCount: number;
  rightsPending: number; // rights records not yet cleared (pending)
  rightsBlocked: number; // restricted or rejected records still attached
  rightsMissingCredit: number; // cleared records without a credit line
  proposalsWaiting: number;
  /** Placeholder content an operator loaded for a preview site: nothing to do. */
  isSample?: boolean;
  today: string; // YYYY-MM-DD in the newsroom's time zone
}

export type ActionTarget = 'text' | 'publishing' | 'sources' | 'rights' | 'proposals' | 'details' | null;

export interface NextAction {
  key: string;
  title: string;
  detail: string;
  tone: Tone;
  owner: string | null;
  target: ActionTarget;
  overdue: boolean;
  blocked: boolean;
}

const ACTIVE: ItemStatus[] = [
  'commissioned',
  'drafting',
  'in_review',
  'changes_requested',
  'ready_for_release',
];

export function nextAction(input: NextActionInput): NextAction {
  const owner = input.assignedEditorName;
  const overdue = Boolean(input.dueOn && ACTIVE.includes(input.status) && input.dueOn < input.today);
  const make = (
    key: string,
    title: string,
    detail: string,
    tone: Tone,
    target: ActionTarget,
    blocked = false,
  ): NextAction => ({
    key,
    title,
    detail: overdue ? `Overdue since ${input.dueOn}. ${detail}` : detail,
    tone: overdue && tone !== 'critical' ? 'serious' : tone,
    owner,
    target,
    overdue,
    blocked,
  });

  if (input.status === 'withdrawn') {
    return make(
      'none',
      'No further action',
      'This item was withdrawn. Keep its records for the archive.',
      'neutral',
      null,
    );
  }
  if (input.isSample) {
    return make(
      'sample',
      'Sample: nothing to do',
      'Placeholder content for the preview. Samples come down before launch (docs/LAUNCH_PREVIEW.md).',
      'neutral',
      null,
    );
  }
  if (!owner) {
    return make(
      'assign',
      'Assign an editor',
      'Nobody owns this item yet. Pick the editor responsible for it.',
      'warning',
      'details',
    );
  }
  if (input.status === 'on_hold') {
    return make(
      'decide_hold',
      'Decide whether to resume or withdraw',
      'The item is on hold. Resume it or withdraw it.',
      'warning',
      'details',
    );
  }
  if (input.status === 'published') {
    if (input.publishedRevision !== null && input.textRevision > input.publishedRevision) {
      return make(
        'update_live',
        'Update the published story',
        `The text has changed since publication (revision ${input.textRevision}, live ${input.publishedRevision}). Update the live page when the edit is ready.`,
        'info',
        'publishing',
      );
    }
    return make(
      'watch',
      'Watch for corrections',
      'Published on the site. Corrections are edits to the text followed by an update.',
      'neutral',
      'publishing',
    );
  }
  if (input.proposalsWaiting > 0) {
    const n = input.proposalsWaiting;
    return make(
      'review_proposals',
      `Review ${n} agent draft proposal${n === 1 ? '' : 's'}`,
      'Use one as the story text, or reject it.',
      'info',
      'proposals',
    );
  }
  if (input.textRevision === 0) {
    return make(
      'write',
      'Write the story',
      'Write the text on this page, or use an agent proposal as the starting point.',
      'info',
      'text',
    );
  }
  switch (input.status) {
    case 'commissioned':
      return make(
        'start_draft',
        'Keep writing, then mark the story Drafting',
        'The text is started. Move the story to Drafting so everyone knows it is under way.',
        'info',
        'text',
      );
    case 'drafting':
      if (input.sourceCount === 0) {
        return make(
          'add_sources',
          'Record the sources',
          'Add at least one source record before the draft goes to review.',
          'warning',
          'sources',
        );
      }
      return make(
        'finish_draft',
        'Finish the draft and send it to review',
        'Complete the text, then mark the story In review.',
        'info',
        'text',
      );
    case 'in_review':
      if (input.sourceCount === 0) {
        return make(
          'review_blocked_sources',
          'Review is blocked: no sources',
          'Record the sources behind every factual claim before approving.',
          'serious',
          'sources',
          true,
        );
      }
      if (input.rightsBlocked > 0 || input.rightsPending > 0 || input.rightsMissingCredit > 0) {
        const n = input.rightsBlocked + input.rightsPending + input.rightsMissingCredit;
        return make(
          'clear_rights',
          `Clear rights and credits for ${n} asset${n === 1 ? '' : 's'}`,
          'Every asset needs cleared permission and a credit line before release.',
          'warning',
          'rights',
        );
      }
      return make(
        'review_draft',
        'Review the text',
        'Approve it as ready for release or request changes.',
        'info',
        'text',
      );
    case 'changes_requested':
      return make(
        'revise',
        'Revise the text and resubmit',
        'Address the requested changes, then mark the story In review.',
        'info',
        'text',
      );
    case 'ready_for_release':
      if (input.rightsBlocked > 0 || input.rightsPending > 0) {
        return make(
          'release_blocked_rights',
          'Release is blocked: rights not cleared',
          'Clear or remove every pending or restricted asset before publishing.',
          'serious',
          'rights',
          true,
        );
      }
      return make(
        'publish',
        'Publish the story',
        'Publish it from the Publishing panel. Emailing subscribers is a separate choice.',
        'good',
        'publishing',
      );
    default:
      return make('details', 'Check the item details', 'Review the status and owner.', 'neutral', 'details');
  }
}

/** Today's date (YYYY-MM-DD) in the newsroom's time zone. */
export function newsroomToday(now = new Date(), timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
