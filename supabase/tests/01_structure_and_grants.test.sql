-- AT-25: actual grants match intended access; no bypass through views or privileged functions.
begin;
\ir helpers/fixtures.psql
select plan(19);

select has_schema('app');
select has_schema('private');

select is_empty(
  $$ select n.nspname || '.' || c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('app', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in app and private has Row Level Security enabled'
);

select is_empty(
  $$ select n.nspname || '.' || c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('app', 'private') and c.relkind in ('v', 'm') $$,
  'no views or materialized views that could bypass row security'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('app', 'private') and c.relkind = 'r'
       and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')) $$,
  'anon has no table privileges in app or private (public intake goes through a function)'
);

select is_empty(
  $$ select r.rolname || ' on ' || c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join (values ('authenticated'), ('desk_agent'), ('service_role'), ('desk_app')) r(rolname)
     where n.nspname = 'private' and c.relkind = 'r'
       and (has_table_privilege(r.rolname, c.oid, 'SELECT') or has_table_privilege(r.rolname, c.oid, 'INSERT')
            or has_table_privilege(r.rolname, c.oid, 'UPDATE') or has_table_privilege(r.rolname, c.oid, 'DELETE')) $$,
  'no API or desk role can touch private tables directly (credentials, audit, intake throttling)'
);

select ok(not has_table_privilege('desk_app', 'app.pitches', 'SELECT'),
  'desk_app holds no privileges of its own: a query without a role switch fails closed');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'app' and c.relkind = 'r' and has_table_privilege('service_role', c.oid, 'SELECT') $$,
  'service_role (which bypasses RLS) has no privileges on operations tables'
);

select ok(not has_table_privilege('authenticated', 'app.pitches', 'DELETE')
          and not has_table_privilege('authenticated', 'app.editorial_items', 'DELETE'),
  'staff cannot delete pitches or editorial items (history is kept; status changes instead)');

select ok(not has_column_privilege('desk_agent', 'app.sources', 'private_contact', 'SELECT')
          and not has_column_privilege('desk_agent', 'app.sources', 'private_notes', 'SELECT'),
  'AT-06: agents cannot select private source contacts or notes (column grants)');

select ok(not has_table_privilege('desk_agent', 'app.pitches', 'SELECT')
          and not has_table_privilege('desk_agent', 'app.asset_rights', 'SELECT'),
  'AT-06: agents have no access to pitches (submitter contacts) or rights records');

select ok(not has_table_privilege('desk_agent', 'app.sources', 'SELECT')
          and not has_any_column_privilege('desk_agent', 'app.sources', 'SELECT'),
  'AT-06: agents read sources only through app.agent_item_sources (redaction happens in SQL)');

select ok(not has_column_privilege('authenticated', 'app.pitches', 'submitter_email', 'UPDATE')
          and not has_column_privilege('authenticated', 'app.draft_proposals', 'body_markdown', 'UPDATE')
          and not has_column_privilege('authenticated', 'app.editorial_items', 'content_id', 'UPDATE')
          and not has_table_privilege('authenticated', 'app.sources', 'UPDATE'),
  'staff cannot rewrite submissions, agent proposals, content IDs or source records after insert');

select ok(not has_column_privilege('desk_agent', 'app.draft_proposals', 'reviewed_at', 'INSERT')
          and not has_column_privilege('desk_agent', 'app.draft_proposals', 'status', 'INSERT')
          and not has_column_privilege('desk_agent', 'app.draft_proposals', 'created_at', 'INSERT'),
  'agents cannot insert a proposal that looks reviewed, accepted or backdated');

select ok(not has_table_privilege('desk_agent', 'app.editorial_items', 'UPDATE')
          and not has_table_privilege('desk_agent', 'app.editorial_items', 'INSERT')
          and not has_table_privilege('desk_agent', 'app.draft_proposals', 'UPDATE'),
  'AT-04/AT-05: agents cannot change editorial items or approve proposals at the database level');

select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'private') and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  array['submit_pitch'],
  'anon can execute exactly one function: app.submit_pitch'
);

select is_empty(
  $$ select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%') $$,
  'every SECURITY DEFINER function pins search_path'
);

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'private') and has_function_privilege('public', p.oid, 'EXECUTE') $$,
  'PUBLIC cannot execute any app or private function'
);

select ok(
  (select not rolinherit and rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname = 'desk_app'),
  'desk_app is a NOINHERIT login role without superuser or BYPASSRLS'
);

select * from finish();
rollback;
