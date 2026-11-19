# Delivery tracking (devtrack)

This folder records **what was done, by whom, when, and what was observed**. It complements, and never copies, the kit's planning sources.

| Question                                         | Canonical source                                                                                                 | Updated with                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| What work exists and what is its status?         | [planning/BACKLOG.json](../planning/BACKLOG.json) (with [BACKLOG.csv](../planning/BACKLOG.csv) kept in lockstep) | `pnpm devtrack ticket SC-### <planned\|ready\|in_progress\|blocked\|done>`                   |
| Which acceptance scenarios ran?                  | Status column of [docs/ACCEPTANCE_TESTS.md](../docs/ACCEPTANCE_TESTS.md)                                         | Edit the table and record evidence of kind `test`                                            |
| What did we actually observe?                    | [evidence.json](evidence.json)                                                                                   | `pnpm devtrack evidence --subjects … --kind … --result … --summary … --steps … --observed …` |
| Which sessions produced which versions?          | [sessions.json](sessions.json)                                                                                   | Edit at session start and hand-off                                                           |
| What enabling work sits outside the kit backlog? | [workstreams.json](workstreams.json)                                                                             | Edit when a workstream changes state                                                         |
| What happened each turn, in prose?               | [devlog/entries/](../devlog/README.md)                                                                           | `pnpm devlog:new --title "…"`                                                                |
| Where do we stand overall?                       | [docs/IMPLEMENTATION_STATUS.md](../docs/IMPLEMENTATION_STATUS.md) (generated block)                              | `pnpm devtrack status --write`                                                               |

## Rules (enforced by `pnpm validate`)

1. **Evidence before claims.** A ticket can be marked `done` only with an evidence record whose result is `pass`. An acceptance scenario marked PASS or FAIL needs a record of kind `test`. This is the AGENTS.md rule ("Every claim of a passing check must cite an actual command or observed interaction and date") made mechanical.
2. **Records are append-only.** Evidence IDs are sequential (`EV-0001`, `EV-0002`, …). Correct a record by adding a new one that references it; never rewrite history.
3. **Commits are explicit.** `commit` holds the SHA the observation was made on, or `WORKTREE@<sha>` for uncommitted changes on top of `<sha>`.
4. **Subjects must exist.** Each subject is a kit ticket (`SC-###`), acceptance scenario (`AT-##`), founder decision (`D##`), ADR (`ADR-###`) or workstream (`WS-…`).
5. **Times carry offsets.** Timestamps are ISO 8601 in the planning timezone `America/New_York` with an explicit offset (for example `2026-11-18T11:16:00-05:00`).
6. **No secrets or private data.** Evidence describes what happened, not credentials, subscriber data, private contacts or confidential sources (AGENTS.md).

## Status vocabularies

| Record                    | Values                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Kit ticket (BACKLOG.json) | `planned`, `ready`, `in_progress`, `blocked`, `done`; the workbook shows Proposed, Ready, In progress, Blocked, Done |
| Acceptance scenario       | `UNRUN`, `BLOCKED`, `PASS`, `FAIL`                                                                                   |
| Founder decision          | `Proposed`, `Discussing`, `Decided`, `Deferred`                                                                      |
| Evidence result           | `pass`, `fail`, `blocked`, `info`                                                                                    |
| Session                   | `open`, `handed-off`, `closed`                                                                                       |

The JSON Schemas in [schema/](schema/) define every record.
