# Changelog

All notable changes to this repository. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semantic versioning](https://semver.org/) (0.x before launch, one minor version per working session).

## [Unreleased]

## [0.3.0] - 2026-11-18 · Session S01, turn 3 · `claude/intelligent-cannon-d1nqq6`

Hosting and cost plan, a proposal to automate Ghost while people still decide releases, a production container, and a Claude agent lab.

### Added
- `docs/planning/HOSTING_AND_COSTS.md`: verified prices for Supabase, Google Cloud (Cloud Run, Cloud Storage) and Hugging Face Spaces. Recommends Supabase Pro plus Cloud Run, about $84–99 a month in cash.
- `decisions/ADR-004-desk-driven-publishing.md` (Proposed): automatic Ghost drafts, webhook sync and one-click human publishing behind the release gate; agents still never publish.
- `apps/desk/Dockerfile`, `.dockerignore` and `docs/DEPLOYMENT.md`: a Next.js standalone image for Cloud Run or a Hugging Face Space; CI `container` job with a smoke test.
- `apps/agent-lab`: a Claude agent (Anthropic SDK tool runner, Opus 5.5 by default, refusal fallbacks, prompt caching) that drafts through the real gateway. Scenarios: drafting, prompt injection (AT-17) and mid-run revocation, judged by database and gateway records, with token and cost reports and a `--self-test` mode.
- `DESK_DB_PREPARE` for the Supabase pooler's transaction mode.
- "Operations desk UI patterns" in the `sc-visual-codex` skill.

### Changed
- `DESK_TRUSTED_PROXY_HOPS` is required in production.
- The founders' decision to keep the intake limits as built is recorded in `docs/DESK.md`.
- Version 0.3.0.

### Fixed
- Settings no longer scrolls sideways on phones: table scroll containers now contain their visually hidden labels.

## [0.2.0] - 2026-11-18 · Session S01, turn 2 · `claude/intelligent-cannon-d1nqq6`

Operations desk foundation (SC-005) and its first vertical slice (SC-006, SC-007, first part of SC-009). Local Supabase only; nothing is deployed and nothing publishes.

### Added
- `apps/desk`: Next.js 16.4 operations desk. Magic-link staff sign-in (sign-up disabled), `/no-access` for identities without a staff role, Today (due, decisions, post-review placeholder, failures), Stories (list, commission, detail with one next action and the exact Ghost editor link), Contributors (pitch queue and decisions), Distribution (honest "not built yet"), Settings (staff, agents, tokens, audit trail). Working Waterfront tokens, self-hosted fonts, accessible forms.
- Public `/pitch` intake: text only, consent-gated, throttled per client and overall, honeypot, receipt only.
- `supabase/migrations/20261118180000_desk_foundation.sql`: principals, staff assignments, pitches, editorial items (content IDs `SC-YYYY-NNN`, unique Ghost post ID), sources (agent-processing flag, staff-only private columns), asset rights, agent grants, draft proposals, hashed agent credentials, append-only audit trail; Row Level Security on every table; `desk_app` role-switching data access (ADR-003).
- Draft-only agent gateway `POST /api/agent/v1` on the kit contract: token auth inside the database, scopes, grants, redaction, idempotent `drafts.propose`, `jobs.read`, audit of every request.
- Security middleware: nonce CSP, request IDs, hardening headers; OpenTelemetry instrumentation; pino logs with redaction.
- Tests: 108 pgTAP assertions (mutation-tested), 67 unit tests, 24 Playwright end-to-end tests with axe WCAG 2.2 AA, client bundle secret scan; CI `desk` job running them against a local Supabase stack.
- Independent security review (no Critical or High findings) with every Medium and Low finding fixed: column-level update grants, database-stamped reviewers and deciders, final agent revocation that revokes tokens, SQL-side source redaction for agents, audited sources, rights and refused actions, gateway flood guards and per-agent budget, strict request IDs, serialized intake throttling with trusted-proxy hops.
- Operator CLIs (`staff`, `agent`), `apps/desk/.env.example`, `docs/DESK.md`, `packages/contracts` validator package.

### Changed
- ADR-003 records the decisions made during the build (Cache Components off, ESLint 9, OpenTelemetry API 1.9.1, global stylesheet on tokens, gateway scope).
- Root scripts: `desk:*` and `db:*`; `pnpm check` includes the desk's static checks. Version 0.2.0.
- CONTRIBUTING: minor version per milestone turn.

## [0.1.0] - 2026-11-18 · Session S01 · `claude/intelligent-cannon-d1nqq6`

Repository foundation, tooling and planning readiness. No application code.

### Added
- Development kit unpacked at the repository root (byte-identical); founder originals in `packet/` with SHA-256 checksums.
- Delivery tracking: `devtrack/` (sessions, workstreams, append-only evidence with JSON Schemas), `devlog/` timestamped entries, generated `docs/IMPLEMENTATION_STATUS.md`.
- Validators (`pnpm validate`) for backlog, calendar, decisions, acceptance matrix, agent contract (17 example requests), fixture guard, packet checksums, Markdown links and evidence rules; tool unit tests.
- Project hub (`pnpm hub:build`): overview, backlog with dependency graph and critical path, acceptance, decisions, editorial plan, visual codex, rendered docs, dev log and evidence; WebGL bathymetry masthead with fallbacks; strict CSP.
- GitHub Actions: CI (validate, test, hub build/check, actionlint, shellcheck, gitleaks, GLSL validation) and Pages previews for every branch.
- Pinned, checksum-verified tool bootstrap (`tools/bootstrap/install-dev-tools.sh`); Node 24 LTS; pnpm 12 supply-chain gates.
- Design tokens (`brand/tokens.json`) with computed contrast gates; `sc-visual-codex` project skill.
- Kit audit, foundation planning brief, ADR-002, contributing, security, license and third-party notices.

### Changed
- `README.md` keeps the original description and adds navigation.
- `planning/BACKLOG.json` and `.csv`: SC-001 status `planned` → `in_progress` (repository, dev environment and vendor feasibility work begun; founder decisions outstanding).

### Fixed
- `tools/bootstrap/install-dev-tools.sh`: log output no longer corrupts captured download paths; install failures can no longer pass silently (found by CI run 1, EV-0015).

### Removed
- `Seafood_Confidential_Launch_Packet.zip` from the working tree (sha256 `4871128f…fd934b04`); recoverable with `git show 2eb9723:Seafood_Confidential_Launch_Packet.zip > Seafood_Confidential_Launch_Packet.zip`.
