-- ADR-005 publishing (database layer): articles written in the desk with revision checks, agent
-- publication gates, staff warnings, the master switch, one job in flight per story and the
-- publisher-only path that claims jobs, reads the site snapshot and records outcomes.
-- AT-04, AT-05, AT-08, AT-12, AT-13, AT-14, AT-20, AT-24, AT-27 to AT-30.
begin;
\ir helpers/fixtures.psql
select plan(76);

-- People
select tests.make_human('owner@example.test', array['owner']) as owner_uid \gset
select tests.make_human('me@example.test', array['managing_editor']) as me_uid \gset
select tests.make_human('editor@example.test', array['editor']) as editor_uid \gset
-- Agents: P may publish, N may only propose
select tests.make_agent('Fixture publisher agent', 'agentpub', 'secret-pub-0123456789abcdef',
  array['items.read', 'drafts.propose', 'drafts.publish', 'jobs.read']) as agent_p \gset
select tests.make_agent('Fixture drafting agent', 'agentnop', 'secret-nop-0123456789abcdef',
  array['items.read', 'drafts.propose', 'jobs.read']) as agent_n \gset

-- Stories (all the_trade explainers unless changed below)
select tests.make_item('SC-2026-951', 'Agent publication fixture') as item_a \gset
select tests.make_item('SC-2026-952', 'Gate fixture') as item_b \gset
select tests.make_item('SC-2026-953', 'Opinion fixture') as item_c \gset
select tests.make_item('SC-2026-954', 'Human-written fixture') as item_d \gset
select tests.make_item('SC-2026-955', 'Staff publication fixture') as item_e \gset
update app.editorial_items set format = 'opinion', label = 'opinion' where id = :'item_c';
insert into app.agent_item_grants (principal_id, item_id)
select :'agent_p'::uuid, unnest(array[:'item_a', :'item_b', :'item_c', :'item_d']::uuid[]);
insert into app.agent_item_grants (principal_id, item_id) values (:'agent_n', :'item_a');

insert into app.sources (item_id, source_code, source_type, title, agent_processing, private_contact, public_citation)
select i, s.code, 'official_document', s.title, s.processing, s.contact, s.citable
from unnest(array[:'item_a', :'item_b', :'item_c', :'item_d', :'item_e']::uuid[]) i,
     (values ('SRC-PUB-01', 'Landings report', 'yes', null, true),
             ('SRC-PUB-02', 'Dockside price sheet', 'yes', null, true),
             ('SRC-PUB-03', 'Redacted price note', 'redacted', null, true),
             ('SRC-PUB-04', 'Confidential interview', 'no', 'Captain Fixture at Harbor Line 5', false),
             ('SRC-PUB-05', 'Readable but not citable memo', 'yes', null, false)) s(code, title, processing, contact, citable);

\set body '''Scallop landings in the Gulf of Maine rose in the first weeks of the season, according to the state landings report. Dockside prices eased as more boats returned to the water, and buyers reported steady demand from restaurants on the coast. The price sheet shows a gradual decline over the month, which matches what processors expected after a slow start. Boat owners should watch fuel costs and the weather, which together decide how many trips are worth making in the coldest weeks of the year.'''

select tests.make_proposal(:'item_a', :'agent_p', :body, array['SRC-PUB-01', 'SRC-PUB-02'], 'How the scallop season opened') as prop_a \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' The harbormaster said "boats are coming in heavier than we have seen in ten years at this point".', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_quote \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' Call the office at 207-555-0134 for details.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_phone \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' According to Captain Fixture at Harbor Line 5, trips were long.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_private \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || E'\n\n![dock](https://example.test/dock.jpg)', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_image \gset
select tests.make_proposal(:'item_b', :'agent_p', :body, array['SRC-PUB-01', 'SRC-PUB-03']) as prop_redacted \gset
select tests.make_proposal(:'item_b', :'agent_p', :body, array['SRC-PUB-01', 'SRC-PUB-05']) as prop_uncitable \gset
select tests.make_proposal(:'item_b', :'agent_p', :body, array['SRC-PUB-01']) as prop_one_source \gset
select tests.make_proposal(:'item_b', :'agent_p', 'Too short to publish.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_short \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' <script>alert(1)</script>', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_html \gset
select tests.make_proposal(:'item_c', :'agent_p', :body, array['SRC-PUB-01', 'SRC-PUB-02']) as prop_opinion \gset
select tests.make_proposal(:'item_d', :'agent_p', :body, array['SRC-PUB-01', 'SRC-PUB-02']) as prop_human \gset
select tests.make_proposal(:'item_e', :'agent_p', :body, array['SRC-PUB-01'], 'Adoptable proposal') as prop_staff \gset

-- ------------------------------------------------------------------------------------- structure
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('app.articles'::regclass, 'app.article_revisions'::regclass, 'app.publish_jobs'::regclass,
                         'app.publishing_policy'::regclass, 'app.publishing_lanes'::regclass)),
  'every publishing table has RLS');
