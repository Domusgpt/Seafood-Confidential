# Changelog

All notable changes to this repository. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semantic versioning](https://semver.org/) (0.x before launch, one minor version per working session).

## [Unreleased]

## [0.7.0] - 2026-11-18 · Session S01, turn 7 · `claude/intelligent-cannon-d1nqq6`

The public site gets photographs and a motion and depth system: layered parallax, titles and images that animate in and reverse, raised and recessed surfaces lit from above, and a tighter type and spacing scale. Readers can turn animation off, and nothing depends on it. See ADR-006.

### Added
- **Story images (`supabase/migrations/20261119120000_story_images.sql`):**
  - A lead image per story, tied to a rights record. It reaches the site only while that record is cleared for the web.
  - Publishing pins the image, so replacing or removing it on a live story waits for an update.
  - Agents never publish a story with an image.
  - Renditions and the original are stored beside the story and read by the publisher under the job's claim token.
- **Image processing (`src/lib/images/process.ts`, sharp 0.35.5):**
  - AVIF and WebP at 480 to 2400 px, never upscaled;
  - EXIF orientation applied, and all metadata (GPS included) removed;
  - decoding bounded by size, pixels, format and aspect ratio.
- **In the desk:**
  - A "Lead image" card on the story page: preview, rights status, alternative text, caption, credit, and where the subject sits.
  - Uploads go through a route handler that checks the session, origin and size before reading the body; other actions keep their 1 MB limit.
  - An operator CLI, `pnpm --filter @sc/desk images samples | attach`.
- **Sample photographs:** six public-domain photographs (USFWS, USDA, FDA, NOAA, and Carol M. Highsmith via the Library of Congress), with verified licences, credits and alternative text (`supabase/sample/images/`).
- **On the public site:**
  - `<picture>` with AVIF and WebP `srcset` and focal-point crops, all without inline styles;
  - a wide hero with caption and credit, and image cards;
  - a drawn plate for stories without an image;
  - `og:image` for previews on social media;
  - related stories, reading time, a drop cap on reported features;
  - an ink footer.
- **Motion (GSAP 3.15.1 and ScrollTrigger, self-hosted; `site-src/motion.js`):**
  - parallax masthead layers (bathymetry, contour linework, light, type);
  - titles rising word by word with their exact text kept;
  - images opening from the edges and developing into colour;
  - reveals that reverse on scroll-back, section rules that draw, a reading-progress bar, and a lead panel that leans toward the pointer.
- **Turning motion off or tuning it:**
  - Readers can turn animation off (remembered), and `prefers-reduced-motion` turns it off.
  - Without JavaScript the page is complete.
  - Turning motion off restores the server's HTML exactly.
  - `SITE_MOTION` chooses the preset: calm, standard, expressive or off.
- **Design tokens v0.2:** `space`, `radius`, `elevation` per theme (one light from above) and `motion` with presets, compiled for the site and the desk. Contour linework is generated from a seeded script (`scripts/build-contours.mjs`).

### Changed
- **The site stylesheet is rewritten on the tokens:**
  - a tighter type scale;
  - a breakout grid so figures run wider than the text;
  - raised cards and a lead panel, recessed sources, bevelled chips;
  - a sticky, frosted section bar marking the current section;
  - phone navigation with faded edges;
  - print styles.
- **The bathymetry renderer** also stops when the reader turns animation off.
- **The repository's accessibility checks** judge pages once motion has settled.

### Fixed
- **Inserting a story could set publication fields.** Staff could insert a story with `slug` or `published_revision` already set, which would have put it on the site at the next rebuild without the publishing workflow. Inserts by API roles may no longer set publication fields.

### Verified (local)
- pgTAP 272/272, including 34 new image tests.
- Vitest 126/126.
- Playwright 32/32, including a new test that uploads a photograph, publishes it and fetches its AVIF and WebP with no metadata.
- 0 axe violations and no overflow on eleven site views: desktop, dark, iPhone 13, reduced motion, and the AI and black-and-white stories.
- The page is complete without JavaScript, and the animation switch reverts exactly.

## [0.6.0] - 2026-11-18 · Session S01, turn 6 · `claude/intelligent-cannon-d1nqq6`

The preview now looks and works like the publication:
- seven labelled sample stories, published with the desk's own publishing code;
- About and How we work pages from the founders' copy;
- a publishing sweep endpoint, ready for a scheduler, so publications never wait in the queue.

### Added
- **Sample stories (`is_sample`):**
  - Only an operator can mark a sample; a trigger refuses staff, agents and the public.
  - The site labels samples everywhere: a "Sample" chip, a note on the page and "Sample:" in the feed.
  - The builder refuses to publish a site that is not a preview while any sample is live.
  - `supabase/sample/preview-content.sql` loads seven placeholder stories (one per section plus an AI-written explainer) attributed to an inert "Sample content (preview)" identity, and queues their publication.
  - `remove-preview-content.sql` takes them down. Its result says what to do next for each sample.
  - The desk shows a Sample badge, and samples ask nothing of editors.
- **Standing pages:** About (the brand guide's About introduction) and How we work (the editorial playbook's standards and ADR-005's agent rules), rendered from Markdown in `apps/desk/site-src/pages`, linked from every footer and listed in the sitemap.
- **Publishing sweep:** `POST /api/publishing/sweep` runs waiting publish jobs. It accepts only a Google-signed OIDC token (RS256) for that exact address, from the configured service account with a verified email. Without that account configured, it answers 404.
  - The endpoint and its caller account `sc-desk-scheduler` are live.
  - The Cloud Scheduler job that would call it every 15 minutes has **not** been created. It is one command for the project owner, in `docs/LAUNCH_PREVIEW.md`.

### Changed
- **Headings in story text** start at h2 whatever level the writer used, with no skipped levels.
- **Links:** same-site links are allowed (never `//host`), and only external links get `rel="nofollow"`.
- **Titles and summaries** get typographic apostrophes.
- **The repository's link check** skips the public-site pages and generated site output.

### Verified
- **Locally (EV-0054, EV-0055, EV-0057):**
  - pgTAP 238/238, Vitest 114/114, Playwright 31/31 (including the sweep's 404), `pnpm check`, and a clean bundle scan;
  - the whole sample lifecycle through the desk's own publisher: load, publish, remove, withdraw;
  - an owner updating a live sample, which rebuilds the site with nothing visibly changed (the suggested first live test).
- **Live (EV-0051 to EV-0053):**
  - the migration and desk 0.6.0;
  - the sweep refuses missing, HS256 and non-Google RS256 tokens;
  - seven samples and both pages live, with 0 axe violations and no overflow on ten views.
- **Not yet live (EV-0056):** a publication by the desk service on Cloud Run, and the sweep with a real scheduler token.

## [0.5.0] - 2026-11-18 · Session S01, turn 5 (preview launch) · `claude/intelligent-cannon-d1nqq6`

The desk and the public site are live as a preview, for the founders to try. See [docs/LAUNCH_PREVIEW.md](docs/LAUNCH_PREVIEW.md).

### Added
- **Preview deployment:**
  - Desk on Cloud Run (`sc-desk`, us-west1, scales to zero) with its own runtime account and Secret Manager secrets.
  - Database and sign-in on Supabase (us-west2, Free plan); both migrations applied atomically through the Management API and recorded in the CLI's migration history.
  - Public site on Firebase Hosting (`seafood-confidential-preview.web.app`).
  - Paul has an owner account.
- **Preview mode for the public site (`SITE_PREVIEW_NOTICE`):** every page carries a "Preview." banner (new `notice` token roles, 8.01:1 in both themes) and a `noindex` tag, and robots.txt disallows everything.
- **`apps/desk/cloudbuild.yaml`:** reproducible image builds in Cloud Build from an exact `git archive`.

### Changed
- **Sign-in links:** the desk also accepts Supabase's default sign-in links (a PKCE code exchanged on the server). On the free plan with the built-in mailer, the email template cannot be customized. Our token-hash links still work. A failed link now says to open it in the same browser.
- **Indexing:** the desk sends `X-Robots-Tag: noindex, nofollow` on every response.
- **Coming-soon page:** it offers a subscription only when a Kit form is configured.

### Verified
- **Live:**
  - database security model;
  - desk health and headers;
  - the desk reaching the database through the pooler (an audited request);
  - the public site released by the desk's own Firebase deploy code (banner, noindex, headers, 404);
  - 0 axe violations on six live views.
- **Locally:** both sign-in link shapes, Vitest 102/102, Playwright 30/30, pgTAP 229/229. See EV-0045 to EV-0050.
- **Not exercised live yet:** a real-email sign-in and a publication from Cloud Run (Paul's first ones), and the newsletter (Kit not connected).

## [0.4.1] - 2026-11-18 · Session S01, turn 4 (security hardening) · `claude/intelligent-cannon-d1nqq6`

An independent review of agent publishing found eight problems (one High, four Medium, three Low). All eight are fixed with regression tests. Fixing them turned up eight more, which are also fixed and tested: retries, the Markdown and invisible-character bypasses, international phone numbers, a possible second newsletter, failure details shown to agents, accented addresses, and claim outcomes reported to agents as "queued".

### Security
- **The live site is built only from what was published.** Every rebuild used each story's current text, so an editor's unreviewed save went live the next time any story was published. It also trusted a status anyone could set by hand. Now each story records the revision it was published at (`published_revision`), rebuilds use that revision, and no API role can move a story to or from Published by hand (a database trigger).
- **Agent jobs are re-checked in full when they run.** A token revoked, a proposal rejected, agent email withdrawn or the switch turned off after the request now cancels the job, with the reason recorded. A retry keeps the revision the job froze, so text a person saved since is never published under an agent's job.
- **Claim tokens fence every step after the claim.** A worker whose lease expired can no longer read the snapshot, email or record an outcome. Leases are renewed during deploys and confirmed right before the release. The newsletter attempt is a compare-and-set in the database: at most one email per job, even with two workers.
- **Refused agent requests are recorded.** The gateway's refusal used to roll back the refused job and its audit row, so the new budget of 10 refusals a day could not count them. Refusals are now committed, and `jobs.read` returns them.
- **Content checks match what readers see.** HTML character references, block quotes inside list items, links to anything but a cited source, Markdown escapes or emphasis that split an email address, invisible characters and international phone numbers are all refused. The content checks run only after the switch, lane and grant checks pass, so they cannot be probed. The desk also checks the rendered text of agent stories before deploying.
- **The queue cannot wedge.** Headlines and summaries that would not fit, titles without Latin letters and long titles all get valid public addresses (accented letters are transliterated, e.g. São → sao). A job that cannot be prepared fails instead of blocking the queue.
- **Local site server:** malformed URL escapes return 400 instead of crashing the process, and directory redirects are built from the file system, never from the request.
- **Agents see agent-facing outcomes.** Failure details written for editors (hosting and database errors) are no longer returned to agents.

### Changed
- A live story is updated, not published again (which could email subscribers twice). Publishing again with email after an unpublish warns that subscribers were already emailed.
- On a live story, the status picker offers only Published and explains that publishing sets it. The unused Ghost link action is removed.
- The publishing log names each failed check briefly ("Master switch: Agent publishing is switched off in Settings").

### Verified
- pgTAP 229/229 (fresh and populated databases), Vitest 101/101, Playwright 30/30, agent lab self-test 18/18, `pnpm check`. See EV-0038 to EV-0044.

## [0.4.0] - 2026-11-18 · Session S01, turn 4 · `claude/intelligent-cannon-d1nqq6`

Ghost-free publishing from the desk, with agents that may publish under the owner's switches and automated checks (ADR-005), and a cost plan that starts at about $1 a month.

### Added
- **Story text in the desk** (`app.articles`): Markdown editor and append-only revisions. Saves from an outdated page are refused (AT-08). Agent proposals can be adopted as the starting text and stay labelled AI-written.
- **Public static site** built by the desk from published stories: home, sections, stories, RSS, sitemap and 404. It uses the Working Waterfront design with self-hosted fonts and the WebGL bathymetry motif on the home page. It has a strict CSP and passes WCAG 2.2 AA (axe).
- **Site deploys:** to a local folder for development and tests (`pnpm --filter @sc/desk site:serve`), or to Firebase Hosting through its REST API in production. Every deploy is a full snapshot, and only one site build runs at a time.
- **Newsletter on Kit** (v4 API): a broadcast is scheduled only when chosen, at most once, and an uncertain result needs a person.
- **Publishing workflow:**
  - Durable publish jobs (`app.publish_jobs`): publish, update and unpublish, with idempotency keys, leases and retries.
  - The Publishing panel on every story; staff warnings that never block.
  - The `/publishing` log, with a stop switch for every staff member.
  - Owner settings for agent publishing: master switch, section lanes, daily cap, minimum sources, agent email and disclosure text.
- **Agent publishing:** gateway tool `drafts.publish` (contract and examples). It checks scope, grant, master switch, lane, people-first, citable sources, no quotes, contact details, images or HTML, length, the daily cap and email permission, all in the database, and refusals list the failed checks.
- **Database:** new role `desk_publisher` (claim, snapshot and complete only). Sources gain a "citable" flag.
- **Agent lab:**
  - A `publish` scenario and `publish_draft` tool.
  - `--check-key`, which checks the key, model and billing for well under a cent.
  - It now reads `SC_AGENT_LAB_API_KEY` first.
- **Docs:** ADR-005; AGENTS.md updated; acceptance tests AT-27 to AT-30; backlog tickets SC-017 and SC-018, with SC-002, SC-003, SC-004 and SC-011 re-scoped. HOSTING_AND_COSTS rewritten with verified prices.

### Changed
- Next actions point to the story text and the Publishing panel instead of Ghost. Marking a story ready by hand now needs its text instead of a Ghost link.
- The contract test now allows exactly one publish tool (`drafts.publish`, which takes a proposal ID only) and still forbids send, approve, export, delete and member tools.
- The local Supabase auth rate limits were raised for test runs. The end-to-end sign-in helper waits for a fresh magic link.
- The container image includes the public site assets (0.4.0, 387 MB).

### Removed
- Ghost as the launch publishing platform (ADR-005). A Ghost adapter was prototyped and verified against Ghost 6.78, then dropped before commit. Its findings are recorded in ADR-005.

## [0.3.0] - 2026-11-18 · Session S01, turn 3 · `claude/intelligent-cannon-d1nqq6`

Hosting and cost plan, a proposal to automate Ghost while people still decide releases, a production container, and a Claude agent lab.

### Added
- `docs/planning/HOSTING_AND_COSTS.md`: verified prices for Supabase, Google Cloud (Cloud Run, Cloud Storage) and Hugging Face Spaces. Recommends Supabase Pro plus Cloud Run, about $84–99 a month in cash.
- `decisions/ADR-004-desk-driven-publishing.md` (Proposed): automatic Ghost drafts, webhook sync and one-click human publishing behind the release gate; agents still never publish.
- `apps/desk/Dockerfile`, `.dockerignore` and `docs/DEPLOYMENT.md`: a Next.js standalone image for Cloud Run or a Hugging Face Space; CI `container` job with a smoke test.
- `apps/agent-lab`: a Claude agent (Anthropic SDK tool runner, Opus 5.5 by default, refusal fallbacks, prompt caching) that drafts through the real gateway. Scenarios: drafting, prompt injection (AT-17) and mid-run revocation, judged by database and gateway records, with token and cost reports and a `--self-test` mode.
- `DESK_DB_PREPARE` for the Supabase pooler's transaction mode.
- "Operations desk UI patterns" in the `sc-visual-codex` skill.

### Changed
- `DESK_TRUSTED_PROXY_HOPS` is required in production.
- The founders' decision to keep the intake limits as built is recorded in `docs/DESK.md`.
- Version 0.3.0.

### Fixed
- Settings no longer scrolls sideways on phones: table scroll containers now contain their visually hidden labels.

## [0.2.0] - 2026-11-18 · Session S01, turn 2 · `claude/intelligent-cannon-d1nqq6`

Operations desk foundation (SC-005) and its first vertical slice (SC-006, SC-007, first part of SC-009). Local Supabase only; nothing is deployed and nothing publishes.

### Added
- `apps/desk`: Next.js 16.4 operations desk. Magic-link staff sign-in (sign-up disabled), `/no-access` for identities without a staff role, Today (due, decisions, post-review placeholder, failures), Stories (list, commission, detail with one next action and the exact Ghost editor link), Contributors (pitch queue and decisions), Distribution (honest "not built yet"), Settings (staff, agents, tokens, audit trail). Working Waterfront tokens, self-hosted fonts, accessible forms.
- Public `/pitch` intake: text only, consent-gated, throttled per client and overall, honeypot, receipt only.
- `supabase/migrations/20261118180000_desk_foundation.sql`: principals, staff assignments, pitches, editorial items (content IDs `SC-YYYY-NNN`, unique Ghost post ID), sources (agent-processing flag, staff-only private columns), asset rights, agent grants, draft proposals, hashed agent credentials, append-only audit trail; Row Level Security on every table; `desk_app` role-switching data access (ADR-003).
- Draft-only agent gateway `POST /api/agent/v1` on the kit contract: token auth inside the database, scopes, grants, redaction, idempotent `drafts.propose`, `jobs.read`, audit of every request.
- Security middleware: nonce CSP, request IDs, hardening headers; OpenTelemetry instrumentation; pino logs with redaction.
- Tests: 108 pgTAP assertions (mutation-tested), 67 unit tests, 24 Playwright end-to-end tests with axe WCAG 2.2 AA, client bundle secret scan; CI `desk` job running them against a local Supabase stack.
- Independent security review (no Critical or High findings) with every Medium and Low finding fixed: column-level update grants, database-stamped reviewers and deciders, final agent revocation that revokes tokens, SQL-side source redaction for agents, audited sources, rights and refused actions, gateway flood guards and per-agent budget, strict request IDs, serialized intake throttling with trusted-proxy hops.
- Operator CLIs (`staff`, `agent`), `apps/desk/.env.example`, `docs/DESK.md`, `packages/contracts` validator package.

### Changed
- ADR-003 records the decisions made during the build (Cache Components off, ESLint 9, OpenTelemetry API 1.9.1, global stylesheet on tokens, gateway scope).
- Root scripts: `desk:*` and `db:*`; `pnpm check` includes the desk's static checks. Version 0.2.0.
- CONTRIBUTING: minor version per milestone turn.

## [0.1.0] - 2026-11-18 · Session S01 · `claude/intelligent-cannon-d1nqq6`

Repository foundation, tooling and planning readiness. No application code.

### Added
- Development kit unpacked at the repository root (byte-identical); founder originals in `packet/` with SHA-256 checksums.
- Delivery tracking: `devtrack/` (sessions, workstreams, append-only evidence with JSON Schemas), `devlog/` timestamped entries, generated `docs/IMPLEMENTATION_STATUS.md`.
- Validators (`pnpm validate`) for backlog, calendar, decisions, acceptance matrix, agent contract (17 example requests), fixture guard, packet checksums, Markdown links and evidence rules; tool unit tests.
- Project hub (`pnpm hub:build`): overview, backlog with dependency graph and critical path, acceptance, decisions, editorial plan, visual codex, rendered docs, dev log and evidence; WebGL bathymetry masthead with fallbacks; strict CSP.
- GitHub Actions: CI (validate, test, hub build/check, actionlint, shellcheck, gitleaks, GLSL validation) and Pages previews for every branch.
- Pinned, checksum-verified tool bootstrap (`tools/bootstrap/install-dev-tools.sh`); Node 24 LTS; pnpm 12 supply-chain gates.
- Design tokens (`brand/tokens.json`) with computed contrast gates; `sc-visual-codex` project skill.
- Kit audit, foundation planning brief, ADR-002, contributing, security, license and third-party notices.

### Changed
- `README.md` keeps the original description and adds navigation.
- `planning/BACKLOG.json` and `.csv`: SC-001 status `planned` → `in_progress` (repository, dev environment and vendor feasibility work begun; founder decisions outstanding).

### Fixed
- `tools/bootstrap/install-dev-tools.sh`: log output no longer corrupts captured download paths; install failures can no longer pass silently (found by CI run 1, EV-0015).

### Removed
- `Seafood_Confidential_Launch_Packet.zip` from the working tree (sha256 `4871128f…fd934b04`); recoverable with `git show 2eb9723:Seafood_Confidential_Launch_Packet.zip > Seafood_Confidential_Launch_Packet.zip`.
