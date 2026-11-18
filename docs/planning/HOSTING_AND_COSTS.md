# Hosting and running costs (v0.3.0)

Prepared 18 November 2026 (session S01, turn 3) for the founders' account and budget decisions (SC-001). Prices were checked against the vendors' official pages on that date (sources at the end). Treat every figure as a planning estimate: vendors change prices, and usage-based lines depend on traffic.

## Recommendation in one table

| Line | Choice | Monthly cash |
| --- | --- | --- |
| Publishing | Ghost(Pro) Publisher, annual (from the launch packet) | $29 |
| Social | Buffer Team, two channels (from the launch packet) | $20 |
| Desk database and staff sign-in | **Supabase Pro**, one Micro project for production | **$25** |
| Staging database | Supabase Free project in a separate organization | $0 |
| Desk hosting | **Google Cloud Run**, scale to zero, one container image | **about $0** (inside the free tier) |
| Builds, images, secrets | Cloud Build, Artifact Registry, Secret Manager | about $0 (inside the free tier) |
| Backups and exports | **Google Cloud Storage** bucket with lifecycle rules | about $0 (inside the 5 GB free tier) |
| AI drafting and testing | Claude API on your monthly credits | $0 cash (usage estimate below) |
| Domain, mailboxes and sign-in email | From the launch packet; magic links need your own SMTP (often included with the mailbox provider) | $10–25 |
| **Total cash** |  | **about $84–99 a month** |

The launch packet budgeted **$119–169** a month. The difference is Vercel Pro ($20) replaced by Cloud Run, and the $15–50 AI allowance covered by your Claude credits. Ghost and Buffer still need **$588 upfront** for their annual plans.

## Supabase

| Plan | What you get | Fit |
| --- | --- | --- |
| Free | 500 MB database, 50,000 monthly active users, 5 GB egress, 1 GB storage, 2 active projects. **Paused after 1 week of inactivity. No backups.** 1-day logs | Staging and development only |
| **Pro, $25/month** | Includes **$10 of compute credit, which covers one Micro instance** (Micro is $10/month, Small $15). Per project: 8 GB disk (then $0.125/GB), 250 GB egress (then $0.09/GB), 100,000 monthly active users (then $0.00325 each), **daily backups kept 7 days**, 7-day logs. Spend cap on by default | **Production** |
| Team, $599/month | 14-day backups, 28-day logs, organization features | Not needed |

For the desk the Pro plan is a **flat $25**. The database will stay far below 8 GB for years, egress is tiny because pages render on the server, and the only signed-in users are a handful of staff. Keep the spend cap on.

Add-ons you do **not** need:
- Point-in-time recovery ($100 a month for each 7 days of retention): daily backups plus our own nightly export to Cloud Storage cover a small newsroom.
- A custom domain ($10 a month per project): the Supabase address is used only server-side.
- The IPv4 add-on: connect through the shared pooler, which is IPv4 on every plan.

A second Pro project for staging would add about $10 a month (another Micro), so use a Free project for staging and accept that it pauses when idle.

**How the desk connects.** On Cloud Run, which scales to zero, use the shared pooler in **transaction mode (port 6543)** with the user `desk_app.<project-ref>` and set `DESK_DB_PREPARE=false`, because prepared statements aren't supported there. Every desk request already runs inside one transaction that switches role and binds the caller, which is exactly what transaction pooling needs. A long-running server can use session mode (port 5432) instead and keep prepared statements on.

## Where to run the desk: Cloud Run versus Hugging Face Spaces

The repository now builds one container image (`apps/desk/Dockerfile`, 385 MB, runs as a non-root user). The same image runs on either platform, so this choice stays reversible.

| | **Google Cloud Run (recommended)** | Hugging Face Docker Space | Vercel Pro (packet default) |
| --- | --- | --- | --- |
| Monthly cost for this traffic | **About $0.** The free tier covers 2 million requests, 180,000 vCPU-seconds, 360,000 GiB-seconds and 1 GB of North America egress a month. Beyond that, usage is billed per second | A paid plan to create the Space (**PRO, $9 a month**) plus either **CPU Basic: free but sleeps after 48 hours idle**, or **CPU Upgrade: $0.03 an hour (about $22 a month)**, always on | $20 per deploying seat |
| Cold starts | A few seconds after an idle period, unless you pay to keep one instance warm | A sleeping free Space has to boot again when someone visits | Minimal |
| Privacy and access | Public HTTPS endpoint behind our own sign-in; IAM and Secret Manager for configuration | Spaces are built for public demos. Private Spaces need a Hugging Face login, which clashes with staff sign-in and the public pitch form | Same as Cloud Run |
| Database latency | Pick the region next to Supabase (for example Cloud Run `us-east4` with Supabase `us-east-1`) | Region not chosen by you | Region selectable |
| Disk | Stateless, which the desk is | Ephemeral; Storage Buckets for persistence | Stateless |
| Your accounts | You already have Google Cloud | You already have Hugging Face | New account |

