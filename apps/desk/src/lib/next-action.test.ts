import { describe, expect, it } from 'vitest';
import { nextAction, newsroomToday, type NextActionInput } from './next-action';

const base: NextActionInput = {
  status: 'commissioned',
  assignedEditorName: 'Morgan Owner',
  textRevision: 1,
  publishedRevision: null,
  dueOn: null,
  sourceCount: 1,
  rightsPending: 0,
  rightsBlocked: 0,
  rightsMissingCredit: 0,
  proposalsWaiting: 0,
  today: '2026-11-18',
};

const act = (patch: Partial<NextActionInput>) => nextAction({ ...base, ...patch });

describe('nextAction (SC-007: one next action with a named owner)', () => {
  it('asks for an owner before anything else', () => {
    const a = act({ assignedEditorName: null });
    expect(a.key).toBe('assign');
    expect(a.owner).toBeNull();
  });

  it('asks for the story text first', () => {
    expect(act({ textRevision: 0 }).key).toBe('write');
    expect(act({ textRevision: 0 }).target).toBe('text');
  });

  it('puts agent proposals ahead of drafting work, but never after publication', () => {
    expect(act({ proposalsWaiting: 2 }).title).toBe('Review 2 agent draft proposals');
    expect(act({ proposalsWaiting: 1 }).title).toBe('Review 1 agent draft proposal');
    expect(act({ status: 'published', proposalsWaiting: 3 }).key).toBe('watch');
  });

  it('walks the workflow to the text, then to the publishing panel', () => {
    expect(act({}).key).toBe('start_draft');
    expect(act({}).target).toBe('text');
    expect(act({ status: 'drafting' }).key).toBe('finish_draft');
    expect(act({ status: 'changes_requested' }).key).toBe('revise');
    expect(act({ status: 'ready_for_release' }).key).toBe('publish');
    expect(act({ status: 'ready_for_release' }).target).toBe('publishing');
  });

  it('asks for an update when the text changed after publication', () => {
    expect(act({ status: 'published', textRevision: 3, publishedRevision: 3 }).key).toBe('watch');
    const update = act({ status: 'published', textRevision: 4, publishedRevision: 3 });
    expect(update.key).toBe('update_live');
    expect(update.target).toBe('publishing');
  });

  it('requires sources before review and blocks review without them', () => {
    expect(act({ status: 'drafting', sourceCount: 0 }).key).toBe('add_sources');
    const blocked = act({ status: 'in_review', sourceCount: 0 });
    expect(blocked.key).toBe('review_blocked_sources');
    expect(blocked.blocked).toBe(true);
    expect(blocked.tone).toBe('serious');
  });

  it('requires cleared rights and credit lines during review and before release', () => {
    expect(act({ status: 'in_review', rightsPending: 1 }).title).toBe('Clear rights and credits for 1 asset');
    expect(act({ status: 'in_review', rightsMissingCredit: 2 }).title).toBe(
      'Clear rights and credits for 2 assets',
    );
    expect(act({ status: 'in_review' }).key).toBe('review_draft');
    const release = act({ status: 'ready_for_release', rightsBlocked: 1 });
    expect(release.key).toBe('release_blocked_rights');
    expect(release.blocked).toBe(true);
  });

  it('handles holds and withdrawals', () => {
    expect(act({ status: 'on_hold' }).key).toBe('decide_hold');
    expect(act({ status: 'withdrawn', assignedEditorName: null }).key).toBe('none');
  });

  it('flags overdue active items and escalates the tone', () => {
    const overdue = act({ status: 'drafting', dueOn: '2026-11-10' });
    expect(overdue.overdue).toBe(true);
    expect(overdue.tone).toBe('serious');
    expect(overdue.detail).toMatch(/^Overdue since 2026-11-10\./);
    expect(act({ status: 'published', dueOn: '2026-11-10' }).overdue).toBe(false);
    expect(act({ status: 'drafting', dueOn: '2026-11-18' }).overdue).toBe(false);
  });
});

describe('newsroomToday', () => {
  it('uses the newsroom time zone, not UTC', () => {
    // 03:00 UTC on Nov 19 is still Nov 18 in New York.
    expect(newsroomToday(new Date('2026-11-19T03:00:00Z'))).toBe('2026-11-18');
    expect(newsroomToday(new Date('2026-11-19T06:00:00Z'))).toBe('2026-11-19');
  });
});
