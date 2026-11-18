# ADR 005 Ghost-free publishing from the desk, with agents publishing under policy

Date: November 18, 2026. Status: **Accepted** by Paul (founder) in session S01, turn 4. Dave should confirm as co-founder (D04 launch scope, D06 publication authority). Supersedes [ADR-004](ADR-004-desk-driven-publishing.md) (proposed). It also replaces the part of [ADR-001](ADR-001-managed-publishing.md) that made Ghost the publishing platform at launch.

## Context

The founders asked for three things in turn 4:

1. "I want ghost and agents publishing. To be in the scope I don't want this hindered for human work to get added."
2. "Go over these costs and make sure we aren't wasting or can't do this cheaper and better to start."
3. After a cost review showed that Ghost(Pro) was the largest recurring cost and was replaceable: "Let's go ghost free and cheap to start."

The kit's original rules said that agents only draft and that Ghost is canonical for articles, the newsletter and members. ADR-004 had proposed automatic Ghost drafts with one-click human publishing, and had rejected autonomous agent publishing. The founders have now decided otherwise. This ADR records that decision and the safeguards that make it workable.

## Decision

### 1. The desk publishes the site itself (no Ghost at launch)

- **Writing:** stories are written in the desk (`app.articles`). Every save is kept (`app.article_revisions`). A save from an outdated page is refused, so a newer edit is never lost (AT-08).
- **Rendering:** publishing renders the whole public site from the published articles: home, sections, stories, RSS feed, sitemap and a 404 page.
- **Deploying:**
  - Production deploys to **Firebase Hosting** through its REST API. Hosting is free, has a CDN and serves our own domain. No key file is needed on Cloud Run.
  - Development and the tests write the site into a local folder.
  - Every deploy is a full snapshot, so repeating one is harmless. One build runs at a time, so two publications can never drop each other's story.
- **Design:** the site follows the Working Waterfront visual codex. It uses self-hosted fonts, the bathymetry motif on the home page, a strict CSP with no inline script or style, and a WCAG 2.2 AA scan of every page type.
- **Newsletter:** Kit's free plan, free up to 10,000 subscribers per kit.com/pricing on 18 November 2026. The site carries the signup form. A story is emailed only when the person publishing ticks the box, or, if the owner allows it, when an agent asks.
- **Email is at most once:**
  - The desk records the attempt before calling Kit.
  - An uncertain outcome becomes "needs attention".
  - A retry never sends again (AT-14).

### 2. Agents publish without per-post approval, inside switches and checks the owner controls

An agent publishes only its own proposal, through the gateway tool `drafts.publish`, and only if all of these hold. The database evaluates every condition itself, in `app.agent_request_publish`, so an application bug cannot skip one:

- **Switches (owner):**
  - The master switch is on. It is off by default, and anyone on staff can turn it off. Turning it off cancels any agent jobs still queued.
  - The story's section is open to agents. Every section starts closed.
  - The agent's token carries the `drafts.publish` scope, and the story is granted to that agent.
- **The story is untouched by people:**
  - Nobody has written or edited its text.
  - It is still Commissioned or Drafting.
  - No other publish job for it is open.
- **Content checks:**
  - It is reporting, in the explainer or reported-feature format.
  - It cites at least the minimum number of sources (2 by default).
  - Every cited source is readable by the agent and marked **citable** by staff.
  - It contains no direct quotations, no email addresses, no phone numbers and none of the story's private contacts.
  - It contains no images and no HTML.
  - Its length is within limits.
- **Volume and email:** the agent is under the daily cap (5 by default), and email goes out only if the owner allows agents to email.

Every refusal returns the list of failed checks and is audited. When the job actually runs, it checks the switches and "people first" again, so a job queued just before someone turned agent publishing off never publishes. Agent stories carry a visible "Written by an AI agent" label and the owner's disclosure text (AT-24).

### 3. People are never blocked, and their work wins

