# Foundation planning brief

Prepared 18 November 2026 by session S01 (branch `claude/intelligent-cannon-d1nqq6`, version 0.1.0) as the input to the next turn's plan mode. Everything here is a **proposal**. Founder decisions stay Proposed until the founders decide; product architecture stays with [ADR-001](../../decisions/ADR-001-managed-publishing.md) until changed deliberately.

## How to use this brief

1. Read the scope, platform facts and feasibility sections for what the foundation covers and what changed since the packet.
2. Answer the questions under "Questions for plan mode". Each has options and a recommendation; the plan should not start building past a question it depends on.
3. Turn the plan skeleton into the executable plan: tickets, order, exit criteria and the acceptance scenarios each phase must evidence.

## Foundation scope

The kit says "implement SC-001 through SC-005 first" and "demonstrate guest/agent negative-permission tests before building broad automation" ([development kit](../DEVELOPMENT_KIT.md)). Three of those five tickets (SC-002 Ghost roles, SC-003 theme, SC-004 newsletter) configure a **paid Ghost(Pro) account that does not exist yet**. The proposed foundation therefore separates what can be built now from what waits for accounts:

| Part | Tickets | Can start now? | Proposed foundation outcome |
|---|---|---|---|
| Decisions and environment | SC-001 (in progress) | Yes | Founder answers recorded; runtime/tooling ADR; staging secrets plan; vendor feasibility documented with manual fallbacks |
| Private operations shell and auth | SC-005 | Yes, fully local | Next.js desk with staff-only access, explicit human and agent principals, Supabase RLS **and grants**, pgTAP policy tests, audit trail, telemetry baseline |
| Ghost groundwork | SC-002 to SC-004 | Partly, against local Ghost 6.78 | Docker Compose stack (Ghost + Mailpit), a fork of the MIT-licensed Source theme with brand tokens, a scripted Contributor-cannot-publish rehearsal; the paid-account configuration waits for D01/D05 |

Foundation estimate from the backlog: **30–42 h** (SC-001 to SC-005). The local Ghost groundwork moves part of SC-002 to SC-004 earlier; it does not add tickets.

## Current platform facts

Checked 18 November 2026 (EV-0009, EV-0010) against primary sources: nodejs.org, npm, nextjs.org, supabase.com, docs.ghost.org and Ghost 6.78.0 source, ghost.org/pricing, support.buffer.com and developers.buffer.com, vercel.com, firebase.google.com.

| Area | Fact | Consequence for the foundation |
|---|---|---|
| Node.js | Active LTS 26 (EOL 2029-04-30); maintenance LTS 24 (EOL 2028-04-30) and 22 (EOL 2027-04-30) | Ghost 6.78 (`^22.23.5 \|\| ^24.22.3`) and gscan (`^22.17 \|\| ^24`) exclude 26; **pin Node 24** (done in `.nvmrc`) |
| Next.js | 16.4.6; Node ≥ 20.9; `middleware.ts` renamed **`proxy.ts`**, Node runtime only; Turbopack default; Cache Components on for new apps | Session refresh and request IDs in `proxy.ts`; authorization still checked inside every route handler and server action |
| React | 19.3.1 (template installs 19.3.0) | |
| TypeScript | 7.0.2 is npm `latest` (native compiler, no compiler API); typescript-eslint supports < 6.1 | Choose a TypeScript line (Q3) |
| pnpm | 12.21.0 with `allowBuilds`, `minimumReleaseAge`, `trustPolicy` | Already configured; blocked a trust downgrade and a same-day release during the probe (EV-0008) |
| Supabase JS | supabase-js 2.119.x (Node ≥ 22); `@supabase/ssr` 0.12.7 for App Router | Server and browser clients via `@supabase/ssr` with `getClaims()` |
| Supabase keys | Publishable/secret keys (`sb_publishable_…`, `sb_secret_…`) replace legacy anon/service_role keys, which are deprecated by the end of 2026; new projects don't receive legacy keys | Use the new keys from day one; secret key server-only (it bypasses RLS) |
| Supabase grants | Since 30 October 2026 new tables in `public` are **not exposed to the Data API automatically** | Every migration grants explicitly; pgTAP tests assert grants (this is AT-25) |
| Supabase Postgres | 17 by default; CLI 3.2.0 targets the local stack by default; `supabase test db` runs pgTAP | Local stack verified in this container (EV-0006) |
| Ghost | 6.78.0; Contributor drafts but cannot publish; Admin API JWT from an integration key; staff access tokens act with that user's role; `Accept-Version: v6.0` | A Contributor staff token lets Ghost itself refuse publication: defence in depth for agent drafts (verify on Ghost(Pro)) |
| Ghost webhooks | Signed with `X-Ghost-Signature` (HMAC-SHA256) when a secret is set; not in the public docs, confirmed in source | Verify on a real delivery before relying on it (kit: "do not assume") |
| Ghost themes | Source (default theme) is MIT-licensed; premium themes typically forbid redistribution | Source fits a public repository; a premium theme needs a private one |
| Buffer | GraphQL API (`api.buffer.com`, since 27 May 2026, all plans); official MCP server `mcp.buffer.com/mcp` (OAuth); legacy REST retires 1 February 2027; approvals are Team-plan only | **An API key acts as the owner and skips approval.** Only a Needs Approval member connected through MCP/OAuth has posts held as drafts by Buffer (Q9) |
| Prices | Ghost Publisher $29/mo yearly ($35 monthly); Buffer Team $10/channel/mo yearly ($12 monthly); Supabase Pro from $25/mo; Vercel Pro $20/mo with one deploying seat | Packet figures hold |
| Firebase App Hosting | Blaze plan; Next.js 15.2 "active", 16.x preview only | Viable later, riskier now (Q4) |

