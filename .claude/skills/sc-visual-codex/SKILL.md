---
name: sc-visual-codex
description: Seafood Confidential's "Working Waterfront" visual codex entry — brand tokens, accessible color steps, type, chart conventions and the bathymetry WebGL motif. Use for any visual work in this repository (project hub, Ghost theme, operations desk UI, newsletter or social graphics, charts) and when adding this brand to a shared visual codex.
---

# Seafood Confidential visual codex: Working Waterfront

An independent trade journal with maritime character: credible on a buying desk, inviting at a kitchen table. Version 0.1 (2026-11-18), pending founder approval with [editorial/BRAND_GUIDE.md](../../../editorial/BRAND_GUIDE.md).

## Source of truth

- **Tokens:** [brand/tokens.json](../../../brand/tokens.json). Never hard-code brand hex values elsewhere; compile from tokens (see `tools/hub/tokens.mjs`).
- **Rendered codex:** the project hub's _Visual codex_ page (`pnpm hub:build`, then `_site/visual-codex.html`).
- **Concept:** `brand/Seafood_Confidential_Brand_Concept.png`. It is AI-generated exploration only: never present it as a photograph, logo artwork or reporting.

## Color rules (computed, not assumed)

| Token     | Hex     | Use                                         | Contrast facts                                                                          |
| --------- | ------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| ink       | #102B3A | Text, masthead, navigation                  | 12.80:1 on salt                                                                         |
| salt      | #F3EFE5 | Page and paper; text on ink                 | 12.80:1 on ink                                                                          |
| sea glass | #7FA59A | Panels, rules, quiet accents                | **2.36:1 on salt: decorative only on paper**; 5.43:1 on ink (text-capable)              |
| rust      | #B64D35 | Small emphasis, accents, large display text | **4.46:1 on salt: fails AA body text**; use `rust-text` #A24430 (5.37:1) for small text |
| harbor    | #2C5A70 | Links and primary chart marks on paper      | 6.52:1 on salt                                                                          |

Dark theme: deep page #0B202C, ink cards, salt text, `salt-2` #C5D0CC, `rust-light` #E08A72, `harbor-light` #8DB8CC (all ≥ 5.4:1 on ink).

