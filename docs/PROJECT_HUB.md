# Project hub and branch previews

The project hub is a static site generated from the repository's canonical sources by `pnpm hub:build`. Its pages: overview, backlog with dependency graph and critical path, acceptance scenarios, decisions, editorial plan, visual codex, rendered documentation, dev log and evidence. It never contains data that the repository does not already hold.

## Where it is published

The [Pages workflow](../.github/workflows/pages.yml) builds the hub for **every pushed branch** and publishes it to the `gh-pages` branch:

| URL | Contents |
|---|---|
| `https://domusgpt.github.io/Seafood-Confidential/` | Index of all branch previews, newest first |
| `…/branches/<branch-slug>/` | The hub as built from that branch (for example `branches/claude-intelligent-cannon-d1nqq6/`) |
| `…/latest/` | Redirects to the most recently updated branch |

When a branch is deleted its preview is removed. The index keeps the 20 most recently updated branches; older previews are pruned automatically.

## One-time setup (repository owner)

GitHub Pages must be switched on once. Workflows cannot do this with the default token.

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Source: Deploy from a branch**.
3. Choose branch **`gh-pages`** and folder **`/ (root)`**, then **Save**.

The `gh-pages` branch appears after the first workflow run on any branch. If Pages is enabled before then, re-run the latest "Pages previews" workflow afterwards. The site is public, like the repository. Every page is marked `noindex`, and the hub is a planning view: it is not the publication.

## Local use

```bash
pnpm hub:build
```

```bash
pnpm hub:serve
```

Then open <http://127.0.0.1:4173/>. `pnpm hub:check` verifies every internal link and asset and each page's structure. `pnpm hub:shots --out <dir>` captures desktop, mobile and dark-mode screenshots and runs an axe accessibility scan.

## How it is built

- **Data:** `tools/lib/project.mjs` reads the backlog, acceptance matrix, decisions, calendar, sessions, evidence and dev log, and derives the critical path, window capacity and counts.
- **Gates:** the build fails if a brand contrast pair drops below its minimum, or if the launch packet's cost table stops reconciling with the workbook totals.
- **Design:** Working Waterfront tokens from `brand/tokens.json` (light and dark), self-hosted Fraunces and Source Sans 3, and charts that follow the dataviz method (table view for every chart, no color-only encoding). The WebGL2 bathymetry masthead falls back to CSS, renders a static frame for reduced-motion users and pauses offscreen.
- **Security:** a strict Content-Security-Policy (no third-party scripts, styles or fonts; the one inline script is allowed by hash), `noindex`, and no forms or network calls.
