-- Story images (v0.7.0, SC-003; docs/DESK.md "Story images").
--
-- * One lead ("hero") image per story, always tied to a rights record (app.asset_rights): its
--   provenance (documentary, illustrative, generated), licence and credit. An image reaches the public
--   site only while that record is cleared and permits the web.
-- * The desk makes the renditions (AVIF and WebP at several widths, metadata stripped) when the
--   image is attached; they are stored here, beside the story, so a publication reads text and
--   images under the same claim token, in one place. The uploaded original is kept too.
-- * What is live is what was published, for images as for text: publishing pins the story's cleared
--   lead image (editorial_items.published_image_id). Replacing or removing an image on a live story
--   changes the site only when someone updates the story; until then the pinned image stays.
-- * Agents never publish a story that has a lead image (the no_images gate): image rights need a person.
-- * Fix (found while adding this): staff could insert a story with publication fields already set
--   (slug, published_revision, ...), which would have put it on the site at the next rebuild without
--   the publishing workflow. Inserts by API roles may no longer set them.

-- ------------------------------------------------------------------------------------------------
-- New stories start unpublished
-- ------------------------------------------------------------------------------------------------
alter table app.editorial_items add column published_image_id uuid;

create function private.guard_new_item_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'desk_agent', 'desk_publisher', 'desk_app')
     and (new.slug is not null or new.published_revision is not null or new.published_at is not null
          or new.published_by is not null or new.published_via is not null or new.public_url is not null
          or new.published_image_id is not null) then
    raise exception 'publication fields are set only by publishing' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger editorial_items_guard_new_publication
  before insert on app.editorial_items
  for each row execute function private.guard_new_item_publication();

-- ------------------------------------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------------------------------------
create table app.story_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.editorial_items (id) on delete cascade,
  asset_rights_id uuid not null references app.asset_rights (id) on delete restrict,
  role text not null default 'hero' check (role in ('hero')),
  alt_text text not null check (char_length(btrim(alt_text)) between 5 and 300),
  caption text check (char_length(caption) <= 400),
  focal_x numeric(4, 3) not null default 0.5 check (focal_x between 0 and 1),
  focal_y numeric(4, 3) not null default 0.5 check (focal_y between 0 and 1),
  width integer not null check (width between 320 and 20000),
  height integer not null check (height between 160 and 20000),
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  original_media_type text not null
    check (original_media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  superseded_at timestamptz,
  created_by uuid references app.principals (id),
  created_at timestamptz not null default now()
);
comment on table app.story_images is
  'A story''s lead image and its rights record. superseded_at marks an image replaced or removed while the live site still shows it (editorial_items.published_image_id).';
create unique index story_images_one_current on app.story_images (item_id, role) where superseded_at is null;
create index story_images_rights on app.story_images (asset_rights_id);

alter table app.editorial_items
  add constraint editorial_items_published_image
  foreign key (published_image_id) references app.story_images (id) on delete set null;
comment on column app.editorial_items.published_image_id is
  'The lead image the live site shows, pinned when the story was last published (v0.7.0).';

create table private.story_image_files (
  image_id uuid not null references app.story_images (id) on delete cascade,
  format text not null check (format in ('avif', 'webp')),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  body bytea not null check (octet_length(body) between 1 and 8388608),
  primary key (image_id, format, width)
);

create table private.story_image_originals (
  image_id uuid primary key references app.story_images (id) on delete cascade,
  media_type text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  body bytea not null check (octet_length(body) between 1 and 26214400)
);

alter table app.story_images enable row level security;
-- The files are reached only through the functions below (no policies: no direct access).
alter table private.story_image_files enable row level security;
alter table private.story_image_originals enable row level security;
create policy staff_read_story_images on app.story_images for select to authenticated
  using (app.current_staff_principal() is not null);
revoke all on app.story_images from public, anon, authenticated, service_role, desk_agent, desk_publisher, desk_app;
revoke all on private.story_image_files, private.story_image_originals
  from public, anon, authenticated, service_role, desk_agent, desk_publisher, desk_app;
-- Staff read the image records; every change goes through the functions below.
grant select on app.story_images to authenticated;

