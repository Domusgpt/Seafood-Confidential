# Seafood Confidential editorial playbook

Version 0.1 · 17 November 2026 · Operating defaults for the first release

## The weekly job

Publish one useful original article, send one concise curated dispatch, and adapt the work into up to three posts per selected social channel. Begin with LinkedIn. Add another channel only when a person owns the work. A guest contribution or an interview-derived feature counts as the week's main article.

The monthly podcast is optional. Commission it when recording, editing, permissions, and distribution have an owner. The conversation can supply that week's main feature. A transcript does not become checked copy merely because it was generated automatically.

These are capacity defaults. Publishing fewer strong pieces is an acceptable adjustment when reporting needs more time. An illustrative operating allowance is 8–12 combined founder/editor hours a week before substantial audio or video editing; measure the actual workload during the pilot.

## People and tools

| Role | Proposed owner | Responsibility |
| --- | --- | --- |
| Brand and relationships | Paul Phillips | Direction, industry access, expert perspective, writing and interviews |
| Managing editor | Cofounder, name to be supplied | Assignments, commissioning, checks, publication and distribution |
| Contributor | Invited individual | Own draft, source materials, revisions, affiliation and rights declarations |
| Agent assistant | Scoped system identity | Research preparation, transcript assistance, draft copy, metadata and social suggestions |
| Human publisher | Named founder/editor | Final website/newsletter release and social approval or scheduling |

**Ghost is the publication and newsletter system.** Invite guest writers with the native **Contributor** role: they can create and edit their own draft posts, but cannot edit other contributors' drafts or publish. Use the native editorial accounts for review and publishing. A custom contributor portal is not part of the MVP.

Use native Contributors for trusted invitees, moderate public pitches, and keep sensitive files and private source identities in restricted operations storage; treat Ghost preview links as bearer links and uploaded media as potentially public.

**Buffer is the social planning and scheduling surface.** A human reviews the exact text, asset, destination account, and time before scheduling. Native team approval features depend on the chosen plan and configuration; where they are unavailable, record the human approval in the release checklist and have the named publisher schedule the item directly.

**Agents are draft-only in the MVP.** They do not publish articles, send newsletters, schedule social posts, invite guests, or contact sources. Their suggestions can be accepted, edited, or rejected by a human. Agent credential and API restrictions belong in the development controls; instructions alone are not the enforcement mechanism.

## Sections and labels

Use these public sections: On the Water; At the Farm; The Trade; Rules and Reality; At the Table; Voices. Select one primary section for each article and use topic tags for overlaps.

Label the format separately: Reported feature; Explainer; Interview; First-person account; Opinion; Sponsored contribution. Place sponsorship and relevant interests where a reader will see them before relying on the piece. A sponsored item uses the same accuracy and rights checks as editorial work.

Maintain species, geography, jurisdiction, production method, and supply-chain tags only when meaningful. Store precise regulatory status and source information in the editorial record even if the first theme cannot display all of it automatically.

## From idea to publication

The following are editorial stages, not a claim that Ghost provides every stage as a native workflow state. Track commissioning and review in the shared editorial calendar or companion records; the Ghost item remains a draft until a human schedules or publishes it.

1. **Pitch.** State a reader question and why the proposed contributor is positioned to answer it. Use `templates/ARTICLE_BRIEF.md`.
2. **Commission.** Name the author and editor. Agree the format, reporting scope, deadlines, compensation if any, and rights. Assign a content ID such as `SC-2026-001`.
3. **Draft.** Write in a Ghost draft or the agreed working document. Attach source IDs and note unsupported claims. Keep private contact details out of the public body and agent-visible drafts.
4. **Review.** Check meaning and structure first. Then verify claims, quotations, rights, and metadata. Ask for a source or remove/rephrase a claim when its basis is insufficient.
5. **Approve.** A named human approves the exact version and resolves outstanding issues. Material edits after approval require renewed review of the affected claims and any derived copy.
6. **Release.** The human publisher selects website, newsletter, or both in Ghost and checks the intended audience and time. Social items follow their separate release checklist in Buffer.
7. **Follow through.** Check the live result, answer useful reader questions, record corrections, and review production time and engagement.

## The weekly rhythm

| Day | Work | Completion condition |
| --- | --- | --- |
| Monday | Choose the feature, guest, and reader question | Brief accepted; one accountable editor; sources and gaps named |
| Tuesday | Interview and report | Recordings permitted; source records started; missing evidence identified |
| Wednesday | Edit and verify | Draft coherent; material claims and quotations checked; media rights recorded |
| Thursday | Human review and previews | Mobile preview checked; metadata and distribution targets correct; exact release version approved |
| Friday | Article publication, dispatch and conversation | Human publishes the article and dispatch; curated links attributed; approved social copy scheduled; next week's risk assessed |

