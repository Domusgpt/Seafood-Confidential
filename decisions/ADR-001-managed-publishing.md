# ADR 001 managed publishing foundation

Date: November 17, 2026. Status: proposed default for founder confirmation at kickoff. **Superseded in part by [ADR-005](ADR-005-desk-publishing-without-ghost.md) (18 November 2026): no Ghost at launch; the desk publishes the site, Kit sends the newsletter, and agents may publish under policy.**

## Context

Two seafood professionals need a useful publication, invited contributions, email and social distribution that the friend can operate with optional AI help. Their industry knowledge and editorial execution create the value. A first sprint should not require building a rich-text editor, email delivery system, membership engine and media infrastructure.

## Decision

Use managed Ghost(Pro) Publisher for canonical publication and newsletter operations; a small Next.js and Supabase console for private editorial workflow and draft-only agent access; Buffer Team for two social channels and native human approval. Use an existing theme. Keep actual podcast distribution optional after a pilot.

## Why this default

Ghost provides native contributor/editor roles, revisions, publishing schedules, memberships and exports. Its documented Admin API supports integrations and role-based staff access. Buffer documents Needs Approval behavior for API/MCP as well as human interfaces. These existing functions reduce custom launch work. The operations console adds the missing assignment/source/review experience and a constrained agent interface.

## Tradeoffs accepted

Staff use more than one provider login. Human native publishing paths can bypass the operations checklist. Some structured seafood metadata lives in operations rather than an elaborate public database. Provider pricing, permissions and API access are dependencies and must be checked at kickoff. Manual promotion export remains available.

## Alternatives

Payload + Next.js + Postgres offers granular field/document access and custom content structures but requires more assembly for the publication, email, accounts and workflows. Choose it if complex enforced review and structured records become core requirements, not simply to avoid a managed tool. A fully custom CMS has still greater delivery and maintenance cost.

## Review triggers

Revisit when a hard approval gate must apply to every publication path; when regulatory/species dossiers become a structured product; when contributor volume exceeds native role usability; or when a documented provider limitation blocks a valuable workflow. Migration must preserve URLs, assets, authors, permission records and subscriber consent.

## References

https://ghost.org/pricing/
https://ghost.org/help/managing-your-team/
https://docs.ghost.org/admin-api
https://ghost.org/help/exports/
https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA
https://payloadcms.com/docs/production/deployment
https://payloadcms.com/docs/access-control/overview
