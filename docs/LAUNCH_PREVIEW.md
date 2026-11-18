# Preview launch (v0.5.0, 18 November 2026)

A working preview of the desk and the public site, so the founders can try them before the real launch. It runs on Paul's existing accounts: a Supabase project and a Google Cloud project with Firebase. Moving to accounts owned by the publication (decision D01) is a later step; see "Moving to the publication's own accounts" below.

**It is a preview.**
- Every public page says so in a banner.
- Search engines are asked not to index the site or the desk.
- Supabase is on the Free plan: no backups, and the project pauses after a week without use.
- Put no real sources, contacts or embargoed material in it.

## Addresses

| What                      | Address                                            |
| ------------------------- | -------------------------------------------------- |
| The desk (sign in here)   | https://sc-desk-629322111689.us-west1.run.app      |
| Public site (preview)     | https://seafood-confidential-preview.web.app       |
| Public pitch form         | https://sc-desk-629322111689.us-west1.run.app/pitch |

## Signing in

1. Open the desk and enter your email. Only people with a desk account get a link, but the page never says whether an address has one.
2. Open the email **in the same browser** and click the link. Sign-in links are single-use and last 15 minutes. A link opened in another browser is refused; request a new one.
3. Supabase's free built-in mailer sends only to members of the Supabase organization, and only about two emails an hour for the whole project. If no email arrives, wait and try again later. Custom SMTP (Resend, with our own domain) removes both limits; it is the first item under "Next steps".

**Paul** has an owner account. **Dave** needs two things:

- an invitation to the Supabase organization (Supabase dashboard, Organization, Team, Invite), so the built-in mailer can email him;
- a desk account. The desk has no "add staff" screen yet. Ask the agent session to add him (it uses the Supabase access token and SQL), or run `pnpm --filter @sc/desk staff add --email … --name … --role owner --allow-remote` on a trusted machine.

## What runs where

| Piece                 | Service                                                    | Region                | Notes |
| --------------------- | ---------------------------------------------------------- | --------------------- | ----- |
| Database and sign-in  | Supabase, Free plan (`SEAFOOD-CONFIDENTIAL`)               | us-west-2 (Oregon)    | Both migrations applied through the Management API, each in one transaction, and recorded in `supabase_migrations.schema_migrations`, so `supabase db push` keeps working. Sign-ups off, 15-minute links, 12-character minimum passwords, refresh-token rotation. |
| Desk                  | Cloud Run service `sc-desk`                                | us-west1 (Oregon)     | Image `us-west1-docker.pkg.dev/<project>/sc-desk/desk:<commit>`, built by Cloud Build from an exact `git archive` (`apps/desk/cloudbuild.yaml`). 0 to 2 instances, 1 CPU, 512 MiB, public with the desk's own sign-in. |
| Runtime identity      | Service account `sc-desk-runtime`                          | n/a                   | Roles: Firebase Hosting Admin (to publish the site) and Secret Manager accessor on the desk's two secrets only. |
| Secrets               | Secret Manager `sc-desk-database-url`, `sc-desk-intake-hash-secret` | automatic replication | The desk's database login (`desk_app`) has a random 48-character password. Supabase only ever received its SCRAM-SHA-256 hash. |
| Public site           | Firebase Hosting site `seafood-confidential-preview`       | global CDN            | Deployed by the desk on every publication (full snapshot). Strict CSP and security headers set per release. `SITE_PREVIEW_NOTICE` adds the banner, the noindex tag and `Disallow: /`. |

The desk and the database are in the same region: the Supabase project was created in us-west-2, so the desk runs in Google's us-west1 rather than us-east4.

## Verified on the live services (EV-0045 to EV-0049)

