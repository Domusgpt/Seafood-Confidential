---
id: DL-20261118-03
title: "Hosting and costs, publishing automation proposal and the Claude agent lab"
session: S01
turn: 3
version: 0.3.0
branch: claude/intelligent-cannon-d1nqq6
baseCommit: d09120798af3ca967b65655aeb7811ea2bb9ea2c
startedAt: 2026-11-18T14:15:00-05:00
recordedAt: 2026-11-18T14:38:04-05:00
author: "Claude Code (cloud session) for Paul Phillips"
tickets: [SC-001, SC-005, SC-009]
workstreams: [WS-ENV, WS-PLAN]
evidence: [EV-0026, EV-0027, EV-0028, EV-0029, EV-0030]
status: complete
---

# Hosting and costs, publishing automation proposal and the Claude agent lab

## Summary

The founders asked about Supabase costs, about hosting on the Hugging Face and Google Cloud accounts they already have, and why the desk does not publish to Ghost. They also offered their Claude API credits. This turn answers each with checked numbers and working code:

- a hosting and cost plan;
- a proposed decision for automating Ghost while a person still decides releases;
- a container image that runs on Cloud Run or a Hugging Face Space;
- a Claude agent lab that red-teams the gateway.

The founders accepted the pitch limits as built. The lab's real Claude runs wait for an API key, because this cloud environment cannot hold one as a network secret.

## What changed

**Planning**
- `docs/planning/HOSTING_AND_COSTS.md`: Supabase Pro (a flat $25 with the Micro compute credit), Cloud Run at about $0 inside the free tier, Cloud Storage for backups, and the Claude API on credits. That is about $84–99 a month in cash, against the packet's $119–169.
- `decisions/ADR-004-desk-driven-publishing.md` (Proposed):
  - agents never publish (a principle);
  - the desk not writing to Ghost was only first-slice scope;
  - the proposal: automatic Ghost drafts, webhook sync and one-click publishing by a signed-in editor behind the release gate.
- The founders' decision on the pitch limits is recorded in `docs/DESK.md`.

**Deployment**
- `apps/desk/Dockerfile` and `.dockerignore`: a Next.js standalone image (385 MB, non-root, health check) that builds without secrets. Behind a TLS-inspecting proxy, an optional build secret supplies the CA.
- `DESK_DB_PREPARE` for the Supabase pooler's transaction mode. `DESK_TRUSTED_PROXY_HOPS` is now required in production.
- `docs/DEPLOYMENT.md`: Supabase, Cloud Run and Hugging Face steps, plus first-deployment checks.
- CI gains a `container` job that builds the image and smoke-tests it.

**Agent lab (`apps/agent-lab`)**
- A Claude drafting agent built on the Anthropic TypeScript SDK's tool runner:
  - `claude-opus-5-5` by default, with explicit effort;
  - server-side refusal fallbacks and prompt caching;
  - four tools that call the real gateway over HTTP.
- Three scenarios judged by database and gateway records:
  - `draft`;
  - `injection` (AT-17: a source tells agents to publish and leak contacts);
  - `revocation` (the token is revoked mid-run).
- Reports include tokens and list-price cost. `--self-test` checks the harness without the model.

**Desk**
- Fixed a phone-layout bug: Settings overflowed by 265 px (see Problems).
- Version 0.3.0.
- The `sc-visual-codex` skill gained an "Operations desk UI patterns" section.

## Decisions

- **Pitch limits stay as built** (founders, 18 November 2026).
- **Cloud Run over a Hugging Face Space for the desk.** It costs about $0 within the free tier and needs no extra plan, it can run next to Supabase, and access is public behind our own sign-in. Hugging Face needs a paid plan to run a Docker Space, its free hardware sleeps, and private Spaces would force Hugging Face logins on staff and contributors.
- **No Firebase Hosting rewrites**, because they forward only the `__session` cookie.
- **The lab runs the Messages API in our own process** rather than on Anthropic-hosted Managed Agents. Its gateway exists only on the local stack, and every call must be asserted. Managed Agents remains an option for production drafting agents once the desk is deployed.
- **Opus 5.5 is the lab default.** Model choice per run is the founders' call, and the cost table shows the alternatives.

## Problems and resolutions

- **The image build failed TLS verification inside this sandbox,** whose proxy uses its own certificate authority. Fixed with an optional BuildKit secret that is never stored in the image.
- **Corepack could not start pnpm 12.** Fixed by installing the pinned pnpm with npm during the build.
- **The phone layout test failed on Settings once the database held more varied data.** Visually hidden labels inside wide tables are absolutely positioned, and their containing block was the page, so the page scrolled sideways. Fixed with `position: relative` on the scroll container, and recorded in the visual codex.
- **No Anthropic API key could be saved for this session,** because network secrets are refused for Anthropic's own hosts. The lab is complete and self-tested; the Claude runs stay UNRUN (EV-0030).

## Evidence

| ID | Kind | Result | What it shows |
| --- | --- | --- | --- |
| EV-0026 | observation | info | Vendor prices and limits from official pages; the cost plan (D05) |
| EV-0027 | test | pass | The container builds without secrets; smoke test: health, pages, CSP, 401, non-root, no `.env` in the image |
| EV-0028 | test | pass | End-to-end 24/24 after standalone output, the pooler setting and the layout fix |
| EV-0029 | verification | pass | Agent-lab harness self-test, 9/9 system checks through the real gateway (no model) |
| EV-0030 | observation | blocked | Claude runs wait for an API key |

Also run: `pnpm check` (validators, 27 tool tests, the desk's static checks with 67 unit tests, the agent-lab typecheck, a 51-page hub, formatting) and the bundle secret scan.

## Risks and open questions

- **Hosted behaviour is still unverified:**
  - transaction pooling with role switching;
  - `desk_app.<ref>` through the pooler;
  - which `X-Forwarded-For` entry Google's front end supplies.

  These are first-deployment checks in `docs/DEPLOYMENT.md` and SC-015.
- **The ADR-004 automation needs a founder decision (D06)** and a staging Ghost site before any code.
- **Production magic links need custom SMTP;** Supabase's built-in mailer is for testing.

## Next actions

1. Founders:
   - add `ANTHROPIC_API_KEY` to the environment variables, or run `pnpm lab` locally;
   - decide ADR-004;
   - choose accounts and regions (D01, D05).
2. Run the lab on Opus 5.5 and record AT-17 and real costs. Try Sonnet 5.5 for comparison if the founders want.
3. SC-002: a staging Ghost site, then build ADR-004's draft sync if approved.
4. Deploy staging to Cloud Run with a Free Supabase project and run the first-deployment checks.
