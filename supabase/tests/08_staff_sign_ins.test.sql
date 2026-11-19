-- Staff sign-ins (v0.7.3, SC-005): owners see when each staff member last signed in; nobody else
-- does, and nothing else from the auth schema comes out.
begin;
\ir helpers/fixtures.psql
select plan(10);

select tests.make_human('owner-s@example.test', array['owner']) as owner_uid \gset
select tests.make_human('editor-s@example.test', array['editor']) as editor_uid \gset
select tests.make_human('newcomer-s@example.test', array['owner']) as newcomer_uid \gset
update auth.users set last_sign_in_at = '2026-11-18 21:00:00+00' where id = :'owner_uid';

-- Shape and grants
select is(
  pg_get_function_result('app.staff_sign_ins()'::regprocedure),
  'TABLE(principal_id uuid, last_sign_in_at timestamp with time zone)',
  'it returns the principal and the time of the last sign-in, nothing else');
select ok(has_function_privilege('authenticated', 'app.staff_sign_ins()', 'EXECUTE'), 'signed-in staff may call it');
select ok(not has_function_privilege('anon', 'app.staff_sign_ins()', 'EXECUTE'), 'the public may not');
select ok(not has_function_privilege('desk_agent', 'app.staff_sign_ins()', 'EXECUTE'), 'agents may not');
select ok(not has_function_privilege('desk_publisher', 'app.staff_sign_ins()', 'EXECUTE'), 'the publisher may not');

-- An owner sees everyone's last sign-in, including a newly added owner who has not signed in yet.
select tests.act_as_user(:'owner_uid');
select is(
  (select count(*)::int from app.staff_sign_ins()
   where principal_id in (tests.principal_of(:'owner_uid'), tests.principal_of(:'editor_uid'),
                          tests.principal_of(:'newcomer_uid'))),
  3, 'an owner sees every staff member');
select is(
  (select last_sign_in_at from app.staff_sign_ins() where principal_id = tests.principal_of(:'owner_uid')),
  '2026-11-18 21:00:00+00'::timestamptz, 'with the time of their last sign-in');
select ok(
  (select last_sign_in_at is null from app.staff_sign_ins() where principal_id = tests.principal_of(:'newcomer_uid')),
  'and no time for someone who has not signed in yet');
reset role;

-- An editor gets nothing (no error, so the desk can always ask).
select tests.act_as_user(:'editor_uid');
select is((select count(*)::int from app.staff_sign_ins()), 0, 'an editor sees no sign-ins');
reset role;

-- A disabled owner gets nothing either.
update app.principals set status = 'disabled' where id = tests.principal_of(:'owner_uid');
select tests.act_as_user(:'owner_uid');
select is((select count(*)::int from app.staff_sign_ins()), 0, 'a disabled owner sees no sign-ins');
reset role;

select * from finish();
rollback;
