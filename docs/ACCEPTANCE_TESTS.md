# Acceptance tests

All tests below start **UNRUN**. This file defines checks; it reports no implemented or passing application behavior.

| ID | Scenario | Required observed outcome | Status |
|---|---|---|---|
| AT-01 | Guest A requests Guest B draft by guessed object ID | Denied; no private fields in error | UNRUN |
| AT-02 | Guest contributor attempts publish | Denied by native role and internal route | UNRUN |
| AT-03 | Reader member requests operations data | Denied; reader identity confers no staff role | UNRUN |
| AT-04 | Agent sends published status or a publish tool name | Rejected before vendor call | UNRUN |
| AT-05 | Agent edits an already published item | Denied; a correction proposal is required | UNRUN |
| AT-06 | Agent requests subscribers or private contact/source records | Denied or explicitly redacted by scope | UNRUN |
| AT-07 | Revoke one agent, leave another active | Revoked principal immediately denied; other scope unaffected | UNRUN |
| AT-08 | Save a draft with an old expected revision | Conflict shown; newer edit retained | UNRUN |
| AT-09 | Change an article after review snapshot | Old snapshot retained; review and social packs marked stale | UNRUN |
| AT-10 | Native Ghost human publishing bypasses console | Actual boundary documented; no false technical-gate claim | UNRUN |
| AT-11 | Agent creates Buffer output with Needs Approval identity | Remains a draft awaiting a human | UNRUN |
| AT-12 | Duplicate identical request key | One durable local job, existing result returned | UNRUN |
| AT-13 | Duplicate key with different body | Conflict; original operation untouched | UNRUN |
| AT-14 | Provider accepted possibly, then times out | Needs-attention/reconciliation; no blind duplicate retry | UNRUN |
| AT-15 | Duplicate webhook and missed webhook | Harmless duplicate; bounded reconciliation detects missing change | UNRUN |
| AT-16 | Search public routes, feeds, sitemaps, previews and media for drafts | No restricted material or private metadata retrievable | UNRUN |
| AT-17 | Malicious embedded prompt in source/guest text | Treated as content; no expanded authority or secret access | UNRUN |
| AT-18 | Script upload, hostile HTML and internal URL fetch through public/agent intake | Rejected or sanitized; no execution or internal access; trusted native Ghost HTML cards are reviewed separately | UNRUN |
| AT-19 | Test subscriber joins and unsubscribes | Consent and preference flow complete; test address stops receiving | UNRUN |
| AT-20 | Publish article but choose no email | No newsletter sent | UNRUN |
| AT-21 | Restore sample backup and revision | Content, mapping and permissions recover as documented | UNRUN |
| AT-22 | Friend completes main workflow on phone and laptop | Clear next actions, accessible controls and useful failures | UNRUN |
| AT-23 | Inspect client bundle, responses and logs | No vendor secrets, service keys or unnecessary private records | UNRUN |
| AT-24 | Inspect public reporting/opinion/sponsor labels and correction | Label visible; correction attributable and timestamped | UNRUN |
| AT-25 | Database table grants, RLS policies, views and privileged functions | Actual grants match intended access; no exposed bypass through views/functions | UNRUN |
| AT-26 | Embargoed media and confidential draft preview | Remain in authenticated/private workflows; no assumption that a Ghost upload or bearer preview is private | UNRUN |

Evidence record per test: date, environment, commit, operator, steps, observed result, evidence location, defect ID if any. Test production-affecting actions using test destinations first. Do not send live newsletters or publish test posts to real audiences to prove a staging behavior.
