# ADR 003 operations desk foundation stack and data access

Date: November 18, 2026. Status: accepted as developer defaults for the foundation build (session S01, turn 2); founders may revisit through the planning brief questions without data loss.

## Context

ADR-001 chose Ghost for publishing and a small Next.js + Supabase desk for private operations. The foundation planning brief listed sixteen open questions with recommendations. The team asked to build the foundation and its first chunk directly, so the recommendations become defaults now. Choices that need founders (accounts, budget, channels, repository visibility) stay open and do not block local development.

## Decision

| Area | Choice | Brief question |
|---|---|---|
| Runtime | Node.js 24 LTS; pnpm 12 workspace (`apps/*`, `packages/*`) with release-age and trust gates | Q2, Q13 |
| Framework | Next.js 16.4 App Router, React 19.3, TypeScript 6.0.3; ESLint 9.39 with `eslint-config-next` (ESLint 10 is blocked by the peer ranges of `eslint-plugin-react`, `-import` and `-jsx-a11y`) | Q3 |
| Rendering | **Cache Components off.** Every desk page is per-user and permission-sensitive, revocation must apply on the next request, and the CSP nonce needs per-request rendering. The public pitch page renders per request for the same nonce reason | — |
| UI | One global stylesheet on CSS custom properties compiled from `brand/tokens.json` (`apps/desk/scripts/build-tokens.mjs`, checked in CI); no inline `style` attributes because the nonce CSP blocks them; self-hosted Fraunces and Source Sans 3 (`@fontsource-variable`) | Q11 |
| Identity | Supabase Auth email magic links for staff; sign-up disabled; staff are invited by an owner. Agents use revocable bearer tokens (`sca_…`) stored only as SHA-256 hashes | Q6 |
| **Data access** | The desk server connects as a dedicated `desk_app` login role that has **no privileges of its own** (`NOINHERIT`). Every query runs in a transaction that first switches role: `authenticated` with the verified Supabase claims for staff, `desk_agent` after token verification for agents, `anon` for public pitch intake. Row Level Security and column grants therefore govern every request; a missing role switch fails closed | Q6 |
| Schemas | `app` for operations records (RLS on every table, explicit grants); `private` for credentials, audit events and intake throttling (no API exposure, no direct grants) | AT-25 |
| Supabase | Local-first (CLI 3.x); new publishable/secret keys. The app holds only the publishable key (auth) and the `desk_app` URL; the secret key lives in the operator CLI's `.env.ops.local`, and the app refuses to start if a secret key is in its environment | Q5 |
| Middleware | `proxy.ts`: session refresh, request ID, nonce-based CSP and security headers. Authorization is re-checked inside every page, action and route | — |
| Telemetry | OpenTelemetry via `instrumentation.ts` (`@vercel/otel` 2.3, which requires `@opentelemetry/api` < 1.10: pinned 1.9.1; export through standard `OTEL_*` variables); pino JSON logs with trace IDs and a redaction list; security events in `private.audit_events` carrying the request ID, which triggers inherit from the transaction | Q10 |
| Agent gateway | `POST /api/agent/v1` implements the kit's request contract (validated with Ajv from `@sc/contracts`). v1 serves `briefs.list`, `items.read`, `drafts.propose` and `jobs.read`; `drafts.revise` and `social.propose` answer 501 until review snapshots (SC-008) and durable jobs (SC-011) exist | SC-009 |
| Tests | Vitest (units), pgTAP via `supabase test db` (policies and grants), Playwright plus axe (journeys, accessibility), contract examples (schema) | — |
| Theme | Ghost's MIT Source theme as the base for SC-003 (licence-safe in a public repository) | Q7 |

## Consequences

Authorization lives in one place, the database, and is testable in SQL. Server code cannot accidentally query as a privileged role. The pattern requires a direct Postgres connection (Supavisor transaction pooling in hosted environments) and a `desk_app` password provisioned out of band. Hosted verification of role membership grants is part of staging (SC-015). PostgREST is not used for operations data, so the Data API can stay closed to the `app` and `private` schemas.

## Alternatives considered

- **supabase-js/PostgREST for all data:** simpler CRUD, but it exposes schemas and leaves agents without an RLS-enforced path.
- **Secret key plus application checks:** bypasses RLS and contradicts AGENTS.md.
- **Minted JWTs for agents:** depends on signing-key access, which Supabase's asymmetric keys restrict.

## Review triggers

Revisit if hosted Supabase refuses the role-membership grants, if connection pooling breaks transaction-scoped settings, or when an MCP adapter for agents is added (it must reuse the same gateway and policies).
