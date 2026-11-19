-- Story images (v0.7.0, SC-003): a lead image per story, tied to a cleared rights record; what is live
-- is what was published (the image is pinned at publication); agents never publish one; and new
-- stories cannot be inserted with publication fields already set.
begin;
\ir helpers/fixtures.psql
select plan(34);

update app.publish_jobs set status = 'cancelled', lease_until = null, claim_token = null
where status in ('queued', 'running', 'needs_attention');

select tests.make_human('owner-i@example.test', array['owner']) as owner_uid \gset
select tests.make_human('editor-i@example.test', array['editor']) as editor_uid \gset
select tests.principal_of(:'owner_uid') as owner_pid \gset
select tests.make_item('SC-2026-971', 'A story with a photograph') as item \gset
select tests.make_item('SC-2026-972', 'Another story') as other \gset

insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, license, credit_line, permitted_uses, status)
values (:'item', 'Boat photo', 'photo', 'documentary', 'Public domain', 'Photo: Fixture (public domain)', array['web'], 'cleared')
returning id as rights \gset
insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, license, credit_line, permitted_uses, status)
values (:'item', 'Second photo', 'photo', 'documentary', 'Public domain', 'Photo: Second (public domain)', array['web'], 'cleared')
returning id as rights2 \gset
insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, credit_line, permitted_uses, status)
values (:'other', 'Photo for another story', 'photo', 'documentary', 'Credit', array['web'], 'cleared')
returning id as other_rights \gset
insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, credit_line, permitted_uses, status)
values (:'item', 'Interview recording', 'audio', 'documentary', 'Credit', array['web'], 'cleared')
returning id as audio_rights \gset
insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, permitted_uses, status)
values (:'item', 'Unusable photo', 'photo', 'documentary', array['web'], 'rejected')
returning id as rejected_rights \gset

-- Renditions: the database checks each one's hash, not its pixels (the desk encodes them).
create function tests.renditions(p_seed text, p_formats text[] default array['webp', 'avif'])
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('format', f, 'width', 480, 'height', 320,
                                      'sha256', encode(sha256(convert_to(p_seed || f, 'UTF8')), 'hex')))
  from unnest(p_formats) f
$$;
create function tests.bodies(p_seed text, p_formats text[] default array['webp', 'avif'])
returns bytea[] language sql as $$
  select array_agg(convert_to(p_seed || f, 'UTF8')) from unnest(p_formats) f
$$;
grant execute on function tests.renditions(text, text[]), tests.bodies(text, text[]) to anon, authenticated, desk_agent, desk_publisher;

-- ---------- New stories start unpublished (fix) ----------
select tests.act_as_user(:'editor_uid');
select throws_ok(
  $$ insert into app.editorial_items (content_id, title, section, format, slug)
     values ('SC-2026-973', 'Smuggled', 'the_trade', 'explainer', 'smuggled-2026-973') $$,
  '42501', null, 'staff cannot create a story with a slug already set');
select throws_ok(
  $$ insert into app.editorial_items (content_id, title, section, format, published_revision)
     values ('SC-2026-974', 'Smuggled', 'the_trade', 'explainer', 1) $$,
  '42501', null, 'staff cannot create a story with a published revision (it would reach the site unpublished)');
select lives_ok(
  $$ insert into app.editorial_items (content_id, title, section, format)
     values ('SC-2026-975', 'An ordinary new story', 'the_trade', 'explainer') $$,
  'staff still create stories normally');

-- ---------- Attaching ----------
select app.attach_story_image(:'item', :'rights', 'A fishing boat tied up at a dock', 'A caption.', 0.7, 0.4,
                              960, 640, repeat('a', 64), 'image/jpeg', tests.renditions('one'), tests.bodies('one'))
  as img1 \gset
select is((select count(*)::int from app.story_images where item_id = :'item'), 1,
  'any staff member can attach a lead image tied to a rights record');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt text here', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x'), tests.bodies('x')) $$, :'item', :'other_rights'),
  '22023', 'choose a rights record that belongs to this story', 'a rights record from another story is refused');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt text here', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x'), tests.bodies('x')) $$, :'item', :'audio_rights'),
  '22023', 'that rights record is not for an image', 'a rights record for audio is refused');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt text here', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x'), tests.bodies('x')) $$, :'item', :'rejected_rights'),
  '22023', 'that rights record was rejected', 'a rejected rights record is refused');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt text here', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x'), tests.bodies('y')) $$, :'item', :'rights2'),
  '22023', null, 'a rendition whose bytes do not match its hash is refused');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt text here', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x', array['avif']), tests.bodies('x', array['avif'])) $$,
         :'item', :'rights2'),
  '22023', 'a WebP rendition is required', 'an image without a WebP rendition is refused');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x'), tests.bodies('x')) $$, :'item', :'rights2'),
  '23514', null, 'alternative text is required (at least a few words)');