## Environment feasibility

| Capability | Result | Evidence |
|---|---|---|
| Docker | The daemon is not running by default but starts (`dockerd`). Docker Hub anonymous pulls returned 429; a `mirror.gcr.io` registry mirror fixes it; ECR Public and GHCR work directly | EV-0004 |
| Supabase local stack | Healthy in 67 s on first run: Postgres 17.12, GoTrue, PostgREST, Storage, Realtime, Mailpit, Studio; pgTAP 1.3.3; roles `anon`, `authenticated`, `service_role` present | EV-0006 |
| Ghost 6.78 local | Runs in development mode with SQLite. It must bind IPv4 (`server__host=0.0.0.0`); the default IPv6 bind fails here with EAFNOSUPPORT | EV-0007 |
| Next.js 16.4.6 | Template plus supabase-js, `@supabase/ssr`, Ghost Admin API client, zod 4, MCP SDK and Ajv install and build under Node 24 and pnpm 12 policies; two policy adjustments were needed | EV-0008 |
| Tools | actionlint, gitleaks, shellcheck, glslang, Firebase CLI, Vercel CLI, gscan, Supabase CLI; pinned and checksum-verified | EV-0005 |

## Proposed foundation architecture

### Repository layout

```text
apps/desk/            Next.js 16 private operations desk (App Router, TypeScript, Node 24)
packages/contracts/   agent request/response schemas and generated types (source: contracts/)
packages/policy/      authorization and validation shared by HTTP routes and a later MCP adapter
supabase/             migrations, fixture-only seed, pgTAP tests (supabase/tests)
themes/sc-source/     fork of Ghost's MIT-licensed Source theme with Working Waterfront tokens
infra/local/          docker compose for Ghost 6.78 + Mailpit; scripts to seed roles
tools/                repository tooling (exists)
```

### Identity and data (SC-005)

- **Principals:** one row per human staff member or named agent: `kind human|agent`, `status active|disabled|revoked`. Reader (Ghost member), Ghost staff, desk human and desk agent remain distinct identities (ARCHITECTURE.md). Matching email addresses confer nothing.
- **Staff assignments** grant desk access explicitly. Supabase Auth sign-in alone grants nothing; a signed-in user without an active assignment sees no data.
- **Agent credentials** are stored hashed, with scopes, object grants, expiry and revocation time, and are verified server-side. The browser and the model never receive vendor keys.
- **Audit events** form an append-only table. The application role cannot update or delete rows.
- **Database access for agents** (Q6): recommended pattern is a server-side transaction that switches to a restricted Postgres role and sets `app.principal_id`, so the **same RLS policies** apply to humans and agents, proven by pgTAP tests. The secret key is reserved for narrowly reviewed maintenance paths.

