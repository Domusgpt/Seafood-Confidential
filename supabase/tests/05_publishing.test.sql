-- ADR-005 publishing (database layer): articles written in the desk with revision checks, agent
-- publication gates, staff warnings, the master switch, one job in flight per story and the
-- publisher-only path that claims jobs, reads the site snapshot and records outcomes.
-- AT-04, AT-05, AT-08, AT-12, AT-13, AT-14, AT-20, AT-24, AT-27 to AT-30.
begin;
\ir helpers/fixtures.psql
select plan(121);

-- This test owns the global publishing state inside its transaction (rolled back at the end), so
-- it passes on a fresh database and on one the end-to-end suite has already used.
update app.publishing_policy
set agents_may_publish = false, agents_may_email = false, agent_daily_limit = 5, min_sources = 2;
update app.publishing_lanes set agents_may_publish = false;
update app.publish_jobs set status = 'cancelled', lease_until = null
where status in ('queued', 'running', 'needs_attention');
update app.publish_jobs set created_at = created_at - interval '2 days'
where created_at > now() - interval '24 hours';

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

insert into app.sources (item_id, source_code, source_type, title, agent_processing, private_contact, public_citation, url)
select i, s.code, 'official_document', s.title, s.processing, s.contact, s.citable,
       case when s.code = 'SRC-PUB-01' then 'https://example.test/landings' end
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
select tests.make_proposal(:'item_b', :'agent_p', :body, array['SRC-PUB-01', 'SRC-PUB-02'], 'AB') as prop_short_title \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' Write to jane&#64;example&#46;com for the figures.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_entity \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || E'\n\n- > boats are coming in heavier than ever', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_list_quote \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' See [the details](https://evil.example/landing).', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_link \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' See [the landings report](https://example.test/landings/).', array['SRC-PUB-01', 'SRC-PUB-02'], 'Linking only to a cited source') as prop_good_link \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' Write to jane\@example.com or jane@exa*mple*.com for the figures.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_escaped \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' The exporter''s office is on +56 2 2345 6789.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_intl_phone \gset
select tests.make_proposal(:'item_b', :'agent_p', :body || ' According to Captain *Fixture* at Harbor Line 5, trips were long.', array['SRC-PUB-01', 'SRC-PUB-02']) as prop_private_emph \gset

-- ------------------------------------------------------------------------------------- structure
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('app.articles'::regclass, 'app.article_revisions'::regclass, 'app.publish_jobs'::regclass,
                         'app.publishing_policy'::regclass, 'app.publishing_lanes'::regclass)),
  'every publishing table has RLS');
select is((select agents_may_publish or agents_may_email from app.publishing_policy), false,
  'agent publishing and agent email both start switched off');
select is((select count(*)::int from app.publishing_lanes where agents_may_publish), 0, 'every section lane starts closed');
select ok(not has_function_privilege('desk_agent', 'app.claim_publish_job(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.complete_publish_job(uuid,uuid,text,boolean,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'app.site_snapshot(uuid,uuid)', 'execute')
  and not has_function_privilege('desk_agent', 'app.renew_publish_lease(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'app.mark_email_attempt(uuid,uuid)', 'execute'),
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
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
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
reset role;
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
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
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"headline_and_summary","pass":false}]'
           from app.agent_request_publish(:'prop_short_title', false, 'idem-gate-title1', repeat('d', 64), 'req-gate-00014')),
  'a headline the article could not hold is refused up front, never left to wedge the queue');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_raw_html","pass":false}]'
           from app.agent_request_publish(:'prop_entity', false, 'idem-gate-entity', repeat('e', 64), 'req-gate-00015')),
  'HTML character references (which could spell out an email address) are refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_direct_quotes","pass":false}]'
           from app.agent_request_publish(:'prop_list_quote', false, 'idem-gate-lquote', repeat('f', 64), 'req-gate-00016')),
  'a block quote inside a list item is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"links_to_cited_sources","pass":false}]'
           from app.agent_request_publish(:'prop_link', false, 'idem-gate-link01', repeat('1', 63) || '2', 'req-gate-00017')),
  'a link to anything but a cited source is refused');
