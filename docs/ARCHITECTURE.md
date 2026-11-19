# Architecture

## Recommended systems and data ownership

| System | Owns | Does not own |
|---|---|---|
| Ghost(Pro) Publisher | Canonical article drafts/published content, authors, public theme, newsletters, members | Private pitch/source workflow or unrestricted agent access |
| Next.js operations console | Private workflow views and authenticated internal API | A second article editor or newsletter engine |
| Supabase Postgres and Auth | Operations principals, RLS-protected records, jobs and review snapshots | Ghost member identity or publication content authority |
| Buffer Team | Channel connections, human social approval and scheduling | Article verification or an automatic authority to publish new claims |
| Dedicated podcast host later | Audio files and podcast RSS if a pilot warrants it | Launch dependency |

Use one private operations application and a small durable job runner. Avoid microservices. Deployment provider selection may follow an existing founder account; the product design does not depend on a specific Next.js hosting vendor. Use a paid plan appropriate for commercial hosting where required. Pin runtime/package versions at implementation time.

## Access and identity

Ghost member, Ghost staff, operations human and operations agent are distinct identities. Link known staff IDs when needed; do not infer that matching email addresses confer extra authority. Supabase Auth permits entry to operations only after explicit staff assignment. Enable RLS on exposed tables and storage, and explicitly revoke/grant only the required database privileges in the same migrations. Adding policies does not remove pre-existing grants. Check views and privileged functions as well as tables. Set policies by authenticated principal, role and item ownership; unauthenticated callers may only submit a bounded pitch through the vetted service endpoint. Service-role keys bypass ordinary RLS and belong exclusively in carefully authorized server code.

Agent credentials are unique, scoped, revocable and stored as hashes or in the provider's supported secure credential store. They grant only documented draft operations and specific object access. No owner/admin token is given directly to a model, browser or guest. Ghost Admin API credentials remain server-side. Prefer a dedicated Contributor identity for draft writes if supported by the chosen deployment's API actions; verify negative permissions rather than assuming them. Provider integration tokens can have broader rights than the internal gateway exposes.

## Operations tables

Principals; pitches; editorial_items with a unique Ghost post reference; sources; asset_rights; append-only review_snapshots; social_drafts with channel/account and upstream snapshot; jobs/outbox with idempotency key and payload hash; audit_events. Keep raw private contacts and releases in restricted tables/storage. Store source metadata, not unbounded scraped copies of copyrighted articles. Schemas in this kit describe design intent; migrations must be implemented and reviewed.

Ghost's advertised custom fields currently refer to member fields, not arbitrary article schemas. Keep detailed species, jurisdiction, claim and review metadata in operations Postgres linked by ghost_post_id. Only selected approved metadata is copied into article source-note blocks, excerpts or supported tags. Public browsing uses tags and native search in the MVP; advanced species and legal-status faceting is phase two.

Ghost stays canonical for editable article content. Review snapshots are exact historical payloads used for comparison, not a separately editable content system. The agent uses expected revisions; Ghost updates use its documented updated_at collision control and deliberate save_revision behavior. Edits mark old review snapshots and attached social packs stale.

## Phase one execution boundary

Humans publish/schedule in Ghost, explicitly choose newsletter sends, and approve/schedule in Buffer. The operations console provides review information and exact proposed promotional copy. Agents never invoke publication, email sends or approval. A native Ghost editor or Buffer approver can act outside the console; this is documented, trained and checked operationally, not claimed as technically impossible.

If content changes after a social post was scheduled in Buffer, flag the pack and ask the editor to inspect, revise or pause the native scheduled post. A console banner cannot revoke an already accepted third-party queue operation by itself.

## Jobs and provider failures

At acceptance, write the request and job durably in one transaction. Enforce uniqueness on principal plus operation plus idempotency key; an identical replay returns the existing job, while a different payload with the same key returns conflict. Workers use bounded leases, retry limits and a dead-letter/needs-attention state. Record provider IDs when returned. If a request times out after possible acceptance and the provider cannot authoritatively deduplicate/reconcile it, do not blindly retry. Require human inspection and reconciliation. Never promise exactly-once external delivery.

Webhook handlers authenticate according to current supported vendor mechanisms, reject malformed payloads, deduplicate notifications and re-fetch canonical content before deriving a change. Periodic reconciliation catches missed events. Webhooks may trigger draft preparation; they do not authorize publication.

## Data and media boundaries

Public-ready assets and private releases/source contacts use separate access policies. Do not assume a Ghost media URL becomes private because its parent article is still a draft. Keep embargoed or sensitive source media in private operations storage until the editor clears public use. Ghost shareable preview URLs may be read by anyone holding the link; use native authenticated staff review for confidential drafts and do not expose those links to broad workflows.

Ghost considers invited staff trusted content creators, including their use of HTML/scripts. Contributor permissions prevent publication, but are not a hostile-user content sandbox. Invite trusted guests only, accept unknown public contributions through moderated pitch intake, validate agent-produced content and review native HTML/embed cards before publication.

Public assets and private releases/source contacts use separate access policies. Check file type and size, sanitize rich text and avoid fetching internal network addresses from user-supplied URLs. Keep a test that attempts public retrieval of draft media, including social previews, feeds, search and source maps. Staff-only previews require real access restriction; robots noindex is insufficient.

## Future hard automation gate

A later release service would require human approval bound to exact payload digest, destination, assets, schedule, expiry and reviewer authority. Before execution it rechecks revision and approval. Changed content invalidates authorization. Revisit whether native human publication paths remain allowed. This is phase two, not an implemented feature or launch claim.

## Primary references checked November 17, 2026

- Ghost roles: https://ghost.org/help/managing-your-team/
- Ghost Admin API auth: https://docs.ghost.org/admin-api
- Ghost updates and revisions: https://docs.ghost.org/admin-api/posts/updating-a-post
- Ghost webhooks: https://docs.ghost.org/admin-api/webhooks/overview
- Ghost publishing and email choices: https://ghost.org/help/publishing-content/
- Buffer approvals including API/MCP: https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Ghost trusted-staff security model: https://docs.ghost.org/security
- Ghost exports: https://ghost.org/help/exports/
