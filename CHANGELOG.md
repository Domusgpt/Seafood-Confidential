# Changelog

All notable changes to this repository. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semantic versioning](https://semver.org/) (0.x before launch, one minor version per working session).

## [Unreleased]

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

### Removed
- `Seafood_Confidential_Launch_Packet.zip` from the working tree (sha256 `4871128f…fd934b04`); recoverable with `git show 2eb9723:Seafood_Confidential_Launch_Packet.zip > Seafood_Confidential_Launch_Packet.zip`.
