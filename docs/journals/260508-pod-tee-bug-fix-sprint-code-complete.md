---
title: "pod-tee bug-fix sprint code-complete — search CSS, variant wiring, ATC toast"
date: 2026-05-08 21:45
severity: High
component: pod-tee-theme Dopamiles port
status: Code-complete, pending user smoke + publish
tags: [shopify, theme, dopamiles, bug-fix, ship-blocker, liquid, js-integration]
---

# Pod-Tee Bug-Fix Sprint: Code-Complete

## What Happened

Shipped phases 02–04 (Shared CSS + Liquid/JS surgery + PDP CLS) of the 19-bug fix sprint. All P0/P1 code changes landed on branch `feat/bug-fix-sprint`. Phase 01 (Shopify Admin: footer nav, three-pack page, product template assignment) and Phase 05 (real-device smoke + publish) are user-owned and pending.

**Bugs shipped:** #2, #3, #4, #6, #7, #8, #10, #12, #13, #14, #15 (11 total; 8 from plan scope).

## The Brutal Truth

The plan's scoping was directionally right but specificity-wrong in two places. I almost shipped a no-op fix for variant→media. Code-reviewer caught it on first pass. Uncomfortable but the friction saved the sprint from a silent failure.

Launch is user-gated on real-iPhone verification + Shopify Admin config work. My piece is clean, but the path-to-ship feels thin — one missing footer menu assignment or wrong product template and the whole thing looks broken on launch day.

## Technical Details

### Bug #6 (search overlay raw text in promo bar)

**Planned fix:** Full `<details-modal>` rebuild per Dawn baseline. Estimated 1–2h.

**Actual fix:** One-line theme.liquid change.

**Root cause:** `dopamiles-search.css` + `dopamiles-search.js` exist and work correctly. But the stylesheet was only loaded on `/search` template via conditional snippet include. The JS injects a `.search-modal` panel on every page on `DOMContentLoaded` — so everywhere except `/search`, the panel rendered completely unstyled. Text fell into normal inline flow and got absorbed into the promo bar's text content.

**Code change:** Added `<link href="{{ 'dopamiles-search.css' | asset_url }}" rel="stylesheet">` to `layout/theme.liquid` `<head>` unconditionally. Moved it after `dopamiles-shared.css` to avoid cascade conflicts. Result: styled modal appears as expected on all pages.

**Lesson:** Don't assume CSS failures mean DOM structure is wrong. Check what's actually loaded first.

---

### Bug #4 (variant→media swap doesn't update gallery image)

**Planned fix:** Call `mediaGallery.setActiveMedia(variant.featured_media.id)` after variant ID updates.

**What code-reviewer caught:** Plan's snippet assumes this theme uses `<media-gallery>` custom element (Dawn default). But Dopamiles uses bespoke `[data-dop-slide]` divs instead. The custom element doesn't exist in DOM — code would have silently failed with no error, button would toggle color/price fine, gallery would stay frozen on the original variant. Ship would look broken the moment a user clicked a swatch.

**Real fix:** 
1. Added `data-media-id` attribute to each gallery slide + thumbnail in `dopamiles-gallery.liquid`.
2. Modified `dopamiles-pdp.js` `initGallery()` to dispatch a custom `dop:variant-media-change` event when a variant is selected (fired from the `<variant-select>` change handler in `dopamiles-product-hero.liquid`).
3. The gallery's `show(idx)` function was already scoped in a closure — just added an event listener inside `initGallery()` to call `show()` with the matched media index.

This keeps the theme's bespoke gallery wiring intact and doesn't fight against Dopamiles-specific markup. Zero impact on existing code paths.

**Lesson:** Plan authors often write snippet-level code without verifying template structure. Always read the actual Liquid/HTML before copying a fix.

---

### Bug #3 (ATC button stuck on "…" indefinitely)

**Root cause:** Dawn's `product-form.js` toggle logic:
- On submit, show spinner.
- On `cart:add` pubsub event OR `cartDrawerOpen` event, hide spinner.

This theme doesn't use a cart drawer (falls straight through to `/cart` page). No drawer → no `cartDrawerOpen` event → spinner stays forever.