-- ------------------------------------------------------------------------------------------------
-- Pinning: publishing fixes which image the live site shows
-- ------------------------------------------------------------------------------------------------
create function private.pin_published_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published_revision is null then
    new.published_image_id := null;
  else
    select s.id into new.published_image_id
    from app.story_images s
    join app.asset_rights ar on ar.id = s.asset_rights_id
    where s.item_id = new.id and s.role = 'hero' and s.superseded_at is null
      and ar.status = 'cleared' and 'web' = any (ar.permitted_uses);
  end if;
  return new;
end
$$;

create trigger editorial_items_pin_image
  before update of published_revision on app.editorial_items
  for each row execute function private.pin_published_image();

-- Once a newer image is live (or the story comes down), replaced images are no longer needed.
create function private.drop_replaced_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app.story_images s
  where s.item_id = new.id and s.superseded_at is not null and s.id is distinct from new.published_image_id;
  return null;
end
$$;

create trigger editorial_items_drop_replaced_images
  after update of published_revision on app.editorial_items
  for each row execute function private.drop_replaced_images();

-- ------------------------------------------------------------------------------------------------
-- Attaching and removing (staff, or an operator script)
-- ------------------------------------------------------------------------------------------------
-- Staff (any desk role) or the database owner (operator scripts, such as the sample loader).
create function private.assert_image_editor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_staff_principal();
begin
  if actor is null and coalesce(nullif(current_setting('role', true), ''), 'none') <> 'none' then
    raise exception 'only staff manage story images' using errcode = '42501';
  end if;
  return actor;
end
$$;

