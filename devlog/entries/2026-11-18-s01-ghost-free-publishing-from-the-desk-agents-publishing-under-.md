---
id: DL-20261118-04
title: "Ghost-free publishing from the desk, agents publishing under policy, and a $1-a-month cost plan"
session: S01
turn: 4
version: 0.4.0
branch: claude/intelligent-cannon-d1nqq6
baseCommit: 7f6a37ced83bc6f4a26be271bbb669f19c34a76b
startedAt: 2026-11-18T14:45:00-05:00
recordedAt: 2026-11-18T16:07:55-05:00
author: "Claude Code (cloud session) for Paul Phillips"
tickets: [SC-001, SC-002, SC-003, SC-004, SC-009, SC-011, SC-017, SC-018]
workstreams: [WS-PLAN, WS-ENV]
evidence: [EV-0031, EV-0032, EV-0033, EV-0034, EV-0035, EV-0036, EV-0037]
status: complete
---

# Ghost-free publishing from the desk, agents publishing under policy, and a $1-a-month cost plan

## Summary

The founders asked, in order:
- for a cost and accounts note for Dave, and how to give the session their Claude API key;
- for **Ghost and agent publishing in scope, without hindering human work**;
- to check that no service is wasted and nothing could be cheaper;
- in the end, to **"go ghost free and cheap to start."**

This turn records that decision (ADR-005) and builds it:
- **Writing:** story text is written in the desk, with revisions.
- **Publishing:** publishing renders and deploys our own static site (Firebase Hosting in production, a local folder in tests). The newsletter goes through Kit's free plan.
- **Agents:** agents publish their own proposals only inside the owner's switches and checks that the database evaluates.
- **Cost:** the plan is now about **$1 a month** to start, down from $84–99 a month plus $588 upfront.

## What changed

**Agent lab key** (pushed early, commit 7f6a37c):
- The lab reads `SC_AGENT_LAB_API_KEY` first, so a key added for the lab never doubles as Claude Code's own sign-in.
- It ignores a host-set `ANTHROPIC_BASE_URL`.
- `lab --check-key` confirms the key, the model and billing for well under a cent. It was verified offline against a stub on six paths.

**Database** (`supabase/migrations/20261118200000_publishing.sql`):
- Articles and append-only revisions, with optimistic concurrency.
- Publishing policy and per-section lanes: master switch off by default, every lane closed.
- Durable publish jobs: one in flight per story, one site build at a time through an advisory lock and lease.
- Agent gates evaluated in SQL; staff warnings; `desk_publisher` role.
- Snapshot of the publishable site; at-most-once email marker.
- A citable flag on sources.
- 74 new pgTAP tests (184 in total).

**Desk:**
- A Markdown story editor with preview, and a Publishing panel with warnings, history, retry and cancel.
- Publishing settings for the owner (agent tokens can now carry the publish scope) and a `/publishing` log with a stop switch.
- Citable-source toggles.
- Next actions now point to the text and the panel.
- The executor builds the site, deploys it and sends the Kit broadcast.
- The gateway gains `drafts.publish`, and `jobs.read` now covers publish jobs.

**Public site:**
- Home, sections, stories, RSS, sitemap and 404, in the Working Waterfront design.
- Self-hosted fonts and the WebGL bathymetry masthead.
- Strict CSP, plus the AI label and disclosure on agent stories.

**Agent lab:** a `publish` scenario with five checks, and a `publish_draft` tool.

**Docs:**
- ADR-005; ADR-001 marked superseded in part and ADR-004 superseded; AGENTS.md publishing rules.
- Product spec note; AT-27 to AT-30 added and six ATs reworded; backlog SC-017 and SC-018 added, four tickets re-scoped.
- HOSTING_AND_COSTS rewritten with verified prices; DEPLOYMENT (Firebase Hosting, Kit, Resend SMTP); DESK publishing section; CHANGELOG 0.4.0.

## Decisions

**ADR-005**, accepted by Paul with Dave to confirm:
- No Ghost at launch. The desk is the only editor.
- Firebase Hosting for the public site, Kit for the newsletter.
- Agents publish without per-post approval, but only where the owner opened a section, only stories nobody has touched, and only if every check passes. Anyone on staff can stop them.
- People are warned and never blocked. Email goes out at most once.

The cost review answered "do we need these services?" one line at a time. The domain, Supabase, Cloud Run and the API key are needed; Ghost, Buffer, Google Workspace, Transistor and Supabase Pro (until real data) are not needed to start.

## Problems and resolutions

- **A Ghost adapter was built first.** It covered JWT auth, collision handling, internal tags and signed webhooks, verified against a real Ghost 6.78 container. The decision then went Ghost-free, so the adapter was dropped before commit. Its findings are kept in ADR-005.
- **New functions inherited `PUBLIC` execute.** The existing structure test caught it. The migration now revokes every privilege on its functions before granting.
- **Concurrent publishing could drop stories.** Two jobs publishing at once could each deploy a snapshot missing the other's story, because a deploy is a full snapshot. A site lease in `claim_publish_job` makes the second wait ("busy").
- **A footer rule hid the signup text.** It dimmed the newsletter box text on the light theme (2.44:1); axe caught it.
- **A stale server broke the first test run.** An old `next start` from turn 3 kept port 3000, so the tests mixed builds. The process was found with `ps` (`ss` is not installed) and stopped.
- **Sign-in tests reused a spent link.** A throttled second request for the same address sent nothing, and the helper picked up the previous email's link. The helper now waits for a new message, and the local auth limits were raised.

## Evidence

- EV-0031: pgTAP 184/184.
- EV-0032: Vitest 87/87.
- EV-0033: Playwright 30/30, including axe on the public pages.
- EV-0034: agent-lab self-test 18/18.
- EV-0035: container image 0.4.0 smoke test and bundle scan.
- EV-0036: visual review of the public site.
- EV-0037: official pricing check.

The Claude lab runs are still UNRUN: the key is now in the environment, but this session cannot see it.

## Risks and open questions

- **Untested live services.** Live Firebase Hosting and Kit have not been exercised; they are tested against fakes, and their first live runs are part of SC-015.
- **Pending confirmations.** Dave has to confirm ADR-005. The founders choose which sections, if any, to open to agents, and the daily cap.
- **Supabase Free.** It has no backups. Before real data goes in, move to Pro or build the nightly Cloud Storage backup (SC-014).
- **Public repository.** The repository is public, so plans and costs are readable by anyone. Make it private (GitHub Pro $4/month) if that matters.
- **One unexplained 500.** The container answered 500 once on its very first gateway request. It could not be reproduced in two cold starts; CI repeats the check.

## Next actions

1. Run the agent lab with Claude (new session, key in `SC_AGENT_LAB_API_KEY`): `--check-key`, then all four scenarios, and record AT-17 and the costs.
2. Have Dave create the accounts in the revised note and confirm ADR-005, then do the first live deploy (SC-015).
3. Build the nightly backup to Cloud Storage (SC-014), scheduled publication and a public corrections note (SC-013).
