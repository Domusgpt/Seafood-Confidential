-- Sample stories for a PREVIEW site (docs/LAUNCH_PREVIEW.md). Run as the database owner, for example
-- through the Supabase SQL editor or the Management API. It is idempotent: a sample that already
-- exists (same title) is skipped.
--
-- What it does:
-- * creates the principal "Sample content (preview)": an agent-kind identity with no token, grants
--   or scopes, so it can do nothing; it only attributes the samples, which are never shown as a
--   person's work. Its publish jobs take the operator's path (requested_via 'staff'): these are
--   deliberate operator loads, not agent requests, so the agent publishing gates do not apply;
-- * adds seven stories marked is_sample, one per section plus an AI-written explainer, each with its
--   text and clearly marked placeholder sources;
-- * queues one publish job per story. The desk's own publisher runs them, the same path as any
--   publication: an owner or managing editor presses "Run … queued jobs now" on the desk's
--   Publishing page (each press runs up to five), or the scheduled sweep runs them if it is set up.
--
-- The text is placeholder copy: it shows how stories look and makes no factual claims to be relied
-- on (no figures, names, quotations or real sources). Every page shows a "Sample" label and note,
-- and the site builder refuses to publish samples to a site that is not a preview. To take them
-- down, run supabase/sample/remove-preview-content.sql.

create function pg_temp.sample_story(
  p_author uuid,
  p_order integer,
  p_title text,
  p_summary text,
  p_section text,
  p_format text,
  p_label text,
  p_byline text,
  p_ai boolean,
  p_sources jsonb,
  p_body text
)
returns void
language plpgsql
as $fn$
declare
  item uuid;
  cid text;
  y integer := extract(year from (now() at time zone 'America/New_York'))::integer;
  n integer;
  codes text[] := array(select s ->> 'code' from jsonb_array_elements(p_sources) s);
begin
  if exists (select 1 from app.editorial_items where is_sample and title = p_title) then
    return;
  end if;
  -- The same per-year counter app.next_content_id() uses (that function is for staff sessions).
  insert into private.content_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = private.content_counters.last_value + 1
  returning last_value into n;
  cid := format('SC-%s-%s', y, lpad(n::text, 3, '0'));
  insert into app.editorial_items (content_id, title, summary, section, format, label, author_display, created_by,
                                   is_sample, status)
  values (cid, p_title, p_summary, p_section, p_format, p_label, p_byline, p_author, true, 'ready_for_release')
  returning id into item;
  insert into app.sources (item_id, source_code, source_type, title, publisher, agent_processing, public_citation)
  select item, s ->> 'code', 'other', s ->> 'title', 'Sample', 'no', true
  from jsonb_array_elements(p_sources) s;
  perform private.write_article(item, p_title, p_summary, p_body, p_byline, codes, p_ai, null, p_author, not p_ai);
  insert into app.publish_jobs (item_id, action, send_email, requested_by, requested_via, idempotency_key,
                                payload_hash, request_id, article_revision, created_at)
  values (item, 'publish', false, p_author, 'staff', 'sample-publish-' || lower(cid), repeat('0', 64),
          'req-sample-content-load', 1, now() + make_interval(secs => p_order));
end
$fn$;

do $load$
declare
  author uuid;
