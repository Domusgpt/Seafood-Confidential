# Hosting and running costs (v0.4.0, Ghost-free start)

Prepared 18 November 2026 (session S01, turn 4) after the founders asked whether every service was needed, then chose a Ghost-free start ([ADR-005](../../decisions/ADR-005-desk-publishing-without-ghost.md)). Every price below was checked that day on the vendor's official page; the sources are at the end. Treat the figures as planning estimates: vendors change prices, and usage-based lines depend on traffic.

## The answer in one table

| Line | What it does | Needed? | Choice | Cash per month |
| --- | --- | --- | --- | --- |
| Domain and DNS | Our address; email reputation | **Yes** | Cloudflare Registrar (sold at cost, no markup) and Cloudflare DNS (free) | about $1 (paid yearly, typically about $10–12 a year for a .com) |
| Public website | Stories, sections, feed, sitemap | **Yes** | Built by the desk and deployed to **Firebase Hosting** | **$0** (free allowance; see below) |
| Newsletter | Signup, sending, unsubscribe and consent | **Yes**, when the first issue goes out | **Kit free plan**: up to 10,000 subscribers, API included | **$0** |
| Desk database and staff sign-in | Private operations, articles and revisions | **Yes** | **Supabase Free** while building; Pro ($25) once real sources and contacts live there | **$0**, then $25 |
| Desk server | The desk and the agent gateway | **Yes** | **Google Cloud Run**, scaling to zero | **$0** (free tier) |
| Sign-in emails for staff | Magic links | **Yes** | **Resend free**: 3,000 a month, 100 a day, used as Supabase's SMTP | **$0** |
| Role mailboxes (editor@, tips@) | Reading mail sent to the publication | Yes, but not as paid mailboxes | **Cloudflare Email Routing** forwards to your existing inboxes | **$0** |
| AI agents | Drafting and publishing within the switches | Optional | Claude API on Paul's credits | $0 cash (usage below) |
| Social scheduling | LinkedIn and Facebook posts | **No** | Post or schedule natively on LinkedIn and Facebook; Buffer's free plan (3 channels, includes the API) later | **$0** |
| Password manager | Shared account access | Yes (security) | Bitwarden free organization (exactly two people) | **$0** |
| Code and previews | Repository, CI, project hub | Yes | GitHub Free (the repository is **public**, so Actions and Pages are free) | **$0** |
| Podcast hosting | | Not until there is a podcast | | $0 |
| **Total to start** | | | | **about $1 a month** |

**From the first real operations data:** add Supabase Pro at **$25 a month**. It gives daily backups for 7 days and the project never pauses. The alternative is to finish the free nightly backup to Cloud Storage first (SC-014). The launch packet budgeted $119–169 a month plus $588 upfront; this plan needs neither the upfront payment nor Ghost, Buffer or Vercel.

## What each service does, and the catches

### Website: Firebase Hosting (free)

- **Publishing:** the desk renders the whole site on every publication and deploys it through the Firebase Hosting API. Cloud Run's own service account does the deploy, so no key file is involved.
- **Cost:** free, with a CDN, SSL and our own domain. On the pay-as-you-go plan (the same Google billing account as Cloud Run), traffic beyond the free allowance is billed per GB. A text-first site uses little bandwidth.
- **Why static:** the public site stays up even when the desk or its database is down or paused.
- **Status:** verified with protocol fakes in this turn. The first live deploy is part of SC-015.

### Newsletter: Kit free plan

Kit's pricing page lists the free plan with:
- up to 10,000 subscribers;
- API access ("Get access to Kit's API to build your own integration");
- one-time broadcasts;
- landing pages on our own domain;
- paid newsletters, at 3.5% plus 30¢ per transaction.

How the desk uses it:
- **Signup:** the public site's signup form posts straight to Kit, so Kit handles consent and unsubscribing.
- **Sending:** the desk schedules a broadcast a few minutes after publication, and only when someone chose to email the story.
- **Never twice:** the desk never sends twice; an uncertain result asks an editor to check Kit.

