-- SC-006 and SC-007 at the database layer: public intake returns only a receipt and is consent-gated
-- and rate limited; staff disposition creates an editorial item with a content ID; every step lands on
-- the append-only audit trail with its actor and request ID.
begin;
\ir helpers/fixtures.psql
select plan(36);

select tests.make_human('owner@example.test', array['owner']) as owner_uid \gset
select tests.make_human('editor@example.test', array['editor']) as editor_uid \gset
select tests.make_human('unassigned@example.test', '{}') as unassigned_uid \gset

-- ---------------------------------------------------------------------------------------------
-- Public intake (anon)
-- ---------------------------------------------------------------------------------------------
select tests.act_as_anon();
select app.submit_pitch(
  repeat('1', 64), '  Fixture Fisher ', 'Fixture.Fisher@Example.TEST', 'Fixture co-op',
  'Fixture subject about quota changes', 'What does a fixture quota change mean for a day boat?',
  'I have fished the fixture grounds for ten seasons.', 'article', '   ', true, 'req-intake-0001'
) as receipt1 \gset
select matches(:'receipt1'::text, '^P-[0-9A-F]{10}$', 'anon receives only a receipt code from public intake');
select is(
  (select count(*)::int from (
     select app.submit_pitch(repeat('1', 64), 'Fixture Fisher', 'fisher@example.test', null,
       'Fixture follow-up subject', 'Fixture reader question here?', 'Fixture firsthand basis here.',
       null, null, true) as r
     from generate_series(1, 4)) s
   where r is not null),
  4, 'four more submissions from the same client within the hour are accepted');
select is(
  app.submit_pitch(repeat('1', 64), 'Fixture Fisher', 'fisher@example.test', null, 'Fixture sixth subject',
    'Fixture reader question here?', 'Fixture firsthand basis here.', null, null, true, 'req-intake-0006'),
  null::text, 'the sixth submission from one client within an hour is throttled (no receipt)');
select matches(
  app.submit_pitch(repeat('2', 64), 'Fixture Grower', 'grower@example.test', null, 'Fixture farm subject',
    'What does a fixture permit change mean for growers?', 'I run a fixture oyster lease.', 'dispatch', null, true),
  '^P-[0-9A-F]{10}$', 'another client is unaffected by that client''s limit');
select throws_ok(
  $$ select app.submit_pitch(repeat('3', 64), 'Fixture Fisher', 'fisher@example.test', null, 'Fixture subject',
       'Fixture reader question here?', 'Fixture firsthand basis here.', null, null, false) $$,
  '22023', null, 'intake without contact consent is refused');
select throws_ok(
  $$ select app.submit_pitch('not-a-client-hash', 'Fixture Fisher', 'fisher@example.test', null, 'Fixture subject',
       'Fixture reader question here?', 'Fixture firsthand basis here.', null, null, true) $$,
  '22023', null, 'an invalid client fingerprint is refused');
select throws_ok(
  $$ select app.submit_pitch(repeat('4', 64), 'Fixture Fisher', 'not-an-email', null, 'Fixture subject',
       'Fixture reader question here?', 'Fixture firsthand basis here.', null, null, true) $$,
  '23514', null, 'a malformed email is rejected by table constraints');
select throws_ok(
  $$ select app.submit_pitch(repeat('5', 64), 'Fixture Fisher', 'fisher@example.test', null, repeat('x', 201),
       'Fixture reader question here?', 'Fixture firsthand basis here.', null, null, true) $$,
  '23514', null, 'oversized fields are rejected by table constraints (bounded intake)');
select throws_ok($$ select count(*) from app.pitches $$, '42501', null,
  'SC-006: anon cannot read or enumerate the queue it submits to');
select throws_ok($$ select app.dispose_pitch(gen_random_uuid(), 'accepted') $$, '42501', null,
  'anon cannot dispose pitches');
reset role;

-- As the test runner: intake normalized the fields and never trusted client formatting
select results_eq(
  format($$ select submitter_name, submitter_email, affiliation, interests_disclosure, status
            from app.pitches where receipt_code = %L $$, :'receipt1'),
  $$ values ('Fixture Fisher'::text, 'fixture.fisher@example.test'::text, 'Fixture co-op'::text, null::text, 'new'::text) $$,
  'intake trims and normalizes fields and starts the pitch as new');

select id as pitch1 from app.pitches where receipt_code = :'receipt1' \gset
select id as pitch2 from app.pitches where submitter_email = 'grower@example.test' \gset
select id as pitch3 from app.pitches where subject = 'Fixture follow-up subject' order by receipt_code limit 1 \gset

-- ---------------------------------------------------------------------------------------------
-- Disposition (staff)
-- ---------------------------------------------------------------------------------------------
select tests.act_as_user(:'unassigned_uid');
select throws_ok(format($$ select app.dispose_pitch(%L, 'accepted') $$, :'pitch1'), '42501', null,
  'a signed-in identity without a staff assignment cannot dispose pitches');
reset role;

select tests.act_as_user(:'owner_uid');
select set_config('app.request_id', 'req-dispose-0001', true);
select throws_ok(format($$ select app.dispose_pitch(%L, 'published') $$, :'pitch1'), '22023', null,
  'unknown decisions are refused (a pitch decision can never publish)');