select is((select agents_may_publish or agents_may_email from app.publishing_policy), false,
  'agent publishing and agent email both start switched off');
select is((select count(*)::int from app.publishing_lanes where agents_may_publish), 0, 'every section lane starts closed');
select ok(not has_function_privilege('desk_agent', 'app.claim_publish_job(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.complete_publish_job(uuid,text,boolean,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'app.site_snapshot(uuid)', 'execute')
  and not has_function_privilege('anon', 'app.mark_email_attempt(uuid)', 'execute'),
  'only the publisher role can claim, snapshot and complete jobs');
select ok(not has_table_privilege('authenticated', 'app.articles', 'insert')
  and not has_table_privilege('authenticated', 'app.articles', 'update')
  and not has_table_privilege('desk_agent', 'app.articles', 'select'),
  'articles are written only through the desk functions, and agents cannot read them');

-- ----------------------------------------------------------------- articles written by people
select tests.act_as_user(:'editor_uid');
select is(app.save_article(:'item_d', 'A person wrote this', null, :body, 'Fixture Writer', array['SRC-PUB-01'], 0), 1,
  'any staff member can write a story (revision 1)');
select throws_ok(format($$ select app.save_article(%L, 'Stale edit', null, 'Overwrites?', null, '{}', 0) $$, :'item_d'),
  'SC409', null, 'AT-08: a save from an old revision is refused; the newer text is kept');
select is(app.save_article(:'item_d', 'A person wrote this, edited', null, :body, 'Fixture Writer', array['SRC-PUB-01'], 1), 2,
  'saving from the current revision works');
select throws_ok(format($$ select app.save_article(%L, 'Bad source', null, 'Body', null, array['SRC-NOPE'], 2) $$, :'item_d'),
  '22023', null, 'an article can cite only sources recorded on the story');
select throws_ok(format($$ update app.articles set title = 'Direct write' where item_id = %L $$, :'item_d'),
  '42501', null, 'staff cannot write articles around the revision check');
reset role;
select is((select count(*)::int from app.article_revisions where item_id = :'item_d'), 2, 'every save is kept as a revision');
select throws_ok($$ update app.article_revisions set title = 'rewrite history' $$, '42501', null, 'revisions are append-only');

-- ----------------------------------------------------------------------- agents: scope and switch
select is(tests.act_as_agent('agentnop', 'secret-nop-0123456789abcdef'), 1, 'drafting agent authenticates');
select throws_ok(format($$ select * from app.agent_request_publish(%L, false, 'idem-nop-00001', %L, 'req-nop-00001') $$, :'prop_a', repeat('b', 64)),
  '42501', null, 'AT-28: a token without drafts.publish cannot request a publication');
select throws_ok($$ update app.publishing_policy set agents_may_publish = true $$, '42501', null,
  'agents cannot change the publishing policy');
select throws_ok($$ select app.set_publishing_lane('the_trade', true) $$, '42501', null, 'agents cannot open a lane');
reset role;

select is(tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef'), 1, 'publishing agent authenticates');
select results_eq(
  format($$ select job_status, replayed from app.agent_request_publish(%L, false, 'idem-pub-off-0001', %L, 'req-pub-off-0001') $$, :'prop_a', repeat('c', 64)),
  $$ values ('refused'::text, false) $$,
  'AT-28: with the master switch off the request is refused and nothing is queued');
select ok((select gate_results @> '[{"gate":"master_switch","pass":false}]' and gate_results @> '[{"gate":"section_lane","pass":false}]'
           from app.publish_jobs where idempotency_key = 'idem-pub-off-0001'),
  'the refusal names the master switch and the closed lane');
reset role;
select is((select count(*)::int from private.audit_events where action = 'publish.refused' and actor_principal_id = :'agent_p' and occurred_at = now()), 1,
  'the refusal is audited against the agent');

-- ------------------------------------------------------------------------ owner opens the lane
select tests.act_as_user(:'editor_uid');
select throws_ok($$ select app.set_publishing_policy(true, false, 5, 2, 'An AI agent wrote this story from the sources listed below.') $$, '42501', null,
  'editors cannot change the publishing policy');
reset role;
select tests.act_as_user(:'me_uid');
select throws_ok($$ select app.set_publishing_lane('the_trade', true) $$, '42501', null, 'managing editors cannot open a lane');
reset role;
select tests.act_as_user(:'owner_uid');
select lives_ok($$ select app.set_publishing_policy(true, false, 5, 2, 'An AI agent wrote this story from the sources listed below.') $$,
  'the owner switches agent publishing on');
select lives_ok($$ select app.set_publishing_lane('the_trade', true) $$, 'the owner opens the trade lane');
reset role;

-- ------------------------------------------------------------------- agents: the happy path
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select results_eq(
  format($$ select job_status, replayed from app.agent_request_publish(%L, false, 'idem-pub-a-0001', %L, 'req-pub-a-0001') $$, :'prop_a', repeat('d', 64)),
  $$ values ('queued'::text, false) $$,
  'AT-27: with the switch on, the lane open and every check passing, the job is queued without a person');
select is((select count(*)::int from app.publish_jobs, jsonb_array_elements(gate_results) g
           where idempotency_key = 'idem-pub-a-0001' and not (g ->> 'pass')::boolean), 0, 'every gate passed');
select results_eq(
  format($$ select job_status, replayed from app.agent_request_publish(%L, false, 'idem-pub-a-0001', %L, 'req-pub-a-0002') $$, :'prop_a', repeat('d', 64)),
  $$ values ('queued'::text, true) $$,
  'AT-12: the same key and body returns the same job');
select throws_ok(
  format($$ select * from app.agent_request_publish(%L, false, 'idem-pub-a-0001', %L, 'req-pub-a-0003') $$, :'prop_a', repeat('e', 64)),
  'SC409', null, 'AT-13: the same key with a different body is a conflict');
select ok((select gate_results @> '[{"gate":"nothing_in_flight","pass":false}]'
           from app.agent_request_publish(:'prop_a', false, 'idem-pub-a-0002', repeat('f', 64), 'req-pub-a-0004')),
  'a second publication of the same story is refused while the first is open');
reset role;
select id as job_a from app.publish_jobs where idempotency_key = 'idem-pub-a-0001' \gset
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select throws_ok(format($$ select app.claim_publish_job(%L) $$, :'job_a'), '42501', null, 'agents cannot run their own jobs');
reset role;
select tests.act_as_agent('agentnop', 'secret-nop-0123456789abcdef');
select is((select count(*)::int from app.publish_jobs), 0, 'another agent cannot see this agent''s jobs');
reset role;

-- ------------------------------------------------------------------- gates (each refuses alone)
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_direct_quotes","pass":false}]'
           from app.agent_request_publish(:'prop_quote', false, 'idem-gate-quote1', repeat('1', 64), 'req-gate-00001')),
  'AT-28: a direct quotation is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_contact_details","pass":false}]'
           from app.agent_request_publish(:'prop_phone', false, 'idem-gate-phone1', repeat('2', 64), 'req-gate-00002')),
  'a phone number is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_contact_details","pass":false}]'
           from app.agent_request_publish(:'prop_private', false, 'idem-gate-priv01', repeat('3', 64), 'req-gate-00003')),
  'a private contact from a staff-only source is refused even though the agent never saw it');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_images","pass":false}]'
           from app.agent_request_publish(:'prop_image', false, 'idem-gate-image1', repeat('4', 64), 'req-gate-00004')),
  'an embedded image is refused (rights cannot be confirmed)');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"sources_publishable","pass":false}]'
           from app.agent_request_publish(:'prop_redacted', false, 'idem-gate-redac1', repeat('5', 64), 'req-gate-00005')),
  'citing a redacted source is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"sources_publishable","pass":false}]'
           from app.agent_request_publish(:'prop_uncitable', false, 'idem-gate-uncit1', repeat('c', 64), 'req-gate-00013')),
  'citing a source staff did not mark citable is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"enough_sources","pass":false}]'
           from app.agent_request_publish(:'prop_one_source', false, 'idem-gate-onesrc', repeat('6', 64), 'req-gate-00006')),
  'fewer sources than the policy minimum is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"length","pass":false}]'
           from app.agent_request_publish(:'prop_short', false, 'idem-gate-short1', repeat('7', 64), 'req-gate-00007')),
  'a body that is too short is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_raw_html","pass":false}]'
           from app.agent_request_publish(:'prop_html', false, 'idem-gate-html01', repeat('8', 64), 'req-gate-00008')),
  'AT-18: raw HTML is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"reporting_format","pass":false}]'
           from app.agent_request_publish(:'prop_opinion', false, 'idem-gate-opin01', repeat('9', 64), 'req-gate-00009')),
  'opinion is refused: it needs a person');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"brief_untouched_by_people","pass":false}]'
           from app.agent_request_publish(:'prop_human', false, 'idem-gate-human1', repeat('0', 64), 'req-gate-00010')),
  'AT-29: a story a person has written is refused');
