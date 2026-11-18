# Seafood Confidential development kit

Prepared for Paul Phillips and his founding editorial partner on November 17, 2026.

## What this is

This is a concrete development specification and operating handoff for a seafood industry publication. It contains a product brief, architecture decision, planned backlog, agent request schema, sample data, acceptance matrix and runbook. It is **not an implemented application**. No account, website, live integration or repository remote has been created by this kit. No application tests have been run or passed.

The recommended launch uses Ghost(Pro) for the publication/newsletter and native contributor/member experiences, a small Next.js and Supabase operations console, and Buffer Team for two social channels. Humans publish in Ghost and approve/schedule in Buffer. Agent access is draft-only.

## Start here

Read AGENTS.md, docs/PRODUCT_SPEC.md, decisions/ADR-001-managed-publishing.md and docs/SPRINT_PLAN.md, in that order. Use planning/BACKLOG.json as the editable backlog source; BACKLOG.csv is its importable view. Read docs/ACCEPTANCE_TESTS.md before implementing authorization or retries.

## Developer kickoff

1. Have the founders identify their organization, account owners, domain shortlist, two social channels and editor. Record account identifiers privately, not in committed documentation.
2. Create or select the private source repository they authorize. On an existing repository, begin a feature branch named feat/seafood-confidential-mvp. Do not assume a remote or overwrite an existing project.
3. Scaffold the selected supported stable Next.js application for the private operations console. Check current official runtime requirements, pin package versions, commit a lockfile and use the provider's official integration instructions. This kit intentionally does not guess future package versions.
4. Establish local development and access-controlled staging, with a separate Supabase project and test Ghost/Buffer destinations. Keep production sends disabled in development.
5. Implement SC-001 through SC-005 first. Connect test accounts only. Demonstrate guest/agent negative-permission tests before building broad automation.
6. Keep docs/IMPLEMENTATION_STATUS.md during the build, with commit, ticket, observed evidence, unresolved risks and next action. Update documentation with every meaningful milestone.

Use WSL or another standard desktop development environment. The platform is an independent publishing project; it does not require FrameCore or any experimental substrate integration.

## File map

| File | Purpose |
|---|---|
| AGENTS.md and CLAUDE.md | Shared developer and agent rules |
| docs/PRODUCT_SPEC.md | Launch boundaries, people and primary journeys |
| docs/ARCHITECTURE.md | Systems, data ownership, access and reliability |
| docs/SPRINT_PLAN.md | Twenty-day conditional schedule and completion criteria |
| docs/ACCEPTANCE_TESTS.md | Required checks with initially unrun status |
| docs/RUNBOOK.md | Daily use, correction, incident and recovery procedures |
| decisions/ADR-001-managed-publishing.md | Why managed Ghost is the launch default |
| contracts/agent-tools.schema.json | Proposed internal agent request shape |
| fixtures/example-article.json | Clearly fictional demo content and metadata |
| planning/BACKLOG.json and BACKLOG.csv | Sixteen actionable planned tickets |

## Planning estimate

107–149 engineering hours plus an 11-hour reserve: 118–160 hours, approximately 15–20 eight-hour developer days. Founder/editor decisions and sample content add approximately 10–16 hours separately. External account approvals and delayed feedback can extend elapsed time. API access must be checked in the actual accounts; manual social export is always available as the fallback.
