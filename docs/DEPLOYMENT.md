# Deploying the desk and the public site (v0.6.0)

How to take the desk from the local stack to hosted Supabase and Google Cloud Run, with the public site on Firebase Hosting and the newsletter on Kit. This is the Ghost-free path in [ADR-005](../decisions/ADR-005-desk-publishing-without-ghost.md) and [planning/HOSTING_AND_COSTS.md](planning/HOSTING_AND_COSTS.md). A preview has been deployed with these steps (with the adjustments recorded in [LAUNCH_PREVIEW.md](LAUNCH_PREVIEW.md): schema applied through the Supabase Management API, image built in Cloud Build, desk in the same region as the database). On Supabase's Free plan with the built-in mailer, the sign-in email template cannot be changed; the desk accepts Supabase's default links too (open them in the same browser). The production launch on the publication's own accounts (SC-001, D01) remains.

## 1. Supabase project

1. Create a project in the region you want, for example `us-east-1`. Start on the **Free** plan while building; move to **Pro** ($25 a month, daily backups, never paused) before real sources and contacts go in, unless the nightly Cloud Storage backup (section 6) is running. Keep the spend cap on.
2. Apply the schema from the repository root:

   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   ```

   ```bash
   pnpm exec supabase db push
   ```

3. Give `desk_app` a long random password in the SQL editor: `alter role desk_app password '<generated>';`. Store it only in Secret Manager.
4. Auth settings:
   - turn off sign-ups;
   - set the Site URL to the desk address and add it to the redirect URLs;
   - set the minimum password length to 12;
   - paste the magic-link template from `supabase/templates/magic_link.html` (subject "Your Seafood Confidential desk sign-in link").
5. **Configure custom SMTP.** Supabase's built-in mailer only sends to your own team's addresses, two messages an hour, so magic links need your own SMTP. Resend's free tier (3,000 a month) works: host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender on a verified domain. Then raise Supabase's email rate limit from its starting 30 an hour if needed.
6. Run the policy tests against staging before production: `pnpm exec supabase test db --db-url "<staging connection string>"`.
7. Create the first owner with the operator CLI. It refuses remote databases unless you pass `--allow-remote`. Put the project's secret key and database owner URL in `apps/desk/.env.ops.local` on a trusted machine only:

   ```bash
   pnpm --filter @sc/desk staff add --email you@yourdomain --name "Your Name" --role owner --allow-remote
   ```

**Connection string for the desk.** Use the shared pooler, which is IPv4 and needs no add-on, in transaction mode for Cloud Run:

```text
postgresql://desk_app.<project-ref>:<password>@<pooler-host>:6543/postgres
```

Set `DESK_DB_PREPARE=false` with this URL, because the shared pooler does not support prepared statements in transaction mode.

## 2. Container image

From the repository root:

```bash
docker build -f apps/desk/Dockerfile -t <region>-docker.pkg.dev/<gcp-project>/sc/desk:0.4.1 .
```

The build needs no secrets. Next.js generates the Server Actions encryption key during the build and embeds it, so every instance of one image agrees. Keep the registry private. Behind a TLS-inspecting proxy, add `--secret id=extra_ca,src=<ca.pem>`; the certificate is used only during the build and never stored in the image.

## 3. Cloud Run

1. Create an Artifact Registry repository next to Supabase (for example `us-east4` for Supabase `us-east-1`):

   ```bash
   gcloud artifacts repositories create sc --repository-format=docker --location=us-east4
   ```

2. Push the image:

   ```bash
   docker push us-east4-docker.pkg.dev/<gcp-project>/sc/desk:0.4.1
   ```

3. Store the secrets in Secret Manager (`desk-database-url`, `intake-hash-secret`, `kit-api-key` when the newsletter is connected, plus `otel-headers` if you export telemetry).
4. Deploy. The service is public because the desk has its own sign-in and serves the public pitch form:

   ```bash
   gcloud run deploy sc-desk --image us-east4-docker.pkg.dev/<gcp-project>/sc/desk:0.4.1 --region us-east4 --port 8080 --min-instances 0 --max-instances 3 --allow-unauthenticated --set-env-vars DESK_SITE_URL=https://<service>-<hash>.us-east4.run.app,SUPABASE_URL=https://<project-ref>.supabase.co,SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>,DESK_DB_PREPARE=false,DESK_TRUSTED_PROXY_HOPS=1,SITE_PUBLIC_URL=https://<your-domain>,SITE_DESTINATION=firebase,FIREBASE_SITE_ID=<firebase-site-id>,KIT_FORM_ID=<kit-form-id>,LOG_LEVEL=info --set-secrets DESK_DATABASE_URL=desk-database-url:latest,INTAKE_HASH_SECRET=intake-hash-secret:latest,KIT_API_KEY=kit-api-key:latest
   ```

5. The desk is staff-only, so its `run.app` address is enough at the start. Cloud Run domain mapping (us-east4 supports it) is still a Preview, and a load balancer costs about $18 a month; add either later if you want `desk.<your-domain>`. Do not put the desk behind Firebase Hosting rewrites: they forward only the `__session` cookie and would break sign-in.

Never set `SUPABASE_SECRET_KEY` on the service: the desk refuses to start with it.

Optional settings:
- **`SITE_PREVIEW_NOTICE`:** for a staging or pre-launch site. It adds a banner, `noindex` and `Disallow: /`. Leave it unset for the real site; the site builder then refuses to publish while any sample story is live.
- **`PUBLISH_SWEEP_INVOKER`:** turns on the publishing sweep (v0.6.0), which runs publish jobs left waiting.
  1. Create a service account with no roles, and set this variable to its email.
  2. Create a Cloud Scheduler job that calls the sweep with that account's OIDC token. The audience must be the exact address:

     ```bash
     gcloud iam service-accounts create sc-desk-scheduler --display-name "Seafood Confidential publishing sweep (no roles)"
     ```

     ```bash
     gcloud scheduler jobs create http sc-desk-publish-sweep --location <region> --schedule "*/15 * * * *" --uri https://<desk-address>/api/publishing/sweep --http-method POST --oidc-service-account-email sc-desk-scheduler@<gcp-project>.iam.gserviceaccount.com --oidc-token-audience https://<desk-address>/api/publishing/sweep --attempt-deadline 300s
     ```

  Each run touches the database, which keeps a Free-plan Supabase project awake.

## 4. Public site on Firebase Hosting

The desk deploys the whole static site on every publication (ADR-005). On Cloud Run it uses its own service account; no key file is created.

1. In the Firebase console, add Firebase to the same Google Cloud project and create a Hosting site (its ID goes in `FIREBASE_SITE_ID`). Use the pay-as-you-go plan on the existing billing account, so a busy day is billed per GB instead of stopping the site.
2. Give the Cloud Run service account the **Firebase Hosting Admin** role on the project:

   ```bash
   gcloud projects add-iam-policy-binding <gcp-project> --member serviceAccount:<run-service-account> --role roles/firebasehosting.admin
   ```

3. Connect the domain in Firebase Hosting (it issues the certificate) and set `SITE_PUBLIC_URL` to it.
4. Publish one test story from the desk, open it on the domain, then unpublish it. Check that the response carries the site's Content-Security-Policy header.

Only the desk service account and the founders should be able to deploy Hosting; anyone with that right could change the site outside the desk (AT-10).

## 5. Newsletter on Kit

1. Create a Kit account (free plan) with a business address and set the sending address on your domain.
2. Create a form for the website; put its numeric ID in `KIT_FORM_ID` (the public site shows the signup form only when this is set).
3. Create a v4 API key and store it as the `kit-api-key` secret (`KIT_API_KEY`). Optional: `KIT_SEGMENT_ID` to send to one segment, `KIT_EMAIL_TEMPLATE_ID` for a template.
4. Send a test story to a test segment first. A broadcast is scheduled about three minutes after publication, so it can still be stopped in Kit.

### First-deployment checks (part of SC-015)

- [ ] `GET /api/health` returns `ok` with the expected version.
- [ ] Sign-in works end to end with the production SMTP.
- [ ] A reader identity reaches `/no-access` (AT-03).
- [ ] The pooler accepts `desk_app.<project-ref>`, and role switching works in transaction mode. The ADR-003 review trigger is verified when pages load.
- [ ] `X-Forwarded-For` really contains the client address as its right-most entry. Submit two pitches from different networks and confirm their throttle buckets differ in the audit log.
- [ ] The nonce CSP and security headers are present (the end-to-end header test can run against the URL).
- [ ] The agent gateway answers 401 without a token, and the agent lab passes against staging.
- [ ] A test story publishes to Firebase Hosting, appears in the feed and sitemap, and unpublishing removes it.
- [ ] Agent publishing is off, and every section closed, until the owner deliberately opens one.

## 6. Alternative: a Hugging Face Docker Space

The same image runs on a Docker Space. This needs a paid Hugging Face plan; CPU Basic sleeps after 48 hours idle, and CPU Upgrade costs $0.03 an hour.

1. Set `app_port: 8080` in the Space README front matter.
2. Put the same variables and secrets in the Space settings, with `DESK_TRUSTED_PROXY_HOPS` set to match Hugging Face's proxy chain (verify it with the header check above).
3. Keep the Space **public**: a private Space would require every staff member and contributor to have a Hugging Face login.

## 7. Backups to Cloud Storage

Planned with SC-014: a nightly job runs `pg_dump` of the `app` and `private` schemas as the database owner, encrypts the dump, and uploads it to a private bucket in a free-tier US region, with lifecycle rules (Nearline after 30 days, delete after a year). The restore procedure is tested before launch (AT-21).