reset role;

select tests.act_as_anon();
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'Alt text here', null, 0.5, 0.5, 960, 640, repeat('a', 64),
                                          'image/jpeg', tests.renditions('x'), tests.bodies('x')) $$, :'item', :'rights2'),
  '42501', null, 'the public cannot attach images');
reset role;
select is(tests.act_as_agent('nonexistent', 'nope'), 0, 'acting as an unauthenticated agent');
select throws_ok($$ select count(*) from app.story_images $$, '42501', null, 'agents cannot read story images');
reset role;

-- ---------- Publishing pins the image; replacing it on a live story waits for an update ----------
select private.write_article(:'item', 'A story with a photograph', null, 'Text of the story with a photograph.', null,
                             '{}', false, null, :'owner_pid', true);
select private.write_article(:'other', 'Another story', null, 'Text of another story.', null,
                             '{}', false, null, :'owner_pid', true);
insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key, payload_hash,
                              request_id, article_revision)
values (:'item', 'publish', false, :'owner_pid', 'staff', 'image-test-0001', repeat('0', 64), 'req-image-0001', 1)
returning id as job1 \gset
select tests.act_as_publisher();
select claim_publish_job ->> 'claimToken' as tok1 from app.claim_publish_job(:'job1') \gset
select site_snapshot as snap1 from app.site_snapshot(:'job1', :'tok1') \gset
select is(
  (select s -> 'heroImage' ->> 'id' from jsonb_array_elements(:'snap1'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-971'),
  :'img1', 'the snapshot carries the story''s cleared lead image');
select is(
  (select s -> 'heroImage' ->> 'credit' from jsonb_array_elements(:'snap1'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-971'),
  'Photo: Fixture (public domain)', 'with the credit line from its rights record');
select is((select count(*)::int from app.site_media(:'job1', :'tok1')), 2, 'the job reads both renditions');
reset role;
select tests.act_as_user(:'editor_uid');
select throws_ok(
  format($$ select app.attach_story_image(%L, %L, 'A late replacement photo', null, 0.5, 0.5, 960, 640, repeat('d', 64),
                                          'image/jpeg', tests.renditions('late'), tests.bodies('late')) $$, :'item', :'rights2'),
  '55006', null, 'an image cannot change while its story is being published (the snapshot is already taken)');
reset role;
select tests.act_as_publisher();
select ok((select bool_and(encode(sha256(body), 'hex') = sha256) from app.site_media(:'job1', :'tok1')),
  'every rendition matches the hash the snapshot names');
select throws_ok(format($$ select * from app.site_media(%L, gen_random_uuid()) $$, :'job1'), '55000', null,
  'image files are fenced by the claim token, like the snapshot');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, 'v1', null, 'Published.') $$, :'job1', :'tok1'),
  'the publication completes');
reset role;
select is((select published_image_id from app.editorial_items where id = :'item'), :'img1'::uuid,
  'publishing pins the image the site shows');

-- Replace the image while the story is live.
select tests.act_as_user(:'editor_uid');
select app.attach_story_image(:'item', :'rights2', 'A second photograph of the dock', null, 0.5, 0.5,
                              960, 640, repeat('b', 64), 'image/jpeg', tests.renditions('two'), tests.bodies('two'))
  as img2 \gset
reset role;
select ok((select superseded_at is not null from app.story_images where id = :'img1'),
  'the replaced image is kept while the live site still shows it');

-- Another story's publication rebuilds the site: this story keeps its published image.
insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key, payload_hash,
                              request_id, article_revision)
values (:'other', 'publish', false, :'owner_pid', 'staff', 'image-test-0002', repeat('0', 64), 'req-image-0002', 1)
returning id as job2 \gset
select tests.act_as_publisher();
select claim_publish_job ->> 'claimToken' as tok2 from app.claim_publish_job(:'job2') \gset
select site_snapshot as snap2 from app.site_snapshot(:'job2', :'tok2') \gset
select is(
  (select s -> 'heroImage' ->> 'id' from jsonb_array_elements(:'snap2'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-971'),
  :'img1', 'a rebuild for another story keeps the published image, not the replacement (what is live is what was published)');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, 'v2', null, 'Published.') $$, :'job2', :'tok2'),
  'the other publication completes');