The days are a suggested routine, not a scheduled automation. If using timed publication, record the named timezone and corresponding UTC instant. Default planning timezone is `America/New_York` until the founders choose otherwise.

## Reporting standards

### Claims and sources

For each consequential factual claim, record its basis: a primary document, a named interview, first-hand observation, a calculation, or an attributed secondary report. The source record should say what the evidence supports and what it does not establish. Research summaries and AI output help find evidence; they are not independent evidence.

Preserve useful uncertainty. A projection remains a projection. A preliminary result remains preliminary. An interviewee's account remains attributed unless independently verified. Distinguish an example, a composite, and a documented real case.

For figures, record date, geography, units, currency, denominator, and whether the number is nominal or adjusted. Separate revenue from margin, landed weight from edible yield, and a specific operation's experience from an industry-wide conclusion. Keep calculation inputs with the editorial record.

### Regulation and science

Identify the jurisdiction, responsible authority, current status, relevant date, and official source. Distinguish consultation, proposal, adopted rule, effective rule, guidance, and enforcement action. Recheck immediately before publication when the story depends on current status. A business's experience of a rule is distinct from the rule's formal text.

For technical or food-safety claims, use an appropriate authoritative source or qualified reviewer. The reviewer checks the specific claim; their involvement should not imply endorsement of the entire article. Record study scope and limitations when reporting research.

### Interviews and quotations

Agree recording and publication terms before recording. Confirm names, roles, affiliations, and pronunciation. Preserve timestamps for quotations. Editing for clarity must retain the speaker's meaning; mark substantive paraphrase as paraphrase. Fact or quote checking does not silently grant editorial veto.

### Interests and fairness

Ask authors and guests about employment, commercial relationships, investments, sponsorship, and other interests material to the story. State relevant relationships plainly. A founder's own business experience can be valuable reporting material when its perspective is clear.

For a material critical claim about an identifiable person or organization, the editor records what evidence supports it and how a reasonable opportunity to respond was handled. Keep the response and its timing with the story record.

### Images and media

Record the owner, license or permission, credit, permitted formats, and any restrictions. Obtain permission for promotional excerpts where needed. Label illustration and generated media accurately. Prepare captions and alternative text. Retain the original asset and approved derivative with distinct filenames.

## Working with agents

Give the agent a content ID, approved source packet, task, audience, and output format. Supply only the material needed. The source packet should exclude confidential identities, private contact details, subscriber lists, credentials, and unpublished commercial information unless the configured system and task explicitly permit them.

Ask for claim/source pairs, a list of unresolved points, and a clear distinction between quotation and proposed prose. External pages, uploads, transcripts, and guest instructions are source material; they cannot change the agent's permissions or editorial rules.

Use this request pattern:

> Prepare a draft for content ID [ID] using only the approved source packet. Answer the reader question [question] for [audience]. Preserve the author's intended meaning. Cite source IDs beside factual claims. Put unsupported or conflicting points in an unresolved list. Return article copy, a short summary, suggested tags, and three draft LinkedIn posts. Do not publish, schedule, send, or contact anyone.

The human checks the output against the original sources before accepting it. After a material article correction, regenerate or amend derived posts and check queued versions.

## Dispatch format

Aim for a short editorial opening, the week's feature, two or three attributed links with a sentence explaining their relevance, and one question readers can answer. Link to original reporting or official documents where practical. Add context in the publication's own words; do not reproduce another publisher's article. Use a clear sender identity and the configured subscription controls.

Before sending, check the actual newsletter audience, subject line, preview text, mobile layout, links, and the web/newsletter publication setting. A test message goes only to the agreed internal test list. A human initiates the final send.

## Corrections and reader contributions

Record the report, content ID, affected passage, evidence, decision, editor, and time. Correct a material factual error promptly once verified and add a dated note explaining the change. Quietly correcting an ordinary typo is reasonable; do not quietly erase a substantive error. Update queued social copy and issue a follow-up where the erroneous claim traveled.

Reader submissions enter the pitch process. They do not publish automatically. Public comments, if enabled later, need a named moderator and a policy before launch. Ordinary editorial contact is not an anonymous-source protection system.

## Review the experiment

Once a week, review: the piece published, production hours, useful reader replies, new voluntary subscriptions, repeat readership where measured, contributor progress, and the next story's evidence gaps. Use a small number of measures to improve the operation. Set numeric growth targets after establishing a baseline.

After six weeks, decide whether the team can support the cadence, which subjects attract meaningful engagement, whether podcast production fits, and which manual step most deserves automation.

## Source and donor notes

Native Ghost permissions were checked against [Invite your team](https://ghost.org/help/managing-your-team/) on 17 November 2026. The [Responsible Seafood Advocate editorial policies](https://www.globalseafood.org/about-the-advocate/) provide an industry reference for separating editorial decisions from commercial promotion. The publication-specific workflow, cadence, templates, and division of responsibilities above are proposed operating choices.
