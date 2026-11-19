# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through GitHub's private vulnerability reporting for this repository (Security → Report a vulnerability) if it is enabled, or contact the repository owner directly through GitHub. Include what you found, how to reproduce it, and its likely impact. A named security contact and response targets will be added when the founders confirm the account owner (decision D01).

## Scope today

The repository contains planning documents and development tooling; the publication and operations desk are not deployed. Relevant reports today include leaked credentials or personal data in the repository history, unsafe tooling (for example the bootstrap script or CI workflows), and weaknesses in the published agent contract design.

## Practices

- **No secrets in the repository.** Credentials live in the hosting provider's and Supabase's secret stores. gitleaks runs in CI and GitHub push protection blocks known token formats.
- **Supply chain.** Exact dependency pins with a lockfile; pnpm denies dependency build scripts unless approved, waits one day before installing new releases, and fails on trust downgrades; GitHub Actions are pinned to full commit SHAs; downloaded tools are verified against pinned SHA-256 hashes.
- **Least privilege by design.** Agents are draft-only, authenticated as named, revocable principals; publication, sending, approval, permission changes and subscriber export are not agent capabilities (AGENTS.md, contracts/agent-tools.schema.json).
- **Data minimization.** Contact details, consent evidence, subscriber records and confidential sources stay out of public paths, AI context and logs unless explicitly required and authorized.
- **Incident handling** follows the security incident procedure in [docs/RUNBOOK.md](docs/RUNBOOK.md): pause affected automation, revoke and rotate, inspect audit events, involve the account owner, re-enable after permission checks.