begin
  select id into author from app.principals
  where kind = 'agent' and display_name = 'Sample content (preview)';
  if author is null then
    insert into app.principals (kind, display_name) values ('agent', 'Sample content (preview)')
    returning id into author;
  end if;

  -- Published in this order, so the last one leads the home page.
  perform pg_temp.sample_story(author, 1,
    'Landed weight, yield and price: reading the numbers in a seafood story',
    'A short glossary of the figures that are easiest to misread.',
    'the_trade', 'explainer', 'reporting', null, true,
    '[{"code": "SRC-SAMPLE-FIGURES", "title": "Placeholder: an industry statistics guide (sample)"}]',
    $body$Numbers in seafood stories are easy to compare in the wrong way. These are the terms worth pinning down before drawing a conclusion.

## Landed weight and edible yield

Landed weight is the weight of the catch as it comes ashore, which may be whole or already processed on board. Edible yield is the share that ends up as usable product. A change in one does not tell you the change in the other.

## Revenue and margin

Revenue is what a sale brings in; margin is what remains after costs. A rising price can still mean a shrinking margin when fuel, feed or freight costs rise faster.

## Nominal and adjusted

A nominal price is the figure at the time. An adjusted price accounts for inflation or currency changes, so that different years can be compared. A story should say which one it uses.

## One operation and the whole industry

A single business's experience is useful evidence of what is possible, but it is not a measure of the whole trade. A story should be clear about which of the two it describes.

This sample shows how a story written by an AI agent is labelled: the note below explains how it was written, and its sources are listed after it.$body$);

  perform pg_temp.sample_story(author, 2,
    'The people who catch and farm our seafood should be the ones explaining it',
    'Working knowledge is the industry''s most underused asset. It belongs in public.',
    'voices', 'opinion', 'opinion', 'Sample author', false,
    '[]',
    $body$Every seafood business runs on knowledge that rarely leaves the building: how to judge a shipment in a minute, how to read the water before a harvest, how a new rule will really change a working week. That knowledge is learned the hard way, and it mostly stays private.

It should not. When the people who do the work explain it, readers get something no outsider can provide: the reason behind a decision, not just the decision.

## Why it does not happen more

Time is the obvious reason. So is caution: a buyer or a farmer may worry that explaining a decision invites criticism of it. And there is the question of where such writing would go, when most coverage of seafood is either trade news or consumer advice.

## What would change

Publications that make room for practitioners, edit them carefully and are clear about each writer's interests can change that. Readers learn how the industry works, and the industry gets a fairer hearing.

This sample shows how an opinion piece looks on the site. A finished opinion would carry its author's name and a note about their interests.$body$);

  perform pg_temp.sample_story(author, 3,
    'What the words on a seafood label are telling you',
    'Species, origin, wild or farmed, and whether it was frozen: what to look for, and what a label does not tell you.',
    'at_the_table', 'explainer', 'reporting', 'Sample author', false,
    '[{"code": "SRC-SAMPLE-LABELS", "title": "Placeholder: labelling regulations (sample)"}]',
    $body$Seafood labels can carry a lot of information in a small space. The rules about what must appear differ between countries, and between shops and restaurants, but these are the kinds of details you may find.

## The species

A common name such as "cod" or "shrimp" can cover more than one species. Some labels also give the scientific name, which identifies the fish precisely.

## Wild or farmed, and where

A label may say whether the product was caught in the wild or farmed, and where. For wild fish that can be a broad ocean area; for farmed fish, the country where it was raised.

## Fresh, frozen or previously frozen

Freezing is a common way to preserve seafood. A label may tell you whether a product was frozen and then thawed for sale.

## What a label does not tell you

A label rarely says how the product was handled along the way, which is why professional buyers ask their suppliers directly. The finished version of this explainer would compare the label rules in the markets our readers work in, citing the regulations themselves.$body$);

  perform pg_temp.sample_story(author, 4,
    'Reading a fishery notice: five things to check before you act',
    'Who issued it, what stage it is at, when it takes effect, whom it applies to, and where the official text lives.',
    'rules_and_reality', 'explainer', 'reporting', 'Sample author', false,
    '[{"code": "SRC-SAMPLE-NOTICE", "title": "Placeholder: an official fishery notice (sample)"}]',
    $body$A notice about a fishery can arrive as a news story, a forwarded email or a screenshot. Before acting on it, it is worth confirming five things.

1. **Who issued it.** Identify the authority and the jurisdiction. Rules for the same species can differ from one management area to the next.
2. **What stage it is at.** A consultation, a proposal, an adopted rule and a rule in force are different things. Only the last one changes what you can do today.
3. **When it takes effect.** Check the date and, where it matters, the time. Some measures take effect at a set hour.
4. **Whom it applies to.** Areas, species, gear types and vessel classes are often defined precisely, and the details decide whether a rule applies to you.
5. **Where the official text lives.** A summary helps, but the official text is what counts. Keep a link to it with your own records.

## Why this matters

A business's experience of a rule is not the same as the rule's formal text, and a story about a rule should say which one it is describing. The finished version of this explainer would work through one real notice, step by step, with the official document as its source.$body$);

  perform pg_temp.sample_story(author, 5,
    'What a buyer checks when a shipment arrives',
    'Temperature, condition and paperwork: the questions to answer before signing for a delivery.',
    'the_trade', 'explainer', 'reporting', 'Sample author', false,
    '[{"code": "SRC-SAMPLE-CHECKLIST", "title": "Placeholder: a buyer''s receiving checklist (sample)"}]',
    $body$A delivery that looks fine on the truck can still be the wrong product, the wrong temperature or the wrong paperwork. Experienced buyers work through the same short list every time.

## Temperature first

Chilled and frozen seafood each have a temperature they should arrive at. Buyers check the product itself, not only the truck's display, and note the reading. A shipment that warmed in transit may still look acceptable while its shelf life has quietly shortened.

## Look, smell and feel

Appearance, smell and texture say a lot about how a product was handled. Buyers learn what good looks like for each species they handle, and they check samples from several boxes rather than the one on top.

## Paperwork and labels

The documents should match what arrived: the species, the weight, the origin and how it was produced. Labels on the boxes should agree with the invoice. Gaps here matter beyond the sale, because the buyer passes the information on to their own customers.

## When something is wrong

Buyers who reject or dispute a delivery record what they found, photograph it and contact the supplier before the product moves on. The finished version of this explainer would compare how buyers in different parts of the trade handle receiving, with their own checklists as sources.$body$);

  perform pg_temp.sample_story(author, 6,
    'How an oyster farmer decides a crop is ready to sell',
    'Size is only the start. Condition, season, water quality and the market all have a say.',
    'at_the_farm', 'explainer', 'reporting', 'Sample author', false,
    '[{"code": "SRC-SAMPLE-FARMER", "title": "Placeholder: interview with an oyster farmer (sample)"}, {"code": "SRC-SAMPLE-CLOSURES", "title": "Placeholder: official harvest-area notices (sample)"}]',
    $body$An oyster on a farm is ready for market when it reaches a size buyers want, but size alone rarely settles the question. Farmers weigh several things at once before they pull a crop.

## Size and shape

Buyers usually order oysters by size grade, so farmers sort their stock as it grows. A farm with an order for one grade may hold back stock that is close but not quite there.

## Condition and season

How full and firm the meat is can change through the year, especially around spawning. A farmer who knows the site well can tell when an oyster is at its best and when it is better to wait.

## The water has a say

In many growing areas, harvest can be paused after heavy rain or other events while water quality is checked. Farmers plan around those pauses, because a closure in the wrong week can leave a crop in the water while buyers are waiting.

## Selling the crop

Then there is the market: a restaurant order, a wholesaler's standing request and a market stall each want something different. The finished version of this explainer would follow one farm through a season, with the farmer's own account and the official notices behind each pause.$body$);

  perform pg_temp.sample_story(author, 7,
    'From the dock to the auction floor: a day boat''s working day',
    'What happens between casting off before dawn and the moment a buyer''s bid lands, and why each step shows up in the price.',
    'on_the_water', 'reported_feature', 'reporting', 'Sample author', false,
    '[{"code": "SRC-SAMPLE-SKIPPER", "title": "Placeholder: interview with a day-boat skipper (sample)"}, {"code": "SRC-SAMPLE-LANDINGS", "title": "Placeholder: landing records for the trip (sample)"}]',
    $body$A day boat goes out and comes back within the same working day: away before first light, back at the dock that afternoon, with the catch still close to the water it came from. For buyers, that short loop is the appeal. For the crew, it is a day of decisions that rarely make it onto a price sheet.

## Before casting off

The day starts on land. The skipper checks the forecast and decides whether the trip is worth making at all; a rough sea costs fuel and time and can cost the catch its condition. The crew loads ice, checks the gear and makes sure the boat's records are ready, because what is caught, where and when will need to be written down before anything is sold.

## On the grounds

Once the gear is working, the job becomes handling. Fish that are sorted quickly, kept out of the sun and chilled fast keep their quality longer. Small choices made on deck, such as how a catch is stowed and how much ice goes on it, show up hours later when a buyer lifts the lid on a box.

## Back at the dock

The boat lands its catch, and what happens next depends on how it is sold. Some catch goes to an auction, where buyers bid on lots they can see; some goes to a buyer who agreed to take it in advance. Either way the landing is recorded, and the paperwork follows the fish.

## Why it matters at the counter

Freshness, careful handling and a clear record of where and when a fish was caught are what a day boat sells. The finished version of this story would follow one crew through one trip and put names, places and prices on each of these steps.$body$);
end
$load$;

select content_id, title, section, status from app.editorial_items where is_sample order by content_id;