Alternatives checked:
- **Beehiiv:** the free plan has no custom domain; paid plans start at $49/month.
- **MailerLite:** the free plan is 250 subscribers and cannot send through the API.
- **Buttondown:** free only to 100 subscribers; an archive on our own domain costs +$29/month.

### Desk database: Supabase Free now, Pro later

| Plan | What matters |
| --- | --- |
| Free | 500 MB database, 50,000 monthly active users, 2 active projects. **"Free projects are paused after 1 week of inactivity"**: a project is inactive when it does not receive enough database activity; a paused project can be restored for up to a year. **No automatic backups.** |
| Pro, $25/month | Includes $10 of compute credit, "enough to cover one Micro instance". 8 GB disk, daily backups kept 7 days, never paused. |

For the desk:
- **Before launch:** Free is fine while building and piloting. Staff use the desk daily, so it stays active.
- **What happens if it pauses:** the public site is static and stays up through a pause; only the desk and the gateway stop.
- **Before real data goes in:** before real sources, contacts or pitches go in, either move to Pro or switch on our own nightly backup to Cloud Storage (SC-014, free tier).

**Sign-in email needs your own SMTP.** Supabase's built-in mailer sends only to your own team's addresses, at two messages an hour. Use **Resend's free tier** (3,000 a month, 100 a day). Its documentation covers Supabase's custom SMTP: host `smtp.resend.com`, port 465, user `resend`, and the API key as the password, with a verified domain.

### Desk server: Cloud Run (free tier)

- **Free tier:** 2 million requests, 180,000 vCPU-seconds and 360,000 GiB-seconds a month cover a newsroom desk at no cost.
- **Domain mapping:** Cloud Run domain mapping is available in us-east4 but is marked **Preview, not production-ready**. Google's recommended load balancer costs about $18 a month, so start with the service's own `run.app` address for the staff-only desk. The public site lives on Firebase Hosting under our domain.
- **Artifact Registry:** 0.5 GB of image storage is free, about two desk images. Keep a cleanup rule.
- **Cloud Scheduler:** 3 jobs are free, enough for a nightly backup.

### Mail for people

- **Role addresses:** **Cloudflare Email Routing** is free. It forwards editor@ and tips@ to the founders' existing inboxes (200 rules, 25 MiB per message).
- **If you want real business mailboxes:**
  - Zoho Mail Lite is $1 per user per month, billed yearly.
  - Google Workspace Business Starter is $7 per user per month yearly, or $8.40 monthly.

### Things not needed to start

| Item | Why not now |
| --- | --- |
| Ghost(Pro) | $29/month yearly ($35 monthly), $46 past 1,000 members. The desk now publishes the site, and Kit sends the newsletter. Starter ($15–18) cannot be used: it has one staff seat and no API. |
| Buffer | LinkedIn Pages and Meta Business Suite schedule posts natively. Buffer's free plan (3 channels, 10 scheduled posts each, 1 user) includes its API for later. Team ($10 per channel per month yearly) only matters when both founders need their own logins. |
| Vercel | Cloud Run covers the desk. |
| Supabase point-in-time recovery, custom domain, IPv4 add-on | Not needed (backups as above; the pooler is IPv4). |
| 1Password Teams | $24.95/month yearly. Bitwarden's free organization covers two people. |

## Claude API (your credits)

List prices per million tokens on the first-party API (platform.claude.com pricing page, checked 18 November 2026):

