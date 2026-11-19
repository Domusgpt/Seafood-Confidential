# Preview launch (v0.5.0, 18 November 2026; sample stories and standing pages v0.6.0; images and motion v0.7.0, same day)

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

## Sample stories and standing pages (v0.6.0)

The preview carries **seven sample stories** so the founders can see the publication working: one per section, plus an explainer labelled as written by an AI agent.

- **Clearly labelled.** Every sample shows an amber "Sample" chip and a note saying it is placeholder text, not reporting, and that it will be removed before launch. The RSS feed prefixes its titles with "Sample:". In the desk, a sample's next action is "Sample: nothing to do".
- **No factual claims to rely on.** The text uses no figures, names, quotations or real sources. Each sample's sources are marked "Placeholder".
- **Attribution.** Samples are attributed to "Sample content (preview)", an inert identity with no token, grants or scopes, never to a person.
- **Preview-only.** Only an operator can mark a story as a sample; a database trigger refuses staff, agents and the public. The site builder refuses to publish a site that is not a preview while any sample is live, so samples cannot reach the real site.
- **Loading.** `supabase/sample/preview-content.sql` loads the samples and queues their publication. It can be run again safely. On this preview, the seven samples were put live on 18 November by an operator run of the desk's own publishing steps (claim, snapshot, build, Firebase Hosting deploy, complete) from the agent session.
- **Removing** (rehearsed end to end locally, EV-0055):
  1. In the Supabase dashboard, open the SQL editor and run `supabase/sample/remove-preview-content.sql`. It queues an unpublish job for every live sample.
  2. On the desk's Publishing page, press "Run … queued jobs now" until no queued jobs are left. Each press runs up to five jobs, so seven samples take two presses. The site is rebuilt without them.
  3. Run the script again. It marks the samples withdrawn, so they leave the desk's working lists.

  The script's last column says what to do next for each sample. Running it more times changes nothing. The withdrawn records stay in the database, with their audit trail.

The site also has two **standing pages**, linked from every footer:
- **About** uses the founders' About introduction from `editorial/BRAND_GUIDE.md`.
- **How we work** follows the standards in `editorial/EDITORIAL_PLAYBOOK.md` and the agent rules in ADR-005.

Both are still drafts for the founders to approve. They live in `apps/desk/site-src/pages/` as Markdown and are built into the desk's image. To change one: edit the file, redeploy the desk (see "Redeploying"), and the next publication carries the change.

## Images and motion (v0.7.0)

- **Six sample stories have photographs.** All are public domain, from U.S. agencies and the Library of Congress via Wikimedia Commons, and each is credited under its picture. `supabase/sample/images/manifest.json` records each one's source, author and licence, verified on its Commons page. The AI-written sample has no photograph: agents never publish images.
- **Loading them:**
  - `pnpm --filter @sc/desk images samples` attaches them to the samples, each with a cleared rights record.
  - With `--emit-sql <dir>` it writes the same work as SQL files, for a database this machine cannot reach (run them in the SQL editor).
  - A sample that was already live shows its photograph once the story is updated, because publishing pins the image.
