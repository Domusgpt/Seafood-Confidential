-- Seafood Confidential operations desk: foundation schema.
-- Tickets: SC-005 (operations shell and auth), first chunk of SC-006 (pitch intake, sources, rights)
-- and SC-007 (editorial queue and Ghost references). Design: decisions/ADR-003-desk-foundation-stack.md.
--
-- Security model
-- * The desk server connects as desk_app, a NOINHERIT login role with no privileges of its own.
--   Every request switches role inside a transaction: authenticated (staff, with verified Supabase
--   claims), desk_agent (agents, after app.authenticate_agent) or anon (public pitch intake).
-- * Every table in app has Row Level Security; grants are explicit and minimal; nothing in app or
--   private is exposed to the Data API (supabase/config.toml: auto_expose_new_tables = false).
-- * SECURITY DEFINER functions pin search_path to '' and derive the acting principal themselves.

-- ------------------------------------------------------------------------------------------------
-- Roles
-- ------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'desk_agent') then
    create role desk_agent nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'desk_app') then
    -- Password is provisioned out of band (supabase/seed.sql sets a local-only value).
    create role desk_app login noinherit;
  end if;
end
$$;

grant anon to desk_app;
grant authenticated to desk_app;
grant desk_agent to desk_app;

-- ------------------------------------------------------------------------------------------------
-- Schemas
-- ------------------------------------------------------------------------------------------------
create schema app;
create schema private;

revoke all on schema app from public;
revoke all on schema private from public;
grant usage on schema app to anon, authenticated, desk_agent;

alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- ------------------------------------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------------------------------------
create table app.principals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('human', 'agent')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'disabled', 'revoked')),
  auth_user_id uuid unique references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references app.principals (id),
  constraint principals_identity check (
    (kind = 'human' and auth_user_id is not null) or (kind = 'agent' and auth_user_id is null)
  )
);
comment on table app.principals is 'Desk identities. Humans map to Supabase Auth users; agents authenticate with revocable tokens. Ghost members and Ghost staff are separate identities.';

