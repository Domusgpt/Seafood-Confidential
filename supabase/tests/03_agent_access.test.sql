-- AT-04, AT-06, AT-07, AT-12/13 (database layer): agents are named, scoped, revocable principals that
-- see only granted items, never private columns, and cannot change editorial state.
begin;
\ir helpers/fixtures.psql
select plan(31);

select tests.make_agent('Fixture agent A', 'agentaaa', 'secret-a-0123456789abcdef', array['items.read', 'drafts.propose']) as agent_a \gset
select tests.make_agent('Fixture agent B', 'agentbbb', 'secret-b-0123456789abcdef', array['items.read']) as agent_b \gset
select tests.make_item('SC-2026-911', 'Granted fixture item') as item1 \gset
select tests.make_item('SC-2026-912', 'Ungranted fixture item') as item2 \gset
insert into app.agent_item_grants (principal_id, item_id) values (:'agent_a', :'item1');
insert into app.sources (item_id, source_code, source_type, title, agent_processing, private_contact)
values (:'item1', 'SRC-FIX-01', 'interview', 'Permitted interview notes', 'yes', 'private-phone-fixture'),
       (:'item1', 'SRC-FIX-02', 'interview', 'Confidential interview', 'no', 'confidential-contact-fixture'),
       (:'item1', 'SRC-FIX-03', 'interview', 'Redacted interview title', 'redacted', 'redacted-contact-fixture');
insert into app.pitches (receipt_code, submitter_name, submitter_email, subject, reader_question, firsthand_basis, consent_contact)
values ('P-0000000002', 'Fixture Person', 'pitcher@example.test', 'Fixture subject', 'Fixture reader question?', 'Fixture firsthand basis text', true);

-- Authentication
select is(tests.act_as_agent('agentaaa', 'secret-a-0123456789abcdef'), 1, 'agent A authenticates with its token');
select is(app.current_agent_principal(), :'agent_a'::uuid, 'authentication binds agent A to the transaction');
select is((select array_agg(content_id order by content_id) from app.editorial_items), array['SC-2026-911'],
  'agent A sees only the item it was granted');
select results_eq(
  format($$ select source_code, title, redacted from app.agent_item_sources(%L) $$, :'item1'),
  $$ values ('SRC-FIX-01'::text, 'Permitted interview notes'::text, false), ('SRC-FIX-03'::text, null::text, true) $$,
  'AT-06: agent A sees permitted sources in full, redacted ones reduced to ID and type, staff-only ones not at all');
select is((select count(*)::int from app.agent_item_sources(:'item2')), 0,
  'the source function returns nothing for an item the agent was not granted');
select throws_ok($$ select count(*) from app.sources $$, '42501', null,
  'agents have no direct access to the sources table');
select throws_ok($$ select private_contact from app.sources $$, '42501', null,
  'AT-06: agent A cannot select private source contacts');
select throws_ok($$ select count(*) from app.pitches $$, '42501', null,
  'AT-06: agents cannot read pitches or submitter contacts');
select throws_ok(format($$ update app.editorial_items set status = 'published' where id = %L $$, :'item1'), '42501', null,
  'AT-04: an agent cannot set an item to published');
select lives_ok(
  format($$ insert into app.draft_proposals (item_id, principal_id, idempotency_key, payload_hash, request_id, title, body_markdown)
            values (%L, %L, 'idem-fixture-0001', repeat('a', 64), 'req-fixture-0001', 'Fixture draft', 'FIXTURE BODY') $$,
         :'item1', :'agent_a'),
  'agent A can propose a draft for its granted item');
select throws_ok(
  format($$ insert into app.draft_proposals (item_id, principal_id, idempotency_key, payload_hash, request_id, title, body_markdown)
            values (%L, %L, 'idem-fixture-0002', repeat('b', 64), 'req-fixture-0002', 'Fixture draft', 'FIXTURE BODY') $$,
         :'item2', :'agent_a'),
  '42501', null, 'agent A cannot propose for an item it was not granted');
select throws_ok(
  format($$ insert into app.draft_proposals (item_id, principal_id, idempotency_key, payload_hash, request_id, title, body_markdown)
            values (%L, %L, 'idem-fixture-0003', repeat('c', 64), 'req-fixture-0003', 'Fixture draft', 'FIXTURE BODY') $$,
         :'item1', :'agent_b'),
  '42501', null, 'agent A cannot write as another principal');