select results_eq(
  format($$ select job_status, gate_results @> '[{"gate":"links_to_cited_sources","pass":true}]'
            from app.agent_request_publish(%L, false, 'idem-gate-link02', %L, 'req-gate-00018') $$,
         :'prop_good_link', repeat('1', 63) || '3'),
  $$ values ('queued'::text, true) $$,
  'a link to a cited source passes the link check (and the job is queued)');
reset role;
update app.publish_jobs set status = 'cancelled', finished_at = now() where idempotency_key = 'idem-gate-link02';
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_contact_details","pass":false}]'
           from app.agent_request_publish(:'prop_escaped', false, 'idem-gate-escap1', repeat('1', 63) || '4', 'req-gate-00019')),
  'an email address hidden by a Markdown escape or emphasis is refused (readers would see it)');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_contact_details","pass":false}]'
           from app.agent_request_publish(:'prop_intl_phone', false, 'idem-gate-intl01', repeat('1', 63) || '5', 'req-gate-00020')),
  'an international phone number is refused');
select ok((select job_status = 'refused' and gate_results @> '[{"gate":"no_contact_details","pass":false}]'
           from app.agent_request_publish(:'prop_private_emph', false, 'idem-gate-priv02', repeat('1', 63) || '6', 'req-gate-00021')),
  'a private contact split by emphasis is still refused');
reset role;
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
select is((select count(*)::int from app.publish_jobs, jsonb_array_elements(gate_results) g
           where idempotency_key = 'idem-pub-off-0001' and g ->> 'gate' in ('no_contact_details', 'no_direct_quotes')), 0,
  'with the switch off the content checks are not run, so they cannot be probed outside an open lane');

-- ------------------------------------------------------------------------- publisher context
select tests.act_as_publisher(:'agent_p');
select claim_publish_job as claim from app.claim_publish_job(:'job_a') \gset
select :'claim'::jsonb ->> 'claimToken' as tok_a \gset
select ok((:'claim'::jsonb ->> 'action') = 'publish' and (:'claim'::jsonb -> 'item' ->> 'slug') = 'how-the-scallop-season-opened-2026-951',
  'the publisher claims the job and the story gets a stable public address');
select is(app.claim_publish_job(:'job_a'), null::jsonb, 'a leased job cannot be claimed twice');
select is(app.next_publish_job(), null::uuid, 'nothing else is waiting to run');
select throws_ok(format($$ select app.site_snapshot(%L, gen_random_uuid()) $$, :'job_a'), '55000', null,
  'a worker without the current claim token cannot read the snapshot');
select site_snapshot as snap from app.site_snapshot(:'job_a', :'tok_a') \gset
select is((select array_agg(x ->> 'sourceCode' order by x ->> 'sourceCode')
           from jsonb_array_elements(:'snap'::jsonb -> 'stories') s, jsonb_array_elements(s -> 'sources') x
           where s ->> 'contentId' = 'SC-2026-951'),
  array['SRC-PUB-01', 'SRC-PUB-02'], 'the snapshot lists the story''s citable sources');
select ok((select (s ->> 'aiGenerated')::boolean from jsonb_array_elements(:'snap'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-951')
  and (:'snap'::jsonb ->> 'disclosure') like 'An AI agent wrote%', 'AT-24: the agent story is labelled AI-generated, with the disclosure');
select is((select count(*)::int from jsonb_array_elements(:'snap'::jsonb -> 'stories') s
           where s ->> 'contentId' in ('SC-2026-952', 'SC-2026-953', 'SC-2026-954', 'SC-2026-955')), 0,
  'unpublished stories are not in the snapshot');
select throws_ok($$ select count(*) from app.publish_jobs $$, '42501', null, 'the publisher role has no table access of its own');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, 'http://127.0.0.1:4173/stories/how-the-scallop-season-opened-2026-951/', 'local-1', null, 'Published.') $$, :'job_a', :'tok_a'),
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