reset role;

-- Updating the story publishes the new image and lets the old one go.
insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key, payload_hash,
                              request_id, article_revision)
values (:'item', 'republish', false, :'owner_pid', 'staff', 'image-test-0003', repeat('0', 64), 'req-image-0003', 1)
returning id as job3 \gset
select tests.act_as_publisher();
select claim_publish_job ->> 'claimToken' as tok3 from app.claim_publish_job(:'job3') \gset
select site_snapshot as snap3 from app.site_snapshot(:'job3', :'tok3') \gset
select is(
  (select s -> 'heroImage' ->> 'id' from jsonb_array_elements(:'snap3'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-971'),
  :'img2', 'updating the story shows the new image');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, 'v3', null, 'Updated.') $$, :'job3', :'tok3'),
  'the update completes');
reset role;
select is((select published_image_id from app.editorial_items where id = :'item'), :'img2'::uuid,
  'the update pins the new image');
select is((select count(*)::int from app.story_images where id = :'img1'), 0, 'and the replaced image is deleted');

-- Revoking rights takes the image off the site at the next rebuild, with no other change.
update app.asset_rights set status = 'restricted' where id = :'rights2';
insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key, payload_hash,
                              request_id, article_revision)
values (:'other', 'republish', false, :'owner_pid', 'staff', 'image-test-0004', repeat('0', 64), 'req-image-0004', 1)
returning id as job4 \gset
select tests.act_as_publisher();
select claim_publish_job ->> 'claimToken' as tok4 from app.claim_publish_job(:'job4') \gset
select site_snapshot as snap4 from app.site_snapshot(:'job4', :'tok4') \gset
select ok(
  (select s -> 'heroImage' = 'null'::jsonb from jsonb_array_elements(:'snap4'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-971'),
  'an image whose rights are no longer cleared leaves the site');
select is((select count(*)::int from app.site_media(:'job4', :'tok4')), 0, 'and its files are no longer served');
reset role;

-- ---------- Agents never publish a story with a lead image ----------
select tests.make_item('SC-2026-976', 'An agent brief') as agent_item \gset
select tests.make_agent('Image test agent', 'agentimg', 'secret-img-0123456789abcd', array['drafts.publish']) as agent \gset
insert into app.agent_item_grants (item_id, principal_id) values (:'agent_item', :'agent');
insert into app.asset_rights (item_id, asset_label, asset_kind, provenance, credit_line, permitted_uses, status)
values (:'agent_item', 'Photo', 'photo', 'documentary', 'Credit', array['web'], 'cleared') returning id as agent_rights \gset
select app.attach_story_image(:'agent_item', :'agent_rights', 'A photograph for the brief', null, 0.5, 0.5, 960, 640,
                              repeat('c', 64), 'image/jpeg', tests.renditions('three'), tests.bodies('three')) as img3 \gset
update app.publishing_policy set agents_may_publish = true;
update app.publishing_lanes set agents_may_publish = true where section = 'the_trade';
select tests.make_proposal(:'agent_item', :'agent', repeat('Agent text. ', 60), array['SRC-1']) as proposal \gset
select is(
  (select (g ->> 'pass')::boolean
   from jsonb_array_elements(private.agent_publish_gates(
          :'agent', (select p from app.draft_proposals p where p.id = :'proposal'),
          (select i from app.editorial_items i where i.id = :'agent_item'), false)) g
   where g ->> 'gate' = 'no_images'),
  false, 'the no_images gate refuses a story that has a lead image');

-- ---------- Removing, and who may call what ----------
select tests.act_as_user(:'editor_uid');
select ok(app.remove_story_image(:'agent_item'), 'staff can remove a lead image');
reset role;
select is((select count(*)::int from app.story_images where item_id = :'agent_item'), 0,
  'an image the site never showed is deleted outright');
select ok(
  not has_function_privilege('authenticated', 'app.site_media(uuid, uuid)', 'execute')
  and not has_function_privilege('desk_agent', 'app.attach_story_image(uuid, uuid, text, text, numeric, numeric, integer, integer, text, text, jsonb, bytea[], bytea)', 'execute')
  and not has_function_privilege('desk_publisher', 'app.attach_story_image(uuid, uuid, text, text, numeric, numeric, integer, integer, text, text, jsonb, bytea[], bytea)', 'execute')
  and has_function_privilege('desk_publisher', 'app.site_media(uuid, uuid)', 'execute'),
  'only the publisher reads image files; only staff attach images');

select * from finish();
rollback;
