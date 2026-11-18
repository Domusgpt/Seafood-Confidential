# Product specification

> **Update, 18 November 2026 ([ADR-005](../decisions/ADR-005-desk-publishing-without-ghost.md)):** the founders chose a Ghost-free start. Stories are written and published from the operations desk to a static public site (Firebase Hosting), the newsletter runs on Kit's free plan, and agents may publish their own proposals only inside the owner's switches and automated checks. Where this specification names Ghost, Ghost roles or Buffer as the place of publication, read the desk equivalent described in ADR-005; the rest of the specification stands.

## Product promise

Seafood Confidential turns the practical knowledge of seafood professionals into useful, source-aware reporting, explanation and conversation about wild fisheries, aquaculture, markets, food and the rules affecting them. The initial editorial focus is industry practitioners and curious serious readers, in English, with worldwide scope handled story by story.

## Launch users

| Person | Job to complete | Access |
|---|---|---|
| Founder owner | Control accounts, money, brand and recovery | Named owner/admin in each provider |
| Friend managing editor | Commission, review, publish and distribute | Ghost Editor or Administrator as needed; operations editor; Buffer approver |
| Invited guest | Write and revise an assigned contribution | Ghost Contributor; private access to own drafts |
| Reader | Read, subscribe and manage preferences | Public browsing and separate Ghost member identity |
| AI assistant | Assemble research notes, propose drafts, prepare channel copy | Named draft-only service principal |

A guest is not an Author role until the editor deliberately wants them able to publish their own work. Keep public submissions to moderated pitches at launch. Ghost staff are trusted content creators; an invitation is not a sandboxed public account. Review guest embeds and scripts before publication.

## Required publication surface

Home, latest, story, section/topic, author, about, contribute, newsletter signup, standards/corrections, privacy/contact and a podcast-ready story format. Search and feeds include only material authorized for public distribution. Use the chosen Ghost theme's mature components. Final privacy/legal policy wording requires the actual business, audience and provider details, not invented promises.

## Required operating surface

The private home answers: What is due? What needs a decision? What changed after review? What failed? It provides named-owner rows and links to the actual Ghost editor or Buffer draft, with a minimal data-entry burden. Queue views: assignments, guest pitches, drafts, review, social packs and corrections. Source and rights records are visible to appropriate editors and absent from public reader views.

## Primary end-to-end journey

A guest pitches a story. The editor accepts and assigns it. A guest or agent produces a draft with source references and image credits. The editor reviews and returns changes. A review snapshot records the exact current draft. The editor publishes the web article in Ghost and separately decides whether to send the newsletter. The operations system prepares two social drafts. A human approves/schedules them in Buffer. A later factual correction updates the article transparently and flags associated promotion for review.

## Editorial item fields

Title, short summary, body, format, section, author, assigned editor, species or product when relevant, region, fishery/aquaculture/both focus, source records, media credits/permissions, reporting/opinion/sponsorship label, article date, last reviewed date and correction history. Regulatory articles additionally record jurisdiction and instrument/effective date when verified. Unknown details remain unknown rather than being generated as facts.

## Launch exclusions

No forum, open self-publication, full marketplace, automated regulatory advice, custom payment engine, custom mobile app, built-in autonomous research loop or fully automated podcast. A newsletter and a useful small archive are the first product; optional audio grows from actual interviews.

## Success criteria

The friend can operate the full workflow without developer access. An invited contributor can work privately. Agents save preparation effort without gaining publishing authority. Readers receive only opted-in email. Editorial decisions, correction history and rights evidence are findable. Failed automation is visible and can be completed manually. Track real time per story and repeated reader response before expanding the system.

No traffic or revenue forecast is part of this technical specification.