-- the live site is rebuilt from the published revision, never from text edited since
select tests.act_as_user(:'editor_uid');
select is(app.save_article(:'item_a', 'UNREVIEWED DRAFT edit after publication', null, :body, null, array['SRC-PUB-01'], 1), 2,
  'an editor can keep editing a published story');
select throws_ok(format($$ update app.editorial_items set status = 'on_hold' where id = %L $$, :'item_a'), '42501', null,
  'nobody can take a story off the site by changing its status by hand');
select throws_ok(format($$ update app.editorial_items set status = 'published' where id = %L $$, :'item_e'), '42501', null,
  'nobody can put a story on the site by changing its status by hand');
reset role;
select is((select published_revision from app.editorial_items where id = :'item_a'), 1, 'the live revision stays 1 until someone republishes');

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
select claim_publish_job as claim_d from app.claim_publish_job(:'job_d') \gset
select ok(not (:'claim_d'::jsonb ->> 'emailAttempted')::boolean, 'a new job has not tried email yet');
select :'claim_d'::jsonb ->> 'claimToken' as tok_d \gset
select site_snapshot as snap_d from app.site_snapshot(:'job_d', :'tok_d') \gset
select is((select s ->> 'title' from jsonb_array_elements(:'snap_d'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-951'),
  'How the scallop season opened', 'another story''s build shows the published text, not the later unreviewed edit');
select ok(app.mark_email_attempt(:'job_d', :'tok_d'), 'the publisher records the email attempt before sending');
select ok(not app.mark_email_attempt(:'job_d', :'tok_d'), 'a second attempt for the same job is refused (at most once)');
select ok(app.renew_publish_lease(:'job_d', :'tok_d'), 'the lease can be renewed during a long deploy');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'needs_attention', true, 'http://127.0.0.1:4173/stories/x/', 'local-2', null, 'Email outcome unknown.') $$, :'job_d', :'tok_d'),
  'AT-14: an uncertain email outcome needs attention, but the page is live');
reset role;
select is((select status from app.editorial_items where id = :'item_d'), 'published', 'the story shows as published once the site is deployed');
select tests.act_as_user(:'owner_uid');
select ok(app.retry_publish_job(:'job_d'), 'an owner can retry the job');
reset role;
select tests.act_as_publisher();
select claim_publish_job as claim_d2 from app.claim_publish_job(:'job_d') \gset
select ok((:'claim_d2'::jsonb ->> 'emailAttempted')::boolean, 'the retry knows the email may already have gone out, so it will not resend');
-- fencing: once the lease expires another worker takes over, and the first one is locked out
reset role;
update app.publish_jobs set lease_until = now() - interval '1 second' where id = :'job_d';
select tests.act_as_publisher();
select claim_publish_job as claim_d3 from app.claim_publish_job(:'job_d') \gset
select ok((:'claim_d3'::jsonb ->> 'claimToken') <> (:'claim_d2'::jsonb ->> 'claimToken'), 'a re-claim after the lease expired gets a new token');
select throws_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, null, null, 'late') $$, :'job_d', :'claim_d2'::jsonb ->> 'claimToken'),
  '55000', null, 'the worker that lost its lease cannot record an outcome');
select ok(not app.renew_publish_lease(:'job_d', (:'claim_d2'::jsonb ->> 'claimToken')::uuid), 'nor renew the lease');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, 'local-3', null, 'Published; email already attempted, not resent.') $$,
                       :'job_d', :'claim_d3'::jsonb ->> 'claimToken'),
  'the worker holding the current lease finishes the job');
reset role;

-- a retry of an agent job whose page is already live finishes it and publishes nothing new
update app.publish_jobs set status = 'needs_attention', finished_at = null where id = :'job_a';
select tests.act_as_user(:'owner_uid');
select ok(app.retry_publish_job(:'job_a'), 'an owner retries an agent job that needs attention');
reset role;
select tests.act_as_publisher();
select claim_publish_job as claim_a2 from app.claim_publish_job(:'job_a') \gset
select is((:'claim_a2'::jsonb ->> 'jobId')::uuid, :'job_a'::uuid,
  'the retry runs although people have since edited the story: its revision is already the live one');
