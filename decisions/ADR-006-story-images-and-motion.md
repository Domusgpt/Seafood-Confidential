# ADR 006 Story images in the desk database, and a motion system for the public site

Date: November 18, 2026. Status: **Proposed** in session S01, turn 7 (v0.7.0), for the founders to confirm. It builds on [ADR-005](ADR-005-desk-publishing-without-ghost.md) (the desk publishes the site) and the Working Waterfront visual codex.

## Context

Paul asked for images, style improvements, GSAP scroll motion, tighter layouts, neo-skeuomorphic depth, more parallax layers, and text and image motion that is cohesive, can be tuned, and reverses ("We need images and this needs some style enhancements and GSAP scroll dynamics…").

Until v0.7.0 the site carried no images. ADR-005 lets agents publish only text, because agents cannot confirm image rights. The desk already kept a rights record for each asset (`app.asset_rights`: provenance, licence, credit, cleared status), and the editorial playbook and brand guide require:
- recorded permission, a credit and a caption;
- accurate labels for illustration and generated media;
- the original kept beside the published derivative.

## Decision

### 1. One lead image per story, tied to a rights record

- **Reaching the site:** a story may have one lead ("hero") image (`app.story_images`). It always points at a rights record of the same story, and reaches the public site only while that record is **cleared and permits the web**. Clearing or revoking rights takes effect at the next rebuild.
- **What is live is what was published, for images too:**
  - Publishing pins the story's cleared image (`editorial_items.published_image_id`).
  - Replacing or removing the image of a live story changes the site only when someone updates the story.
  - A replaced image is kept while the site still shows it.
- **Agents:** they never publish a story that has a lead image (the `no_images` gate).
- **Editors:** staff attach images in the desk (any desk role); operators use `pnpm --filter @sc/desk images`.

### 2. The desk makes the renditions; the database keeps them

- **Renditions:**
  - At upload, the desk re-encodes the image (sharp) as AVIF and WebP at 480, 800, 1200, 1600 and 2400 px wide, never wider than the original.
  - Orientation is applied and all metadata, including GPS, is removed.
  - Each rendition is named by its SHA-256, so the host caches it for a year.
- **Storage:** renditions and the uploaded original are stored as `bytea` in private tables. Only security-definer functions reach them:
  - `app.attach_story_image` checks every rendition's hash;
  - `app.site_media` hands the publisher the files, under the same claim token as the snapshot.
- **Uploads:** they go through a route handler (`/stories/<id>/image`), not a Server Action. The other actions, the public pitch form among them, keep their 1 MB body limit, and the upload is size-, origin- and session-checked before its body is read.

**Why the database, not object storage:**
- **One fenced read:** a publication reads text and images in one claim-fenced transaction, with no second credential.
- **No new credentials or public surface:** the desk holds no service key, and a Supabase Storage bucket would need either one or a public bucket, which would expose unpublished images.
- **One backup:** backups and restores stay one system.
- **Size:** at preview scale this is small, about 1 MB of renditions per image.

### 3. A motion system, tuned from tokens

- **Tokens:** `brand/tokens.json` v0.2 adds `space`, `radius`, `elevation` (one light from above, set per theme) and `motion`. Motion covers durations, easings for CSS and GSAP, distances, parallax depths and presets (`calm`, `standard`, `expressive`).
- **Engine:** GSAP 3.15.1 with ScrollTrigger, self-hosted under the strict CSP. `site-src/motion.js` reads every value from the tokens.
- **Choosing a preset:** the site's preset is the `SITE_MOTION` setting. Readers can turn animation off in the footer, and `prefers-reduced-motion` turns it off.
- **What moves:**
  - parallax masthead layers;
  - titles that rise word by word, keeping their exact text;
  - images that open from the edges and develop into colour;
  - reveals that reverse on scroll-back;
  - a reading-progress bar;
  - a lead panel that leans toward the pointer.
- **Without JavaScript:** every page works fully. A two-and-a-half-second failsafe shows everything if the motion script never arrives, and turning motion off restores the server's HTML exactly.

## Consequences

- **The database grows with images.** Review this decision, and move renditions to Cloud Storage (keeping the hash names), when either of these happens:
  - the database passes 2 GB;
  - a full site build loads more than about 200 MB of image files into memory. Today every build loads every published image; Firebase uploads only new hashes, but the builder reads them all.
- **GSAP is not open source.**
  - Its "no charge" Standard license allows this commercial use, requires its notices to stay intact, and can be changed by Webflow (THIRD_PARTY_NOTICES.md).
  - The site does not depend on it to be read, so it can be replaced by CSS scroll-driven animations if needed.
- **Image processing takes time and memory.**
  - **Time:** 20 to 60 seconds per photograph on one CPU, mostly the AVIF encoder. The desk says so on the form; a lower AVIF effort is the first lever if that becomes a problem.
  - **Memory (v0.7.1):** the first version made every rendition from a full-size decode, and the desk's container with Cloud Run's 512 MiB was killed by a 24-megapixel photograph. The upload is now decoded once to a master of at most 2400 px and about 4.3 megapixels, one image at a time, with glibc's malloc arenas limited. The container's charged memory now peaks at 300 to 456 MiB for 12 to 59 megapixels, and the server process's high-water mark at 509 MiB. The service runs with 1 GiB for headroom.
  - **Moving processing out of the desk:** if uploads become frequent or large, a separate job, such as a Cloud Run job or a function, could do the processing; the hashes and tables stay the same.
- **Fix found while building this:** staff could insert a story with publication fields already set. Inserts by API roles may no longer set them (migration `20261119120000_story_images.sql`).