select throws_ok(
  format($$ insert into app.draft_proposals (item_id, principal_id, idempotency_key, payload_hash, request_id, title, body_markdown)
            values (%L, %L, 'idem-fixture-0001', repeat('d', 64), 'req-fixture-0004', 'Changed draft', 'CHANGED BODY') $$,
         :'item1', :'agent_a'),
  '23505', null, 'AT-13: the same idempotency key cannot create a second proposal');
select throws_ok($$ select count(*) from private.agent_credentials $$, '42501', null,
  'agents cannot read credential hashes');
select throws_ok(
  format($$ insert into app.draft_proposals (item_id, principal_id, idempotency_key, payload_hash, request_id, title, body_markdown, reviewed_at)
            values (%L, %L, 'idem-fixture-0009', repeat('e', 64), 'req-fixture-0009', 'Backdated', 'BODY', now()) $$,
         :'item1', :'agent_a'),
  '42501', null, 'agents cannot insert proposals that look reviewed');
select throws_ok($$ select app.record_audit('pitch.accepted', 'pitch', 'x', 'allowed') $$, '42501', null,
  'an agent cannot write staff events to the audit trail');
reset role;

-- Isolation between agents
select is(tests.act_as_agent('agentbbb', 'secret-b-0123456789abcdef'), 1, 'agent B authenticates');
select is((select count(*)::int from app.editorial_items), 0, 'agent B sees nothing of agent A''s item');
reset role;

-- Revocation (AT-07): revoke A; B is unaffected
update private.agent_credentials set revoked_at = now() where token_prefix = 'agentaaa';
select is(tests.act_as_agent('agentaaa', 'secret-a-0123456789abcdef'), 0, 'AT-07: revoked agent A is denied immediately');
reset role;
select is(tests.act_as_agent('agentbbb', 'secret-b-0123456789abcdef'), 1, 'AT-07: agent B still authenticates');
reset role;

-- Wrong secret and expiry
select is(tests.act_as_agent('agentbbb', 'wrong-secret-0123456789'), 0, 'a wrong secret is rejected');
select is(app.current_agent_principal(), null::uuid, 'a failed authentication binds no principal');
select is((select count(*)::int from app.agent_item_grants), 0, 'an unbound agent session reads nothing');
reset role;

update private.agent_credentials set expires_at = now() - interval '1 minute' where token_prefix = 'agentbbb';
select is(tests.act_as_agent('agentbbb', 'secret-b-0123456789abcdef'), 0, 'an expired credential is rejected');
reset role;

-- The session binding is trusted from the desk server (server-only connection, parameterized SQL).
-- Revoking the principal itself cuts off even a forged binding.
update app.principals set status = 'revoked' where id = :'agent_a';
set local role desk_agent;
select set_config('app.agent_principal_id', :'agent_a', true);
select is(app.current_agent_principal(), null::uuid, 'a revoked agent principal cannot be bound');
select is((select count(*)::int from app.editorial_items), 0, 'a revoked agent principal sees nothing even with a forged binding');
reset role;

-- Per-agent request budget: only this agent's gateway (agent.*) events count
select tests.make_agent('Fixture agent C', 'agentccc', 'secret-c-0123456789abcdef', array['briefs.list']) as agent_c \gset
select is(tests.act_as_agent('agentccc', 'secret-c-0123456789abcdef'), 1, 'agent C authenticates for the rate check');
select app.record_audit('agent.briefs.list', 'agent_tool', 'briefs.list', 'allowed', 'req-rate-0001');
select app.record_audit('agent.items.read', 'agent_tool', 'items.read', 'allowed', 'req-rate-0002');
select is(app.agent_rate_remaining(3, 60), 1, 'two recent gateway requests leave one of three');
select is(app.agent_rate_remaining(2, 60), 0, 'the budget is exhausted at the limit');
reset role;

-- Credential lifecycle events are audited (issue and revoke; not last-used bookkeeping)
select is((select count(*)::int from private.audit_events where action = 'agent_credentials.update' and occurred_at = now()), 2,
  'credential revocation and expiry changes are on the audit trail');
select is((select count(*)::int from private.audit_events where action = 'draft_proposals.insert' and actor_kind = 'agent' and occurred_at = now()), 1,
  'the accepted proposal is attributed to the agent on the audit trail');

select * from finish();
rollback;