-- Retire the current lead image: kept while the live site shows it, deleted otherwise.
create function private.retire_story_image(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev uuid;
begin
  select s.id into prev from app.story_images s
  where s.item_id = p_item_id and s.role = 'hero' and s.superseded_at is null;
  if prev is not null then
    if exists (select 1 from app.editorial_items e where e.id = p_item_id and e.published_image_id = prev) then
      update app.story_images set superseded_at = now() where id = prev;
    else
      delete from app.story_images where id = prev;
    end if;
  end if;
  delete from app.story_images s
  where s.item_id = p_item_id and s.superseded_at is not null
    and not exists (select 1 from app.editorial_items e where e.id = p_item_id and e.published_image_id = s.id);
  return prev;
end
$$;

create function app.attach_story_image(
  p_item_id uuid,
  p_asset_rights_id uuid,
  p_alt text,
  p_caption text,
  p_focal_x numeric,
  p_focal_y numeric,
  p_width integer,
  p_height integer,
  p_original_sha256 text,
  p_original_media_type text,
  p_variants jsonb,
  p_bodies bytea[],
  p_original bytea default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_image_editor();
  it app.editorial_items;
  ar app.asset_rights;
  n integer := coalesce(jsonb_array_length(p_variants), 0);
  v jsonb;
  img uuid;
  bytes bigint := 0;
begin
  select * into it from app.editorial_items where id = p_item_id;
  if not found then
    raise exception 'story not found' using errcode = 'P0002';
  end if;
  -- A running job has already read the snapshot: changing the image now could pin one the site
  -- never showed. A queued job has not, so the image simply goes out with it.
  if exists (select 1 from app.publish_jobs j where j.item_id = p_item_id and j.status = 'running') then
    raise exception 'this story is being published right now; try again in a minute' using errcode = '55006';
  end if;
  select * into ar from app.asset_rights where id = p_asset_rights_id;
  if not found or ar.item_id <> p_item_id then
    raise exception 'choose a rights record that belongs to this story' using errcode = '22023';
  end if;
  if ar.asset_kind not in ('photo', 'illustration', 'graphic') then
    raise exception 'that rights record is not for an image' using errcode = '22023';
  end if;
  if ar.status = 'rejected' then
    raise exception 'that rights record was rejected' using errcode = '22023';
  end if;
  if n = 0 or n > 16 or n <> coalesce(array_length(p_bodies, 1), 0) then
    raise exception 'the renditions do not match their descriptions' using errcode = '22023';
  end if;
  for k in 0 .. n - 1 loop
    v := p_variants -> k;
    if coalesce(v ->> 'format', '') not in ('avif', 'webp')
       or coalesce((v ->> 'width')::integer, 0) not between 1 and p_width
       or coalesce((v ->> 'height')::integer, 0) not between 1 and p_height
       or encode(sha256(p_bodies[k + 1]), 'hex') is distinct from (v ->> 'sha256') then
      raise exception 'rendition % does not match its description', k + 1 using errcode = '22023';
    end if;
    bytes := bytes + octet_length(p_bodies[k + 1]);
  end loop;
  if not exists (select 1 from jsonb_array_elements(p_variants) e where e ->> 'format' = 'webp') then
    raise exception 'a WebP rendition is required' using errcode = '22023';
  end if;
  if p_original is not null and encode(sha256(p_original), 'hex') is distinct from p_original_sha256 then
    raise exception 'the original does not match its hash' using errcode = '22023';
  end if;

  perform private.retire_story_image(p_item_id);
  insert into app.story_images (item_id, asset_rights_id, alt_text, caption, focal_x, focal_y, width, height,
                                original_sha256, original_media_type, created_by)
  values (p_item_id, p_asset_rights_id, btrim(p_alt), nullif(btrim(coalesce(p_caption, '')), ''),
          least(1, greatest(0, coalesce(p_focal_x, 0.5))), least(1, greatest(0, coalesce(p_focal_y, 0.5))),
          p_width, p_height, p_original_sha256, p_original_media_type, actor)
  returning id into img;
  insert into private.story_image_files (image_id, format, width, height, sha256, body)
  select img, e.value ->> 'format', (e.value ->> 'width')::integer, (e.value ->> 'height')::integer,
         e.value ->> 'sha256', p_bodies[e.ordinality::integer]
  from jsonb_array_elements(p_variants) with ordinality e;
  if p_original is not null then
    insert into private.story_image_originals (image_id, media_type, sha256, body)
    values (img, p_original_media_type, p_original_sha256, p_original);
  end if;

  perform private.write_audit('story_image.attach', 'story_image', img::text, 'allowed', null,
    jsonb_build_object('item_id', p_item_id, 'content_id', it.content_id, 'asset_rights_id', p_asset_rights_id,
                       'rights_status', ar.status, 'renditions', n, 'bytes', bytes,
                       'original_kept', p_original is not null));
  return img;
end
$$;

create function app.remove_story_image(p_item_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prev uuid;
begin
  perform private.assert_image_editor();
  -- A running job has already read the snapshot: changing the image now could pin one the site
  -- never showed. A queued job has not, so the image simply goes out with it.
  if exists (select 1 from app.publish_jobs j where j.item_id = p_item_id and j.status = 'running') then
    raise exception 'this story is being published right now; try again in a minute' using errcode = '55006';
  end if;
  prev := private.retire_story_image(p_item_id);
  if prev is not null then
    perform private.write_audit('story_image.remove', 'story_image', prev::text, 'allowed', null,
      jsonb_build_object('item_id', p_item_id));
  end if;
  return prev is not null;
end
$$;

-- The desk shows staff the current lead image: the largest WebP rendition up to p_max_width.
create function app.story_image_preview(p_item_id uuid, p_max_width integer default 800)
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select f.body
  from app.story_images s
  join private.story_image_files f on f.image_id = s.id and f.format = 'webp'
  where s.item_id = p_item_id and s.role = 'hero' and s.superseded_at is null
    and (app.current_staff_principal() is not null or coalesce(nullif(current_setting('role', true), ''), 'none') = 'none')
  order by (f.width <= greatest(p_max_width, 320)) desc,
           case when f.width <= greatest(p_max_width, 320) then -f.width else f.width end
  limit 1
$$;

-- ------------------------------------------------------------------------------------------------
-- Publishing: which image each story shows, and its files
-- ------------------------------------------------------------------------------------------------
-- The story being published shows its current image; every other story the image it was published
-- with. Either way only while the rights record is cleared for the web.
create function private.site_hero_image(p_item uuid, p_current boolean, p_published_image uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'alt', s.alt_text, 'caption', s.caption, 'credit', ar.credit_line,
    'provenance', ar.provenance, 'kind', ar.asset_kind, 'width', s.width, 'height', s.height,
    'focalX', s.focal_x, 'focalY', s.focal_y,
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object('format', f.format, 'width', f.width, 'height', f.height,
                                          'sha256', f.sha256) order by f.format, f.width)
      from private.story_image_files f where f.image_id = s.id
    ), '[]'::jsonb)
  )
  from app.story_images s
  join app.asset_rights ar on ar.id = s.asset_rights_id
  where s.item_id = p_item and s.role = 'hero'
    and ar.status = 'cleared' and 'web' = any (ar.permitted_uses)
    and case when p_current then s.superseded_at is null else s.id = p_published_image end
  limit 1
