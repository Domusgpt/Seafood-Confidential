# ADR 004 desk-driven Ghost drafts and one-click human publishing

Date: November 18, 2026. Status: **Proposed** (session S01, turn 3). Founders decide; nothing in this ADR is built yet.

## Context

The founders asked why the desk "is built to not publish to Ghost" when the goal is a workflow that runs automatically and seamlessly.

Two different rules are involved, and only one of them is a principle:

1. **Agents never publish.** The launch packet and the kit's AGENTS.md give agents draft authority only: they never publish, send, approve, change permissions or export subscribers. Acceptance scenarios AT-04, AT-11 and AT-20 test exactly this.

   The reason is risk that cannot be undone. A model can invent a quote, misstate a number about a named business, or reuse a photo without permission. Once a story is emailed to subscribers, it cannot be recalled. The publication carries the legal and reputational liability, so a named person decides every release.

2. **The v0.2.0 desk never writes to Ghost at all.** This was a scoping choice for the first slice, not a principle. No Ghost site or Admin API key exists yet (SC-002). Writing to Ghost safely also needs durable jobs that never create duplicate posts after a timeout (SC-011, AT-14 and AT-15).

So the desk can become far more automated without letting a machine decide what is published.

## Decision (proposed)

Automate everything around the decision, and keep the decision with a person:

1. **Drafts flow into Ghost automatically.** When an editor accepts an agent's proposal, or commissions a story, the desk creates or updates the Ghost draft through the Admin API. It sets the title, body, tags, section, byline and image credits, and stores the post ID. Nobody copies and pastes.
2. **Ghost stays in sync automatically.** Ghost webhooks (post published, updated or unpublished) update the desk's status. A change made after review marks the story for re-review (SC-008).
3. **One-click publish for a signed-in editor.** In the desk, an owner or editor clicks Publish, or Schedule, and chooses whether the story is emailed (AT-20). The desk enables the button only when the release gate passes:
   - the Ghost post is linked;
   - sources are recorded;
   - every asset is cleared and credited;
   - the review snapshot is current.

   The desk then calls Ghost and records who decided, when and with which request ID.
4. **Agents cannot reach it.** Publishing is a staff-only Server Action, not a gateway tool. The agent contract still has no publish or send operation, and the database still refuses any agent write to an item.
5. **Fully autonomous publishing is rejected** for news and features, for the reasons above. If the founders later want automation for a narrow, low-risk format, for example a weekly price table generated from a verified data feed, it gets its own ADR with a named owner, an allow-listed format, a kill switch and an audit of every release.

## Consequences

- The desk server holds a Ghost Admin API key. That key can publish or delete any post, so it lives only in the server's secret store, rotates on staff changes, and every use is audited. Ghost's own staff permissions stay authoritative for anyone working in Ghost directly (AT-10).
- Writes to Ghost go through durable jobs with idempotency and reconciliation (SC-011). A timeout never produces a blind retry or a duplicate post.
- Tests need a staging Ghost site (SC-002, SC-015). The local Ghost 6.78 setup verified in turn 1 covers development.
- Editors work mostly in the desk and open Ghost for writing and layout. The friend-editor workflow test (AT-22) covers this.

## Alternatives considered

- **Keep publishing only in Ghost (status quo):** safest and simplest, but editors copy material between systems and statuses drift.
- **Let agents publish after automated checks:** fast, but checks cannot verify that a quote is real or that permission was given. Rejected for news and features.
- **Approve in the desk, then publish manually in Ghost:** keeps an extra manual step without a safety gain over one-click publishing by the same person.

## Review triggers

Revisit after the first month of operation, when an MCP or Managed Agents integration is added, or if Ghost changes its Admin API permissions model.
