-- Seafood Confidential operations desk: publishing our own site and newsletter, by staff and by agents.
-- Decision: decisions/ADR-005-desk-publishing-without-ghost.md (Ghost-free start; agents publish under
-- policy). Tickets: SC-003 (public site pages), SC-004 (newsletter), SC-011 (durable publish jobs),
-- SC-017 (agent publishing lanes), SC-018 (articles written in the desk). Acceptance: AT-04, AT-08,
-- AT-12 to AT-15, AT-20, AT-24, AT-27 to AT-30.
--
-- Model
-- * Stories are written in the desk: app.articles holds the text of each story, with every saved
--   version kept in app.article_revisions. Saving checks the revision the writer started from, so a
--   newer edit is never silently overwritten (AT-08).
-- * Publishing rebuilds the public static site from every published article and deploys it (the
--   desk server does the rendering and the upload). The newsletter goes out only when asked for.
-- * Agents publish without per-post human approval, but only through app.agent_request_publish:
--   a token with the drafts.publish scope, an item granted to the agent, the owner's master switch
--   on, the item's section lane open, and every automated check passing. The checks run here, in
--   the database, so an application bug cannot skip them.
-- * People are never blocked: staff checks come back as warnings they can acknowledge.
-- * Human work wins: once a person has written or edited a story's text, agents cannot publish it.
-- * The site build and upload run in the desk server under desk_publisher, a role that can only
--   claim jobs, read the publishable snapshot and record outcomes. A claim token fences every step
--   after the claim, and the lease is renewed during long deploys.
-- * The live site is built from the revision each story was published at (published_revision),
--   never from text edited since, and no API role can move a story to or from Published by hand.

-- ------------------------------------------------------------------------------------------------
-- Role
-- ------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'desk_publisher') then
    create role desk_publisher nologin noinherit;
  end if;
end
$$;

grant desk_publisher to desk_app;
grant usage on schema app to desk_publisher;

-- ------------------------------------------------------------------------------------------------
-- Changes to existing tables
-- ------------------------------------------------------------------------------------------------
alter table private.agent_credentials drop constraint agent_credentials_scopes_check;
alter table private.agent_credentials add constraint agent_credentials_scopes_check check (
  cardinality(scopes) > 0
  and scopes <@ array[
    'briefs.list', 'items.read', 'drafts.propose', 'drafts.revise', 'drafts.publish', 'social.propose', 'jobs.read'
  ]::text[]
);

alter table app.draft_proposals drop constraint draft_proposals_status_check;
alter table app.draft_proposals add constraint draft_proposals_status_check
  check (status in ('proposed', 'accepted', 'rejected', 'published'));
comment on table app.draft_proposals is 'Agent draft proposals. A proposal is published only through a publish job (ADR-005).';

alter table app.editorial_items
  add column slug text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 96),
  add column published_at timestamptz,
  add column published_by uuid references app.principals (id),
  add column published_via text check (published_via in ('staff', 'agent')),
  add column published_revision integer,
  add column public_url text check (public_url ~ '^https?://[^\s]+$' and char_length(public_url) <= 2000);
comment on column app.editorial_items.status is 'Operations workflow state. Publish jobs move it to published, and unpublishing to on_hold (ADR-005).';
comment on column app.editorial_items.slug is 'Public address segment, fixed at first publication so links keep working.';
comment on column app.editorial_items.ghost_post_id is 'Reserved: Ghost is not used at launch (ADR-005).';

