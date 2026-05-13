# Phase 05 — Misc pages (contact, page, search, blog)

**Status:** pending
**Owner:** code
**Effort:** 3-5h
**Depends on:** Phase 04
**Gate:** Automated mobile + desktop QA. Lower-traffic pages still get full pipeline (P0 for mobile, P1 for desktop). Run `node qa/phase-05.mjs`.

## Goal
Convert remaining customer-facing sections that aren't homepage / PDP / collection / cart. Lower priority than prior phases but completes the "every section block-driven" mission.

## Sections in scope

| Section | Current state | Plan |
|---|---|---|
| `dopamiles-contact.liquid` | 18 settings + 2 blocks | Extend with @theme; form fields stay hardcoded |
| `dopamiles-page.liquid` | 11 settings, 0 blocks (renders page.content) | Convert to block-driven wrapper around `{{ page.content }}` |
| `dopamiles-search.liquid` | 5 settings + 1 block | Extend with @theme |
| `dopamiles-blog-article.liquid` | 6 settings, 0 blocks | Convert wrapper; article content stays from `{{ article.content }}` |
| `dopamiles-blog-index.liquid` | 7 settings, 0 blocks | Convert wrapper |
| `dopamiles-promo-bar.liquid` | 1 setting, 0 blocks | Convert to block-driven (multiple promo messages rotating?) |

## Implementation steps
1. Extend contact schema with @theme — surroundings of form
2. Convert page.liquid to wrap `{{ page.content }}` with optional pre/post blocks
3. Extend search with @theme
4. Convert blog-article + blog-index wrappers
5. Convert promo-bar to allow multiple rotating messages via blocks
6. Theme check
7. Spot-check on preview (no real-device QA — accept emulated)

## Todo
- [ ] Extend `dopamiles-contact.liquid`
- [ ] Convert `dopamiles-page.liquid`
- [ ] Extend `dopamiles-search.liquid`
- [ ] Convert `dopamiles-blog-article.liquid`
- [ ] Convert `dopamiles-blog-index.liquid`
- [ ] Convert `dopamiles-promo-bar.liquid` (block-driven rotation)
- [ ] Theme check pass
- [ ] Code-reviewer pass
- [ ] Push to preview
- [ ] Emulated QA via Playwright (re-run qa-script.mjs from QA report) on /pages/about, /search, /blogs/news

## Success criteria
- All listed sections accept theme blocks or are converted
- Contact form still posts correctly
- Blog list + article rendering preserved
- Promo bar: if merchant adds multiple blocks, they render correctly (rotation can be CSS animation or just stacked — TBD during impl)

## Risk assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Blog article wrapper accidentally injects blocks inside `{{ article.content }}` flow | Low | Render blocks in dedicated `<aside>` or `<header>` zones, not inline with content |
| Page wrapper breaks legal pages (privacy, ToS) | Low | If `template contains 'policy'` then bypass blocks render entirely |
| Promo-bar rotation introduces CLS | Low | Use opacity-based rotation with reserved height |

## QA assertions (Phase 05)

**Script:** `qa/phase-05.mjs`
**Viewports:** iPhone 14 Chromium (P0), iPhone 14 WebKit (P0), Desktop 1280 (P1)

**P0 — fail → halt:**
- `/pages/about` returns 200 (assuming an "about" page exists; if not, pick a real page handle from the store)
- `/search?q=tee` returns 200, search results section renders
- `/blogs/news` returns 200 (or actual blog handle)
- Contact form renders all expected fields (don't submit; just verify field count)
- Promo bar block-driven default renders correctly

**P1 — flag:**
- Blog article page renders if at least one article exists
- Page templates with `template contains 'policy'` bypass blocks (privacy / ToS pages)

**P2 — log only:**
- Search no-results state
- Empty blog state

## Halt rule
1 iteration max. P0 fail → halt.

## Next phase
Phase 06 — System pages (DEFERRABLE).