create table app.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references app.principals (id),
  role text not null check (role in ('owner', 'managing_editor', 'editor')),
  granted_by uuid references app.principals (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index staff_assignments_one_active_role
  on app.staff_assignments (principal_id, role) where revoked_at is null;

create table app.pitches (
  id uuid primary key default gen_random_uuid(),
  receipt_code text not null unique check (receipt_code ~ '^P-[0-9A-F]{10}$'),
  submitted_at timestamptz not null default now(),
  submitter_name text not null check (char_length(submitter_name) between 1 and 120),
  submitter_email text not null check (
    char_length(submitter_email) between 3 and 254 and submitter_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  affiliation text check (char_length(affiliation) <= 200),
  subject text not null check (char_length(subject) between 3 and 200),
  reader_question text not null check (char_length(reader_question) between 10 and 1000),
  firsthand_basis text not null check (char_length(firsthand_basis) between 10 and 2000),
  format_hint text check (format_hint in ('article', 'dispatch', 'interview', 'audio', 'photographs', 'other')),
  interests_disclosure text check (char_length(interests_disclosure) <= 1000),
  consent_contact boolean not null check (consent_contact),
  status text not null default 'new' check (status in ('new', 'accepted', 'declined', 'needs_info')),
  disposition_note text check (char_length(disposition_note) <= 2000),
  disposition_by uuid references app.principals (id),
  disposition_at timestamptz,
  item_id uuid,
  updated_at timestamptz not null default now()
);
comment on column app.pitches.submitter_email is 'Private contact detail: staff only, never exposed to agents or public routes.';

create table app.editorial_items (
  id uuid primary key default gen_random_uuid(),
  content_id text not null unique check (content_id ~ '^SC-[0-9]{4}-[0-9]{3,}$'),
  title text not null check (char_length(title) between 3 and 180),
  summary text check (char_length(summary) <= 1000),
  section text not null check (
    section in ('on_the_water', 'at_the_farm', 'the_trade', 'rules_and_reality', 'at_the_table', 'voices')
  ),
  format text not null check (
    format in ('reported_feature', 'explainer', 'interview', 'first_person', 'opinion', 'sponsored')
  ),
  label text not null default 'reporting' check (label in ('reporting', 'opinion', 'sponsored')),
  focus text check (focus in ('fishery', 'aquaculture', 'both')),
  status text not null default 'commissioned' check (
    status in (
      'commissioned', 'drafting', 'in_review', 'changes_requested', 'ready_for_release',
      'published', 'on_hold', 'withdrawn'
    )
  ),
  assigned_editor_id uuid references app.principals (id),
  author_display text check (char_length(author_display) <= 200),
  region text[] not null default '{}' check (cardinality(region) <= 20),
  species text[] not null default '{}' check (cardinality(species) <= 20),
  due_on date,
  ghost_post_id text unique check (ghost_post_id ~ '^[0-9a-f]{24}$'),
  ghost_updated_at timestamptz,
  pitch_id uuid unique references app.pitches (id),
  created_by uuid references app.principals (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editorial_items_label_matches_format check (
    (format <> 'opinion' or label = 'opinion') and (format <> 'sponsored' or label = 'sponsored')
  )
);
comment on column app.editorial_items.status is 'Operations workflow state. Ghost post status (draft/scheduled/published) is separate and is never overwritten from here (SC-007).';

alter table app.pitches
  add constraint pitches_item_fk foreign key (item_id) references app.editorial_items (id);

create table app.sources (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.editorial_items (id) on delete cascade,
  source_code text not null check (source_code ~ '^SRC-[A-Z0-9-]{3,40}$'),
  source_type text not null check (
    source_type in (
      'official_document', 'primary_research', 'interview', 'direct_record',
      'firsthand_observation', 'calculation', 'secondary_reporting', 'other'
    )
  ),
  title text not null check (char_length(title) between 3 and 300),
  publisher text check (char_length(publisher) <= 200),
  url text check (url ~ '^https?://[^\s]+$' and char_length(url) <= 2000),
  published_on date,
  accessed_on date,
  claim_supported text check (char_length(claim_supported) <= 2000),
  location_in_source text check (char_length(location_in_source) <= 300),
  agent_processing text not null default 'no' check (agent_processing in ('yes', 'no', 'redacted')),
  private_contact text check (char_length(private_contact) <= 500),
  private_notes text check (char_length(private_notes) <= 4000),
  created_by uuid references app.principals (id),
  created_at timestamptz not null default now(),
  unique (item_id, source_code)
);
comment on column app.sources.private_contact is 'Restricted: staff only. Not granted to desk_agent (AT-06).';

create table app.asset_rights (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.editorial_items (id) on delete cascade,
  asset_label text not null check (char_length(asset_label) between 2 and 200),
  asset_kind text not null check (
    asset_kind in ('photo', 'illustration', 'graphic', 'audio', 'video', 'document', 'other')
  ),
  provenance text not null check (provenance in ('documentary', 'illustrative', 'generated')),
  owner_name text check (char_length(owner_name) <= 200),
  license text check (char_length(license) <= 200),
  credit_line text check (char_length(credit_line) <= 300),
  permitted_uses text[] not null default '{}' check (
    permitted_uses <@ array['web', 'newsletter', 'social', 'podcast', 'print']::text[]
  ),
  restrictions text check (char_length(restrictions) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'cleared', 'restricted', 'rejected')),
  consent_reference text check (char_length(consent_reference) <= 500),
  created_by uuid references app.principals (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Release rule enforced in the database too: nothing is cleared without a credit line.
  constraint asset_rights_cleared_needs_credit check (status <> 'cleared' or coalesce(btrim(credit_line), '') <> '')
);

create table app.agent_item_grants (
  principal_id uuid not null references app.principals (id),
  item_id uuid not null references app.editorial_items (id) on delete cascade,
  granted_by uuid references app.principals (id),
  granted_at timestamptz not null default now(),
  primary key (principal_id, item_id)
);

create table app.draft_proposals (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.editorial_items (id) on delete cascade,
  principal_id uuid not null references app.principals (id),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  request_id text not null check (char_length(request_id) between 8 and 128),
  title text not null check (char_length(title) between 1 and 180),
  summary text check (char_length(summary) <= 600),
  body_markdown text not null check (char_length(body_markdown) between 1 and 100000),
  section text check (
    section in ('on_the_water', 'at_the_farm', 'the_trade', 'rules_and_reality', 'at_the_table', 'voices')
  ),
  source_ids text[] not null default '{}' check (cardinality(source_ids) <= 100),
  editor_notes text check (char_length(editor_notes) <= 4000),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  reviewed_by uuid references app.principals (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (principal_id, idempotency_key)
);
comment on table app.draft_proposals is 'Agent draft proposals. A proposal never publishes; a human reviews it and works in Ghost.';

create table private.agent_credentials (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references app.principals (id),
  token_prefix text not null unique check (token_prefix ~ '^[a-z0-9]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (
    cardinality(scopes) > 0
    and scopes <@ array['briefs.list', 'items.read', 'drafts.propose', 'drafts.revise', 'social.propose', 'jobs.read']::text[]
  ),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references app.principals (id),
  created_at timestamptz not null default now()
);
comment on table private.agent_credentials is 'Only SHA-256 hashes of agent tokens are stored; the token is shown once at issue time.';

create table private.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  request_id text check (char_length(request_id) <= 128),
  actor_principal_id uuid,
  actor_kind text not null check (actor_kind in ('human', 'agent', 'public', 'system')),
  action text not null check (char_length(action) between 3 and 80),
  subject_type text check (char_length(subject_type) <= 40),
  subject_id text check (char_length(subject_id) <= 128),
  outcome text not null check (outcome in ('allowed', 'denied', 'error')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) < 8192)
);
create index audit_events_occurred_at on private.audit_events (occurred_at desc);
create index audit_events_actor_recent on private.audit_events (actor_principal_id, occurred_at desc)
  where actor_principal_id is not null;

create table private.intake_events (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now()
);
create index intake_events_recent on private.intake_events (ip_hash, occurred_at desc);
create index intake_events_occurred_at on private.intake_events (occurred_at);
comment on table private.intake_events is 'Intake throttling only: a keyed hash of the client address (daily-rotated server salt), pruned after a day.';

create table private.content_counters (
  year integer primary key,
  last_value integer not null default 0
);

-- ------------------------------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER: they read principals regardless of the caller's own grants)
-- ------------------------------------------------------------------------------------------------
create function app.current_staff_principal()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from app.principals p
  where auth.uid() is not null
    and p.auth_user_id = auth.uid()
    and p.kind = 'human'
    and p.status = 'active'
    and exists (
      select 1 from app.staff_assignments a
      where a.principal_id = p.id and a.revoked_at is null
    )
$$;

create function app.has_staff_role(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.principals p
    join app.staff_assignments a on a.principal_id = p.id and a.revoked_at is null
    where auth.uid() is not null
      and p.auth_user_id = auth.uid()
      and p.kind = 'human'
      and p.status = 'active'
      and a.role = any (roles)
  )
$$;

create function app.current_agent_principal()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from app.principals p
  where p.kind = 'agent'
    and p.status = 'active'
    and p.id = nullif(current_setting('app.agent_principal_id', true), '')::uuid
$$;

create function app.current_principal_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.current_staff_principal(), app.current_agent_principal())
$$;

-- Verifies an agent token (prefix + SHA-256 of the secret) and binds the agent principal to the
-- current transaction. Callable only as desk_agent; returns no row for unknown, revoked or expired
-- credentials and for disabled or revoked principals (AT-07).
create function app.authenticate_agent(p_token_prefix text, p_token_hash text)
returns table (principal_id uuid, scopes text[], credential_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select ac.id, ac.principal_id, ac.scopes
  into c
  from private.agent_credentials ac
  join app.principals p on p.id = ac.principal_id
  where ac.token_prefix = p_token_prefix
    and ac.token_hash = p_token_hash
    and ac.revoked_at is null
    and (ac.expires_at is null or ac.expires_at > now())
    and p.kind = 'agent'
    and p.status = 'active';
  if not found then
    return;
  end if;
  update private.agent_credentials set last_used_at = now() where id = c.id;
  perform set_config('app.agent_principal_id', c.principal_id::text, true);
  return query select c.principal_id, c.scopes, c.id;
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Audit
-- ------------------------------------------------------------------------------------------------
-- The actor is always derived from the bound identity, never supplied by the caller. The request ID
-- comes from the argument or from the per-transaction app.request_id setting the desk server binds,
-- so rows written by triggers carry the same correlation ID as the request that caused them.
create function private.write_audit(
  p_action text,
  p_subject_type text,
  p_subject_id text,
  p_outcome text,
  p_request_id text,
  p_details jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  staff uuid := app.current_staff_principal();
  agent uuid := app.current_agent_principal();
begin
  insert into private.audit_events (
    request_id, actor_principal_id, actor_kind, action, subject_type, subject_id, outcome, details
  )
  values (
    left(coalesce(p_request_id, nullif(current_setting('app.request_id', true), '')), 128),
    coalesce(staff, agent),
    case
      when staff is not null then 'human'
      when agent is not null then 'agent'
      -- An API role without a bound principal: an unauthenticated or unauthorized caller.
      when current_setting('role', true) in ('anon', 'authenticated', 'desk_agent') then 'public'
      -- No role switch at all: a migration, an operator script or a maintenance job.
      else 'system'
    end,
    p_action,
    p_subject_type,
    left(p_subject_id, 128),
    p_outcome,
    coalesce(p_details, '{}'::jsonb)
  );
end
$$;

-- The API-facing entry point (desk server). Triggers write through private.write_audit directly.
create function app.record_audit(
  p_action text,
  p_subject_type text,
  p_subject_id text,
  p_outcome text,
  p_request_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- An agent-bound transaction can only describe gateway events; it cannot forge staff actions.
  if app.current_staff_principal() is null and app.current_agent_principal() is not null
     and p_action not like 'agent.%' then
    raise exception 'agents may only record agent.* events' using errcode = '42501';
  end if;
  perform private.write_audit(p_action, p_subject_type, p_subject_id, p_outcome, p_request_id, p_details);
end
$$;

create function private.forbid_audit_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only' using errcode = '42501';
end
$$;

create trigger audit_events_append_only
  before update or delete on private.audit_events
  for each row execute function private.forbid_audit_changes();
create trigger audit_events_no_truncate
  before truncate on private.audit_events
  for each statement execute function private.forbid_audit_changes();

create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject text;
  detail jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'editorial_items' then
    if tg_op = 'UPDATE'
      and new.status is not distinct from old.status
      and new.ghost_post_id is not distinct from old.ghost_post_id
      and new.assigned_editor_id is not distinct from old.assigned_editor_id then
      return null; -- title or tag edits are not audit events
    end if;
    subject := new.id::text;
    detail := jsonb_build_object('content_id', new.content_id, 'status', new.status);
    if tg_op = 'UPDATE' then
      detail := detail || jsonb_build_object('previous_status', old.status, 'ghost_post_id', new.ghost_post_id);
    end if;
  elsif tg_table_name = 'principals' then
    if tg_op = 'UPDATE'
      and new.status is not distinct from old.status
      and new.display_name is not distinct from old.display_name then
      return null;
    end if;
    subject := new.id::text;
    detail := jsonb_build_object('kind', new.kind, 'status', new.status);
  elsif tg_table_name = 'staff_assignments' then
    subject := new.principal_id::text;
    detail := jsonb_build_object('role', new.role, 'revoked', new.revoked_at is not null);
  elsif tg_table_name = 'agent_item_grants' then
    if tg_op = 'DELETE' then
      subject := old.principal_id::text;
      detail := jsonb_build_object('item_id', old.item_id);
    else
      subject := new.principal_id::text;
      detail := jsonb_build_object('item_id', new.item_id);
    end if;
  elsif tg_table_name = 'agent_credentials' then
    subject := new.principal_id::text;
    detail := jsonb_build_object(
      'credential_id', new.id, 'token_prefix', new.token_prefix, 'scopes', new.scopes,
      'expires_at', new.expires_at, 'revoked', new.revoked_at is not null
    );
  elsif tg_table_name = 'draft_proposals' then
    subject := new.id::text;
    detail := jsonb_build_object('item_id', new.item_id, 'status', new.status);
  elsif tg_table_name = 'sources' then
    if tg_op = 'DELETE' then
      subject := old.id::text;
      detail := jsonb_build_object('item_id', old.item_id, 'source_code', old.source_code);
    else
      subject := new.id::text;
      detail := jsonb_build_object(
        'item_id', new.item_id, 'source_code', new.source_code, 'agent_processing', new.agent_processing
      );
    end if;
  elsif tg_table_name = 'asset_rights' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
      return null;
    end if;
    subject := new.id::text;
    detail := jsonb_build_object('item_id', new.item_id, 'status', new.status, 'provenance', new.provenance);
    if tg_op = 'UPDATE' then
      detail := detail || jsonb_build_object('previous_status', old.status);
    end if;
  end if;
  perform private.write_audit(
    tg_table_name || '.' || lower(tg_op), tg_table_name, subject, 'allowed', null, detail
  );
  return null; -- AFTER trigger: the return value is ignored
end
$$;

create trigger editorial_items_audit after insert or update on app.editorial_items
  for each row execute function private.audit_row_change();
create trigger principals_audit after insert or update on app.principals
  for each row execute function private.audit_row_change();
create trigger staff_assignments_audit after insert or update on app.staff_assignments
  for each row execute function private.audit_row_change();
create trigger agent_item_grants_audit after insert or delete on app.agent_item_grants
  for each row execute function private.audit_row_change();
-- Issue and revocation only: last_used_at bookkeeping is not an audit event.
create trigger agent_credentials_audit after insert or update of revoked_at, expires_at, scopes
  on private.agent_credentials
  for each row execute function private.audit_row_change();
create trigger draft_proposals_audit after insert or update on app.draft_proposals
  for each row execute function private.audit_row_change();
create trigger sources_audit after insert or delete on app.sources
  for each row execute function private.audit_row_change();
create trigger asset_rights_audit after insert or update of status on app.asset_rights
  for each row execute function private.audit_row_change();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger editorial_items_touch before update on app.editorial_items
  for each row execute function private.touch_updated_at();
create trigger pitches_touch before update on app.pitches
  for each row execute function private.touch_updated_at();
create trigger asset_rights_touch before update on app.asset_rights
  for each row execute function private.touch_updated_at();

-- Staff assignments and agent grants must point at the right kind of principal.
create function private.assert_principal_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text := tg_argv[0];
begin
  if not exists (select 1 from app.principals where id = new.principal_id and kind = expected) then
    raise exception '% requires a % principal', tg_table_name, expected using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger staff_assignments_human before insert or update on app.staff_assignments
  for each row execute function private.assert_principal_kind('human');
create trigger agent_item_grants_agent before insert or update on app.agent_item_grants
  for each row execute function private.assert_principal_kind('agent');
create trigger draft_proposals_agent before insert on app.draft_proposals
  for each row execute function private.assert_principal_kind('agent');

-- Who reviewed or decided is derived, never supplied, and a review or a final decision is not
-- reopened by a later update.
create function private.stamp_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'proposed' then
      raise exception 'proposal already reviewed' using errcode = '55000';
    end if;
    new.reviewed_by := app.current_staff_principal();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end
$$;

create trigger draft_proposals_stamp_review before update on app.draft_proposals
  for each row execute function private.stamp_review();

create function private.stamp_disposition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status in ('accepted', 'declined') then
      raise exception 'pitch already decided' using errcode = 'SC409';
    end if;
    new.disposition_by := app.current_staff_principal();
    new.disposition_at := now();
  else
    new.disposition_by := old.disposition_by;
    new.disposition_at := old.disposition_at;
  end if;
  return new;
end
$$;

create trigger pitches_stamp_disposition before update on app.pitches
  for each row execute function private.stamp_disposition();

-- Revocation is final; revoking an agent principal revokes every token it holds.
create function private.guard_principal_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'a revoked principal cannot be reactivated' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger principals_guard_status before update on app.principals
  for each row execute function private.guard_principal_status();

create function private.cascade_agent_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'agent' and new.status = 'revoked' and old.status <> 'revoked' then
    update private.agent_credentials set revoked_at = now()
    where principal_id = new.id and revoked_at is null;
  end if;
  return null;
end
$$;

create trigger principals_cascade_revocation after update of status on app.principals
  for each row execute function private.cascade_agent_revocation();

-- ------------------------------------------------------------------------------------------------
-- Workflow functions
-- ------------------------------------------------------------------------------------------------
create function app.next_content_id()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  y integer := extract(year from (now() at time zone 'America/New_York'))::integer;
  n integer;
begin
  if app.current_staff_principal() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into private.content_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = private.content_counters.last_value + 1
  returning last_value into n;
  return format('SC-%s-%s', y, lpad(n::text, 3, '0'));
end
$$;

-- Public pitch intake (SC-006). Runs as anon through the desk server and returns only a receipt.
-- Bounded by table constraints, a per-client hourly limit, a global hourly ceiling and audit logging;
-- never echoes submitted data. A throttled call returns NULL instead of raising, so the denial stays
-- on the audit trail (the desk server answers 429).
create function app.submit_pitch(
  p_client_hash text,
  p_name text,
  p_email text,
  p_affiliation text,
  p_subject text,
  p_reader_question text,
  p_firsthand_basis text,
  p_format_hint text,
  p_interests text,
  p_consent boolean,
  p_request_id text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  per_client_limit constant integer := 5;
  global_limit constant integer := 200;
  recent integer;
  overall integer;
  receipt text;
begin
  if p_consent is distinct from true then
    raise exception 'consent required' using errcode = '22023';
  end if;
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid client' using errcode = '22023';
  end if;
  -- One transaction at a time counts and inserts, so bursts cannot exceed either limit.
  perform pg_advisory_xact_lock(hashtextextended('sc.intake', 0));
  delete from private.intake_events where occurred_at < now() - interval '1 day';
  select count(*) filter (where ip_hash = p_client_hash), count(*)
  into recent, overall
  from private.intake_events
  where occurred_at > now() - interval '1 hour';
  if recent >= per_client_limit or overall >= global_limit then
    insert into private.audit_events (request_id, actor_kind, action, outcome, details)
    values (
      left(p_request_id, 128), 'public', 'pitch.submit', 'denied',
      jsonb_build_object('reason', case when recent >= per_client_limit then 'client_rate_limited' else 'global_rate_limited' end)
    );
    return null;
  end if;
  insert into private.intake_events (ip_hash) values (p_client_hash);
  receipt := 'P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into app.pitches (
    receipt_code, submitter_name, submitter_email, affiliation, subject, reader_question,
    firsthand_basis, format_hint, interests_disclosure, consent_contact
  )
  values (
    receipt, btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_affiliation), ''), btrim(p_subject),
    btrim(p_reader_question), btrim(p_firsthand_basis), nullif(p_format_hint, ''),
    nullif(btrim(p_interests), ''), true
  );
  insert into private.audit_events (request_id, actor_kind, action, subject_type, subject_id, outcome)
  values (left(p_request_id, 128), 'public', 'pitch.submit', 'pitch', receipt, 'allowed');
  return receipt;
end
$$;

-- Pitch disposition (SC-006 → SC-007). SECURITY INVOKER: Row Level Security on pitches and
-- editorial_items decides; only the content-ID counter runs with definer rights.
create function app.dispose_pitch(
  p_pitch_id uuid,
  p_decision text,
  p_note text default null,
  p_title text default null,
  p_section text default null,
  p_format text default null,
  p_editor_id uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  pitch app.pitches%rowtype;
  item uuid;
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_decision not in ('accepted', 'declined', 'needs_info') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into pitch from app.pitches where id = p_pitch_id for update;
  if not found then
    raise exception 'pitch not found' using errcode = 'P0002';
  end if;
  if pitch.status in ('accepted', 'declined') then
    raise exception 'pitch already decided' using errcode = 'SC409';
  end if;
  if p_decision = 'accepted' then
    insert into app.editorial_items (
      content_id, title, summary, section, format, label, status, assigned_editor_id, pitch_id, created_by
    )
    values (
      app.next_content_id(),
      left(coalesce(nullif(btrim(p_title), ''), pitch.subject), 180),
      pitch.reader_question,
      coalesce(p_section, 'voices'),
      coalesce(p_format, 'reported_feature'),
      case coalesce(p_format, 'reported_feature')
        when 'opinion' then 'opinion'
        when 'sponsored' then 'sponsored'
        else 'reporting'
      end,
      'commissioned',
      coalesce(p_editor_id, actor),
      pitch.id,
      actor
    )
    returning id into item;
  end if;
  update app.pitches
  set status = p_decision,
      disposition_note = nullif(btrim(p_note), ''),
      disposition_by = actor,
      disposition_at = now(),
      item_id = coalesce(item, pitch.item_id)
  where id = p_pitch_id;
  perform app.record_audit(
    'pitch.' || p_decision, 'pitch', p_pitch_id::text, 'allowed', p_request_id,
    jsonb_build_object('item_id', item)
  );
  return item;
end
$$;

-- Recent audit events for owners and managing editors (details never contain secrets).
create function app.recent_audit_events(p_limit integer default 50, p_failures_only boolean default false)
returns table (
  occurred_at timestamptz,
  actor_kind text,
  actor_name text,
  action text,
  subject_type text,
  subject_id text,
  outcome text,
  request_id text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_staff_role('owner', 'managing_editor') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select e.occurred_at, e.actor_kind, p.display_name, e.action, e.subject_type, e.subject_id,
           e.outcome, e.request_id
    from private.audit_events e
    left join app.principals p on p.id = e.actor_principal_id
    where not p_failures_only or e.outcome <> 'allowed'
    order by e.occurred_at desc, e.id desc
    limit least(greatest(p_limit, 1), 200);
end
$$;

-- Agent credential management (Settings, AT-07). The desk server generates the token, shows it once
-- and passes only its prefix and SHA-256 hash; the database never sees the secret.
create function app.issue_agent_credential(
  p_principal_id uuid,
  p_token_prefix text,
  p_token_hash text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  credential uuid;
begin
  if actor is null or not app.has_staff_role('owner') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from app.principals where id = p_principal_id and kind = 'agent' and status = 'active'
  ) then
    raise exception 'agent principal not found or not active' using errcode = 'P0002';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expiry must be in the future' using errcode = '22023';
  end if;
  insert into private.agent_credentials (principal_id, token_prefix, token_hash, scopes, expires_at, created_by)
  values (p_principal_id, p_token_prefix, p_token_hash, p_scopes, p_expires_at, actor)
  returning id into credential;
  return credential;
end
$$;

create function app.revoke_agent_credential(p_credential_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_staff_role('owner', 'managing_editor') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update private.agent_credentials set revoked_at = now()
  where id = p_credential_id and revoked_at is null;
  return found;
end
$$;

create function app.list_agent_credentials()
returns table (
  credential_id uuid,
  principal_id uuid,
  agent_name text,
  agent_status text,
  token_prefix text,
  scopes text[],
  created_at timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_staff_role('owner', 'managing_editor') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select c.id, p.id, p.display_name, p.status, c.token_prefix, c.scopes, c.created_at, c.expires_at,
           c.last_used_at, c.revoked_at
    from private.agent_credentials c
    join app.principals p on p.id = c.principal_id
    order by c.revoked_at is not null, c.created_at desc;
end
$$;

-- Per-agent request budget for the gateway (SC-009). Every gateway request writes exactly one
-- agent.* audit row, so the trail doubles as the rate counter. Soft limit: concurrent requests in
-- one burst can exceed it slightly; the database stays authoritative for everything else.
create function app.agent_rate_remaining(p_limit integer, p_window_seconds integer default 60)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(p_limit, 0) - count(*)::integer
  from private.audit_events e
  where e.actor_principal_id = app.current_agent_principal()
    and e.actor_kind = 'agent'
    and e.action like 'agent.%'
    and e.occurred_at > now() - make_interval(secs => least(greatest(p_window_seconds, 1), 3600))
$$;

-- Sources for one granted item as an agent may see them (AT-06). Agents have no direct access to
-- app.sources: "redacted" entries reveal only their ID and type, staff-only entries never appear.
create function app.agent_item_sources(p_item_id uuid)
returns table (
  source_code text,
  source_type text,
  title text,
  publisher text,
  url text,
  published_on date,
  accessed_on date,
  claim_supported text,
  location_in_source text,
  redacted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.source_code, s.source_type,
         case when s.agent_processing = 'yes' then s.title end,
         case when s.agent_processing = 'yes' then s.publisher end,
         case when s.agent_processing = 'yes' then s.url end,
         case when s.agent_processing = 'yes' then s.published_on end,
         case when s.agent_processing = 'yes' then s.accessed_on end,
         case when s.agent_processing = 'yes' then s.claim_supported end,
         case when s.agent_processing = 'yes' then s.location_in_source end,
         s.agent_processing = 'redacted'
  from app.sources s
  where s.item_id = p_item_id
    and s.agent_processing in ('yes', 'redacted')
    and exists (
      select 1 from app.agent_item_grants g
      where g.item_id = s.item_id and g.principal_id = app.current_agent_principal()
    )
  order by s.source_code
$$;

-- ------------------------------------------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------------------------------------------
alter table app.principals enable row level security;
alter table app.staff_assignments enable row level security;
alter table app.pitches enable row level security;
alter table app.editorial_items enable row level security;
alter table app.sources enable row level security;
alter table app.asset_rights enable row level security;
alter table app.agent_item_grants enable row level security;
alter table app.draft_proposals enable row level security;
alter table private.agent_credentials enable row level security;
alter table private.audit_events enable row level security;
alter table private.intake_events enable row level security;
alter table private.content_counters enable row level security;

-- principals
create policy staff_read_principals on app.principals for select to authenticated
  using (app.current_staff_principal() is not null);
create policy owner_insert_principals on app.principals for insert to authenticated
  with check (app.has_staff_role('owner'));
create policy owner_update_principals on app.principals for update to authenticated
  using (app.has_staff_role('owner')) with check (app.has_staff_role('owner'));
create policy agent_read_self on app.principals for select to desk_agent
  using (id = app.current_agent_principal());

-- staff assignments
create policy staff_read_assignments on app.staff_assignments for select to authenticated
  using (app.current_staff_principal() is not null);
create policy owner_insert_assignments on app.staff_assignments for insert to authenticated
  with check (app.has_staff_role('owner'));
create policy owner_update_assignments on app.staff_assignments for update to authenticated
  using (app.has_staff_role('owner')) with check (app.has_staff_role('owner'));

-- pitches: staff only; public intake goes through app.submit_pitch
create policy staff_read_pitches on app.pitches for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_update_pitches on app.pitches for update to authenticated
  using (app.current_staff_principal() is not null)
  with check (app.current_staff_principal() is not null);

-- editorial items
create policy staff_read_items on app.editorial_items for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_insert_items on app.editorial_items for insert to authenticated
  with check (app.current_staff_principal() is not null);
create policy staff_update_items on app.editorial_items for update to authenticated
  using (app.current_staff_principal() is not null)
  with check (app.current_staff_principal() is not null);
create policy agent_read_granted_items on app.editorial_items for select to desk_agent
  using (
    exists (
      select 1 from app.agent_item_grants g
      where g.item_id = editorial_items.id and g.principal_id = app.current_agent_principal()
    )
  );

-- sources
create policy staff_read_sources on app.sources for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_insert_sources on app.sources for insert to authenticated
  with check (app.current_staff_principal() is not null);
create policy editors_delete_sources on app.sources for delete to authenticated
  using (app.has_staff_role('owner', 'managing_editor'));

-- asset rights: staff only
create policy staff_read_rights on app.asset_rights for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_insert_rights on app.asset_rights for insert to authenticated
  with check (app.current_staff_principal() is not null);
create policy staff_update_rights on app.asset_rights for update to authenticated
  using (app.current_staff_principal() is not null)
  with check (app.current_staff_principal() is not null);

-- agent item grants
create policy staff_read_grants on app.agent_item_grants for select to authenticated
  using (app.current_staff_principal() is not null);
create policy editors_insert_grants on app.agent_item_grants for insert to authenticated
  with check (app.has_staff_role('owner', 'managing_editor'));
create policy editors_delete_grants on app.agent_item_grants for delete to authenticated
  using (app.has_staff_role('owner', 'managing_editor'));
create policy agent_read_own_grants on app.agent_item_grants for select to desk_agent
  using (principal_id = app.current_agent_principal());

-- draft proposals
create policy staff_read_proposals on app.draft_proposals for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_review_proposals on app.draft_proposals for update to authenticated
  using (app.current_staff_principal() is not null)
  with check (app.current_staff_principal() is not null);
create policy agent_read_own_proposals on app.draft_proposals for select to desk_agent
  using (principal_id = app.current_agent_principal());
create policy agent_insert_proposals on app.draft_proposals for insert to desk_agent
  with check (
    principal_id = app.current_agent_principal()
    and status = 'proposed'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from app.agent_item_grants g
      where g.item_id = draft_proposals.item_id and g.principal_id = app.current_agent_principal()
    )
  );

-- private tables: no policies and no grants; only SECURITY DEFINER functions reach them.

-- ------------------------------------------------------------------------------------------------
-- Grants (explicit and minimal; Row Level Security narrows them further)
-- ------------------------------------------------------------------------------------------------
revoke all on all tables in schema app from public, anon, authenticated, service_role, desk_agent;
revoke all on all tables in schema private from public, anon, authenticated, service_role, desk_agent;
revoke all on all functions in schema app from public, anon, authenticated, service_role, desk_agent;
revoke all on all functions in schema private from public, anon, authenticated, service_role, desk_agent;

-- Staff: whole-row reads; UPDATE only on the columns the workflow changes (identity, provenance
-- and authorship columns are never writable after insert).
grant select, insert on app.principals to authenticated;
grant update (display_name, status) on app.principals to authenticated;
grant select, insert on app.staff_assignments to authenticated;
grant update (revoked_at) on app.staff_assignments to authenticated;
grant select on app.pitches to authenticated;
grant update (status, disposition_note, disposition_by, disposition_at, item_id) on app.pitches to authenticated;
grant select, insert on app.editorial_items to authenticated;
grant update (
  title, summary, section, format, label, focus, status, due_on, assigned_editor_id, author_display,
  region, species, ghost_post_id, ghost_updated_at
) on app.editorial_items to authenticated;
grant select, insert, delete on app.sources to authenticated;
grant select, insert on app.asset_rights to authenticated;
grant update (status) on app.asset_rights to authenticated;
grant select, insert, delete on app.agent_item_grants to authenticated;
grant select on app.draft_proposals to authenticated;
grant update (status, reviewed_by, reviewed_at) on app.draft_proposals to authenticated;

grant select on app.principals to desk_agent;
grant select (
  id, content_id, title, summary, section, format, label, focus, status, region, species,
  due_on, ghost_post_id, created_at, updated_at
) on app.editorial_items to desk_agent;
grant select on app.agent_item_grants to desk_agent;
grant select on app.draft_proposals to desk_agent;
grant insert (
  item_id, principal_id, idempotency_key, payload_hash, request_id, title, summary, body_markdown,
  section, source_ids, editor_notes
) on app.draft_proposals to desk_agent;

grant execute on function app.current_staff_principal() to authenticated, desk_agent;
grant execute on function app.has_staff_role(text[]) to authenticated, desk_agent;
grant execute on function app.current_agent_principal() to authenticated, desk_agent;
grant execute on function app.current_principal_id() to authenticated, desk_agent;
grant execute on function app.authenticate_agent(text, text) to desk_agent;
grant execute on function app.record_audit(text, text, text, text, text, jsonb) to authenticated, desk_agent;
grant execute on function app.next_content_id() to authenticated;
grant execute on function app.submit_pitch(text, text, text, text, text, text, text, text, text, boolean, text) to anon;
grant execute on function app.dispose_pitch(uuid, text, text, text, text, text, uuid, text) to authenticated;
grant execute on function app.recent_audit_events(integer, boolean) to authenticated;
grant execute on function app.agent_item_sources(uuid) to desk_agent;
grant execute on function app.issue_agent_credential(uuid, text, text, text[], timestamptz) to authenticated;
grant execute on function app.revoke_agent_credential(uuid) to authenticated;
grant execute on function app.list_agent_credentials() to authenticated;
grant execute on function app.agent_rate_remaining(integer, integer) to desk_agent;
