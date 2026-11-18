# Development environment

Verified 18 November 2026 in a Claude Code cloud container (Linux x86_64) and designed to work on any Linux, macOS or WSL machine with the same tools. Evidence: EV-0004 to EV-0009.

## Required

| Tool | Version | How |
|---|---|---|
| Node.js | 24 LTS (`.nvmrc`) | nvm, fnm, or `tools/bootstrap/install-dev-tools.sh --node` (installs side-by-side in `/opt/node24`) |
| pnpm | 12.21.0 (`packageManager`) | Any pnpm 10 or later switches to the pinned version automatically; or `npm i -g pnpm@12.21.0` |
| Git | any recent | |

Then `pnpm install` and `pnpm check`.

## Installed by the bootstrap script

`bash tools/bootstrap/install-dev-tools.sh` (Linux x86_64; root or sudo). Every download is verified against a pinned SHA-256 and re-runs are idempotent. `--check` reports versions without changing anything.

| Tool | Version | Why |
|---|---|---|
| actionlint | 1.7.12 | Lint GitHub Actions workflows |
| gitleaks | 8.30.1 | Secret scanning (also in CI) |
| shellcheck | 0.11.0 | Lint shell scripts (hash pinned trust-on-first-use; upstream publishes no checksum file) |
| firebase-tools | 15.36.0 | Firebase hosting option (planning brief Q4); the team's usual platform |
| vercel | 66.1.0 | The kit's default host for the operations desk |
| gscan | 6.7.0 | Validate Ghost themes (SC-003) |

Installed separately in this environment and recommended:

| Tool | Version | Why |
|---|---|---|
| Supabase CLI | 3.2.0 | A pinned dev dependency: `pnpm exec supabase …` |
| Docker Engine | 29.x | Local Supabase and Ghost stacks |
| glslang (`glslangValidator`) | 15.1.0 | Validate WebGL shaders (`apt-get install glslang-tools`) |
| PostgreSQL client (`psql`) | 16+ | Inspect local databases |
| Playwright Chromium | bundled with Playwright 1.63.0 | Hub screenshots and accessibility scans |

## Docker

In cloud containers the daemon is not running by default. Start it with `dockerd` (as root, in the background) and check `docker info`.

Docker Hub limits anonymous pulls; this environment hit `429 Too Many Requests`. Configure a registry mirror in `/etc/docker/daemon.json`, then restart `dockerd`:

```json
{ "registry-mirrors": ["https://mirror.gcr.io"] }
```

Supabase images come from ECR Public and GHCR and need no mirror.

## Local Supabase

```bash
pnpm exec supabase start -x edge-runtime,logflare,vector,imgproxy,supavisor
```

The first run pulls images in about a minute. The services include Postgres 17.12 (with pgTAP, pg_cron, pg_net, pgsodium and vault), GoTrue, PostgREST, Storage, Realtime, Mailpit and Studio, with the `anon`, `authenticated` and `service_role` roles present. Stop it with `pnpm exec supabase stop --no-backup`. The local database URL and keys are printed by `supabase status`; they are local-only and must never be reused for hosted projects.

Since October 2026, new tables are **not** exposed to the Data API automatically. Every migration grants explicitly, and pgTAP tests assert the grants (AT-25).

## Local Ghost

```bash
docker run -d --name ghost-local -p 2368:2368 -e NODE_ENV=development -e url=http://localhost:2368 -e server__host=0.0.0.0 ghost:6.78.0-alpine
```

`server__host=0.0.0.0` is required where IPv6 is unavailable; without it Ghost fails with error code -97 (EAFNOSUPPORT). Admin is at <http://localhost:2368/ghost/>. Development mode uses SQLite; mail goes to the console unless configured. Use Mailpit (`axllent/mailpit:v1.34.0`) to catch member emails. A compose file and role-seeding scripts are part of the foundation plan (phase F4).

## Package manager policy

`pnpm-workspace.yaml` sets supply-chain gates:

- **`allowBuilds`:** only listed packages may run install scripts (the Supabase CLI downloads its binary).
- **`minimumReleaseAge: 1440`:** versions younger than one day are refused (strict). Example: `@supabase/supabase-js` 2.119.1 was refused on its release day; 2.119.0 installed.
- **`trustPolicy: no-downgrade`:** fails when a package's publishing trust weakens. Example: the create-next-app default `@types/node@^20` pulls `undici-types@6.21.0`, which was flagged; use `@types/node@^24` to match the runtime.
