# Acceptance tests

All tests below started **UNRUN**. A PASS means a recorded local run (database, unit and end-to-end tests; evidence in devtrack/evidence.json), not a hosted verification. AT-27 to AT-30 and the rewording of AT-02, AT-04, AT-10, AT-15, AT-19 and AT-26 follow ADR-005 (18 November 2026).

| ID | Scenario | Required observed outcome | Status |
|---|---|---|---|
| AT-01 | Guest A requests Guest B draft by guessed object ID | Denied; no private fields in error | UNRUN |
| AT-02 | Guest contributor or editor attempts publish | Denied: contributors have no desk role, and only owners and managing editors publish (ADR-005) | UNRUN |
| AT-03 | Reader member requests operations data | Denied; reader identity confers no staff role | PASS |
| AT-04 | Agent sends published status through a draft tool, or an unknown publish tool name | Rejected before anything is published; agents publish only through drafts.publish under policy (ADR-005) | PASS |
| AT-05 | Agent edits an already published item | Denied; a correction proposal is required | UNRUN |
| AT-06 | Agent requests subscribers or private contact/source records | Denied or explicitly redacted by scope | PASS |
| AT-07 | Revoke one agent, leave another active | Revoked principal immediately denied; other scope unaffected | PASS |
| AT-08 | Save a draft with an old expected revision | Conflict shown; newer edit retained | PASS |
| AT-09 | Change an article after review snapshot | Old snapshot retained; review and social packs marked stale | UNRUN |
| AT-10 | Content published outside the desk (direct Firebase Hosting deploy) | Actual boundary documented (Hosting deploy rights on the Google project); no false technical-gate claim | UNRUN |
| AT-11 | Agent creates Buffer output with Needs Approval identity | Remains a draft awaiting a human | UNRUN |
| AT-12 | Duplicate identical request key | One durable local job, existing result returned | PASS |
| AT-13 | Duplicate key with different body | Conflict; original operation untouched | PASS |
| AT-14 | Provider accepted possibly, then times out | Needs-attention/reconciliation; no blind duplicate retry | PASS |
| AT-15 | A publication is repeated or retried after a timeout | The same full site snapshot is redeployed; no duplicate story, page or email | PASS |
| AT-16 | Search public routes, feeds, sitemaps, previews and media for drafts | No restricted material or private metadata retrievable | UNRUN |
| AT-17 | Malicious embedded prompt in source/guest text | Treated as content; no expanded authority or secret access | UNRUN |
| AT-18 | Script upload, hostile HTML and internal URL fetch through public/agent intake | Rejected or sanitized; no execution or internal access; trusted native Ghost HTML cards are reviewed separately | PASS |
| AT-19 | Test subscriber joins and unsubscribes (Kit form on the public site) | Consent and preference flow complete; test address stops receiving | UNRUN |
| AT-20 | Publish article but choose no email | No newsletter sent | UNRUN |
| AT-21 | Restore sample backup and revision | Content, mapping and permissions recover as documented | UNRUN |
| AT-22 | Friend completes main workflow on phone and laptop | Clear next actions, accessible controls and useful failures | UNRUN |
| AT-23 | Inspect client bundle, responses and logs | No vendor secrets, service keys or unnecessary private records | PASS |
| AT-24 | Inspect public reporting/opinion/sponsor labels and correction | Label visible; correction attributable and timestamped | UNRUN |
| AT-25 | Database table grants, RLS policies, views and privileged functions | Actual grants match intended access; no exposed bypass through views/functions | PASS |
| AT-26 | Embargoed media and confidential draft preview | Remain in the authenticated desk; nothing reaches the public site before publication | UNRUN |
| AT-27 | Agent publishes its own proposal in an open section with every check passing | Published without a person; labelled AI-written with the disclosure and citable sources; attributed to the agent and audited | PASS |
| AT-28 | Agent tries to publish with the switch off, a closed section, no publish scope, or a failing check (quote, contact details, uncitable source, image, HTML, length, daily cap, email) | Refused before anything is published; failed checks returned and audited | PASS |
| AT-29 | A person has written or edited the story, then an agent tries to publish it | Refused; the person's text is never overwritten | PASS |
| AT-30 | Staff switch agent publishing off while agent jobs are queued | Queued agent jobs cancelled; agents publish nothing further | PASS |

Evidence record per test: date, environment, commit, operator, steps, observed result, evidence location, defect ID if any. Test production-affecting actions using test destinations first. Do not send live newsletters or publish test posts to real audiences to prove a staging behavior.