- The database matches the tested model: all 17 tables have row-level security, the anonymous role can run only `app.submit_pitch`, and the publisher role can run only the six publishing functions. Agent publishing is off and every section lane is closed. Supabase's Data API exposes none of our schemas.
- The desk serves health, sign-in and the pitch form. Its headers include HSTS, `X-Frame-Options: DENY`, a per-request nonce CSP and `X-Robots-Tag: noindex, nofollow`.
- The desk reaches the database through Supabase's pooler as `desk_app`: a refused agent request was audited under its request ID.
- The public site was released by the desk's own Firebase Hosting deploy code (version, file list, upload, finalize, release; 21 files). It shows the preview banner, `noindex`, the security headers and our 404 page. There are 0 axe violations on desktop, dark and iPhone 13 views, and no horizontal overflow.
- Both sign-in link shapes were proven against a local Supabase using its default email template. A link opened in the requesting browser signs in; the same kind of link opened in another browser is refused with a clear message.

**Not yet exercised live:**
- Sign-in with a real email. Paul's first sign-in is the first one.
- A publication from the desk on Cloud Run. Paul's first publication is the first one; it uses the runtime account and Firebase Hosting Admin role above. If it fails, the publishing log on `/publishing` says why, nothing breaks, and the job can be retried.
- The newsletter. Kit is not connected, so publishing never emails anyone.

## Costs

At preview traffic this is about **$0 a month**:
- Supabase Free, Firebase Hosting free tier.
- Cloud Run scales to zero, so only requests are billed, well inside the free tier.
- Artifact Registry stores about 120 MB of images (pennies a month).
- Secret Manager is free for this volume.

## Redeploying

From a machine or session with the project's deploy access, at the repository root:

1. Build the image from an exact commit:

   ```bash
   git archive --format=tar.gz -o /tmp/desk-src.tar.gz HEAD
   ```

   ```bash
   gcloud builds submit /tmp/desk-src.tar.gz --config apps/desk/cloudbuild.yaml --region us-west1 --substitutions _TAG=$(git rev-parse --short HEAD)
   ```

2. Roll the service onto it. Settings and secrets are kept:

   ```bash
   gcloud run deploy sc-desk --region us-west1 --image us-west1-docker.pkg.dev/<project>/sc-desk/desk:<commit>
   ```

Schema changes are applied the same way as in `docs/DEPLOYMENT.md` (`supabase db push` from a machine that can reach the database), or through the Management API's SQL endpoint, one migration per transaction, recording each in `supabase_migrations.schema_migrations`.

## Taking it down

Delete the Cloud Run service `sc-desk`, the Artifact Registry repository `sc-desk`, the two `sc-desk-*` secrets, the service account `sc-desk-runtime` and the Firebase Hosting site `seafood-confidential-preview`. Pause or delete the Supabase project.

## Security follow-ups for the founders

1. **Delete the Supabase secret key `seafood_confidential_launch`.** It was pasted into the chat by mistake. Go to Project Settings, then API Keys. Also delete `desk_ops_launch` if it is still listed; it was only for the one-time setup.
2. **Rotate the Google Cloud key `agents@…` (key ID starting `3b4c8ef7`).** The whole key file was displayed in the chat when it was attached. Create a new key only if you still need one; better, deploy from CI with Workload Identity Federation (no key at all).
3. **Revoke the Supabase access token** under Account, Access Tokens when the launch work is done. Create a new one for the next session that needs it.

## Moving to the publication's own accounts

When Dave confirms D01:
- Create the publication's Supabase organization and Google Cloud project.
- Repeat these steps there (the commands above and `docs/DEPLOYMENT.md`).
- Set up custom SMTP on our own domain, and use our sign-in email template (`supabase/templates/magic_link.html`; this needs custom SMTP).
- Map the domain to Firebase Hosting, remove `SITE_PREVIEW_NOTICE`, and move to Supabase Pro (or start the nightly backup, SC-014) before real sources go in.

## Next steps

1. Custom SMTP (Resend free tier) on our own domain: removes the team-only and two-an-hour limits, and enables our sign-in template, whose links work in any browser.
2. An "Add a staff member" screen in Settings for owners, so adding Dave and others needs no operator.
3. Deploys from CI with Workload Identity Federation, so no deploy key lives anywhere.