$$;

create or replace function app.site_snapshot(p_job_id uuid, p_claim_token uuid)
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
        'isSample', i.is_sample,
        'revision', r.revision,
        'publishedAt', coalesce(i.published_at, now()),
        'updatedAt', case
          when i.id = j.item_id and j.action = 'republish' then now()
          when i.id = j.item_id then coalesce(i.published_at, now())
          else greatest(coalesce(i.published_at, r.saved_at), r.saved_at) end,
        'heroImage', private.site_hero_image(i.id, i.id = j.item_id, i.published_image_id),
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

-- The image files the job's site needs, under the same claim as the snapshot.
create function app.site_media(p_job_id uuid, p_claim_token uuid)
returns table (sha256 text, format text, width integer, body bytea)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j app.publish_jobs;
begin
  select * into j from app.publish_jobs
  where id = p_job_id and status = 'running' and claim_token = p_claim_token;
  if not found then
    raise exception 'job is not running under this claim' using errcode = '55000';
  end if;
  return query
  select f.sha256, f.format, f.width, f.body
  from app.editorial_items i
  cross join lateral (
    select (private.site_hero_image(i.id, i.id = j.item_id, i.published_image_id) ->> 'id')::uuid as image_id
  ) h
  join private.story_image_files f on f.image_id = h.image_id
  where i.slug is not null
    and (
      (i.id = j.item_id and j.action in ('publish', 'republish'))
      or (i.id <> j.item_id and i.published_revision is not null)
    );
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Agents: a story with a lead image needs a person
-- ------------------------------------------------------------------------------------------------
create or replace function private.agent_publish_gates(
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
  has_image boolean;
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
  -- A lead image is chosen and its rights confirmed by a person: agents never publish one (v0.7.0).
  select exists (
    select 1 from app.story_images s where s.item_id = p_item.id and s.superseded_at is null
  ) into has_image;

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
    jsonb_build_object('gate', 'no_images', 'pass', not ('embedded_image' = any (findings)) and not has_image,
      'detail', case when has_image then 'This story has a lead image, which only a person can publish.'
                     else 'Agents cannot confirm image rights, so agent stories carry no images.' end),
    jsonb_build_object('gate', 'no_raw_html', 'pass', not ('raw_html' = any (findings)),
      'detail', 'Markdown only; no HTML or HTML character references.'),
    jsonb_build_object('gate', 'length', 'pass', char_length(p_proposal.body_markdown) between 400 and 30000,
      'detail', format('Body is %s characters; 400 to 30,000 allowed.', char_length(p_proposal.body_markdown)))
  );
end
$$;

-- ------------------------------------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' and p.proname in (
             'guard_new_item_publication', 'pin_published_image', 'drop_replaced_images',
             'assert_image_editor', 'retire_story_image', 'site_hero_image', 'agent_publish_gates'))
       or (n.nspname = 'app' and p.proname in (
             'attach_story_image', 'remove_story_image', 'story_image_preview', 'site_media', 'site_snapshot'))
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role, desk_agent, desk_publisher', f
    );
  end loop;
end
$$;

grant execute on function app.attach_story_image(uuid, uuid, text, text, numeric, numeric, integer, integer, text, text, jsonb, bytea[], bytea) to authenticated;
grant execute on function app.remove_story_image(uuid) to authenticated;
grant execute on function app.story_image_preview(uuid, integer) to authenticated;
grant execute on function app.site_snapshot(uuid, uuid) to desk_publisher;
grant execute on function app.site_media(uuid, uuid) to desk_publisher;
