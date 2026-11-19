-- Takes the sample stories down (docs/LAUNCH_PREVIEW.md). Run as the database owner (for example in
-- the Supabase SQL editor), twice:
--   1. this script queues an unpublish job for every sample that is live. An owner or managing
--      editor then presses "Run … queued jobs now" on the desk's Publishing page until no queued
--      jobs are left (each press runs up to five), or the scheduled sweep runs them if it is set up.
--      Each job rebuilds the site without that story;
--   2. run it again once those jobs have finished: it then marks every sample that is no longer live
--      as withdrawn, so they leave the desk's working lists.
-- The last column of the result says what to do next for each sample. Running it more times
-- changes nothing. Samples stay in the database as withdrawn records (the audit trail keeps
-- everything that happened to them).

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

select i.content_id, i.title, i.status,
       case
         when exists (select 1 from app.publish_jobs j
                      where j.item_id = i.id and j.status = 'needs_attention')
           then 'A publish job needs attention: see the Publishing page.'
         when exists (select 1 from app.publish_jobs j
                      where j.item_id = i.id and j.status in ('queued', 'running'))
           then 'Unpublishing is queued: press "Run … queued jobs now" on the Publishing page, then run this script again.'
         when i.status = 'withdrawn' then 'Removed.'
         when i.status = 'published' then 'Still live: run this script again to queue its removal.'
         else 'Run this script again to finish.'
       end as next_step
from app.editorial_items i
where i.is_sample
order by i.content_id;
