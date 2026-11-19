# Third-party notices

The repository's own contents are covered by [LICENSE](LICENSE). The components below keep their own licenses.

## Distributed with the project hub

| Component                                                                     | Version | License                   | Use                                                                                   |
| ----------------------------------------------------------------------------- | ------- | ------------------------- | ------------------------------------------------------------------------------------- |
| Fraunces variable font (Undercase Type; via `@fontsource-variable/fraunces`)  | 5.3.0   | SIL Open Font License 1.1 | Display type in the hub; license text shipped as `assets/fonts/fraunces-OFL.txt`      |
| Source Sans 3 variable font (Adobe; via `@fontsource-variable/source-sans-3`) | 5.3.1   | SIL Open Font License 1.1 | Text and interface type; license text shipped as `assets/fonts/source-sans-3-OFL.txt` |

## Distributed with the public site (v0.7.0)

| Component                                                                    | Version  | License                                                              | Use                                                                        |
| ---------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Fraunces and Source Sans 3 variable fonts                                    | as above | SIL Open Font License 1.1                                            | Type on the public site; license texts shipped as `assets/fonts/*-OFL.txt` |
| GSAP and its ScrollTrigger plugin (GreenSock, a Webflow company; via `gsap`) | 3.15.1   | GSAP Standard "no charge" license, https://gsap.com/standard-license | Scroll-linked motion on the public site (`assets/vendor/*.min.js`)         |

**GSAP is not open-source software.** Its Standard license is a proprietary no-charge license.

- **Allowed:** commercial use on websites, including this publication.
- **Prohibited:** using GSAP in tools that let people build animations without code in competition with Webflow.
- **Notices:** GSAP's own notices must stay intact, so the files are copied byte for byte.
- **Termination and changes:** Webflow may end the license for non-compliance and may revise its terms.

The motion system works without GSAP (the site is fully readable with scripts off), so it could be replaced by CSS scroll-driven animations or an MIT-licensed library if the terms ever stop suiting the publication.

### Sample-story photographs (preview only)

All six are in the public domain. License, author and source were verified on each Wikimedia Commons file page on 19 November 2026 (`supabase/sample/images/manifest.json`). They are credited on the site anyway, and recorded as cleared rights records in the database.

| File                                                              | Author                                                                 | Status                                                            | Source                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/sample/images/sc-2026-007-fishing-boat.jpg`             | Sean Varner, U.S. Fish and Wildlife Service                            | Public domain (released by its author)                            | [Old rusty fishing boat moored in the harbor.jpg](https://commons.wikimedia.org/wiki/File:Old_rusty_fishing_boat_moored_in_the_harbor.jpg)                                                                                                               |
| `supabase/sample/images/sc-2026-006-oyster-cages.jpg`             | Preston Keres, U.S. Department of Agriculture                          | Public domain (U.S. government work)                              | [20180927-FPAC-PJK-0621 TONED.jpg](https://commons.wikimedia.org/wiki/File:20180927-FPAC-PJK-0621_TONED.jpg)                                                                                                                                             |
| `supabase/sample/images/sc-2026-005-imported-seafood-samples.jpg` | Michael J. Ermarth, U.S. Food and Drug Administration                  | Public domain (U.S. government work)                              | [Seafood- FDA Inspector 2708 (4494140211).jpg](https://commons.wikimedia.org/wiki/File:Seafood-_FDA_Inspector_2708_%284494140211%29.jpg)                                                                                                                 |
| `supabase/sample/images/sc-2026-004-harvest-waters-map.jpg`       | Michael J. Ermarth, U.S. Food and Drug Administration                  | Public domain (U.S. government work)                              | [Safe Shellfish (4496) (4493305743).jpg](https://commons.wikimedia.org/wiki/File:Safe_Shellfish_%284496%29_%284493305743%29.jpg)                                                                                                                         |
| `supabase/sample/images/sc-2026-003-shrimp-counter.jpg`           | Carol M. Highsmith (Carol M. Highsmith's America, Library of Congress) | Public domain (no known restrictions; Carol M. Highsmith Archive) | [Seafood vendors at the Maine Ave. Fish Market, 1100 Maine Ave., SW, Washington, D.C LCCN2010641388.tif](https://commons.wikimedia.org/wiki/File:Seafood_vendors_at_the_Maine_Ave._Fish_Market,_1100_Maine_Ave.,_SW,_Washington,_D.C_LCCN2010641388.tif) |
| `supabase/sample/images/sc-2026-002-power-block.jpg`              | NOAA Historic Fisheries Collection (photographer not named)            | Public domain (U.S. government work)                              | [Hauling net with power block on salmon purse seiner.jpg](https://commons.wikimedia.org/wiki/File:Hauling_net_with_power_block_on_salmon_purse_seiner.jpg)                                                                                               |

## Used by the desk server (inside its container image)

| Component                                          | Version | License           | Use                                                                                                |
| -------------------------------------------------- | ------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| sharp                                              | 0.35.5  | Apache-2.0        | Story image processing (renditions, orientation, metadata removal)                                 |
| libvips (prebuilt, `@img/sharp-libvips-linux-x64`) | 8.18.7  | LGPL-3.0-or-later | Image codec library used by sharp, dynamically linked; its license and notices ship in the package |

## Development dependencies (not distributed)

| Package              | Version | License    |
| -------------------- | ------- | ---------- |
| ajv                  | 8.20.0  | MIT        |
| marked               | 18.2.1  | MIT        |
| yaml                 | 2.9.1   | ISC        |
| playwright           | 1.63.0  | Apache-2.0 |
| @axe-core/playwright | 4.14.0  | MPL-2.0    |
| prettier             | 3.10.1  | MIT        |
| supabase (CLI)       | 3.2.0   | MIT        |

## Tools installed by `tools/bootstrap/install-dev-tools.sh` (not distributed)

| Tool           | Version | License                              |
| -------------- | ------- | ------------------------------------ |
| Node.js        | 24.22.3 | MIT                                  |
| actionlint     | 1.7.12  | MIT                                  |
| gitleaks       | 8.30.1  | MIT                                  |
| ShellCheck     | 0.11.0  | GPL-3.0 (used as a separate program) |
| firebase-tools | 15.36.0 | MIT                                  |
| vercel CLI     | 66.1.0  | Apache-2.0                           |
| gscan          | 6.7.0   | MIT                                  |

## Brand material

`brand/Seafood_Confidential_Brand_Concept.png` (and its web derivatives in `brand/web/`) is an **AI-generated concept exploration** delivered with the founder packet. It is not final artwork, a logo, or documentary photography, and must not be presented as a photograph of a real person, operation or event (editorial/BRAND_GUIDE.md).

## Referenced, not included

Ghost's Source theme (MIT), proposed as the starting theme, is not yet part of this repository. Paid or marketplace themes are generally licensed against redistribution and must not be committed to a public repository.