select throws_ok($$ select app.dispose_pitch(gen_random_uuid(), 'accepted') $$, 'P0002', null,
  'an unknown pitch is reported as not found');
select app.dispose_pitch(:'pitch1', 'accepted', 'Strong firsthand basis', 'Fixture story title',
  'on_the_water', 'reported_feature', null, 'req-dispose-0001') as item1 \gset
select matches((select content_id from app.editorial_items where id = :'item1'), '^SC-[0-9]{4}-[0-9]{3}$',
  'acceptance creates an editorial item with an SC-YYYY-NNN content ID');
select results_eq(
  format($$ select i.status, i.section, i.format, i.label, i.pitch_id, i.assigned_editor_id, p.status, p.item_id
            from app.editorial_items i join app.pitches p on p.id = i.pitch_id where i.id = %L $$, :'item1'),
  format($$ values ('commissioned'::text, 'on_the_water'::text, 'reported_feature'::text, 'reporting'::text,
                    %L::uuid, %L::uuid, 'accepted'::text, %L::uuid) $$,
         :'pitch1', tests.principal_of(:'owner_uid'), :'item1'),
  'the item starts commissioned, is assigned to the deciding editor and is linked both ways to its pitch');
select throws_ok(format($$ select app.dispose_pitch(%L, 'declined') $$, :'pitch1'), 'SC409', null,
  'a decided pitch cannot be decided again');
reset role;

select tests.act_as_user(:'editor_uid');
select is(app.dispose_pitch(:'pitch2', 'needs_info', 'Ask which season'), null::uuid,
  'needs_info records a decision without creating an item');
select isnt(app.dispose_pitch(:'pitch2', 'accepted', null, null, null, 'opinion'), null::uuid,
  'a needs_info pitch can still be accepted later');
select is((select label from app.editorial_items where pitch_id = :'pitch2'), 'opinion',
  'an opinion item is labelled opinion (label follows format)');
select is(
  (select split_part(b.content_id, '-', 3)::int - split_part(a.content_id, '-', 3)::int
   from app.editorial_items a, app.editorial_items b
   where a.pitch_id = :'pitch1' and b.pitch_id = :'pitch2'),
  1, 'content IDs are issued sequentially');
select is(app.dispose_pitch(:'pitch3', 'declined', 'Out of scope'), null::uuid, 'declining creates no item');
select throws_ok($$ select * from app.recent_audit_events(10) $$, '42501', null,
  'an editor cannot read the audit trail');
select throws_ok(
  format($$ update app.editorial_items set ghost_post_id = 'not-a-ghost-id' where id = %L $$, :'item1'),
  '23514', null, 'a Ghost reference must be a 24-character Ghost object ID');
select lives_ok(
  format($$ update app.editorial_items set ghost_post_id = '0123456789abcdef01234567', status = 'drafting' where id = %L $$, :'item1'),
  'staff link an item to its Ghost post and move it to drafting');
select throws_ok(
  format($$ update app.editorial_items set ghost_post_id = '0123456789abcdef01234567'
            where pitch_id = %L $$, :'pitch2'),
  '23505', null, 'SC-007: one Ghost post maps to at most one editorial item');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------------------------
select tests.act_as_user(:'owner_uid');
select is((select count(*)::int from app.recent_audit_events(200) where action = 'pitch.accepted' and occurred_at = now()), 2,
  'owners can read dispositions on the audit trail');
reset role;

select results_eq(
  format($$ select actor_kind, actor_principal_id, outcome, request_id
            from private.audit_events where action = 'pitch.accepted' and subject_id = %L $$, :'pitch1'),
  format($$ values ('human'::text, %L::uuid, 'allowed'::text, 'req-dispose-0001'::text) $$,
         tests.principal_of(:'owner_uid')),
  'the acceptance is attributed to the owner and carries the request ID');
select is(
  (select request_id from private.audit_events where action = 'editorial_items.insert'
     and subject_id = :'item1'),
  'req-dispose-0001', 'trigger-written audit rows inherit the bound request ID');
select results_eq(
  $$ select outcome, request_id, details->>'reason' from private.audit_events
     where action = 'pitch.submit' and outcome = 'denied' and occurred_at = now() $$,
  $$ values ('denied'::text, 'req-intake-0006'::text, 'client_rate_limited'::text) $$,
  'the throttled submission stays on the audit trail with its reason');
select is((select count(*)::int from private.audit_events where action = 'pitch.submit' and outcome = 'allowed' and occurred_at = now()), 6,
  'every accepted submission is on the audit trail');
select is(
  (select distinct actor_kind from private.audit_events where action = 'staff_assignments.insert' and occurred_at = now()),
  'system', 'set-up without a signed-in actor is attributed to the system, not the public');
select throws_ok($$ update private.audit_events set outcome = 'error' $$, '42501', null,
  'audit events cannot be updated, even by the table owner');
select throws_ok($$ delete from private.audit_events $$, '42501', null,
  'audit events cannot be deleted, even by the table owner');
select throws_ok($$ truncate private.audit_events $$, '42501', null, 'audit events cannot be truncated');
select is(
  (select count(*)::int from private.audit_events where details::text ~* '@|fisher|grower' and occurred_at = now()), 0,
  'audit details never carry submitter contact details');

select * from finish();
rollback;