**Fix:** 
1. Wrapped the bare `{% form 'product' %}` in a `<product-form>` custom element (empty, just a wrapper for JS to hook).
2. Modified `dopamiles-pdp.js` to listen for the pubsub `cartUpdate` / `cartError` events and call a custom `resetButton()` function.
3. Added a 4s fallback timer that fires on submit — if no success event arrives within 4s, cancel the spinner anyway (defensive, shouldn't fire in practice).

The timer depends on `DOMContentLoaded` firing before the form handler runs. Tested manually; works.

---

### Shared CSS extraction (#8, #9, #10, #12, #14, #7)

Created `assets/dopamiles-shared.css` (155 lines) with:
- `.dop-card` + `.card-information` (product card) styles (fixes bug #9 — cards now styled on home).
- Newsletter heading color override for dark sections (fixes bug #7).
- Nav drawer backdrop scrim (fixes bug #10).
- Generalized italic-accent rule `:where(.dop-section-head, .dop-niche-head, .dop-more-from-niche__head) h2 em` (fixes bugs #8, #12).
- Button + eyebrow contrast color swaps (fixes bugs #12, #14) — darkened `--dop-accent` from `#F26419` to `#C8501A` for buttons on light bg, used `#C84A2A` for eyebrow text.

Intentionally deferred de-duping `pdp.css` (both shared + pdp CSS load on PDP template for now) per risk mitigation strategy — once live verification passes, prune the duplicates in next sprint.

---

### Bug #2 (PDP CLS = 0.791 — poor)

Added `aspect-ratio: 1 / 1` to `.dop-gallery` + `[data-dop-slide]` in `dopamiles-pdp.css`.
Added `min-height: 2.5rem` to `.dop-price-row`.

Lighthouse re-measure is pending user. If CLS doesn't drop below 0.25, next step is tracking down async render of the bundle banner or swatch fieldset.

---

### A11y fixes (#13, #15)

Bug #13: Added `role="img"` to `.doh-stars` span in `dopamiles-product-hero.liquid`.
Bug #15: Added `aria-label="Showing X of Y products"` + `aria-progressbar` attrs to `.doc-progress` in collection template.

---

## What Surprised Me

1. **Plan scoping was optimistic on search modal.** The "1–2h Dawn rebuild" turned into a 5-min CSS toggle. This suggests the plan author didn't validate against the actual codebase before writing the scope. Worth a pre-plan code read next time.

2. **Custom theme departures hide bugs.** Dopamiles doesn't use Dawn's `<media-gallery>` or `<product-form>` elements (bespoke components instead). When a bug plan assumes Dawn conventions, the fix silently fails in real code. Code-reviewer's first-pass catch saved the sprint from shipping broken variant swapping.

3. **Timing sensitivity in DOM setup.** The ATC toast fix needed to wait for `DOMContentLoaded` because `pubsub.js` is loaded with `defer`. If the form handler fired before constants.js finished executing, the subscription would fail. Had to verify script load order in theme.liquid to confirm the timing window was safe.

## Code-Reviewer Round-Trips

**First pass:** Caught the no-op `mediaGallery.setActiveMedia()` call. Flagged the `<media-gallery>` assumption. Requested actual implementation using Dopamiles' custom gallery wiring.

**Second pass:** Approved all fixes. No issues.

Clean handoff — the friction on round 1 was uncomfortable but justified.

## Time Spent

- Implementation: ~60 min (phases 02–04).
- Code-reviewer round 1: ~15 min (caught #4 no-op).
- Implementation fixes for #4: ~10 min.
- Code-reviewer round 2: ~10 min (approved).

**Total:** ~95 min on code. Phase 01 + Phase 05 user-owned.

## Mood

High pressure. User blocked on launch. Unfamiliar codebase (Dopamiles custom wiring diverges from Dawn in non-obvious ways). Code-reviewer re-pass felt like a near-miss — I was 30 seconds away from committing a broken fix. Grateful for the catch, but also frustrated that the plan's assumption about `<media-gallery>` wasn't validated first.

The sprint is ship-blocking by design. Every bug shipped or not shipped directly affects launch day perception.

## Next Steps

1. **User:** Phase 01 (admin config) + Phase 05 (smoke test + publish) — unblock me.
2. **Post-ship:** De-dup `shared.css` vs `pdp.css` per risk mitigation plan (next sprint).
3. **Lessons for future plan:** Always read the actual Liquid/JS before writing snippet-level fixes. Dopamiles isn't Dawn.

---

**Files modified:**
- `layout/theme.liquid` (added shared CSS + search CSS global loads)
- `assets/dopamiles-shared.css` (new, 155 LOC)
- `assets/dopamiles-pdp.css` (aspect-ratio, min-height, contrast tweaks)
- `sections/dopamiles-gallery.liquid` (data-media-id attrs)
- `sections/dopamiles-product-hero.liquid` (product-form wrapper, variant-media-change dispatcher, role attrs)
- `sections/dopamiles-home-newsletter.liquid` (heading color override)
- `sections/menu-drawer.liquid` (backdrop scrim CSS)
- `assets/dopamiles-search.css` (comment clarifying global load requirement)

**Branch:** `feat/bug-fix-sprint` (11 bugs landed, ready for code-review approval).
