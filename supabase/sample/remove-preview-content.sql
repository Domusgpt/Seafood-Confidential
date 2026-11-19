-- Takes the sample stories down (docs/LAUNCH_PREVIEW.md). Run as the database owner, twice:
--   1. this script queues an unpublish job for every sample that is live; the desk's publisher runs
--      them on its next sweep (or "Run queued jobs" on the Publishing page), rebuilding the site
--      without them;
--   2. run it again once those jobs have finished: it then marks every sample that is no longer live
--      as withdrawn, so they leave the desk's working lists.
-- Samples stay in the database as withdrawn records (the audit trail keeps everything that
-- happened to them).

insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key,
                              payload_hash, request_id, article_revision)
select i.id, 'unpublish', false, i.created_by, 'staff',
       'sample-unpublish-' || lower(i.content_id) || '-' || to_char(now(), 'YYYYMMDDHH24MISS'),
       repeat('0', 64), 'req-sample-content-remove', i.published_revision
from app.editorial_items i
where i.is_sample and i.status = 'published'
  and not exists (
    select 1 from app.publish_jobs j
    where j.item_id = i.id and j.status in ('queued', 'running', 'needs_attention')
  );

update app.editorial_items set status = 'withdrawn'
where is_sample and status <> 'published' and status <> 'withdrawn'
  and not exists (
    select 1 from app.publish_jobs j
    where j.item_id = app.editorial_items.id and j.status in ('queued', 'running', 'needs_attention')
  );

select content_id, title, status from app.editorial_items where is_sample order by content_id;
