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
