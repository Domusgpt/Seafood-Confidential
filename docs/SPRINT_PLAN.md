# Development sprint plan

## Commitment and assumptions

Target twenty working days from a chosen kickoff, with one experienced full-stack developer and available founders. Engineering estimate 107–149 hours plus 11 hours reserve, 118–160 hours total. Founder/editor input is approximately 10–16 hours in addition. Choose one existing theme and two social channels. Do not treat external account/API approvals as guaranteed completion dates.

## Sequence

| Working days | Outcome | Tickets |
|---|---|---|
| 1–4 | Accounts, permission baseline, public shell and email journey | SC-001 to SC-004 |
| 5–9 | Private operations, pitches, evidence records and canonical Ghost links | SC-005 to SC-007 |
| 10–14 | Review snapshots, constrained agent drafts, provider adapter and durable jobs | SC-008 to SC-011 |
| 15–17 | Episode-ready format, editorial policies, recovery and failure checks | SC-012 to SC-015 |
| 18–20 | Operator rehearsal, corrections, findings and reserve | SC-016 and necessary fixes |

Dependencies in planning/BACKLOG.json are authoritative; the day ranges are a planning envelope, not evidence of work completed. Re-estimate after the Day 1 vendor/API check and after the first vertical slice.

## Founder decisions at kickoff

Name the managing editor and business account owner. Choose the launch audience, brand direction, theme, two channels and initial publishing cadence. Supply approved founder bios, real contact details and three seed article briefs. Confirm whether existing subscriber data has permission for this publication before importing it. Decide which details may be used by AI agents and which remain private.

## Cut line

Keep permission tests, source/rights review, exact drafts, corrections, recovery and operator usability. If API access blocks a provider adapter, deliver the exact copy/export pack and keep the integration ticket explicitly blocked rather than claiming it works. Defer custom SSO, custom contributor editor, autonomous publication, built-in model orchestration and actual podcast distribution.

## Release demonstration

The managing editor accepts a pitch, reviews a guest draft and its evidence, returns changes, publishes in Ghost, sends a test newsletter, makes the live send decision, approves two Buffer drafts, detects an after-review edit, adds a correction and finds a recoverable version. The developer demonstrates agent publish denial, cross-user draft denial, duplicate request handling and unknown provider outcome handling. The friend performs the daily workflow without reading source code.

## Gate record

For each ticket record commit, owner, observed acceptance result and unresolved item. Application test status starts UNRUN. Do not infer a pass from document completeness. Founder review of staging precedes any real public launch, email send or social posting.
