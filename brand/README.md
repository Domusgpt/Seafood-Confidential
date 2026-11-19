# Visual codex sources: Working Waterfront

| File                                                                                                             | What it is                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Seafood_Confidential_Brand_Concept.png](Seafood_Confidential_Brand_Concept.png)                                 | Original concept board from the founder packet (AI-generated exploration; not production artwork or photography)                                               |
| [web/brand-concept-1536.jpg](web/brand-concept-1536.jpg), [web/brand-concept-768.jpg](web/brand-concept-768.jpg) | Web derivatives for the hub (native and half width, JPEG q80); the original stays untouched                                                                    |
| [tokens.json](tokens.json)                                                                                       | Design tokens: brand colors, derived accessible steps, light and dark theme roles, status scale, type families, and the contrast pairs every hub build asserts |

The brand rules themselves are in [editorial/BRAND_GUIDE.md](../editorial/BRAND_GUIDE.md). The rendered visual codex (swatches, computed contrast, type specimen, chart conventions and the bathymetry motif) is the hub's **Visual codex** page. Agents working on visual output load the project skill [.claude/skills/sc-visual-codex](../.claude/skills/sc-visual-codex/SKILL.md).

## Changing tokens

1. Edit `tokens.json`. Brand values change only with founder approval; derived steps may change when contrast demands it.
2. Run `pnpm hub:build`. The build fails if any asserted pair drops below its minimum (4.5:1 normal text, 3:1 large text and non-text marks).
3. Screenshot the result (`pnpm hub:shots`), record evidence, and note the change in the dev log.
