# Contributing

These conventions apply to people and coding agents alike. [AGENTS.md](AGENTS.md) is the authoritative rule set for scope, authority and verification. This file adds the repository workflow.

## Branches and pull requests

- **Never commit to `main` directly.** Agent sessions work on `claude/<session-name>` branches; people use `feat/<topic>` or `fix/<topic>`. The kit's suggested `feat/seafood-confidential-mvp` is superseded by these names.
- **Work from the latest open pull request.** Merges are infrequent, so new work branches from the most recent open PR branch, not from `main`. When several PRs are open, confirm with the repository owner which one is current before starting.
- **Pull requests start as drafts.** Each PR states its **session, version, base branch and base commit** in the description (the template asks for them) and links the dev log entry.
- **Previews:** every pushed branch is published to the project hub under `/branches/<branch-slug>/` (see [docs/PROJECT_HUB.md](docs/PROJECT_HUB.md)).

## Versions

The repository uses semantic versioning in `package.json`. Before launch (0.x), each session that changes the repository bumps the minor version (0.1.0 → 0.2.0); fixes within a session bump the patch. Record every version in [CHANGELOG.md](CHANGELOG.md) and in `devtrack/sessions.json`.

## Every turn

1. Start or continue a session in `devtrack/sessions.json` (id, branch, version, base commit, start time).
2. Do the work in the smallest ticket-sized increments; respect ticket dependencies in `planning/BACKLOG.json`.
3. Record what you observed with `pnpm devtrack evidence …`. **No evidence, no claim.** A ticket becomes `done` and a scenario becomes PASS only with an evidence record.
4. Write the turn's dev log entry (`pnpm devlog:new --title "…"`; see [devlog/README.md](devlog/README.md)).
5. Run `pnpm devtrack status --write`, then `pnpm check`. Commit only when it is green, or record why not in the dev log.
6. Produce visual evidence for any interface or design change: screenshots at desktop and mobile widths, plus an accessibility scan (`pnpm hub:shots` for the hub).

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `refactor:`), present tense, with a body explaining why. Keep the founder packet and kit files byte-for-byte unless a change is deliberate and noted in the dev log and changelog.

## Never commit

Secrets, tokens, `.env` files, real subscriber or contributor contact data, confidential sources, signed URLs, or account identifiers (AGENTS.md: record account owners privately). gitleaks runs in CI; GitHub push protection is the second line.

## Checks

| Command                                                       | What it does                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm validate`                                               | Kit integrity, tracking rules, agent contract examples, packet checksums, Markdown links |
| `pnpm test`                                                   | Tool unit tests (`node --test`)                                                          |
| `pnpm hub:build` / `pnpm hub:check`                           | Build the project hub; verify links, structure and CSP                                   |
| `pnpm hub:shots`                                              | Desktop and mobile screenshots plus an axe accessibility scan of the hub                 |
| `pnpm lint:actions` / `pnpm lint:shell` / `pnpm lint:secrets` | actionlint, shellcheck, gitleaks                                                         |
| `pnpm format:check`                                           | Prettier for tooling and config (kit documents are excluded)                             |