**Recommendation:** run the desk on **Cloud Run**, in the region next to the Supabase project, with minimum instances at 0. Use Cloud Run domain mapping for `desk.<your-domain>` in a region that supports it, or a load balancer later if needed.

Don't put the desk behind **Firebase Hosting rewrites**: they pass only the `__session` cookie to the backend, which would break Supabase's sign-in cookies.

Keep **Hugging Face** for what it is best at: demos, model experiments and public showcases (ZeroGPU is free on paid accounts), not the newsroom's private operations.

## Google Cloud Storage

Use one private bucket in a US free-tier region (`us-east1`, `us-west1` or `us-central1`) for:
- nightly logical backups of the desk database (the `app` and `private` schemas), which SC-014 turns into a tested restore procedure;
- archived agent-lab reports;
- later, signed permission documents for rights records.

The free tier is 5 GB-months of regional storage, 5,000 Class A and 50,000 Class B operations, and 100 GB of North America egress a month. Beyond it, Standard storage is about $0.020 per GB-month. Add a lifecycle rule (Nearline after 30 days, delete after a year) and the bucket costs pennies at most.

## Claude API (your credits)

List prices per million tokens, first-party API:

| Model | Input | Output | Cache read |
| --- | --- | --- | --- |
| Claude Opus 5.5 (the lab's default) | $4 | $20 | $0.20 |
| Claude Sonnet 5.5 | $2 | $10 | $0.10 |
| Claude Haiku 5.5 | $0.10 | $0.50 | $0.01 |

**Estimate, to be replaced by measurement.** These figures assume one drafting task takes about six model turns, with about 25,000 input tokens across the turns and about 4,000 output tokens including reasoning.

| | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| --- | --- | --- | --- |
| One drafting task | about $0.18 | about $0.09 | well under a cent |
| One agent-lab run (three scenarios) | about $0.40–0.60 | about $0.20–0.30 | about a cent |
| A month of nightly lab runs plus 100 real drafts | about $30–35 | about $15–18 | under $1 |

The agent lab prints the exact tokens and the list-price cost of every run, so the first real run replaces this estimate. Quality, not price, should decide the model: `--model` switches it per run.

## What changes in the repository for this plan

- `apps/desk/Dockerfile` and `.dockerignore`: a standalone Next.js image that builds without secrets and starts with `node apps/desk/server.js` on port 8080.
- `DESK_DB_PREPARE`: turns prepared statements off for the shared pooler's transaction mode.
- `DESK_TRUSTED_PROXY_HOPS` is required in production. On Cloud Run, Google's front end appends the client address, so set it to 1 and verify it on the first deployment (the intake throttle relies on it).
- `docs/DEPLOYMENT.md`: step-by-step Supabase and Cloud Run setup.

## Sources

- Supabase pricing: https://supabase.com/pricing (plan limits, compute credits, add-ons)
- Supabase connections and pooler: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/platform/ipv4-address
- Hugging Face pricing: https://huggingface.co/pricing; Spaces hardware, billing and sleep: https://huggingface.co/docs/hub/spaces-gpus; Spaces storage: https://huggingface.co/docs/hub/spaces-storage
- Google Cloud free tier (Cloud Run, Cloud Storage, Secret Manager, Artifact Registry, Cloud Build): https://docs.cloud.google.com/free/docs/free-cloud-features
- Cloud Run pricing beyond the free tier: https://cloud.google.com/run/pricing
- Cloud Storage pricing: https://cloud.google.com/storage/pricing
- Claude API prices: the Claude API reference used in this session (cached 3 November 2026); current prices at https://platform.claude.com/docs/en/about-claude/pricing
- Launch packet cost table: [docs/LAUNCH_PACKET.md](../LAUNCH_PACKET.md)