Process: add any new text/background pair to `contrast.pairs` in tokens.json. The hub build fails below 4.5:1 for normal text and 3:1 for large text or UI marks. Status colors (good #0CA30C, warning #FAB219, serious #EC835A, critical #D03B3B) always carry an icon and a label.

## Type

- **Display:** Fraunces variable (SIL OFL 1.1). Masthead in uppercase, weight 860, `'SOFT' 0, 'WONK' 0, 'opsz' 144`, line height 0.92. Tagline in italic at `opsz` 36. Headings at weight 680–760.
- **Text and UI:** Source Sans 3 variable (SIL OFL 1.1) for body, interface and **all chart figures** (never a serif on numbers). Proportional figures for big numbers, `tabular-nums` only in aligned columns.
- Self-host both (`@fontsource-variable/*`); no third-party font CDNs. Fallbacks: Iowan Old Style, Palatino, Georgia; system-ui.

## Layout and components

- Paper background (salt), raised cards (#FBF9F4) with a 1px ink-14% rule, radius 10px, soft shadow. 16px gutter on phones, 28px from 720px. Body text 17px with 1.6 line height; measure about 72ch.
- Eyebrow labels: 13px uppercase, letter-spacing 0.08em, `rust-text`.
- A 2px rust rule under the masthead wordmark (from the concept board).
- Status badge: an icon plus a label in ink; the icon carries the status color.

## Charts (dataviz method)

Use thin bars (≤ 24px; 14px default) with a 4px rounded data end and a square baseline; one axis; solid hairline grid. Marks use `mark` (harbor); ranges use `mark-range`, the same ramp one step lighter, with values always in labels or the table view. Reserve or secondary context uses sea glass. One emphasized series or path uses rust (emphasis form). Reference lines are 2px ink. Every chart gets a legend (for two or more series), selective direct labels and a **table-view twin**. Build bar charts in HTML/CSS so text stays at real sizes. Validate any categorical palette with the dataviz skill's `validate_palette.js` before shipping.

## Motif: bathymetry

Nautical depth contours in sea glass on ink, with every fifth line an index contour, slowly drifting. Implementation: `tools/hub/assets/shaders/bathymetry.{vert,frag}` (GLSL ES 3.00, validated with `glslangValidator`) and `tools/hub/assets/waterfront-gl.js`. Requirements:

- WebGL2 with a CSS fallback; a static frame under `prefers-reduced-motion`; paused offscreen and in hidden tabs; device pixel ratio capped at 1.5; about 30 fps.
- Decorative only (`aria-hidden`); a gradient scrim keeps text contrast independent of the lines.
- Reuse it as a rendered still for newsletter headers or social cards. Keep it out of article bodies.

## Imagery and voice

Show real people and working places, with fisheries and aquaculture at equal standing. Record permission, credit and location, and whether an image is documentary, illustrative or generated. Voice: direct, curious, warm, occasionally wry. Tagline: "Seafood, from the people who know it."

## Checklist for visual changes

1. Edit tokens, never raw hex. 2. `pnpm hub:build` (contrast gate). 3. `pnpm hub:shots` (desktop 2×, iPhone 13, dark, reduced motion; axe WCAG 2.2 AA). 4. Look at the screenshots yourself. 5. Record evidence and a dev log entry.

## Operations desk UI patterns (from the desk build, v0.2.0–0.3.0)

Reusable for any private tool in this brand. Live reference: `apps/desk/src/app/globals.css`, `apps/desk/src/components/`.

- **Status = icon + label + tone token.** One `StatusBadge` with tones `good / warning / serious / critical / info / neutral` mapped to the status colors (info uses `mark`). Never color alone. Icon glyph strokes use the masthead ink or salt so they keep contrast in both themes.
- **One next action per record.** A callout with a 5px tone bar, the action as the title, then the owner, due date and the single link that moves the work (for example the exact Ghost editor URL).
- **Forms:** a visible label, an "(optional)" marker, a hint linked with `aria-describedby`, and an error with `aria-invalid`. Form errors go in a `role="alert"` summary and successes in `role="status"`. Inputs are at least 44px tall; pressed buttons are disabled with `aria-disabled`.
- **No inline `style` attributes.** A nonce-based CSP blocks them; use classes and SVG presentation attributes only.
- **Tables on phones:** wrap every table in a horizontal scroll container that is `position: relative`. Otherwise absolutely positioned visually-hidden labels inside a wide table stretch the whole page sideways (found by the phone layout test).
- **Calendar dates** (Postgres `date`) are formatted as dates in UTC, never as instants in the newsroom zone; otherwise they show a day early.
- **Masthead rule** sits under the wordmark only (`justify-self: start` on grid layouts), not across the bar.
- **Fonts:** `@fontsource-variable` registers `Fraunces Variable` and `Source Sans 3 Variable`; put those names before the token families when compiling tokens for an app.
- **State a workflow owns** (v0.4.1). When a value is set by a process, such as Published, which only publishing sets, the form shows that value as the only choice. The hint names the control that changes it ("Update it or take it off the site from the Publishing panel; the status follows"). The server refuses a hand change with the same sentence, so a crafted request gets the same explanation as the page.
- **Failed checks** (v0.4.1). List one item per failed check: a short check name in bold, then what was found ("**Master switch:** Agent publishing is switched off in Settings."). Never pair a requirement phrased as a statement with a finding that contradicts it.

## Public site patterns (from the desk-built static site, v0.4.0)

Reusable for any static publication in this brand. Live reference: `apps/desk/site-src/site.css`, `apps/desk/src/lib/site/build.ts`.

- **Masthead:** an ink band with the wordmark, a rust rule under it and the italic tagline. Only the home page carries the WebGL bathymetry canvas, with the scrim; inner pages use the static radial gradient.
- **Section bar:** a horizontal scroller with 44px targets. Section names are links, never buttons.
- **Cards:** a raised surface card per story, holding:
  - an eyebrow line (rust-text, uppercase, 0.08em letter spacing) with the section;
  - the story's labels as pills: Opinion, Sponsored, and an **AI-written pill with the info icon**;
  - a Fraunces headline, the dek, then the byline and date.

  The lead story gets a 4px rust top rule and a larger headline.

- **Story page:** one 72ch column, with the title at Fraunces 720 and `text-wrap: balance`. Body text is 18px with a 1.68 line height, and story headings start at h2 (the title is the only h1). Blockquotes are Fraunces italic with a rust rule.
- **AI disclosure:** an aside with a 5px `mark` left bar, titled "How this story was written", showing the owner's disclosure text. It appears on every AI-generated story and is never hidden.
- **Sources:** a list under a 2px ink rule. Each title links to its source; publisher and date sit in muted text below.
- **Newsletter box:** an ink card with salt text and a full-height input and button. Scope muted footer text to direct children only: a broad `footer p` rule once dimmed the box text to 2.44:1.
- **Security and performance:**
  - no inline script or style; only `/assets/*` and the motif script on the home page;
  - a CSP in a meta tag mirrored as a hosting header (`frame-ancestors` lives only in the header);
  - fonts preloaded and self-hosted with their OFL files.
- **Checks before shipping:** axe WCAG 2.2 AA on home, an AI story and a person's story, each in light, dark and phone views, with no horizontal overflow.

## Preview and placeholder labelling (v0.5.0–v0.6.0)

Reusable for any staged or pre-launch site in this brand. Live reference: `apps/desk/site-src/site.css` (`.preview-banner`, `.label--sample`, `.sample-note`) and the site builder (`apps/desk/src/lib/site/build.ts`).

- **One token role for "not the real thing":** `notice` (status warning) with `notice-text` (ink). The pair is 8.01:1 in both themes and listed in `contrast.pairs`. Use it only for preview and placeholder marking, never for decoration.
- **Preview banner:** one centred line above the masthead: **Preview.** followed by a plain sentence ("Not launched yet. Stories here are tests by the founders."). Pair it with `noindex` on every page, `Disallow: /` in robots.txt, and `X-Robots-Tag` on private tools.
- **Placeholder content:**
  - an uppercase "Sample" chip beside the section eyebrow, on the card and the story;
  - a `notice` callout at the top of the story body that says it is placeholder text, not reporting, and will be removed;
  - "Sample:" before each feed title;
  - sources visibly marked as placeholders.

  Text always carries the meaning; colour only reinforces it.

- **Placeholder copy makes no factual claims:** no figures, names, quotations or real sources. It shows form, never facts.
- **Guard it in code, not only in style:** the build refuses to publish placeholder items to a site that is not a preview.
- **Empty state:** "Coming soon" with one plain line ("The first stories are on their way."), and no sign-up offer unless a form really exists.

## Motion and depth (v0.7.0)

Reusable for any public page in this brand. Live reference: `apps/desk/site-src/motion.js`, `motion-boot.js`, `site.css`; tokens `space`, `radius`, `elevation`, `motion` in `brand/tokens.json` (v0.2); decision in `decisions/ADR-006-story-images-and-motion.md`.

- **One light from above.** Raised surfaces use `--elevation-1/2/3`: a top highlight and layered ambient and key shadows. Recessed ones (source trays, inputs) use `--elevation-inset`, and chips and buttons `--elevation-bevel`.
  - Each theme sets its own highlight and shadow colours; dark mode has a faint highlight and deep shadows.
  - Depth never replaces the 1px rule that marks an edge.
- **Tune motion in tokens, never in code.** Durations, CSS and GSAP easings, distances, parallax depths and `mediaScale` are read at runtime.
  - Presets (`data-motion-preset`: calm, standard, expressive) scale distance and speed.
  - `off` ships a still site.
- **Layers.** A masthead is a stack moving at different depths: bathymetry (deep), contour linework (mid; `contours.svg` as a CSS mask so the theme colours it), light (near), and type (moves against the scroll and fades).
- **Text.** Titles rise word by word: each word is a span with real spaces between, so the heading's text, which screen readers, find-in-page and copying see, is unchanged. Never duplicate text into a hidden copy.
- **Images:**
  - Frames open from their edges and develop from muted to full colour (no colour filter on phones).
  - The photograph drifts inside its frame, scaled just enough that no edge shows.
- **Scroll behaviour.** Everything scroll-linked reverses when the reader scrolls back. Things above the fold play on load, not on scroll.
- **Off switches, and no flash:**
  - A synchronous same-origin `motion-boot.js` decides before first paint whether to hide revealable elements.
  - A 2.5-second failsafe shows everything if motion never starts.
  - The reader's toggle (remembered) and `prefers-reduced-motion` turn motion off.
  - Turning it off reverts every change: GSAP context revert, then the style attributes motion added are removed. That is safe because the server's HTML has none under the CSP.
- **Accessibility gates.** Run axe on pages at rest, after motion has settled. Keyboard focus reveals content at once, and reveals use opacity only, never visibility, so links stay focusable.
- **CSP.** Self-host GSAP, copied byte for byte so its license notices stay intact. Set styles only through CSSOM (`el.style`) or classes, never inline `style=` in markup. Focal points are classes (`fx-0…4`, `fy-0…4`), not inline `object-position`.
