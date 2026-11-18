import type { ItemStatus, Tone } from './vocab';

// SC-007: every editorial item shows one next action with a named owner and, where the work happens
// in Ghost, the exact native editor link. Pure function so it can be unit tested exhaustively.

export interface NextActionInput {
  status: ItemStatus;
  assignedEditorName: string | null;
  ghostPostId: string | null;
  dueOn: string | null; // YYYY-MM-DD
  sourceCount: number;
  rightsPending: number; // rights records not yet cleared (pending)
  rightsBlocked: number; // restricted or rejected records still attached
  rightsMissingCredit: number; // cleared records without a credit line
  proposalsWaiting: number;
  today: string; // YYYY-MM-DD in the newsroom's time zone
}

export type ActionTarget =
  'ghost_editor' | 'ghost_new' | 'sources' | 'rights' | 'proposals' | 'details' | null;

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
    return make(
      'watch',
      'Watch for corrections',
      'Published in Ghost. Corrections and distribution are separate decisions.',
      'neutral',
      'ghost_editor',
    );
  }
  if (input.proposalsWaiting > 0) {
    const n = input.proposalsWaiting;
    return make(
      'review_proposals',
      `Review ${n} agent draft proposal${n === 1 ? '' : 's'}`,
      'Proposals never publish. Accept or reject each one, then work in Ghost.',
      'info',
      'proposals',
    );
  }
  if (!input.ghostPostId) {
    return make(
      'link_ghost',
      'Create the Ghost draft and link it',
      'Start a draft in Ghost, then paste its post ID or editor URL here.',
      'info',
      'ghost_new',
    );
  }
  switch (input.status) {
    case 'commissioned':
      return make(
        'start_draft',
        'Start drafting in Ghost',
        'Open the linked draft in Ghost, then mark the item Drafting.',
        'info',
        'ghost_editor',
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
        'Complete the draft in Ghost, then mark the item In review.',
        'info',
        'ghost_editor',
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
        'Review the draft in Ghost',
        'Approve it as ready for release or request changes.',
        'info',
        'ghost_editor',
      );
    case 'changes_requested':
      return make(
        'revise',
        'Revise the draft and resubmit',
        'Address the requested changes in Ghost, then mark the item In review.',
        'info',
        'ghost_editor',
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
        'Publish in Ghost',
        'A person publishes in Ghost, then marks the item Published here. The desk never publishes.',
        'good',
        'ghost_editor',
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