select site_snapshot as snap_a2 from app.site_snapshot(:'job_a', (:'claim_a2'::jsonb ->> 'claimToken')::uuid) \gset
select is((select s ->> 'title' from jsonb_array_elements(:'snap_a2'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-951'),
  'How the scallop season opened', 'the retry rebuilds the revision the agent published, never the later unreviewed edit');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, 'local-4', null, 'Finished.') $$,
                       :'job_a', :'claim_a2'::jsonb ->> 'claimToken'), 'the retried job finishes');
reset role;
select is((select published_revision from app.editorial_items where id = :'item_a'), 1, 'the live revision is still the agent''s');

-- one newsletter per story: no second "publish" of a live story, and a repeat email is a warning
select tests.act_as_user(:'owner_uid');
select throws_ok(format($$ select * from app.staff_request_publish(%L, 'publish', true, array['assets_not_cleared'], 'idem-staff-0006', %L, 'req-staff-0006') $$, :'item_d', repeat('4', 64)),
  '22023', null, 'a live story is updated, not published again (which could email subscribers twice)');
select is((select job_status from app.staff_request_publish(:'item_d', 'unpublish', false, '{}', 'idem-staff-0007', repeat('5', 64), 'req-staff-0007')),
  'queued', 'an owner can take a story off the site');
reset role;
select id as job_u from app.publish_jobs where idempotency_key = 'idem-staff-0007' \gset
select tests.act_as_publisher();
select claim_publish_job as claim_u from app.claim_publish_job(:'job_u') \gset
select site_snapshot as snap_u from app.site_snapshot(:'job_u', (:'claim_u'::jsonb ->> 'claimToken')::uuid) \gset
select ok(not exists (select 1 from jsonb_array_elements(:'snap_u'::jsonb -> 'stories') s where s ->> 'contentId' = 'SC-2026-954'),
  'the unpublish build leaves the story out');
select lives_ok(format($$ select app.complete_publish_job(%L, %L, 'succeeded', true, null, 'local-5', null, 'Unpublished.') $$,
                       :'job_u', :'claim_u'::jsonb ->> 'claimToken'), 'the unpublish job finishes');
reset role;
select results_eq(
  format($$ select status, published_revision is null, public_url is null from app.editorial_items where id = %L $$, :'item_d'),
  $$ values ('on_hold'::text, true, true) $$, 'the story is off the site and back on hold');
select tests.act_as_user(:'owner_uid');
select results_eq(
  format($$ select job_status, warnings from app.staff_request_publish(%L, 'publish', true, array['assets_not_cleared'], 'idem-staff-0008', %L, 'req-staff-0008') $$, :'item_d', repeat('6', 64)),
  $$ values ('needs_confirmation'::text, array['assets_not_cleared', 'already_emailed']::text[]) $$,
  'publishing it again with email warns that subscribers were already emailed about it');
reset role;