| Model | Input | Output | Batch input / output (50% off) |
| --- | --- | --- | --- |
| Claude Opus 5.5 (the lab's default) | $4 | $20 | $2 / $10 |
| Claude Sonnet 5.5 | $2 | $10 | $1 / $5 |
| Claude Haiku 5.5 (prompts up to 100k tokens) | $0.10 | $0.50 | $0.05 / $0.25 |

**Estimate, to be replaced by measurement.** These figures assume a drafting task takes about six model turns, roughly 25,000 input and 4,000 output tokens.

| Work | Cost |
| --- | --- |
| One drafting task | about $0.18 on Opus, $0.09 on Sonnet |
| One agent-lab run (four scenarios) | about $0.50–0.80 on Opus |
| A month of nightly lab runs plus 100 real drafts | about $30–35 on Opus, $15–18 on Sonnet |

Scheduled, non-urgent work can use the Batch API at half price. `pnpm --filter @sc/agent-lab lab --check-key` confirms a key and billing for well under a cent before any run.

## A note on the public repository

The GitHub repository is **public**: that is why Actions minutes and Pages previews cost nothing. It also means the planning documents, costs, ADRs and code are readable by anyone.
- **What's not in it:** no secret values; the bundle scan and `.gitignore` enforce this.
- **If the plans should be private:** make the repository private and take GitHub Pro ($4/month). On GitHub Free, a private repository has about 2,000 Actions minutes a month, then $0.006 a minute, and no Pages.

## Sources (official pages, checked 18 November 2026)

- **Ghost:**
  - https://ghost.org/pricing/
  - https://ghost.org/help/what-happens-when-my-ghost-pro-trial-ends/
- **Kit:** https://kit.com/pricing
- **Kit API:** https://developers.kit.com/api-reference/broadcasts/create-a-broadcast
- **Beehiiv:** https://www.beehiiv.com/pricing
- **MailerLite:** https://www.mailerlite.com/pricing
- **Buttondown:** https://buttondown.com/pricing
- **Buffer:**
  - https://buffer.com/pricing
  - https://buffer.com/api
- **Native scheduling:**
  - LinkedIn Pages: https://www.linkedin.com/help/linkedin/answer/a1419179
  - Facebook: https://www.facebook.com/help/389849807718635
- **Supabase:**
  - https://supabase.com/pricing
  - https://supabase.com/docs/guides/platform/free-project-pausing
  - https://supabase.com/docs/guides/platform/backups
  - https://supabase.com/docs/guides/auth/auth-smtp
- **Email delivery:**
  - Resend: https://resend.com/pricing
  - Resend with Supabase SMTP: https://resend.com/docs/send-with-supabase-smtp
  - Brevo: https://www.brevo.com/pricing/
  - Postmark: https://postmarkapp.com/pricing
  - Amazon SES: https://aws.amazon.com/ses/pricing/
- **Mail and domain:**
  - Google Workspace: https://workspace.google.com/business/
  - Zoho Mail: https://www.zoho.com/mail/zohomail-pricing.html
  - Cloudflare Email Routing limits: https://developers.cloudflare.com/email-routing/limits/
  - Cloudflare Registrar: https://developers.cloudflare.com/registrar/faq/
  - Cloudflare DNS: https://developers.cloudflare.com/dns/
- **Password managers:**
  - https://bitwarden.com/pricing/
  - https://1password.com/product/teams-small-business-password-manager
- **GitHub:**
  - https://docs.github.com/en/billing/concepts/product-billing/github-actions
  - https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- **Google Cloud:**
  - Cloud Run domain mapping: https://docs.cloud.google.com/run/docs/mapping-custom-domains
  - Artifact Registry: https://cloud.google.com/artifact-registry/pricing
  - Cloud Scheduler: https://cloud.google.com/scheduler/pricing
  - Free tier: https://docs.cloud.google.com/free/docs/free-cloud-features
- **Firebase Hosting:** https://firebase.google.com/docs/hosting/api-deploy
- **Claude API:** https://platform.claude.com/docs/en/about-claude/pricing
- **Launch packet cost table, for comparison:** [docs/LAUNCH_PACKET.md](../LAUNCH_PACKET.md)
