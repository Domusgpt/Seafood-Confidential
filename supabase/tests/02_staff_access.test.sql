-- AT-03 and SC-005: only active principals with an active staff assignment can read operations data;
-- a signed-in identity alone (reader, disabled or unassigned) confers nothing.
begin;
\ir helpers/fixtures.psql
select plan(22);

-- Fixtures (as the migration owner)
select tests.make_human('owner@example.test', array['owner']) as owner_uid \gset
select tests.make_human('editor@example.test', array['editor']) as editor_uid \gset
select tests.make_human('reader@example.test', '{}', 'active', false) as reader_uid \gset
select tests.make_human('unassigned@example.test', '{}') as unassigned_uid \gset
select tests.make_human('disabled@example.test', array['editor'], 'disabled') as disabled_uid \gset
select tests.make_human('revoked@example.test', array['editor']) as revoked_uid \gset
update app.staff_assignments set revoked_at = now()
  where principal_id = tests.principal_of(:'revoked_uid');
insert into app.pitches (receipt_code, submitter_name, submitter_email, subject, reader_question, firsthand_basis, consent_contact)
values ('P-0000000001', 'Fixture Person', 'pitcher@example.test', 'Fixture subject', 'Fixture reader question?', 'Fixture firsthand basis text', true);
select tests.make_item('SC-2026-901') as item_id \gset

-- Owner and editor
select tests.act_as_user(:'owner_uid');
select is((select count(*)::int from app.pitches where receipt_code = 'P-0000000001'), 1, 'owner sees the pitch queue');
select is((select count(*)::int from app.editorial_items where content_id = 'SC-2026-901'), 1, 'owner sees editorial items');
select lives_ok(
  $$ insert into app.principals (kind, display_name) values ('agent', 'Fixture research agent') $$,
  'owner can create an agent principal');
reset role;

select tests.act_as_user(:'editor_uid');
select is((select count(*)::int from app.pitches where receipt_code = 'P-0000000001'), 1, 'editor sees the pitch queue');
select is((select submitter_email from app.pitches where receipt_code = 'P-0000000001'), 'pitcher@example.test', 'staff can read submitter contact details');
select throws_ok(
  $$ insert into app.principals (kind, display_name) values ('agent', 'Editor-made agent') $$,
  '42501', null, 'editor cannot create principals (owner only)');
select throws_ok(
  format($$ insert into app.staff_assignments (principal_id, role) values (%L, 'owner') $$, tests.principal_of(:'editor_uid')),
  '42501', null, 'editor cannot grant themselves the owner role');
reset role;

-- Identities that must see nothing
select tests.act_as_user(:'reader_uid');
select is((select count(*)::int from app.pitches) + (select count(*)::int from app.editorial_items)
          + (select count(*)::int from app.principals), 0,
  'AT-03: a signed-in identity without a principal (e.g. a reader) sees no operations data');
reset role;

select tests.act_as_user(:'unassigned_uid');
select is((select count(*)::int from app.pitches) + (select count(*)::int from app.editorial_items), 0,
  'a principal without a staff assignment sees nothing');
reset role;

select tests.act_as_user(:'disabled_uid');
select is((select count(*)::int from app.pitches) + (select count(*)::int from app.editorial_items), 0,
  'a disabled principal sees nothing (SC-005: disabled accounts cannot retrieve operational data)');
reset role;

select tests.act_as_user(:'revoked_uid');
select is((select count(*)::int from app.pitches) + (select count(*)::int from app.editorial_items), 0,
  'a principal whose assignment was revoked sees nothing');
select is(app.current_staff_principal(), null::uuid, 'revoked assignment resolves to no staff principal');
reset role;

-- Unauthenticated and privileged-table access
select tests.act_as_anon();
select throws_ok($$ select count(*) from app.pitches $$, '42501', null,
  'anon cannot read pitches (no enumeration through the public intake role)');
reset role;

select tests.act_as_user(:'owner_uid');
select throws_ok($$ select count(*) from private.audit_events $$, '42501', null,
  'even the owner cannot read audit events directly');
select throws_ok($$ select count(*) from private.agent_credentials $$, '42501', null,
  'credential hashes are unreachable from the authenticated role');
select throws_ok(format($$ delete from app.pitches where receipt_code = %L $$, 'P-0000000001'), '42501', null,
  'staff cannot delete pitches');
reset role;

-- Integrity: derived reviewers and deciders, rights rules, final revocation
select tests.act_as_user(:'editor_uid');
select throws_ok(
  $$ update app.pitches set submitter_email = 'changed@example.test' $$,
  '42501', null, 'an editor cannot rewrite a contributor''s submission');
select throws_ok(
  format($$ insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, status)
            values (%L, 'Uncredited photo', 'photo', 'documentary', 'cleared') $$, :'item_id'),
  '23514', null, 'rights cannot be cleared without a credit line');
update app.pitches set status = 'needs_info', disposition_by = tests.principal_of(:'owner_uid')
  where receipt_code = 'P-0000000001';
select is((select disposition_by from app.pitches where receipt_code = 'P-0000000001'),
  tests.principal_of(:'editor_uid'), 'the recorded decider is the signed-in editor, whatever the request claims');
reset role;

select tests.make_agent('Fixture agent to revoke', 'agentrrr', 'secret-r-0123456789abcdef', array['briefs.list']) as agent_r \gset
select tests.act_as_user(:'owner_uid');
update app.principals set status = 'revoked' where id = :'agent_r';
select throws_ok(format($$ update app.principals set status = 'active' where id = %L $$, :'agent_r'), '55000', null,
  'a revoked agent cannot be reactivated');
reset role;
select is((select count(*)::int from private.agent_credentials where token_prefix = 'agentrrr' and revoked_at is null), 0,
  'revoking an agent revokes all of its tokens');

-- Claims spoofing: forging a sub for an unknown user yields nothing
select tests.act_as_user(gen_random_uuid());
select is((select count(*)::int from app.pitches), 0, 'an unknown subject in the claims sees nothing');
reset role;

select * from finish();
rollback;