-- ------------------------------------------------------------------------------------------------
-- Articles: the text of each story, written in the desk (SC-021)
-- ------------------------------------------------------------------------------------------------
create table app.articles (
  item_id uuid primary key references app.editorial_items (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 180),
  dek text check (char_length(dek) <= 300),
  body_markdown text not null check (char_length(body_markdown) between 1 and 100000),
  byline text check (char_length(byline) <= 200),
  source_codes text[] not null default '{}' check (cardinality(source_codes) <= 100),
  ai_generated boolean not null default false,
  origin_proposal_id uuid references app.draft_proposals (id),
  revision integer not null default 1 check (revision >= 1),
  human_edited_at timestamptz,
  updated_by uuid not null references app.principals (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on column app.articles.ai_generated is 'The text came from an agent proposal; the public page carries the disclosure (AT-24).';
comment on column app.articles.human_edited_at is 'Last time a person saved or adopted this text. Agents cannot publish a story a person has worked on.';

create table app.article_revisions (
  id bigint generated always as identity primary key,
  item_id uuid not null references app.editorial_items (id) on delete cascade,
  revision integer not null,
  title text not null,
  dek text,
  body_markdown text not null,
  byline text,
  source_codes text[] not null,
  ai_generated boolean not null,
  saved_by uuid not null references app.principals (id),
  saved_at timestamptz not null default now(),
  unique (item_id, revision)
);
comment on table app.article_revisions is 'Every saved version of every article, append-only (corrections and restores, AT-21/AT-24).';

create function private.forbid_revision_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'article revisions are append-only' using errcode = '42501';
end
$$;
create trigger article_revisions_append_only before update or delete on app.article_revisions
  for each row execute function private.forbid_revision_changes();

-- Writes the article and its revision row. Called by app.save_article (people) and by the
-- publisher (an agent's proposal at publication). Never callable directly.
create function private.write_article(
  p_item_id uuid,
  p_title text,
  p_dek text,
  p_body text,
  p_byline text,
  p_source_codes text[],
  p_ai_generated boolean,
  p_origin_proposal uuid,
  p_author uuid,
  p_human boolean
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  next_revision integer;
begin
  insert into app.articles as a (
    item_id, title, dek, body_markdown, byline, source_codes, ai_generated, origin_proposal_id,
    revision, human_edited_at, updated_by
  ) values (
    p_item_id, btrim(p_title), nullif(btrim(p_dek), ''), p_body, nullif(btrim(p_byline), ''),
    coalesce(p_source_codes, '{}'), p_ai_generated, p_origin_proposal, 1,
    case when p_human then now() end, p_author
  )
  on conflict (item_id) do update set
    title = excluded.title, dek = excluded.dek, body_markdown = excluded.body_markdown,
    byline = excluded.byline, source_codes = excluded.source_codes,
    ai_generated = a.ai_generated or excluded.ai_generated,
    origin_proposal_id = coalesce(excluded.origin_proposal_id, a.origin_proposal_id),
    revision = a.revision + 1,
    human_edited_at = case when p_human then now() else a.human_edited_at end,
    updated_by = excluded.updated_by, updated_at = now()
  returning revision into next_revision;
  insert into app.article_revisions (
    item_id, revision, title, dek, body_markdown, byline, source_codes, ai_generated, saved_by
  )
  select item_id, revision, title, dek, body_markdown, byline, source_codes, ai_generated, updated_by
  from app.articles where item_id = p_item_id;
  return next_revision;
end
$$;

-- People save articles here. p_expected_revision is the revision the writer started from (0 for a
-- new article); a mismatch means someone saved in between, and nothing is overwritten (AT-08).
create function app.save_article(
  p_item_id uuid,
  p_title text,
  p_dek text,
  p_body text,
  p_byline text,
  p_source_codes text[],
  p_expected_revision integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  current_revision integer;
  saved integer;
  unknown text[];
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform 1 from app.editorial_items where id = p_item_id for update;
  if not found then
    raise exception 'story not found' using errcode = 'P0002';
  end if;
  select revision into current_revision from app.articles where item_id = p_item_id;
  if coalesce(current_revision, 0) <> coalesce(p_expected_revision, 0) then
    raise exception 'the article changed since you opened it (now revision %)', coalesce(current_revision, 0)
      using errcode = 'SC409';
  end if;
  select array_agg(c) into unknown
  from unnest(coalesce(p_source_codes, '{}')) c
  where not exists (select 1 from app.sources s where s.item_id = p_item_id and s.source_code = c);
  if unknown is not null then
    raise exception 'unknown source IDs: %', array_to_string(unknown, ', ') using errcode = '22023';
  end if;
  saved := private.write_article(
    p_item_id, p_title, p_dek, p_body, p_byline, p_source_codes, false, null, actor, true
  );
  perform private.write_audit(
    'article.saved', 'article', p_item_id::text, 'allowed', null,
    jsonb_build_object('revision', saved, 'characters', char_length(p_body))
  );
  return saved;
end
$$;

-- A person adopts an agent proposal as the story's text (it stays labelled as AI-generated).
create function app.adopt_proposal(p_proposal_id uuid, p_expected_revision integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  prop app.draft_proposals;
  current_revision integer;
  saved integer;
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into prop from app.draft_proposals where id = p_proposal_id;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if prop.status not in ('proposed', 'accepted') then
    raise exception 'proposal is %', prop.status using errcode = '55000';
  end if;
  perform 1 from app.editorial_items where id = prop.item_id for update;
  select revision into current_revision from app.articles where item_id = prop.item_id;
  if coalesce(current_revision, 0) <> coalesce(p_expected_revision, 0) then
    raise exception 'the article changed since you opened it' using errcode = 'SC409';
  end if;
  -- Proposals allow shorter headlines and longer summaries than articles; adopt within article limits.
  saved := private.write_article(
    prop.item_id,
    case when char_length(btrim(prop.title)) >= 3 then left(btrim(prop.title), 180)
         else (select e.title from app.editorial_items e where e.id = prop.item_id) end,
    left(prop.summary, 300), prop.body_markdown, null,
    array(select distinct unnest(prop.source_ids)), true, prop.id, actor, true
  );
  update app.draft_proposals set status = 'accepted' where id = prop.id and status = 'proposed';
  perform private.write_audit(
    'article.adopted', 'article', prop.item_id::text, 'allowed', null,
    jsonb_build_object('proposal_id', prop.id, 'revision', saved)
  );
  return saved;
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Publishing policy (owner) and section lanes
-- ------------------------------------------------------------------------------------------------
create table app.publishing_policy (
  singleton boolean primary key default true check (singleton),
  agents_may_publish boolean not null default false,
  agents_may_email boolean not null default false,
  agent_daily_limit integer not null default 5 check (agent_daily_limit between 0 and 50),
  min_sources integer not null default 2 check (min_sources between 1 and 10),
  disclosure_text text not null default
    'An AI agent wrote this story for Seafood Confidential, using only the sources listed below. Spot an error? Tell us and we will correct it.'
    check (char_length(btrim(disclosure_text)) between 20 and 600),
  updated_by uuid references app.principals (id),
  updated_at timestamptz not null default now()
);
comment on table app.publishing_policy is 'One row. agents_may_publish is the master switch: off stops every agent publication, including queued ones.';
insert into app.publishing_policy default values;

create table app.publishing_lanes (
  section text primary key check (
    section in ('on_the_water', 'at_the_farm', 'the_trade', 'rules_and_reality', 'at_the_table', 'voices')
  ),
  agents_may_publish boolean not null default false,
  updated_by uuid references app.principals (id),
  updated_at timestamptz not null default now()
);
comment on table app.publishing_lanes is 'Sections in which agents may publish while the master switch is on.';
insert into app.publishing_lanes (section)
values ('on_the_water'), ('at_the_farm'), ('the_trade'), ('rules_and_reality'), ('at_the_table'), ('voices');

-- ------------------------------------------------------------------------------------------------
-- Publish jobs (durable, idempotent; SC-011)
-- ------------------------------------------------------------------------------------------------
create table app.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.editorial_items (id) on delete restrict,
  proposal_id uuid references app.draft_proposals (id) on delete restrict,
  action text not null check (action in ('publish', 'republish', 'unpublish')),
  send_email boolean not null default false,
  requested_by uuid not null references app.principals (id),
  requested_via text not null check (requested_via in ('staff', 'agent')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  request_id text not null check (char_length(request_id) between 8 and 128),
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed', 'needs_attention', 'refused', 'cancelled')
  ),
  attempts integer not null default 0 check (attempts between 0 and 20),
  gate_results jsonb not null default '[]'::jsonb check (jsonb_typeof(gate_results) = 'array'),
  acknowledged_warnings text[] not null default '{}' check (cardinality(acknowledged_warnings) <= 20),
  agent_credential_id uuid references private.agent_credentials (id),
  claim_token uuid,
  email_attempted_at timestamptz,
  article_revision integer,
  site_version text check (char_length(site_version) <= 200),
  public_url text check (char_length(public_url) <= 2000),
  newsletter_id text check (char_length(newsletter_id) <= 100),
  outcome_message text check (char_length(outcome_message) <= 1000),
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (requested_by, idempotency_key),
  constraint publish_jobs_email_on_publish check (not send_email or action = 'publish'),
  constraint publish_jobs_agent_scope check (
    requested_via = 'staff' or (action = 'publish' and proposal_id is not null)
  )
);
comment on table app.publish_jobs is 'Every request to change the public site. A job with an uncertain outcome (needs_attention) blocks new jobs for its story until it is resolved (AT-14).';
create index publish_jobs_item on app.publish_jobs (item_id, created_at desc);
create index publish_jobs_recent on app.publish_jobs (created_at desc);
create index publish_jobs_agent_recent on app.publish_jobs (created_at desc) where requested_via = 'agent';
-- One job in flight per story: two publications of the same story can never race.
create unique index publish_jobs_one_in_flight on app.publish_jobs (item_id)
  where status in ('queued', 'running', 'needs_attention');
-- ------------------------------------------------------------------------------------------------
-- Agent identity: remember which credential authenticated, so SQL can check its scopes
-- ------------------------------------------------------------------------------------------------
create or replace function app.authenticate_agent(p_token_prefix text, p_token_hash text)
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
  perform set_config('app.agent_credential_id', c.id::text, true);
  return query select c.principal_id, c.scopes, c.id;
end
$$;

create function private.current_agent_has_scope(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.agent_credentials c
    where c.id = nullif(current_setting('app.agent_credential_id', true), '')::uuid
      and c.principal_id = app.current_agent_principal()
      and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now())
      and p_scope = any (c.scopes)
  )
$$;

-- ------------------------------------------------------------------------------------------------
-- Proposals: a publication is recorded by the publishing workflow only
-- ------------------------------------------------------------------------------------------------
create or replace function private.stamp_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'published' then
      -- Staff, agents and the publisher role cannot set this directly; only the publishing
      -- functions (running as the schema owner) record a publication.
      if current_user in ('anon', 'authenticated', 'desk_agent', 'desk_publisher', 'desk_app') then
        raise exception 'a publication is recorded by the publishing workflow only' using errcode = '42501';
      end if;
      if old.status not in ('proposed', 'accepted') then
        raise exception 'proposal already reviewed' using errcode = '55000';
      end if;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      return new;
    end if;
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

-- ------------------------------------------------------------------------------------------------
-- Content checks shared by the agent gates (blocking) and staff warnings (advisory)
-- ------------------------------------------------------------------------------------------------
create function private.content_findings(p_item_id uuid, p_title text, p_summary text, p_body text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with raw as (
    select concat_ws(E'\n', p_title, p_summary, p_body) as all_text, coalesce(p_body, '') as body
  ), t as (
    -- "flat" is the text as a reader sees it once Markdown escapes, emphasis markers and invisible
    -- characters are removed, so jane\@example.com or jane@exa*mple*.com cannot slip through.
    select raw.*, regexp_replace(raw.all_text, '[\\*_`~\u00AD\u200B-\u200F\u2060\uFEFF]+', '', 'g') as flat
    from raw
  )
  select array_remove(array[
    -- A quotation of about eight words or more, or a Markdown block quote (also inside list items):
    -- quotes need a person to confirm the wording against the source.
    case when t.all_text ~ '["“][^"“”]{40,}["”]'
           or t.body ~ '(^|\n)[ \t]*(([-*+]|[0-9]{1,9}[.)])[ \t]+)*>'
         then 'direct_quote' end,
    -- Email addresses, North American and international phone numbers (a + and at least nine
    -- digits), and any recorded private contact, in the raw or the reader's text.
    case when t.all_text ~ '[A-Za-z0-9._%+-]+[@＠][A-Za-z0-9.-]+\.[A-Za-z]{2,}'
           or t.flat ~ '[A-Za-z0-9._%+-]+[@＠][A-Za-z0-9.-]+\.[A-Za-z]{2,}'
           or t.flat ~ '(\+?1[-. ]?)?\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}'
           or t.flat ~ '\+(?=([^0-9\n]{0,2}[0-9]){9})[0-9]{1,3}([ .-]?\(?[0-9]{1,4}\)?){2,6}'
           or exists (
             select 1 from app.sources s
             where s.item_id = p_item_id
               and char_length(btrim(coalesce(s.private_contact, ''))) >= 6
               and (position(lower(btrim(s.private_contact)) in lower(t.all_text)) > 0
                    or position(lower(btrim(s.private_contact)) in lower(t.flat)) > 0)
           )
         then 'contact_details' end,
    case when t.body ~ '!\[' or t.all_text ~* '<img' then 'embedded_image' end,
    -- HTML, and HTML character references (which Markdown decodes, so they could spell out an
    -- email address, a phone number or quotation marks that the patterns above would not see).
    case when t.all_text ~ '<[A-Za-z!/]'
           or t.all_text ~ '&(#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});'
         then 'raw_html' end
  ], null)
  from t
$$;

-- Links in agent text may point only at the URLs of the sources the text cites (inline links,
-- reference definitions and autolinks are all counted).
create function private.uncited_links(p_item_id uuid, p_body text, p_cited text[])
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with urls as (
    select m[1] as url from regexp_matches(coalesce(p_body, ''), '\]\(\s*<?([^)\s>]+)', 'g') as m
    union all
    select m[1] from regexp_matches(coalesce(p_body, ''), '(?:^|\n)[ \t]{0,3}\[[^]\n]+\]:[ \t]*<?([^\s>]+)', 'g') as m
    union all
    select m[1] from regexp_matches(coalesce(p_body, ''), '<((?:https?|mailto):[^\s>]+)>', 'g') as m
  )
  select count(*)::int
  from urls u
  where not exists (
    select 1 from app.sources s
    where s.item_id = p_item_id and s.source_code = any (p_cited) and s.url is not null
      and rtrim(s.url, '/') = rtrim(u.url, '/')
  )
$$;

-- Sources are cited on the public site only when staff mark them citable: a confidential
-- interview must never appear under a story by accident.
alter table app.sources add column public_citation boolean not null default false;
comment on column app.sources.public_citation is 'Title, publisher and link may appear under a published story. Agents may cite only sources that are readable to them and citable.';
create policy staff_update_sources on app.sources for update to authenticated
  using (app.current_staff_principal() is not null)
  with check (app.current_staff_principal() is not null);
grant update (public_citation) on app.sources to authenticated;

-- The automated release gate for agents. Publishing conditions (switch, lane, grant, people-first,
-- in-flight, format, daily limit, email permission) are checked first; the content checks run only
-- when all of them pass, so content checks never answer questions for agents outside an open lane.
-- p_job excludes a job's own row when the gate is re-run as the job is claimed.
create function private.agent_publish_gates(
  p_agent uuid,
  p_proposal app.draft_proposals,
  p_item app.editorial_items,
  p_send_email boolean,
  p_job uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pol app.publishing_policy;
  lane_open boolean;
  cited text[] := array(select distinct unnest(p_proposal.source_ids));
  publishable integer;
  recent integer;
  in_flight boolean;
  people_wrote boolean;
  findings text[];
  conditions jsonb;
begin
  select * into pol from app.publishing_policy where singleton;
  select l.agents_may_publish into lane_open from app.publishing_lanes l where l.section = p_item.section;
  select count(*) into recent
  from app.publish_jobs j
  where j.requested_via = 'agent'
    and j.status in ('queued', 'running', 'succeeded', 'needs_attention')
    and j.created_at > now() - interval '24 hours'
    and j.id is distinct from p_job;
  select exists (
    select 1 from app.publish_jobs j
    where j.item_id = p_item.id and j.status in ('queued', 'running', 'needs_attention')
      and j.id is distinct from p_job
  ) into in_flight;
  select exists (
    select 1 from app.articles a where a.item_id = p_item.id and a.human_edited_at is not null
  ) into people_wrote;

  conditions := jsonb_build_array(
    jsonb_build_object('gate', 'master_switch', 'pass', pol.agents_may_publish,
      'detail', case when pol.agents_may_publish then 'Agent publishing is on.'
                     else 'Agent publishing is switched off in Settings.' end),
    jsonb_build_object('gate', 'section_lane', 'pass', coalesce(lane_open, false),
      'detail', format('Agents %s publish in the %s section.',
                       case when coalesce(lane_open, false) then 'may' else 'may not' end, p_item.section)),
    jsonb_build_object('gate', 'item_granted', 'pass', exists (
        select 1 from app.agent_item_grants g where g.item_id = p_item.id and g.principal_id = p_agent),
      'detail', 'The brief must be assigned to this agent.'),
    jsonb_build_object('gate', 'own_open_proposal',
      'pass', p_proposal.principal_id = p_agent and p_proposal.item_id = p_item.id
              and p_proposal.status in ('proposed', 'accepted'),
      'detail', format('The proposal must be this agent''s own and still open (it is %s).', p_proposal.status)),
    jsonb_build_object('gate', 'brief_untouched_by_people',
      'pass', p_item.status in ('commissioned', 'drafting') and not people_wrote,
      'detail', case
        when people_wrote then 'A person has written or edited this story, so agents keep out.'
        when p_item.status not in ('commissioned', 'drafting')
          then format('The story is %s, so editors have taken it over.', replace(p_item.status, '_', ' '))
        else 'No person has written this story or taken it into review.' end),
    jsonb_build_object('gate', 'nothing_in_flight', 'pass', not in_flight,
      'detail', case when in_flight then 'Another publish job for this story is still open.'
                     else 'No other publish job is open for this story.' end),
    jsonb_build_object('gate', 'reporting_format',
      'pass', p_item.label = 'reporting' and p_item.format in ('explainer', 'reported_feature'),
      'detail', 'Agents publish explainers and reported features only; opinion, first-person, interviews and sponsored stories need a person.'),
    jsonb_build_object('gate', 'daily_limit', 'pass', recent < pol.agent_daily_limit,
      'detail', format('%s of %s agent publications used in the last 24 hours.', recent, pol.agent_daily_limit)),
    jsonb_build_object('gate', 'newsletter', 'pass', not p_send_email or pol.agents_may_email,
      'detail', case when not p_send_email then 'No newsletter email requested.'
                     when pol.agents_may_email then 'Agents may email subscribers.'
                     else 'Agents may not email subscribers; publish without email.' end)
  );
  if exists (select 1 from jsonb_array_elements(conditions) g where not (g ->> 'pass')::boolean) then
    return conditions;
  end if;

  select count(*) into publishable
  from app.sources s
  where s.item_id = p_item.id and s.agent_processing = 'yes' and s.public_citation
    and s.source_code = any (cited);
  findings := private.content_findings(p_item.id, p_proposal.title, p_proposal.summary, p_proposal.body_markdown);
  return conditions || jsonb_build_array(
    jsonb_build_object('gate', 'headline_and_summary',
      'pass', char_length(btrim(p_proposal.title)) between 3 and 180 and coalesce(char_length(p_proposal.summary), 0) <= 300,
      'detail', 'A headline of 3 to 180 characters and a summary of at most 300.'),
    jsonb_build_object('gate', 'enough_sources', 'pass', cardinality(cited) >= pol.min_sources,
      'detail', format('Cites %s source(s); at least %s required.', cardinality(cited), pol.min_sources)),
    jsonb_build_object('gate', 'sources_publishable', 'pass', publishable = cardinality(cited) and cardinality(cited) > 0,
      'detail', 'Every cited source must be readable by the agent and marked citable by staff.'),
    jsonb_build_object('gate', 'links_to_cited_sources',
      'pass', private.uncited_links(p_item.id, p_proposal.body_markdown, cited) = 0,
      'detail', 'Links may point only at the cited sources.'),
    jsonb_build_object('gate', 'no_direct_quotes', 'pass', not ('direct_quote' = any (findings)),
      'detail', 'Paraphrase and cite instead of quoting; quotes need a person to check them.'),
    jsonb_build_object('gate', 'no_contact_details', 'pass', not ('contact_details' = any (findings)),
      'detail', 'No email addresses, phone numbers or private contact details.'),
    jsonb_build_object('gate', 'no_images', 'pass', not ('embedded_image' = any (findings)),
      'detail', 'Agents cannot confirm image rights, so agent stories carry no images.'),
    jsonb_build_object('gate', 'no_raw_html', 'pass', not ('raw_html' = any (findings)),
      'detail', 'Markdown only; no HTML or HTML character references.'),
    jsonb_build_object('gate', 'length', 'pass', char_length(p_proposal.body_markdown) between 400 and 30000,
      'detail', format('Body is %s characters; 400 to 30,000 allowed.', char_length(p_proposal.body_markdown)))
  );
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Requests
-- ------------------------------------------------------------------------------------------------
create function app.agent_request_publish(
  p_proposal_id uuid,
  p_send_email boolean,
  p_idempotency_key text,
  p_payload_hash text,
  p_request_id text
)
returns table (job_id uuid, job_status text, replayed boolean, gate_results jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  agent uuid := app.current_agent_principal();
  credential uuid := nullif(current_setting('app.agent_credential_id', true), '')::uuid;
  existing app.publish_jobs;
  prop app.draft_proposals;
  it app.editorial_items;
  gates jsonb;
  passed boolean;
  refusals integer;
  new_id uuid;
begin
  if agent is null or not private.current_agent_has_scope('drafts.publish') then
    raise exception 'not authorized to publish' using errcode = '42501';
  end if;
  -- Serialize agent publication requests so the daily limit and in-flight checks are exact.
  perform pg_advisory_xact_lock(hashtextextended('sc.agent_publish', 0));
  select * into existing from app.publish_jobs j
  where j.requested_by = agent and j.idempotency_key = p_idempotency_key;
  if found then
    if existing.payload_hash <> p_payload_hash then
      raise exception 'idempotency key reused with a different request' using errcode = 'SC409';
    end if;
    return query select existing.id, existing.status, true, existing.gate_results;
    return;
  end if;
  select * into prop from app.draft_proposals d where d.id = p_proposal_id and d.principal_id = agent;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  select * into it from app.editorial_items e where e.id = prop.item_id for update;
  -- Refusals are budgeted, so the checks cannot be used to probe for long.
  select count(*) into refusals
  from app.publish_jobs j
  where j.requested_by = agent and j.status = 'refused' and j.created_at > now() - interval '24 hours';
  if refusals >= 10 then
    gates := jsonb_build_array(jsonb_build_object('gate', 'refusal_limit', 'pass', false,
      'detail', 'Too many refused publishing requests in the last 24 hours; an editor needs to look before this agent tries again.'));
  else
    gates := private.agent_publish_gates(agent, prop, it, coalesce(p_send_email, false));
  end if;
  passed := not exists (select 1 from jsonb_array_elements(gates) g where not (g ->> 'pass')::boolean);
  insert into app.publish_jobs (
    item_id, proposal_id, action, send_email, requested_by, requested_via, agent_credential_id, idempotency_key,
    payload_hash, request_id, status, gate_results, finished_at, outcome_message
  ) values (
    it.id, prop.id, 'publish', coalesce(p_send_email, false), agent, 'agent', credential, p_idempotency_key,
    p_payload_hash, p_request_id, case when passed then 'queued' else 'refused' end, gates,
    case when passed then null else now() end,
    case when passed then null else 'Refused by the automated publishing checks; nothing was published.' end
  )
  returning id into new_id;
  perform private.write_audit(
    case when passed then 'publish.requested' else 'publish.refused' end, 'publish_job', new_id::text,
    case when passed then 'allowed' else 'denied' end, p_request_id,
    jsonb_build_object(
      'via', 'agent', 'item_id', it.id, 'content_id', it.content_id, 'proposal_id', prop.id,
      'send_email', coalesce(p_send_email, false),
      'failed_gates', (
        select coalesce(jsonb_agg(g -> 'gate'), '[]'::jsonb)
        from jsonb_array_elements(gates) g where not (g ->> 'pass')::boolean
      )
    )
  );
  return query select new_id, case when passed then 'queued' else 'refused' end, false, gates;
end
$$;

-- Staff publishing. People are never blocked: checks come back as warnings, and a request that
-- acknowledges them goes ahead. Owners and managing editors publish, update and unpublish (D06);
-- every staff member can write.
create function app.staff_request_publish(
  p_item_id uuid,
  p_action text,
  p_send_email boolean,
  p_acknowledged text[],
  p_idempotency_key text,
  p_payload_hash text,
  p_request_id text
)
returns table (job_id uuid, job_status text, replayed boolean, warnings text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  existing app.publish_jobs;
  it app.editorial_items;
  art app.articles;
  warn text[] := '{}';
  new_id uuid;
begin
  if actor is null or not app.has_staff_role('owner', 'managing_editor') then
    raise exception 'only owners and managing editors publish' using errcode = '42501';
  end if;
  if p_action not in ('publish', 'republish', 'unpublish') then
    raise exception 'unknown publishing action' using errcode = '22023';
  end if;
  select * into existing from app.publish_jobs j
  where j.requested_by = actor and j.idempotency_key = p_idempotency_key;
  if found then
    if existing.payload_hash <> p_payload_hash then
      raise exception 'idempotency key reused with a different request' using errcode = 'SC409';
    end if;
    return query select existing.id, existing.status, true, existing.acknowledged_warnings;
    return;
  end if;
  select * into it from app.editorial_items e where e.id = p_item_id for update;
  if not found then
    raise exception 'story not found' using errcode = 'P0002';
  end if;
  select * into art from app.articles a where a.item_id = it.id;
  if p_action in ('publish', 'republish') and art.item_id is null then
    raise exception 'write the story (or adopt a proposal) before publishing' using errcode = '22023';
  end if;
  if p_action = 'republish' and it.status <> 'published' then
    raise exception 'only a published story can be updated' using errcode = '22023';
  end if;
  if p_action = 'publish' and it.status = 'published' then
    raise exception 'this story is already live; update it instead' using errcode = '22023';
  end if;
  if p_action = 'unpublish' and it.status <> 'published' then
    raise exception 'nothing to unpublish' using errcode = '22023';
  end if;
  if coalesce(p_send_email, false) and p_action <> 'publish' then
    raise exception 'email goes out only with a first publication' using errcode = '22023';
  end if;
  if exists (
    select 1 from app.publish_jobs j
    where j.item_id = it.id and j.status in ('queued', 'running', 'needs_attention')
  ) then
    raise exception 'another publish job for this story is still open' using errcode = 'SC409';
  end if;

  if p_action in ('publish', 'republish') then
    if not exists (select 1 from app.sources s where s.item_id = it.id) then
      warn := array_append(warn, 'no_sources_recorded');
    end if;
    if exists (select 1 from app.asset_rights a where a.item_id = it.id and a.status <> 'cleared') then
      warn := array_append(warn, 'assets_not_cleared');
    end if;
    warn := warn || array(
      select 'text_' || f from unnest(private.content_findings(it.id, art.title, art.dek, art.body_markdown)) f
      where f <> 'direct_quote' or art.ai_generated
    );
  end if;
  if coalesce(p_send_email, false) and exists (
    select 1 from app.publish_jobs j where j.item_id = it.id and j.email_attempted_at is not null
  ) then
    warn := array_append(warn, 'already_emailed');
  end if;
  if exists (select 1 from unnest(warn) w where not (w = any (coalesce(p_acknowledged, '{}')))) then
    return query select null::uuid, 'needs_confirmation'::text, false, warn;
    return;
  end if;

  insert into app.publish_jobs (
    item_id, action, send_email, requested_by, requested_via, idempotency_key, payload_hash, request_id,
    acknowledged_warnings, article_revision
  ) values (
    it.id, p_action, coalesce(p_send_email, false), actor, 'staff', p_idempotency_key, p_payload_hash,
    p_request_id, warn, art.revision
  )
  returning id into new_id;
  perform private.write_audit(
    'publish.requested', 'publish_job', new_id::text, 'allowed', p_request_id,
    jsonb_build_object(
      'via', 'staff', 'action', p_action, 'item_id', it.id, 'content_id', it.content_id,
      'send_email', coalesce(p_send_email, false), 'acknowledged', warn, 'revision', art.revision
    )
  );
  return query select new_id, 'queued'::text, false, warn;
end
$$;


create function app.retry_publish_job(p_job_id uuid)
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
  update app.publish_jobs
  set status = 'queued', outcome_message = null, lease_until = null, finished_at = null, claim_token = null
  where id = p_job_id
    and (status in ('failed', 'needs_attention') or (status = 'running' and lease_until < now()));
  if not found then
    -- A queued job needs no change; the caller runs it.
    return exists (select 1 from app.publish_jobs where id = p_job_id and status = 'queued');
  end if;
  perform private.write_audit('publish.retry', 'publish_job', p_job_id::text, 'allowed', null, '{}'::jsonb);
  return true;
end
$$;

create function app.cancel_publish_job(p_job_id uuid)
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
  update app.publish_jobs
  set status = 'cancelled', finished_at = now(), lease_until = null, claim_token = null,
      outcome_message = coalesce(outcome_message, 'Cancelled by an editor.')
  where id = p_job_id
    and (status in ('queued', 'failed', 'needs_attention') or (status = 'running' and lease_until < now()));
  if not found then
    return false;
  end if;
  perform private.write_audit('publish.cancel', 'publish_job', p_job_id::text, 'allowed', null, '{}'::jsonb);
  return true;
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Policy management
-- ------------------------------------------------------------------------------------------------
create function app.set_publishing_policy(
  p_agents_may_publish boolean,
  p_agents_may_email boolean,
  p_agent_daily_limit integer,
  p_min_sources integer,
  p_disclosure_text text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  before app.publishing_policy;
begin
  if actor is null or not app.has_staff_role('owner') then
    raise exception 'only owners change the publishing policy' using errcode = '42501';
  end if;
  select * into before from app.publishing_policy where singleton for update;
  update app.publishing_policy
  set agents_may_publish = p_agents_may_publish,
      agents_may_email = p_agents_may_email,
      agent_daily_limit = p_agent_daily_limit,
      min_sources = p_min_sources,
      disclosure_text = btrim(p_disclosure_text),
      updated_by = actor,
      updated_at = now()
  where singleton;
  if not p_agents_may_publish then
    perform private.cancel_queued_agent_jobs();
  end if;
  perform private.write_audit(
    'publishing.policy', 'publishing_policy', 'policy', 'allowed', null,
    jsonb_build_object(
      'agents_may_publish', p_agents_may_publish, 'was', before.agents_may_publish,
      'agents_may_email', p_agents_may_email, 'agent_daily_limit', p_agent_daily_limit,
      'min_sources', p_min_sources
    )
  );
end
$$;

create function private.cancel_queued_agent_jobs()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update app.publish_jobs
  set status = 'cancelled', finished_at = now(),
      outcome_message = 'Agent publishing was switched off before this job ran.'
  where requested_via = 'agent' and status = 'queued';
  get diagnostics n = row_count;
  return n;
end
$$;

-- The off switch is for everyone on staff: anyone who sees a problem can stop agent publishing.
create function app.stop_agent_publishing()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
  n integer;
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update app.publishing_policy
  set agents_may_publish = false, updated_by = actor, updated_at = now()
  where singleton;
  n := private.cancel_queued_agent_jobs();
  perform private.write_audit(
    'publishing.stop', 'publishing_policy', 'policy', 'allowed', null, jsonb_build_object('cancelled_jobs', n)
  );
  return n;
end
$$;

create function app.set_publishing_lane(p_section text, p_agents_may_publish boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
begin
  if actor is null or not app.has_staff_role('owner') then
    raise exception 'only owners change publishing lanes' using errcode = '42501';
  end if;
  update app.publishing_lanes
  set agents_may_publish = p_agents_may_publish, updated_by = actor, updated_at = now()
  where section = p_section;
  if not found then
    raise exception 'unknown section' using errcode = '22023';
  end if;
  perform private.write_audit(
    'publishing.lane', 'publishing_lane', p_section, 'allowed', null,
    jsonb_build_object('agents_may_publish', p_agents_may_publish)
  );
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Publisher context (desk server only): claim, snapshot, record outcomes
-- ------------------------------------------------------------------------------------------------
create function private.slug_for(p_title text, p_content_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Letters with diacritics become their base letter (São → sao, Pêche → peche); then truncate
  -- before trimming hyphens, so the result never has a doubled or leading hyphen. Titles with no
  -- Latin letters or digits fall back to "story".
  select coalesce(nullif(base, ''), 'story') || '-' || lower(replace(p_content_id, 'SC-', ''))
  from (
    select trim(both '-' from left(regexp_replace(lower(translate(
             replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_title, ''),
               'ß', 'ss'), 'Æ', 'ae'), 'æ', 'ae'), 'Œ', 'oe'), 'œ', 'oe'), 'Þ', 'th'), 'þ', 'th'), '&', ' and '),
             'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïðñòóôõöøùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĴĵĶķĹĺĻļĽľĿŀŁłŃńŅņŇňŉŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſƀƚƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳ',
             'aaaaaaceeeeiiiidnoooooouuuuyaaaaaaceeeeiiiidnoooooouuuuyyaaaaaaccccccccddddeeeeeeeeeegggggggghhhhiiiiiiiiiijjkkllllllllllnnnnnnnoooooorrrrrrssssssssttttttuuuuuuuuuuuuwwyyyzzzzzzsbloouuaaiioouuuuuuuuuuaaaaggkkoooojggnnaaaaaaeeeeiiiioooorrrruuuusstthhaaeeooooooooyy')), '[^a-z0-9]+', '-', 'g'), 72)) as base
  ) s
$$;

-- Claims a job to run. Returns the claim (with a token that fences every later step: a worker whose
-- lease expired cannot snapshot, email or complete), or {"busy": true} when another site build
-- holds the lease, {"cancelled": true, "message"} when an agent job's conditions no longer hold,
-- {"failed": true, "message"} when the job could not be prepared, or null when there is nothing to
-- run (finished, or running under a live lease).
create function app.claim_publish_job(p_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j app.publish_jobs;
  it app.editorial_items;
  prop app.draft_proposals;
  art app.articles;
  gates jsonb;
  reason text;
  token uuid := gen_random_uuid();
  publish_title text;
  already_live boolean;
begin
  -- One site build at a time: every deploy is a full snapshot, so two concurrent builds could
  -- drop each other's story. A busy answer leaves the job queued for the next run.
  perform pg_advisory_xact_lock(hashtextextended('sc.site_deploy', 0));
  select * into j from app.publish_jobs where id = p_job_id for update;
  if not found or not (j.status = 'queued' or (j.status = 'running' and j.lease_until < now())) then
    return null;
  end if;
  if exists (
    select 1 from app.publish_jobs o where o.status = 'running' and o.lease_until > now() and o.id <> j.id
  ) then
    return jsonb_build_object('busy', true);
  end if;
  select * into it from app.editorial_items where id = j.item_id for update;

  -- A retry of a job whose revision is already the live one only finishes the job (the email is
  -- never resent), so it publishes nothing new and is not re-checked.
  already_live := j.article_revision is not null and it.status = 'published'
                  and it.published_revision is not distinct from j.article_revision;

  if j.requested_via = 'agent' and not already_live then
    -- Everything that allowed the request must still hold when the job runs.
    select * into prop from app.draft_proposals where id = j.proposal_id;
    if not exists (
         select 1 from private.agent_credentials c
         where c.id = j.agent_credential_id and c.principal_id = j.requested_by and c.revoked_at is null
           and (c.expires_at is null or c.expires_at > now()) and 'drafts.publish' = any (c.scopes)
       )
       or not exists (select 1 from app.principals p where p.id = j.requested_by and p.status = 'active') then
      reason := 'The agent''s token or account was revoked before this job ran.';
    else
      gates := private.agent_publish_gates(j.requested_by, prop, it, j.send_email, j.id);
      select string_agg(g ->> 'gate', ', ') into reason
      from jsonb_array_elements(gates) g where not (g ->> 'pass')::boolean;
      if reason is not null then
        reason := 'Conditions changed before this job ran; now failing: ' || reason || '.';
      end if;
    end if;
    if reason is not null then
      update app.publish_jobs
      set status = 'cancelled', finished_at = now(), lease_until = null, claim_token = null,
          outcome_message = left(reason, 1000)
      where id = j.id;
      perform private.write_audit('publish.cancelled', 'publish_job', j.id::text, 'denied', j.request_id,
        jsonb_build_object('reason', left(reason, 300), 'item_id', it.id));
      return jsonb_build_object('cancelled', true, 'message', left(reason, 1000));
    end if;
  end if;

  -- Prepare the text and the address. A job that cannot be prepared fails instead of staying
  -- queued, so it never blocks the jobs behind it.
  begin
    -- An agent job writes its proposal as the article on its first run and freezes that revision;
    -- a retry keeps it, so text a person saved since is never published under the agent's job.
    if j.requested_via = 'agent' and j.article_revision is null then
      select * into art from app.articles where item_id = it.id;
      if art.item_id is null or art.origin_proposal_id is distinct from prop.id then
        perform private.write_article(
          it.id, prop.title, prop.summary, prop.body_markdown, null,
          array(select distinct unnest(prop.source_ids)), true, prop.id, j.requested_by, false
        );
        select * into art from app.articles where item_id = it.id;
      end if;
      j.article_revision := art.revision;
    end if;
    if j.action <> 'unpublish' then
      select r.title into publish_title
      from app.article_revisions r where r.item_id = it.id and r.revision = j.article_revision;
      if publish_title is null then
        raise exception 'the revision to publish (%) does not exist', j.article_revision;
      end if;
      if it.slug is null then
        update app.editorial_items set slug = private.slug_for(publish_title, it.content_id) where id = it.id;
      end if;
    end if;
  exception when others then
    update app.publish_jobs
    set status = 'failed', finished_at = now(), lease_until = null, claim_token = null,
        outcome_message = left('This job could not be prepared: ' || sqlerrm, 1000)
    where id = j.id;
    perform private.write_audit('publish.failed', 'publish_job', j.id::text, 'error', j.request_id,
      jsonb_build_object('stage', 'claim', 'error', left(sqlerrm, 300)));
    -- The database's message stays in the job record for editors.
    return jsonb_build_object('failed', true, 'message', 'This job could not be prepared; an editor can see why on the Publishing page.');
  end;

  update app.publish_jobs
  set status = 'running', attempts = attempts + 1, lease_until = now() + interval '5 minutes',
      started_at = coalesce(started_at, now()), claim_token = token, article_revision = j.article_revision
  where id = j.id
  returning * into j;
  select * into it from app.editorial_items where id = j.item_id;
  return jsonb_build_object(
    'jobId', j.id,
    'claimToken', token,
    'action', j.action,
    'sendEmail', j.send_email,
    'requestedVia', j.requested_via,
    'requestId', j.request_id,
    'attempt', j.attempts,
    'emailAttempted', j.email_attempted_at is not null,
    'item', jsonb_build_object('id', it.id, 'contentId', it.content_id, 'slug', it.slug, 'section', it.section)
  );
end
$$;

-- Keeps a running job's lease alive during a long deploy; false means the claim was lost.
create function app.renew_publish_lease(p_job_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update app.publish_jobs set lease_until = now() + interval '5 minutes'
  where id = p_job_id and status = 'running' and claim_token = p_claim_token;
  return found;
end
$$;

-- The oldest job waiting to run (queued, or running with an expired lease), for the follow-up sweep.
create function app.next_publish_job()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from app.publish_jobs
  where status = 'queued' or (status = 'running' and lease_until < now())
  order by created_at
  limit 1
$$;

-- What the public site shows, as of this job. Every other story is rebuilt from the revision that
-- was published (never from text edited since), and only stories the publishing functions marked
-- live are included; the job's own story uses the revision the job froze.
create function app.site_snapshot(p_job_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j app.publish_jobs;
  pol app.publishing_policy;
begin
  select * into j from app.publish_jobs
  where id = p_job_id and status = 'running' and claim_token = p_claim_token;
  if not found then
    raise exception 'job is not running under this claim' using errcode = '55000';
  end if;
  select * into pol from app.publishing_policy where singleton;
  return jsonb_build_object(
    'disclosure', pol.disclosure_text,
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contentId', i.content_id,
        'slug', i.slug,
        'title', r.title,
        'dek', r.dek,
        'bodyMarkdown', r.body_markdown,
        'byline', r.byline,
        'section', i.section,
        'label', i.label,
        'format', i.format,
        'aiGenerated', r.ai_generated,
        'revision', r.revision,
        'publishedAt', coalesce(i.published_at, now()),
        'updatedAt', case
          when i.id = j.item_id and j.action = 'republish' then now()
          when i.id = j.item_id then coalesce(i.published_at, now())
          else greatest(coalesce(i.published_at, r.saved_at), r.saved_at) end,
        'sources', coalesce((
          select jsonb_agg(jsonb_build_object(
            'sourceCode', s.source_code, 'title', s.title, 'publisher', s.publisher, 'url', s.url,
            'publishedOn', s.published_on
          ) order by s.source_code)
          from app.sources s
          where s.item_id = i.id and s.public_citation and s.source_code = any (r.source_codes)
        ), '[]'::jsonb)
      ) order by coalesce(i.published_at, now()) desc, i.content_id)
      from app.editorial_items i
      join app.article_revisions r
        on r.item_id = i.id
       and r.revision = case when i.id = j.item_id then j.article_revision else i.published_revision end
      where i.slug is not null
        and (
          (i.id = j.item_id and j.action in ('publish', 'republish'))
          or (i.id <> j.item_id and i.published_revision is not null)
        )
    ), '[]'::jsonb)
  );
end
$$;

-- Records the newsletter attempt before the request is made, at most once per job: true means
-- this worker may send; false means an attempt already happened (or the claim was lost).
create function app.mark_email_attempt(p_job_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update app.publish_jobs set email_attempted_at = now()
  where id = p_job_id and status = 'running' and claim_token = p_claim_token and send_email
    and email_attempted_at is null;
  if not found then
    return false;
  end if;
  perform private.write_audit('publish.email_attempt', 'publish_job', p_job_id::text, 'allowed', null, '{}'::jsonb);
  return true;
end
$$;

create function app.complete_publish_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_status text,
  p_site_deployed boolean,
  p_public_url text,
  p_site_version text,
  p_newsletter_id text,
  p_message text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  j app.publish_jobs;
begin
  if p_status not in ('succeeded', 'failed', 'needs_attention') then
    raise exception 'unknown outcome' using errcode = '22023';
  end if;
  select * into j from app.publish_jobs where id = p_job_id for update;
  if not found or j.status <> 'running' or j.claim_token is distinct from p_claim_token then
    raise exception 'job is not running under this claim' using errcode = '55000';
  end if;
  update app.publish_jobs
  set status = p_status,
      public_url = coalesce(p_public_url, public_url),
      site_version = coalesce(p_site_version, site_version),
      newsletter_id = coalesce(p_newsletter_id, newsletter_id),
      outcome_message = left(p_message, 1000),
      lease_until = null,
      claim_token = null,
      finished_at = case when p_status = 'needs_attention' then null else now() end
  where id = j.id;

  -- The site reflects the job as soon as it was deployed, even if a later step (the email) failed.
  if p_site_deployed then
    if j.action in ('publish', 'republish') then
      update app.editorial_items
      set status = 'published',
          published_at = coalesce(published_at, now()),
          published_by = coalesce(published_by, j.requested_by),
          published_via = coalesce(published_via, j.requested_via),
          published_revision = j.article_revision,
          public_url = coalesce(p_public_url, public_url)
      where id = j.item_id;
      if j.proposal_id is not null then
        update app.draft_proposals set status = 'published'
        where id = j.proposal_id and status in ('proposed', 'accepted');
      end if;
    else
      update app.editorial_items
      set status = 'on_hold', published_at = null, published_by = null, published_via = null,
          published_revision = null, public_url = null
      where id = j.item_id;
    end if;
  end if;

  perform private.write_audit(
    'publish.' || p_status, 'publish_job', j.id::text,
    case when p_status = 'succeeded' then 'allowed' else 'error' end, j.request_id,
    jsonb_build_object(
      'via', j.requested_via, 'action', j.action, 'item_id', j.item_id, 'site_deployed', p_site_deployed,
      'revision', j.article_revision, 'site_version', p_site_version, 'send_email', j.send_email,
      'newsletter_id', p_newsletter_id, 'attempt', j.attempts, 'message', left(p_message, 300)
    )
  );
end
$$;

-- Publication state belongs to the publishing workflow: no API role can move a story to or from
-- Published by hand (the live site is decided by published_revision, which only the publishing
-- functions write).
create function private.guard_publication_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'desk_agent', 'desk_publisher', 'desk_app')
     and (
       (tg_op = 'INSERT' and new.status = 'published')
       or (tg_op = 'UPDATE' and new.status is distinct from old.status
           and (new.status = 'published' or old.status = 'published'))
     ) then
    raise exception 'publish and unpublish from the Publishing panel' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger editorial_items_guard_publication
  before insert or update of status on app.editorial_items
  for each row execute function private.guard_publication_state();

-- ------------------------------------------------------------------------------------------------
-- Row Level Security and grants
-- ------------------------------------------------------------------------------------------------
alter table app.articles enable row level security;
alter table app.article_revisions enable row level security;
alter table app.publishing_policy enable row level security;
alter table app.publishing_lanes enable row level security;
alter table app.publish_jobs enable row level security;

create policy staff_read_articles on app.articles for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_read_revisions on app.article_revisions for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_read_policy on app.publishing_policy for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_read_lanes on app.publishing_lanes for select to authenticated
  using (app.current_staff_principal() is not null);
create policy staff_read_publish_jobs on app.publish_jobs for select to authenticated
  using (app.current_staff_principal() is not null);
create policy agent_read_own_publish_jobs on app.publish_jobs for select to desk_agent
  using (requested_by = app.current_agent_principal());

revoke all on app.articles, app.article_revisions, app.publishing_policy, app.publishing_lanes, app.publish_jobs
  from public, anon, authenticated, service_role, desk_agent, desk_publisher;

-- Staff read everything here and write only through the functions below.
grant select on app.articles, app.article_revisions, app.publishing_policy, app.publishing_lanes,
  app.publish_jobs to authenticated;
grant select (
  id, item_id, proposal_id, action, send_email, requested_by, idempotency_key, request_id, status, gate_results,
  public_url, outcome_message, created_at, started_at, finished_at
) on app.publish_jobs to desk_agent;
grant select (published_at, published_via) on app.editorial_items to desk_agent;

-- New functions start with no privileges at all (PUBLIC included); grants below are the only access.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' and p.proname in (
             'forbid_revision_changes', 'write_article', 'current_agent_has_scope', 'content_findings',
             'agent_publish_gates', 'cancel_queued_agent_jobs', 'slug_for', 'uncited_links',
             'guard_publication_state'))
       or (n.nspname = 'app' and p.proname in (
             'save_article', 'adopt_proposal', 'agent_request_publish', 'staff_request_publish',
             'retry_publish_job', 'cancel_publish_job', 'set_publishing_policy', 'stop_agent_publishing',
             'set_publishing_lane', 'claim_publish_job', 'site_snapshot', 'mark_email_attempt',
             'complete_publish_job', 'next_publish_job', 'renew_publish_lease'))
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role, desk_agent, desk_publisher', f
    );
  end loop;
end
$$;

grant execute on function app.save_article(uuid, text, text, text, text, text[], integer) to authenticated;
grant execute on function app.adopt_proposal(uuid, integer) to authenticated;
grant execute on function app.agent_request_publish(uuid, boolean, text, text, text) to desk_agent;
grant execute on function app.staff_request_publish(uuid, text, boolean, text[], text, text, text) to authenticated;
grant execute on function app.retry_publish_job(uuid) to authenticated;
grant execute on function app.cancel_publish_job(uuid) to authenticated;
grant execute on function app.set_publishing_policy(boolean, boolean, integer, integer, text) to authenticated;
grant execute on function app.stop_agent_publishing() to authenticated;
grant execute on function app.set_publishing_lane(text, boolean) to authenticated;
grant execute on function app.claim_publish_job(uuid) to desk_publisher;
grant execute on function app.site_snapshot(uuid, uuid) to desk_publisher;
grant execute on function app.renew_publish_lease(uuid, uuid) to desk_publisher;
grant execute on function app.next_publish_job() to desk_publisher;
grant execute on function app.mark_email_attempt(uuid, uuid) to desk_publisher;
grant execute on function app.complete_publish_job(uuid, uuid, text, boolean, text, text, text, text) to desk_publisher;