### Middleware: Next.js `proxy.ts` and route guards

- `proxy.ts`: Supabase session refresh (`@supabase/ssr`), a request ID (`x-request-id`), and security headers: a nonce-based CSP, `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `Permissions-Policy`.
- **Route guards inside each handler and server action** (proxy is not an authorization boundary): resolve principal → check assignment or scope → validate input (Ajv/zod against the contract) → execute → emit audit event.
- The agent gateway (`/api/agent/v1`) accepts only the contract's six tools. Unknown tools, extra fields and publish/send verbs are rejected before any vendor call (AT-04).

### Telemetry baseline

- **Traces:** OpenTelemetry through Next.js `instrumentation.ts`. Agent gateway spans follow the OpenTelemetry GenAI conventions where applicable (`gen_ai.operation.name`, tool name, request ID, principal ID; never content, prompts or contact data).
- **Logs:** structured JSON with a redaction allowlist. Tokens, cookies, email addresses, source contacts and draft bodies are never logged (AGENTS.md; AT-23).
- **Audit:** security-relevant events (sign-in, assignment change, agent request accepted or rejected, revocation, review snapshot) go to `audit_events` with the request ID.
- **Errors:** an error boundary plus server error capture. The vendor choice (Sentry, host-native or OTel backend) is Q10.

### Security baseline

Secrets live only in the hosting environment and Supabase. gitleaks runs in CI alongside GitHub push protection. Dependencies install under pnpm's release-age and trust gates. Every table gets RLS, explicit grants and pgTAP tests. CSP and secure headers are in place, the client bundle is scanned for secrets (AT-23), and staging and production environments are kept separate. The fixture is clearly marked unpublishable.

### Testing strategy

| Layer | Tool | Runs in CI |
|---|---|---|
| Contract | Ajv over contracts/examples (exists) | Yes |
| Database policies and grants | pgTAP via `supabase test db` | Yes (Docker on GitHub runners) |
| Unit | Vitest or `node --test` for policy functions | Yes |
| Integration and journeys | Playwright against the desk and local Ghost | Yes |
| Accessibility | axe-core via Playwright (exists for the hub) | Yes |
| Visual | Playwright screenshots attached to the dev log | On demand |

## Questions for plan mode

| ID | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Repository visibility | Keep public / make private | **Decide before SC-003.** Public is workable only with Source (MIT) and strict no-secrets discipline. Private matches the kit, but GitHub Pages on a private repository needs a paid plan and the site itself stays public; an access-controlled hub would move to Cloudflare Access or Vercel |
| Q2 | Node runtime | 24 LTS / 26 LTS | **24** (Ghost and gscan exclude 26); revisit when Ghost supports 26 |
| Q3 | TypeScript line | 5.9 (template) / 6.0.3 / 7.0.2 | **6.0.3** with typescript-eslint; trial 7.x for type-checking speed once lint support lands |
| Q4 | Desk hosting | Vercel Pro / Firebase App Hosting / self-host | **Vercel Pro** (kit default, first-class Next 16). Firebase App Hosting stays an option once Next 16 is "active" there |
| Q5 | Supabase project timing | Hosted staging now / local-first | **Local-first** until SC-005 passes its policy tests; create a staging project after D05 approves budget |
| Q6 | How agents reach the database | Role switch + `app.principal_id` / minted JWTs / secret key + app checks | **Role switch + `app.principal_id`**: one set of RLS policies, testable in pgTAP, no RLS bypass |
| Q7 | Ghost theme | Source (MIT) / premium | **Source fork** (license-safe in a public repository; mature components) |
| Q8 | Launch social channels (D10) | LinkedIn only / LinkedIn + Facebook | Founder choice; engineering builds channel-agnostic. The playbook's LinkedIn-first is lower workload |
| Q9 | Buffer integration path | GraphQL with owner key / MCP or OAuth as a Needs Approval member / manual export | **MCP/OAuth as Needs Approval member** so Buffer itself holds drafts; manual export always available |
| Q10 | Telemetry and error backend | Host-native / OTel backend (e.g. Grafana Cloud, Honeycomb) / Sentry | **OTel SDK plus structured logs first**; choose a backend with the accounts; no PII in telemetry |
| Q11 | Desk UI approach | CSS modules + brand tokens / Tailwind v4 / component library | **CSS modules + brand tokens** (small private surface; tokens already compiled from brand/tokens.json) |
| Q12 | Workbook | Replace the generator (ExcelJS or openpyxl) / retire as engineering record | **Repository JSON is the record**; keep the XLSX as a founder snapshot |
| Q13 | Repository layout | As proposed above / single app | **The layout above**; packages only where code is shared (contracts, policy) |
| Q14 | Licensing | Proprietary interim (current) / open-source code | Interim proprietary notice stands until the founders decide; content is never open-licensed by default |
| Q15 | Which founder decisions can be made now | D01–D12 | At minimum D01 (owners), D04 (scope), D06 (publication authority), D10 (channels), D05 (budget) before paid accounts |
| Q16 | Fit with the team's usual Firebase, Flutter and WebGL stack | — | Keep the kit stack for the desk; reuse the WebGL bathymetry motif for theme and newsletter art; no Flutter app (native apps are a launch exclusion); Firebase is optional for later hosting |

## Plan skeleton

| Phase | Work | Exit criteria (evidence required) | Tickets / scenarios |
|---|---|---|---|
| F0 Decisions | Record answers to Q1–Q16 and the founder decisions possible now; ADR-003 runtime and tooling; staging secrets plan | Decisions recorded with owner and date; ADR merged | SC-001 |
| F1 Desk scaffold | `apps/desk` on Next 16 with Node 24 and pnpm 12; `proxy.ts`, security headers, request IDs, OTel and logging, error boundary; CI jobs | Desk builds and starts in CI; header and CSP check; bundle secret scan clean | SC-005; AT-23 |
| F2 Database | Migrations: principals, staff assignments, agent credentials, audit events; explicit grants plus RLS; fixture-only seed; generated types | `supabase test db` passes grant, RLS and view/function tests | SC-005; AT-25 |
| F3 Access | Staff sign-in, assignment-gated access, disabled-account denial; agent token issue/revoke CLI; gateway skeleton enforcing the contract | Negative tests: unauthorized, disabled and revoked principals denied; publish verbs rejected before vendor calls | SC-005; AT-03, AT-04, AT-07 |
| F4 Ghost groundwork | Local Ghost + Mailpit compose file; Source theme fork with tokens; scripted role setup; server-only Admin API wrapper | Contributor cannot publish or edit another contributor's draft on local Ghost; reader member cannot reach staff admin | SC-002 to SC-004 (local); AT-01, AT-02 rehearsal |
| F5 Evidence and hand-off | Run in-scope scenarios; evidence records; hub, dev log and status updated | `pnpm check` green; IMPLEMENTATION_STATUS current | All of the above |

## Foundation risks

| Risk | Mitigation |
|---|---|
| Founder decisions lag | Build only what is account-independent; keep SC-001 open with named blockers |
| Supabase grant and key changes catch migrations | pgTAP grant tests from the first migration; new keys only |
| Proxy mistaken for an authorization boundary | Guards inside each handler; tests that call handlers directly |
| Vendor API drift (Buffer, Ghost webhooks) | Isolate adapters; manual export path; verify against real deliveries |
| Public repository leaks something sensitive | gitleaks plus push protection; no real contacts or credentials in fixtures; Q1 decided early |
| Single developer and tight capacity | Re-estimate after F1; the critical path is 54–74 h, so a second contributor on Ghost work shortens calendar time |

## References

[Product spec](../PRODUCT_SPEC.md) · [Architecture](../ARCHITECTURE.md) · [Acceptance tests](../ACCEPTANCE_TESTS.md) · [Sprint plan](../SPRINT_PLAN.md) · [Kit audit](../KIT_AUDIT.md) · [Development environment](../DEVELOPMENT_ENVIRONMENT.md) · [ADR-001](../../decisions/ADR-001-managed-publishing.md) · [ADR-002](../../decisions/ADR-002-repository-foundation.md) · [Evidence log](../../devtrack/evidence.json)