- **Warnings:** staff publishing returns warnings, such as a missing source, an uncleared photo, or a direct quotation in agent-written text. One click acknowledges them and publishes. The acknowledgement is recorded with the job.
- **Who:** owners and managing editors publish (D06). Every staff member can write.
- **People first:** once a person has written or edited a story, agents cannot publish it.
- **Adopting proposals:** a person can adopt an agent proposal as the starting text. It stays labelled as AI-written, and it counts as human work from then on.

### 4. Separation of duties in the database

- **Who runs publishing:** the site build and upload run in the desk server under a new role, `desk_publisher`. That role can only claim jobs, read the publishable snapshot and record outcomes. Agents can request a publication but can never run or complete one.
- **Writing articles:** staff write articles only through `app.save_article` and `app.adopt_proposal`; there are no direct table writes.
- **Recording publication:** a proposal can be marked published only by the publishing functions. The `private.stamp_review` trigger refuses it for every API role.

## Consequences

- **Cost:** monthly cash at launch drops from about $84–99 to about **$1** (the domain). See [docs/planning/HOSTING_AND_COSTS.md](../docs/planning/HOSTING_AND_COSTS.md).
- **What Ghost gave us that we must replace:**
  - **Member accounts and paywalls:** no paid memberships or paywalled articles at launch. Kit handles paid newsletters if they are wanted (3.5% plus 30¢ per transaction on its free plan).
  - **Theme ecosystem:** the site design is ours to maintain.
  - **Hosted editor:** the desk now has the only article editor. That keeps faith with the kit's rule against two competing editors.
- **Kit superseded:** kit rules that assumed Ghost need replacing: AGENTS.md (updated), the product specification and the acceptance matrix. AT-02, AT-10, AT-19 and AT-26 now refer to the desk and Kit (docs/ACCEPTANCE_TESTS.md).
- **Ghost columns:** `ghost_post_id` and `ghost_updated_at` stay in the schema, reserved and unused, in case a Ghost destination is wanted later.
- **Live services not yet exercised:** Firebase Hosting and Kit are verified with protocol-level fakes only. Their first live runs belong to SC-015, with the founders' accounts.

## Alternatives considered

| Option | Why not now |
| --- | --- |
| Ghost(Pro) Publisher ($29/mo yearly, $35 monthly; $46/mo past 1,000 members) | The most expensive line. Its strengths (memberships, themes, editor) are not needed to start. |
| Self-hosted Ghost | Needs MySQL and Mailgun, so it saves nothing and adds operations work. |
| Beehiiv | The free plan has no custom domain; paid plans start at $49/mo. |
| MailerLite | The free plan is 250 subscribers, and it cannot send through the API. |
| Buttondown | Free only up to 100 subscribers; an archive on our own domain is +$29/mo. |
| The desk serving public pages from Cloud Run | Simpler to build, but the site would go down whenever the database pauses (Supabase Free) or the server is cold. A static site stays up. |
| Fully autonomous agents with no switches or checks | Rejected: invented quotes, misstatements about named businesses and image rights cannot be undone once published. The switches and checks above are the founders' chosen guardrails. |

A Ghost destination was prototyped and verified against Ghost 6.78 before this decision. The facts it established are kept here for a possible future adapter:
- Admin API keys in Ghost 6 are returned as `id:secret` inside the `secret` field.
- Short-lived HS256 tokens work.
- A stale `updated_at` returns 409 `UpdateCollisionError`.
- Internal tags (`#sc-…`, slug `hash-sc-…`) find posts for reconciliation.
- Webhooks are signed as `sha256=<hex>, t=<ms>` over body plus timestamp.

## Review triggers

Revisit this ADR in any of these cases:
- after the first month of agent publishing;
- if a correction is needed on an agent story;
- when paid memberships become a goal (re-evaluate Ghost or an equivalent);
- before raising the daily cap or opening more than two sections to agents.
