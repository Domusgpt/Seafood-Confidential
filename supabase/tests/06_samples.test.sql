-- Sample stories for preview sites (SC-003): only operators mark them, and the site snapshot carries
-- the flag so the builder can label them and refuse them outside a preview.
begin;
\ir helpers/fixtures.psql
select plan(9);

update app.publish_jobs set status = 'cancelled', lease_until = null, claim_token = null
where status in ('queued', 'running', 'needs_attention');

select tests.make_human('owner-s@example.test', array['owner']) as owner_uid \gset
select tests.make_human('editor-s@example.test', array['editor']) as editor_uid \gset

select col_default_is('app', 'editorial_items', 'is_sample', 'false', 'stories are not samples by default');

-- Staff cannot create or convert a sample.
select tests.act_as_user(:'editor_uid');
select throws_ok(
  $$ insert into app.editorial_items (content_id, title, section, format, is_sample)
     values ('SC-2026-961', 'Staff-made sample', 'the_trade', 'explainer', true) $$,
  '42501', null, 'staff cannot insert a sample story');
reset role;
select tests.make_item('SC-2026-962', 'A real story') as real_item \gset
select tests.act_as_user(:'owner_uid');
select throws_ok(format($$ update app.editorial_items set is_sample = true where id = %L $$, :'real_item'),
  '42501', null, 'not even an owner can turn a real story into a sample from the desk');
reset role;

-- The operator (database owner) loads a sample.
insert into app.editorial_items (content_id, title, section, format, is_sample)
values ('SC-2026-963', 'Operator sample', 'the_trade', 'explainer', true) returning id as sample_item \gset
select ok((select is_sample from app.editorial_items where id = :'sample_item'), 'the operator can load a sample story');
select tests.act_as_user(:'owner_uid');
select throws_ok(format($$ update app.editorial_items set is_sample = false where id = %L $$, :'sample_item'),
  '42501', null, 'staff cannot quietly turn a sample into a real story either');
select is((select is_sample from app.editorial_items where id = :'sample_item'), true, 'staff can read the flag');
reset role;

-- The flag reaches the site snapshot.
select private.write_article(:'sample_item', 'Operator sample', null, 'Sample text for the preview.', null, '{}',
                             false, null, (select id from app.principals where auth_user_id = :'owner_uid'), true);
insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key, payload_hash,
                              request_id, article_revision)
select :'sample_item', 'publish', false, p.id, 'staff', 'sample-test-0001', repeat('0', 64), 'req-sample-0001', 1
from app.principals p join app.staff_assignments a on a.principal_id = p.id and a.role = 'owner'
where p.auth_user_id = :'owner_uid'
returning id as job_s \gset
select tests.act_as_publisher();
select claim_publish_job as claim_s from app.claim_publish_job(:'job_s') \gset
select site_snapshot as snap_s from app.site_snapshot(:'job_s', (:'claim_s'::jsonb ->> 'claimToken')::uuid) \gset
reset role;
select is((select (s ->> 'isSample')::boolean from jsonb_array_elements(:'snap_s'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-963'),
  true, 'the site snapshot marks the sample');

select ok(not has_function_privilege('authenticated', 'private.guard_sample_flag()', 'execute')
  and not has_function_privilege('anon', 'private.guard_sample_flag()', 'execute'),
  'the guard function is not callable by API roles');
select has_trigger('app', 'editorial_items', 'editorial_items_guard_sample', 'the guard trigger is installed');

select * from finish();
rollback;
