# @sc/desk: Seafood Confidential operations desk

The private operations desk (Next.js 16.4, React 19, Supabase). Staff sign in with magic links; the public pitch form lives at `/pitch`; agents use the draft-only gateway at `/api/agent/v1`.

Read [docs/DESK.md](../../docs/DESK.md) for the architecture, security model, gateway API reference, local setup and tests, and [ADR-003](../../decisions/ADR-003-desk-foundation-stack.md) for the stack decisions. Rules for agents working here are in the repository's [AGENTS.md](../../AGENTS.md) (this folder's `AGENTS.md` is Next.js's own block, maintained by `next dev`).

| Script                                       | What it does                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`     | Next.js on 127.0.0.1:3000                                                     |
| `pnpm env:local`                             | Write `.env.local` and `.env.ops.local` from the running local Supabase stack |
| `pnpm staff …` / `pnpm agent …`              | Operator CLIs (local and bootstrap only)                                      |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | ESLint, TypeScript, Vitest                                                    |
| `pnpm e2e --trace off`                       | Playwright end-to-end tests with axe (needs the local stack and a build)      |
| `pnpm scan:bundle`                           | Fail if any secret shape or local secret value reaches browser bundles        |
| `pnpm tokens` / `pnpm tokens:check`          | Regenerate or verify `src/app/tokens.css` from `brand/tokens.json`            |