-- agent jobs are re-checked in full when they run
select tests.act_as_user(:'owner_uid');
select app.set_publishing_policy(true, true, 50, 2, 'An AI agent wrote this story from the sources listed below.');
reset role;
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
select tests.make_item('SC-2026-956', 'Re-check fixture') as item_f \gset
select tests.make_item('SC-2026-957', 'Revocation fixture') as item_g \gset
select tests.make_item('SC-2026-958', 'Email fixture') as item_h \gset
insert into app.agent_item_grants (principal_id, item_id)
select :'agent_p'::uuid, unnest(array[:'item_f', :'item_g', :'item_h']::uuid[]);
insert into app.sources (item_id, source_code, source_type, title, agent_processing, public_citation)
select i, c, 'official_document', 'Fixture source ' || c, 'yes', true
from unnest(array[:'item_f', :'item_g', :'item_h']::uuid[]) i, unnest(array['SRC-RE-01', 'SRC-RE-02']) c;
select tests.make_proposal(:'item_f', :'agent_p', :body, array['SRC-RE-01', 'SRC-RE-02']) as prop_f \gset
select tests.make_proposal(:'item_g', :'agent_p', :body, array['SRC-RE-01', 'SRC-RE-02']) as prop_g \gset
select tests.make_proposal(:'item_h', :'agent_p', :body, array['SRC-RE-01', 'SRC-RE-02']) as prop_h \gset
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select is((select job_status from app.agent_request_publish(:'prop_f', false, 'idem-recheck-f1', repeat('4', 64), 'req-recheck-f1')), 'queued', 'job f queued');
select is((select job_status from app.agent_request_publish(:'prop_g', false, 'idem-recheck-g1', repeat('5', 64), 'req-recheck-g1')), 'queued', 'job g queued');
select is((select job_status from app.agent_request_publish(:'prop_h', true, 'idem-recheck-h1', repeat('6', 64), 'req-recheck-h1')), 'queued', 'job h queued, with email allowed at the time');
reset role;
select tests.act_as_user(:'owner_uid');
select ok(app.retry_publish_job(tests.job_id('idem-recheck-f1')), 'retrying a job that is still queued is accepted (the caller runs it)');
update app.draft_proposals set status = 'rejected' where id = :'prop_f';
select app.set_publishing_policy(true, false, 50, 2, 'An AI agent wrote this story from the sources listed below.');
reset role;
update private.agent_credentials set revoked_at = now() where token_prefix = 'agentpub';
select tests.act_as_publisher();
select ok((app.claim_publish_job(tests.job_id('idem-recheck-g1')) ->> 'cancelled')::boolean, 'a job whose token was revoked after the request does not run');
reset role;
update private.agent_credentials set revoked_at = null where token_prefix = 'agentpub';
select tests.act_as_publisher();
select ok((app.claim_publish_job(tests.job_id('idem-recheck-f1')) ->> 'cancelled')::boolean, 'a job whose proposal was rejected after the request does not run');
select is(app.claim_publish_job(tests.job_id('idem-recheck-h1')) ->> 'message',
  'Conditions changed before this job ran; now failing: newsletter.', 'a job asking for email after the owner withdrew agent email does not run, and says why');
reset role;
select results_eq(
  $$ select idempotency_key, status, outcome_message like '%' || case idempotency_key when 'idem-recheck-f1' then 'own_open_proposal'
       when 'idem-recheck-h1' then 'newsletter' else 'revoked' end || '%'
     from app.publish_jobs where idempotency_key like 'idem-recheck-%' order by idempotency_key $$,
  $$ values ('idem-recheck-f1'::text, 'cancelled'::text, true), ('idem-recheck-g1', 'cancelled', true), ('idem-recheck-h1', 'cancelled', true) $$,
  'each stale job is cancelled with the reason that no longer holds');

-- refusals are budgeted
update app.publish_jobs set created_at = created_at - interval '2 days' where status = 'refused';
select tests.act_as_agent('agentpub', 'secret-pub-0123456789abcdef');
select is((select count(*)::int from generate_series(1, 10) g,
             lateral app.agent_request_publish(:'prop_short', false, 'idem-budget-' || g, md5(g::text) || md5(g::text), 'req-budget-' || g) r
           where r.job_status = 'refused'), 10, 'ten refused requests in a day');
select ok((select gate_results @> '[{"gate":"refusal_limit","pass":false}]'
           from app.agent_request_publish(:'prop_short', false, 'idem-budget-11', repeat('7', 64), 'req-budget-11')),
  'the eleventh is refused without running any check (the checks cannot be used to probe)');
reset role;

-- addresses are always valid
select is(private.slug_for('帆立貝の季節', 'SC-2026-002'), 'story-2026-002', 'a title without Latin letters gets a fallback address');
select is(private.slug_for('Pêche à São Pedro: Œufs & Straße', 'SC-2026-003'), 'peche-a-sao-pedro-oeufs-and-strasse-2026-003',
  'letters with diacritics keep their base letter in the address');
select ok(private.slug_for(repeat('a', 71) || ' b', 'SC-2026-001') ~ '^[a-z0-9]+(-[a-z0-9]+)*$', 'a long title never leaves a doubled hyphen');

select * from finish();
rollback;
