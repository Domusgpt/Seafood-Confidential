# syntax=docker/dockerfile:1.7
# Operations desk container: one image for Google Cloud Run (recommended) or a Hugging Face
# Docker Space. Build from the repository root:
#   docker build -f apps/desk/Dockerfile -t sc-desk:0.7.2 .
# Runtime configuration comes from the environment (see apps/desk/.env.example); no secret is
# baked in except the Server Actions key Next.js embeds at build time (keep the image private).

FROM node:24.11-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1 CI=1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/desk/package.json apps/desk/
COPY packages/contracts/package.json packages/contracts/
COPY apps/agent-lab/package.json apps/agent-lab/
# Optional extra CA for builds behind a TLS-inspecting proxy (never stored in the image):
#   docker build --secret id=extra_ca,src=/path/to/ca.pem ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install --global --no-fund --no-audit pnpm@12.21.0 && \
    pnpm install --frozen-lockfile --filter "@sc/desk..."
COPY contracts/agent-tools.schema.json contracts/
COPY packages/contracts packages/contracts
# The public site's assets are compiled from the brand tokens and the hub's motif (ADR-005).
COPY brand/tokens.json brand/
COPY tools/hub/tokens.mjs tools/hub/
COPY tools/lib/color.mjs tools/lib/
COPY tools/hub/assets/waterfront-gl.js tools/hub/assets/
COPY tools/hub/assets/shaders tools/hub/assets/shaders
COPY apps/desk apps/desk
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter @sc/desk build

FROM node:24.11-bookworm-slim AS run
# MALLOC_ARENA_MAX=2: image processing (sharp, libvips) is multi-threaded, and glibc's default
# per-thread malloc arenas fragment memory; with two arenas a large photograph peaks about a third
# lower, which matters in Cloud Run's 512 MiB (measured; see src/lib/images/process.ts).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 MALLOC_ARENA_MAX=2 \
    SITE_ASSETS_DIR=/app/apps/desk/site-static SITE_OUTPUT_DIR=/tmp/site-output
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/desk/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/desk/.next/static ./apps/desk/.next/static
COPY --from=build --chown=node:node /repo/apps/desk/site-static ./apps/desk/site-static
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/desk/server.js"]
