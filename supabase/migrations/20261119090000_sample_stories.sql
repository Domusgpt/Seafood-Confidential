-- Seafood Confidential: sample stories for preview sites (SC-003). Operators load clearly labelled
-- placeholder stories into a preview so the founders can see the publication working; the site
-- builder refuses to put them on a site that is not a preview, and no API role can mark or unmark a
-- story as a sample (docs/LAUNCH_PREVIEW.md, supabase/sample/).

alter table app.editorial_items add column is_sample boolean not null default false;
comment on column app.editorial_items.is_sample is
  'Placeholder content loaded by an operator for a preview site. Shown with a Sample label; never allowed on the real site.';

-- Only operators (the database owner) mark samples; staff, agents and the public cannot set or clear it.
create function private.guard_sample_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'desk_agent', 'desk_publisher', 'desk_app')
     and (
       (tg_op = 'INSERT' and new.is_sample)
       or (tg_op = 'UPDATE' and new.is_sample is distinct from old.is_sample)
     ) then
    raise exception 'sample stories are loaded by an operator' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger editorial_items_guard_sample
  before insert or update of is_sample on app.editorial_items
  for each row execute function private.guard_sample_flag();

revoke all on function private.guard_sample_flag() from public, anon, authenticated, service_role, desk_agent, desk_publisher;

-- The site snapshot carries the flag, so every page can label a sample and the builder can refuse
-- samples outside a preview. Same signature, so existing grants (desk_publisher only) are kept.
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
