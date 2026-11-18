# Dev log

A chronological, timestamped record of every working turn: what changed, why, what broke, what was observed, and what comes next. The log is the narrative half of the tracking system; [devtrack/](../devtrack/README.md) holds the structured half (sessions, evidence, status).

## When to write

- **Every turn that changes the repository** gets an entry before its commit is pushed. A large turn gets one entry; a session with several turns gets one per turn.
- Entries are written by whoever did the work: an agent session or a person.

## How

```bash
pnpm devlog:new --title "Foundation slice: operations shell" --tickets SC-005 --workstreams WS-ENV
```

This creates `devlog/entries/<date>-<session>-<slug>.md` with validated front matter. Then:

1. Add the file to `devtrack/sessions.json` under the session's `devlog` list.
2. Fill every section (below). Delete none; write "None." when a section is empty.
3. Record observations with `pnpm devtrack evidence …` and list their IDs in the `evidence` front-matter field.
4. Set `status: complete` when the turn is handed off, regenerate status (`pnpm devtrack status --write`), and run `pnpm check`.

## Entry anatomy

| Section | Contents |
|---|---|
| Front matter | `id` (DL-YYYYMMDD-NN), `session`, `turn`, `version`, `branch`, `baseCommit`, `startedAt`/`recordedAt` (ISO 8601, America/New_York offset), `tickets`, `workstreams`, `evidence`, `status` |
| Summary | Three to five sentences a founder can read without context |
| What changed | Files and behavior, grouped by area |
| Decisions | Choices made in the turn, with rationale; product decisions stay Proposed until founders decide |
| Problems and resolutions | What failed, why, and how it was resolved or routed: the learning record |
| Evidence | Evidence IDs with one-line results; commands where useful |
| Risks and open questions | What is unresolved and who owns it |
| Next actions | The concrete next steps, in order |

## Conventions

- Write in plain language; explain trade terms and tooling the first time they appear.
- Never include secrets, private contact details, subscriber data or confidential sources.
- Never claim a check passed without an evidence record. Mocked integrations are labeled as mocks.
- Model identifiers are not recorded in the repository; the session link identifies the agent session.

The project hub renders these entries at `/devlog/` in each branch preview.