- **Adding an image to a real story:** add a rights record (photo, provenance, licence, credit line, cleared for the web), then use "Lead image" on the story page. See `docs/DESK.md`.
- **What an upload takes (v0.7.1):** a JPEG, PNG, WebP or AVIF up to 15 MB. The desk needs 20 to 60 seconds to make the renditions, one image at a time; keep the page open until it returns. HEIC photographs (the iPhone camera's usual format) must be exported as JPEG first; choosing a photograph on the iPhone itself converts it automatically.
- **Memory (v0.7.1):** testing the desk's container with the service's original 512 MiB showed that a 24-megapixel photograph crashed it. The processing was rebuilt to use far less memory, and the service now has 1 GiB.
- **Motion:** parallax masthead, titles and images animated in on scroll, reversing on the way back. Readers can turn it off in the footer ("Animation: on"), and devices that ask for reduced motion never see it.

## Publishing sweep (v0.6.0): ready, not scheduled

The desk has an endpoint, `POST /api/publishing/sweep`, that runs publish jobs that are waiting: queued behind a busy build, or left by a worker that stopped.

It is ready, but **nothing calls it yet.** A Cloud Scheduler job would call it every 15 minutes. Creating that job is Paul's decision, for two reasons: it is a standing automation on his Google Cloud account, and it keeps the free Supabase project from pausing. The agent session did not create it.

Until it exists, waiting jobs run when an editor publishes, or when someone presses "Run … queued jobs now" on the Publishing page.

- **Who can call it.** The desk accepts only a Google-signed ID token with all of these:
  - issued for that exact address;
  - for the service account `sc-desk-scheduler`, which holds no roles;
  - with a verified email.

  The desk's `PUBLISH_SWEEP_INVOKER` setting names that account. Without the setting, the route answers 404.

  Live checks (EV-0052): each of these gets 401, and a GET gets 405:
  - no token;
  - an HS256 token;
  - a well-formed RS256 token signed by a key that isn't Google's.

  The desk logs each refusal's reason under its request ID, never the token.
- **Turning it on.** Run this once, from a machine signed in to the Google Cloud project (as an owner). Replace `<project>` with the project ID:

  ```bash
  gcloud scheduler jobs create http sc-desk-publish-sweep --location us-west1 --schedule "*/15 * * * *" --uri https://sc-desk-629322111689.us-west1.run.app/api/publishing/sweep --http-method POST --oidc-service-account-email sc-desk-scheduler@<project>.iam.gserviceaccount.com --oidc-token-audience https://sc-desk-629322111689.us-west1.run.app/api/publishing/sweep --attempt-deadline 300s
  ```

  To run it once straight away: `gcloud scheduler jobs run sc-desk-publish-sweep --location us-west1`.
- **Side effect.** Each run touches the database, so the Free-plan Supabase project does not pause while the job is on. Pause it (`gcloud scheduler jobs pause sc-desk-publish-sweep --location us-west1`) to let the preview sleep.

## What runs where

| Piece                 | Service                                                    | Region                | Notes |
| --------------------- | ---------------------------------------------------------- | --------------------- | ----- |
| Database and sign-in  | Supabase, Free plan (`SEAFOOD-CONFIDENTIAL`)               | us-west-2 (Oregon)    | Both migrations applied through the Management API, each in one transaction, and recorded in `supabase_migrations.schema_migrations`, so `supabase db push` keeps working. Sign-ups off, 15-minute links, 12-character minimum passwords, refresh-token rotation. |
| Desk                  | Cloud Run service `sc-desk`                                | us-west1 (Oregon)     | Image `us-west1-docker.pkg.dev/<project>/sc-desk/desk:<commit>`, built by Cloud Build from an exact `git archive` (`apps/desk/cloudbuild.yaml`). 0 to 2 instances, 1 CPU, 1 GiB (512 MiB until v0.7.1; image processing needs the room), public with the desk's own sign-in. |
| Runtime identity      | Service account `sc-desk-runtime`                          | n/a                   | Roles: Firebase Hosting Admin (to publish the site) and Secret Manager accessor on the desk's two secrets only. |
| Publishing sweep      | Desk endpoint `POST /api/publishing/sweep`; caller service account `sc-desk-scheduler` (no roles). **No Cloud Scheduler job yet.** | us-west1 | Accepts only a Google-signed ID token for that address and account; the desk checks issuer, audience, account and freshness. The 15-minute job is one command (above). |
| Secrets               | Secret Manager `sc-desk-database-url`, `sc-desk-intake-hash-secret` | automatic replication | The desk's database login (`desk_app`) has a random 48-character password. Supabase only ever received its SCRAM-SHA-256 hash. |
| Public site           | Firebase Hosting site `seafood-confidential-preview`       | global CDN            | Deployed by the desk on every publication (full snapshot). Strict CSP and security headers set per release. `SITE_PREVIEW_NOTICE` adds the banner, the noindex tag and `Disallow: /`. |

The desk and the database are in the same region: the Supabase project was created in us-west-2, so the desk runs in Google's us-west1 rather than us-east4.

## Verified on the live services (EV-0045 to EV-0049)

- The database matches the tested model: all 17 tables have row-level security, the anonymous role can run only `app.submit_pitch`, and the publisher role can run only the six publishing functions. Agent publishing is off and every section lane is closed. Supabase's Data API exposes none of our schemas.
- The desk serves health, sign-in and the pitch form. Its headers include HSTS, `X-Frame-Options: DENY`, a per-request nonce CSP and `X-Robots-Tag: noindex, nofollow`.
- The desk reaches the database through Supabase's pooler as `desk_app`: a refused agent request was audited under its request ID.
- The public site was released by the desk's own Firebase Hosting deploy code (version, file list, upload, finalize, release; 21 files). It shows the preview banner, `noindex`, the security headers and our 404 page. There are 0 axe violations on desktop, dark and iPhone 13 views, and no horizontal overflow.
- Both sign-in link shapes were proven against a local Supabase using its default email template. A link opened in the requesting browser signs in; the same kind of link opened in another browser is refused with a clear message.

## Verified on the live services, v0.6.0 (EV-0051 to EV-0053)

- **Database.** The sample-stories migration is applied and recorded like the first two.
- **Desk.** Revision `sc-desk-00003-jpq` reports version 0.6.0.
- **Sweep.** The endpoint answers 401 to a missing token, an HS256 token and a well-formed RS256 token from a key that isn't Google's, and 405 to a GET. The last refusal shows the desk fetched Google's signing keys, which a real scheduler call needs.
- **Public site.** It shows the seven samples, each with its Sample chip, and the About and How we work pages.
  - The RSS feed titles start with "Sample:".
  - The preview banner, `noindex`, `Disallow: /` and the security headers are unchanged.
  - Ten views have 0 axe violations and no horizontal overflow: home on desktop, dark and iPhone 13, a story on desktop and iPhone 13, the AI-written explainer, the opinion piece, About, How we work, and a section page.

## Verified on the live services, v0.7.0 and v0.7.1 (EV-0060 to EV-0068)

- **Database.** The story-images migration is applied and recorded. The publisher may read image files, staff may attach images but not read the files, and agents may not attach.
- **Desk.** Revision `sc-desk-00005-dw7` reports version 0.7.1 and runs with 1 CPU and 1 GiB. The image route refuses requests without a session (401) or from another site (403), and a 12.6 MB request is no longer cut off.
- **Photographs.** Six samples have photographs, each with 10 renditions whose hashes were re-checked in the database. The site was rebuilt with them: 95 files, 60 of them image renditions, served as AVIF or WebP and cached for a year.
- **Public site:**
  - Eleven views have 0 axe violations and no horizontal overflow, including reduced motion. Pages are complete without JavaScript, and the animation switch reverts exactly.
  - Page weight on a first visit is 383 to 532 KB, and 755 KB for the home page on an iPhone. Largest contentful paint is 0.4 to 1.2 seconds.
- **Before v0.7.1 went live,** the desk's container was tested with the service's old limits (512 MiB, one CPU). A 24-megapixel upload crashed v0.7.0; v0.7.1 handles 12 to 59 megapixels (EV-0064, EV-0065).

**Not yet exercised live:**
- **An image upload through the desk.** It is tested end to end locally and in the desk's container; Paul's first upload is the first live one.
- **Sign-in with a real email.** Paul's first sign-in is the first one.
- **A publication by the desk service on Cloud Run.** The samples went live through the desk's own publishing code, run by an operator with a short-lived token. On Cloud Run the same code gets its token from the metadata server as `sc-desk-runtime` (Firebase Hosting Admin), and that has not run yet.

  **A safe first test:** sign in, open any sample story and press "Update the published story". It rebuilds the site with nothing visibly changed (rehearsed locally, EV-0057). If it fails, the publishing log on `/publishing` says why, nothing breaks, and the job can be retried.
- **The sweep with a real scheduler token.** The Cloud Scheduler job does not exist yet.
- **The newsletter.** Kit is not connected, so publishing never emails anyone.

## Costs

At preview traffic this is about **$0 a month**:
- Supabase Free, Firebase Hosting free tier.
- Cloud Run scales to zero, so only requests are billed, well inside the free tier.
- Artifact Registry stores about 120 MB of images (pennies a month).
- Secret Manager is free for this volume.
- Cloud Scheduler, if the sweep job is created: one job is inside the free allowance of three per billing account.

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

Delete the Cloud Scheduler job `sc-desk-publish-sweep` (if it was created), the service account `sc-desk-scheduler`, the Cloud Run service `sc-desk`, the Artifact Registry repository `sc-desk`, the two `sc-desk-*` secrets, the service account `sc-desk-runtime` and the Firebase Hosting site `seafood-confidential-preview`. Pause or delete the Supabase project.

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
4. Turn on the publishing sweep (the one command above) when the founders want waiting jobs to run without a button press.
5. Remove the sample stories before real stories go out (see "Removing" above), and approve or rewrite the About and How we work drafts.
