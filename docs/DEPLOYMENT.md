# Deploying the desk (v0.3.0)

How to take the desk from the local stack to hosted Supabase and Google Cloud Run, the path recommended in [planning/HOSTING_AND_COSTS.md](planning/HOSTING_AND_COSTS.md). Nothing here has been run against hosted services yet. The steps are verified locally (the container image builds and serves), and their hosted execution belongs to SC-015 with the founders' accounts (SC-001).

## 1. Supabase project

1. Create a **Pro** organization and one project in the region you want, for example `us-east-1`. Keep the spend cap on. A separate **Free** organization holds staging.
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
5. **Configure custom SMTP** (your domain's mail provider). Supabase's built-in mailer is meant for testing and is heavily rate-limited, so magic links need your own SMTP in production.
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
docker build -f apps/desk/Dockerfile -t <region>-docker.pkg.dev/<gcp-project>/sc/desk:0.3.0 .
```

The build needs no secrets. Next.js generates the Server Actions encryption key during the build and embeds it, so every instance of one image agrees. Keep the registry private. Behind a TLS-inspecting proxy, add `--secret id=extra_ca,src=<ca.pem>`; the certificate is used only during the build and never stored in the image.

## 3. Cloud Run

1. Create an Artifact Registry repository next to Supabase (for example `us-east4` for Supabase `us-east-1`):

   ```bash
   gcloud artifacts repositories create sc --repository-format=docker --location=us-east4
   ```

2. Push the image:

   ```bash
   docker push us-east4-docker.pkg.dev/<gcp-project>/sc/desk:0.3.0
   ```

3. Store the secrets in Secret Manager (`desk-database-url`, `intake-hash-secret`, plus `otel-headers` if you export telemetry).
4. Deploy. The service is public because the desk has its own sign-in and serves the public pitch form:

   ```bash
   gcloud run deploy sc-desk --image us-east4-docker.pkg.dev/<gcp-project>/sc/desk:0.3.0 --region us-east4 --port 8080 --min-instances 0 --max-instances 3 --allow-unauthenticated --set-env-vars DESK_SITE_URL=https://desk.<your-domain>,SUPABASE_URL=https://<project-ref>.supabase.co,SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>,DESK_DB_PREPARE=false,DESK_TRUSTED_PROXY_HOPS=1,GHOST_ADMIN_URL=https://<your-ghost-site>,LOG_LEVEL=info --set-secrets DESK_DATABASE_URL=desk-database-url:latest,INTAKE_HASH_SECRET=intake-hash-secret:latest
   ```

5. Map the custom domain with Cloud Run domain mapping, in a region that supports it, or later through a load balancer. Do not use Firebase Hosting rewrites: they forward only the `__session` cookie and would break sign-in.

Never set `SUPABASE_SECRET_KEY` on the service: the desk refuses to start with it.

### First-deployment checks (part of SC-015)

- [ ] `GET /api/health` returns `ok` with the expected version.
- [ ] Sign-in works end to end with the production SMTP.
- [ ] A reader identity reaches `/no-access` (AT-03).
- [ ] The pooler accepts `desk_app.<project-ref>`, and role switching works in transaction mode. The ADR-003 review trigger is verified when pages load.
- [ ] `X-Forwarded-For` really contains the client address as its right-most entry. Submit two pitches from different networks and confirm their throttle buckets differ in the audit log.
- [ ] The nonce CSP and security headers are present (the end-to-end header test can run against the URL).
- [ ] The agent gateway answers 401 without a token, and the agent lab passes against staging.

## 4. Alternative: a Hugging Face Docker Space

The same image runs on a Docker Space. This needs a paid Hugging Face plan; CPU Basic sleeps after 48 hours idle, and CPU Upgrade costs $0.03 an hour.

1. Set `app_port: 8080` in the Space README front matter.
2. Put the same variables and secrets in the Space settings, with `DESK_TRUSTED_PROXY_HOPS` set to match Hugging Face's proxy chain (verify it with the header check above).
3. Keep the Space **public**: a private Space would require every staff member and contributor to have a Hugging Face login.

## 5. Backups to Cloud Storage

Planned with SC-014: a nightly job runs `pg_dump` of the `app` and `private` schemas as the database owner, encrypts the dump, and uploads it to a private bucket in a free-tier US region, with lifecycle rules (Nearline after 30 days, delete after a year). The restore procedure is tested before launch (AT-21).
