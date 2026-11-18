# Seafood-Confidential

A Seafood industry blog on fisheries, food, and the effects of marine harvest on the world.
Seafood Confidential will bring experienced people in fisheries, aquaculture and the seafood trade into a publication that is useful to professionals and readable by anyone who wants to understand the food. This packet defines a practical first release and the operating system behind it.

---

**Status: planning.** This repository holds the founder launch packet, the development kit (specifications, backlog, contracts, templates), the delivery tracking system and the project hub. No application has been built or deployed; all 26 acceptance scenarios are UNRUN. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Start here

| If you are…                 | Read                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A founder                   | [Launch packet (PDF)](packet/Seafood_Confidential_Launch_Packet.pdf) · [workbook](packet/Seafood_Confidential_Sprint_Workbook.xlsx) · [foundation planning brief](docs/planning/FOUNDATION_PLANNING_BRIEF.md)                               |
| A developer or coding agent | [AGENTS.md](AGENTS.md) → [product spec](docs/PRODUCT_SPEC.md) → [ADR-001](decisions/ADR-001-managed-publishing.md) → [sprint plan](docs/SPRINT_PLAN.md) → [acceptance tests](docs/ACCEPTANCE_TESTS.md) → [CONTRIBUTING.md](CONTRIBUTING.md) |
| The managing editor         | [Editorial playbook](editorial/EDITORIAL_PLAYBOOK.md) · [brand guide](editorial/BRAND_GUIDE.md) · [templates](editorial/templates/) · [runbook](docs/RUNBOOK.md)                                                                            |

**Project hub:** branch previews are published to GitHub Pages at <https://domusgpt.github.io/Seafood-Confidential/> once Pages is enabled (see [docs/PROJECT_HUB.md](docs/PROJECT_HUB.md)).

## The plan in one paragraph

Ghost(Pro) runs the public publication, contributors and newsletter. A small private Next.js and Supabase operations desk handles pitches, sources, rights, review snapshots and a draft-only agent gateway. Buffer handles human-approved social distribution on one or two channels. Humans publish; agents only draft. The estimate is 118–160 engineering hours over a four-week sprint, and the operating cost is $119–169 a month before optional podcast hosting ([ADR-001](decisions/ADR-001-managed-publishing.md), [launch packet](docs/LAUNCH_PACKET.md)).

## Repository map

| Path         | Contents                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desk/` | The private operations desk (Next.js 16): staff sign-in, pitch queue, stories, sources, rights, agent gateway ([docs/DESK.md](docs/DESK.md)) |
| `supabase/`  | Database migrations, local stack configuration and pgTAP policy tests                                                                        |
| `packages/`  | Shared workspace packages (`@sc/contracts`: the agent request validator)                                                                     |
| `packet/`    | Founder originals (PDF, DOCX, XLSX, cover note) with SHA-256 checksums                                                                       |
| `docs/`      | Product spec, architecture, acceptance tests, sprint plan, runbook, launch packet text, implementation status, kit audit, planning brief     |
| `decisions/` | Architecture decision records                                                                                                                |
| `planning/`  | Backlog (canonical JSON + CSV view), workbook notes and decision register                                                                    |
| `editorial/` | Brand guide, editorial playbook, six-week calendar, templates                                                                                |
| `contracts/` | Draft-only agent request contract and executable examples                                                                                    |
| `fixtures/`  | Clearly fictional test data (never publishable)                                                                                              |
| `brand/`     | Concept board, web derivatives and design tokens (visual codex)                                                                              |
| `devlog/`    | Timestamped log of every working turn                                                                                                        |
| `devtrack/`  | Sessions, workstreams and evidence records with schemas                                                                                      |
| `tools/`     | Validators, tracking CLIs, project hub generator, tool bootstrap                                                                             |
| `.github/`   | CI, Pages previews, templates and ownership                                                                                                  |

## Working on the repository

```bash
bash tools/bootstrap/install-dev-tools.sh
```

```bash
pnpm install
```

```bash
pnpm check
```

`pnpm check` validates the kit and tracking, runs the tool tests and the desk's static checks (tokens, lint, types, unit tests), builds the hub and checks it, then verifies formatting. To run the desk itself (local Supabase, sign-in through Mailpit, end-to-end tests), follow [docs/DESK.md](docs/DESK.md#running-it-locally). See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, the dev log, evidence rules and pull-request conventions, and [docs/DEVELOPMENT_ENVIRONMENT.md](docs/DEVELOPMENT_ENVIRONMENT.md) for local Supabase and Ghost.

## License

© 2026 the Seafood Confidential founders. All rights reserved; see [LICENSE](LICENSE). Third-party components keep their own licenses ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