reset role;

-- ------------------------------------------------------------------------- publisher context
select tests.act_as_publisher(:'agent_p');
select claim_publish_job as claim from app.claim_publish_job(:'job_a') \gset
select ok((:'claim'::jsonb ->> 'action') = 'publish' and (:'claim'::jsonb -> 'item' ->> 'slug') = 'how-the-scallop-season-opened-2026-951',
  'the publisher claims the job and the story gets a stable public address');
select is(app.claim_publish_job(:'job_a'), null::jsonb, 'a leased job cannot be claimed twice');
select is(app.next_publish_job(), null::uuid, 'nothing else is waiting to run');
select site_snapshot as snap from app.site_snapshot(:'job_a') \gset
select is((select array_agg(x ->> 'sourceCode' order by x ->> 'sourceCode')
           from jsonb_array_elements(:'snap'::jsonb -> 'stories') s, jsonb_array_elements(s -> 'sources') x
           where s ->> 'contentId' = 'SC-2026-951'),
  array['SRC-PUB-01', 'SRC-PUB-02'], 'the snapshot lists the story''s citable sources');
select ok((select (s ->> 'aiGenerated')::boolean from jsonb_array_elements(:'snap'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-951')
  and (:'snap'::jsonb ->> 'disclosure') like 'An AI agent wrote%', 'AT-24: the agent story is labelled AI-generated, with the disclosure');
select is(jsonb_array_length(:'snap'::jsonb -> 'stories'), 1, 'unpublished stories are not in the snapshot');
select throws_ok($$ select count(*) from app.publish_jobs $$, '42501', null, 'the publisher role has no table access of its own');
select lives_ok(format($$ select app.complete_publish_job(%L, 'succeeded', true, 'http://127.0.0.1:4173/stories/how-the-scallop-season-opened-2026-951/', 'local-1', null, 'Published.') $$, :'job_a'),
  'the publisher records the outcome');
reset role;
select results_eq(
  format($$ select status, published_via, public_url from app.editorial_items where id = %L $$, :'item_a'),
  $$ values ('published'::text, 'agent'::text, 'http://127.0.0.1:4173/stories/how-the-scallop-season-opened-2026-951/'::text) $$,
  'AT-27: the story is published and attributed to the agent');
select results_eq(
  format($$ select ai_generated, human_edited_at is null, origin_proposal_id from app.articles where item_id = %L $$, :'item_a'),
  format($$ values (true, true, %L::uuid) $$, :'prop_a'),
  'the agent''s proposal became the article, unedited by people');
select is((select status from app.draft_proposals where id = :'prop_a'), 'published', 'the proposal is marked published');
select is((select actor_kind from private.audit_events where action = 'publish.succeeded' and occurred_at = now() order by id desc limit 1), 'agent',
  'the publication is audited against the agent that asked');

-- staff can never mark a proposal published by hand
select tests.act_as_user(:'owner_uid');
select throws_ok(format($$ update app.draft_proposals set status = 'published' where id = %L $$, :'prop_phone'),
  '42501', null, 'a publication cannot be recorded by hand');
reset role;

-- daily limit and email
select tests.act_as_user(:'owner_uid');
select app.set_publishing_policy(true, false, 1, 2, 'An AI agent wrote this story from the sources listed below.');
reset role;
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select ok((select gate_results @> '[{"gate":"daily_limit","pass":false}]'
           from app.agent_request_publish(:'prop_phone', false, 'idem-gate-daily1', repeat('a', 64), 'req-gate-00011')),
  'the daily limit counts the agent publication already made');
select ok((select gate_results @> '[{"gate":"newsletter","pass":false}]'
           from app.agent_request_publish(:'prop_phone', true, 'idem-gate-email1', repeat('b', 64), 'req-gate-00012')),
  'AT-20: agents may not email subscribers unless the owner allows it');
reset role;

-- ------------------------------------------------------------------------ master switch (AT-30)
select tests.act_as_user(:'owner_uid');
select app.set_publishing_policy(true, false, 10, 2, 'An AI agent wrote this story from the sources listed below.');
reset role;
update app.draft_proposals set body_markdown = :body where id = :'prop_phone';
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select is((select job_status from app.agent_request_publish(:'prop_phone', false, 'idem-switch-0001', repeat('c', 64), 'req-switch-0001')),
  'queued', 'a corrected proposal is queued');
reset role;
-- another job holds the site build: this one waits (busy), and stays queued
update app.publish_jobs set status = 'running', lease_until = now() + interval '1 minute' where idempotency_key = 'idem-pub-off-0001';
select tests.act_as_publisher();
select is(app.claim_publish_job((select tests.job_id('idem-switch-0001'))) ->> 'busy', 'true',
  'one site build at a time: a second job waits instead of racing');
reset role;
update app.publish_jobs set status = 'refused', lease_until = null where idempotency_key = 'idem-pub-off-0001';
select tests.act_as_user(:'editor_uid');
select is(app.stop_agent_publishing(), 1, 'AT-30: any staff member can stop agent publishing; the queued job is cancelled');
reset role;
select is((select status from app.publish_jobs where idempotency_key = 'idem-switch-0001'), 'cancelled', 'the queued agent job never runs');
select is((select agents_may_publish from app.publishing_policy), false, 'the master switch is off');

-- --------------------------------------------------------------------------- staff publishing
select tests.act_as_user(:'editor_uid');
select throws_ok(format($$ select * from app.staff_request_publish(%L, 'publish', false, '{}', 'idem-staff-0001', %L, 'req-staff-0001') $$, :'item_e', repeat('d', 64)),
  '42501', null, 'editors write but do not publish (D06)');
reset role;
select tests.act_as_user(:'owner_uid');
select throws_ok(format($$ select * from app.staff_request_publish(%L, 'publish', false, '{}', 'idem-staff-0002', %L, 'req-staff-0002') $$, :'item_e', repeat('e', 64)),
  '22023', null, 'there is nothing to publish before the story is written');
select is(app.adopt_proposal(:'prop_staff', 0), 1, 'a person can adopt an agent proposal as the text');
select throws_ok(format($$ select app.adopt_proposal(%L, 0) $$, :'prop_human'), 'SC409', null,
  'adopting over text someone already wrote is refused by the revision check');
reset role;
select results_eq(
  format($$ select ai_generated, human_edited_at is not null from app.articles where item_id = %L $$, :'item_e'),
  $$ values (true, true) $$,
  'adopted text stays labelled AI-generated and counts as a person''s work');
insert into app.asset_rights (item_id, asset_label, asset_kind, provenance) values (:'item_d', 'Dock photo', 'photo', 'documentary');
select tests.act_as_user(:'owner_uid');
select results_eq(
  format($$ select job_status, warnings from app.staff_request_publish(%L, 'publish', false, '{}', 'idem-staff-0003', %L, 'req-staff-0003') $$, :'item_d', repeat('1', 64)),
  $$ values ('needs_confirmation'::text, array['assets_not_cleared']::text[]) $$,
  'people are warned, not blocked: an uncleared photo comes back as a warning');
select is((select job_status from app.staff_request_publish(:'item_d', 'publish', true, array['assets_not_cleared'],
            'idem-staff-0004', repeat('2', 64), 'req-staff-0004')),
  'queued', 'acknowledging the warning publishes (with the newsletter)');
select throws_ok(format($$ select * from app.staff_request_publish(%L, 'publish', false, array['assets_not_cleared'], 'idem-staff-0005', %L, 'req-staff-0005') $$, :'item_d', repeat('3', 64)),
  'SC409', null, 'one job in flight per story, for staff too');
reset role;

-- email is attempted once at most
select id as job_d from app.publish_jobs where idempotency_key = 'idem-staff-0004' \gset
select tests.act_as_publisher();
select ok(not (app.claim_publish_job(:'job_d') ->> 'emailAttempted')::boolean, 'a new job has not tried email yet');
select lives_ok(format($$ select app.mark_email_attempt(%L) $$, :'job_d'), 'the publisher records the email attempt first');
select lives_ok(format($$ select app.complete_publish_job(%L, 'needs_attention', true, 'http://127.0.0.1:4173/stories/x/', 'local-2', null, 'Email outcome unknown.') $$, :'job_d'),
  'AT-14: an uncertain email outcome needs attention, but the page is live');
reset role;
select is((select status from app.editorial_items where id = :'item_d'), 'published', 'the story shows as published once the site is deployed');
select tests.act_as_user(:'owner_uid');
select ok(app.retry_publish_job(:'job_d'), 'an owner can retry the job');
reset role;
select tests.act_as_publisher();
select ok((app.claim_publish_job(:'job_d') ->> 'emailAttempted')::boolean, 'the retry knows the email may already have gone out, so it will not resend');
reset role;

select * from finish();
rollback;
