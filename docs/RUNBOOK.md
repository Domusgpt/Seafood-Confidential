# Editorial and operations runbook

This is the proposed runbook. Replace placeholders with real account owners, provider links, support contacts and observed procedures during the sprint. It has not been rehearsed against a deployed application.

## Daily opening

The managing editor opens the operations home, reviews due items and failed jobs, checks changed-after-review flags, and chooses the next editorial decision. The dashboard links to the authoritative Ghost draft or Buffer draft. Publication, newsletter and social are three separate decisions.

## Invite and commission

Confirm the guest's identity and the intended topic. Invite only a trusted contributor; Ghost staff can create rich HTML and embeds, so review these before publication. Do not share confidential draft preview URLs or upload embargoed source media into public-ready Ghost storage. Create a Ghost Contributor invitation, record the assignment and explain source, credit and disclosure requirements. Keep their personal contact and media permission records private. A public pitch receives an editorial disposition before anyone gets a staff account.

## Review an article

Check the thesis, actual sources, attribution, quotations, date/jurisdiction for regulatory claims, rights to each image/audio segment, conflicts and the reporting/opinion/sponsorship label. Capture the reviewed version. If it changes, inspect the difference and create a new review record. AI output is a draft; the human byline remains responsible for the final piece.

## Publish and distribute

Preview desktop/mobile article and email in Ghost. Publish or schedule the web article only after the final human review. Send a test email and explicitly select whether to send the live newsletter. Review the exact social copy, destination account, image credits, link and timezone in Buffer; approve or schedule as a human. Agent-generated social items remain drafts until that action.

If the article later changes, inspect its stale social packs and any posts already scheduled in Buffer. Revise, pause or cancel native scheduled promotion as appropriate. A console flag does not itself cancel Buffer's queue.

## Failed draft automation

Open the job and read its plain-language state. A documented rejected request can be corrected. A transient failure may be retried within the configured limit. If the provider may have accepted the request but the response is unknown, inspect the provider first and reconcile its ID; do not press retry repeatedly. Use the manual social export or native editor if the integration remains unavailable. Record what was done so a later retry does not duplicate it.

## Correction

Record the concern and current version. Verify the correction with appropriate evidence. Edit the article and add a visible correction note when substantive. Record reviewer and date. Inspect affected email/social copies: delivered email cannot be edited retroactively, and an already published social post may need an update or follow-up. Preserve the previous review record and state exactly which destinations were corrected.

## Security incident

If a credential or account appears compromised, pause affected automation, revoke that credential/session using the provider's native controls, rotate server secrets, inspect audit events and unauthorized changes, and involve the named account owner. Preserve useful evidence without exposing secrets in shared logs. Assess whether readers or contributors need a communication based on actual affected data and appropriate advice. Re-enable only after permission checks and an operator review.

## Backup and recovery

The owner keeps access to the domain, Ghost, Buffer, Supabase, hosting, source repository and billing. Export Ghost content/settings, themes, routes, members and media where supported. Back up the operations database and private rights/release assets separately. Keep recovery credentials in an owner-controlled password manager. Rehearse a sample restore before launch and periodically after material changes.

Proposed initial targets: operations recovery point within one day and essential service restoration within one business day. These are targets until measured. Record the last restore date, what was recovered, how long it took and what remained missing.

## Weekly review

Review the next two weeks of assignments, guest follow-ups, corrections and failed jobs. Compare actual editor time per story with the promised cadence. Inspect opt-in audience growth, substantive replies and returning readers; do not make raw AI output volume a success metric. Refresh regulatory articles when their source situation changes. Review agent scopes, active contributors and integration spend.

## Required handoff fields

Business/account owner; managing editor; developer support contact; authoritative domain registrar; vendor admin URLs; billing schedule; recovery location; secret rotation owner; backup schedule; last restore evidence; social channels; current API limitations; live launch authorization date. Store sensitive values privately.
