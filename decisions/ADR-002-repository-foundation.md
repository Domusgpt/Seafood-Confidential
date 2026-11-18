# ADR 002 repository foundation, delivery tracking and previews

Date: November 18, 2026. Status: accepted for repository tooling (session S01); product and vendor choices remain with ADR-001 and the founders.

## Context

The founders delivered a launch packet and development kit as a zip committed to a public GitHub repository. The kit is a specification with no application. Its rules: work from a branch, keep implementation status with evidence, mark unrun checks UNRUN, never claim a mock is live. The team also wants every turn logged with timestamps, previews of current and recent branches on GitHub Pages, and professional supply-chain, licensing and telemetry practice from the start.

## Decision

1. **Layout.** The kit's tree lives at the repository root, so every path in its documents stays valid. The founder originals (PDF, DOCX, XLSX, cover note) live in `packet/` with SHA-256 checksums. The zip is removed from the working tree; it remains recoverable from commit `2eb9723`.
2. **Runtime and packages.** Node 24 LTS (`.nvmrc`) because Ghost 6.78 and gscan exclude Node 26. pnpm 12 with supply-chain gates: dependency build scripts denied unless approved, a one-day minimum release age, and trust-downgrade failure. Exact version pins with a lockfile.
3. **Tool bootstrap.** `tools/bootstrap/install-dev-tools.sh` installs pinned, SHA-256-verified CLIs (actionlint, gitleaks, shellcheck, Node LTS side-by-side, Firebase and Vercel CLIs, gscan) idempotently.
4. **Tracking.** Kit planning files stay canonical. `devtrack/` adds sessions, workstreams and append-only evidence records with JSON Schemas. `devlog/` holds one timestamped entry per turn. `docs/IMPLEMENTATION_STATUS.md` carries a generated, deterministic status block.
5. **Validation.** `pnpm validate` checks backlog integrity and CSV parity, calendar parity, decisions, the acceptance matrix, the agent contract against example requests, the fixture guard, packet checksums, Markdown links and the evidence rules (no "done" without passing evidence). CI runs it on every push.
6. **Project hub and previews.** A static hub generated from canonical sources: status, backlog and critical path, acceptance, decisions, editorial plan, visual codex, rendered docs, dev log and evidence. A workflow publishes every pushed branch to `gh-pages` under `/branches/<slug>/` with an index of recent previews at the site root; pruning keeps the newest 20. Branch-based publishing was chosen over the Actions-artifact Pages deployment because the `github-pages` environment restricts deployments to the default branch, which would block previews of unmerged session branches.
7. **Brand tokens.** `brand/tokens.json` is the single source of color and type roles. The hub compiles CSS from it and fails the build if a declared text pair drops below WCAG 2.2 AA.
8. **Licensing.** An interim proprietary notice (all rights reserved) until the founders choose otherwise; third-party components keep their licenses (`THIRD_PARTY_NOTICES.md`).

## Consequences

Status claims are mechanically tied to evidence. Previews exist for unmerged work, matching the team's habit of working from the latest pull-request branch. Because the repository is public, the hub is public; it is marked `noindex` and contains only what the repository already shows. Enabling Pages is a one-time owner action (docs/PROJECT_HUB.md). The tooling adds a small Node codebase that must be maintained; it is covered by its own tests.

## Alternatives considered

- **Keep the zip as the source of truth:** rejected; documents could not be reviewed, linked or validated.
- **Docs frameworks (VitePress, Astro, Docusaurus):** heavier dependency trees for a hub whose value is derived data and checks, not prose navigation.
- **Git LFS for binaries:** unnecessary at under 10 MB of originals.
- **Actions-artifact Pages deployment:** default-branch-only environment rules conflict with branch previews (see Decision 6).

## Review triggers

Revisit when the repository visibility changes (planning brief Q1), when the operations desk needs authenticated previews, when Ghost supports Node 26, or when the number of active branches makes per-branch previews noisy.
