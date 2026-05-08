# POD Bundle Phase 04 — 3-Pack Picker & Cart Integration Shipped

**Date**: 2026-05-08 15:30  
**Severity**: Medium (feature complete; deployment edge case noted)  
**Component**: Dopamiles POD Tee — Bundle Picker Page & Cart Flow  
**Status**: Code-shipped & live; Phase 02 (admin UI) deferred

---

## TL;DR

Shipped Phase 04: 3-pack picker page on Dopamiles dev store, bundle Function integrated, discount applied via GraphQL mutation. 6 new files + 2 modifications in pod-tee-theme. Code-reviewer caught **critical `_bundle_id` collision** with existing kit-picker drawer grouping; pivoted to announcement-only pattern (dropped cart grouping, cut 30% LOC, zero regression). Mobile-pro-max hardening passed 6 hit-area + touch interaction checks. Function deployed as `dopamiles-bundle-app-3`. Theme accidentally published to live (harmless on dev; user was testing template assignment).

---

## What Shipped

**Dopamiles dev store**:
- `/pages/3-pack` picker page (template suffix `three-pack`)
- Function live as app 3, discount configured via GraphQL Admin API
- Theme pushed as `3pack-QA-260508-1215` (now published; user testing template assignment)

**Pod-tee-theme new files** (feat/bundle-function, commit 5d3e22e):
- `templates/page.three-pack.json` — page scaffolding, picker section embed
- `sections/dopamiles-3pack-picker.liquid` — 174 LOC, slot UI + add-to-cart logic
- `snippets/dopamiles-3pack-slot.liquid` — product slot renderer (fill/empty states)
- `snippets/dopamiles-3pack-browse-card.liquid` — product browse modal card
- `assets/dopamiles-3pack.js` — 360 LOC, picker state machine + drawer refresh coordination
- `assets/dopamiles-3pack.css` — 440 LOC (mobile hardening +12% over first pass)

**Pod-tee-theme modifications**:
- `layout/theme.liquid` — CSS link gated on `template == 'page.three-pack'` → dropped gate, loads site-wide (~9KB cost, necessary for mobile preview)
- `assets/dopamiles-cart.js` — exposed `refresh: refreshDrawer` on `window.dopCart` (picker needs post-ATC refresh before open)

**Crusher-form plan docs** (claude/add-photo-upload-tool-p3dI0, commit bee1f34, pushed):
- Phase 04 completion notes + architecture pivot documentation

---

## Architecture Pivot: Why We Dropped Cart Grouping

**Original Phase 04 design**: Picker ATC 3 lines with `_bundle_id: '3pack-123'` (parent) + `_bundle_parent: '3pack-123'` (children), mutate drawer to visually group them.

**Code-reviewer caught**: Drawer at `dopamiles-cart-drawer.liquid:107-114` already uses this property pattern for kit-picker bundles. Setting `_bundle_id` on all 3 lines would clash: drawer would render 3 "Bundle parent" cards (misinterpreted as 3 separate bundles), each with empty children and "Remove bundle" buttons. The drawer code even claimed to ignore `_bundle_id` — that docstring was stale/wrong.

**Pivot (user-approved)**: Drop `_bundle_id` entirely. Announce bundle visually via Phase 03 cart headline instead ("Bundle saving applied · 25% off"). Discount applies via qty-sum tag matching in Function regardless of grouping. Phase 03 headline already state-machines correctly (0/1/2/3+ items). Result: **picker payload is clean, zero drawer regression, UX identical**.

**Trade**: Saved ~120 LOC (30% of original picker logic). Eliminated integration risk. Design stays elegant.

---

## Seven Lessons That Stung

### 1. Liquid `template` global doesn't reflect `?view=` overrides
CSS gated on `{% if template == 'page.three-pack' %}` failed on preview. The page was created with default template (admin UI limitation prevented `templateSuffix` GraphQL setter without broader scopes), then previewed via `?view=three-pack`. Gate evaluated false → CSS never loaded → product images rendered at natural snowboard aspect (600×800px) overflowing the 100px slot massively. Fixed by dropping gate; CSS now site-wide. **Lesson**: Don't gate critical rendering CSS on `template` global if the page might be viewed under different templates. Use selector-based specificity instead (e.g., `[data-page-type="3pack"]`).

### 2. `_bundle_id` property collides with kit-picker architecture
Not a typo or oversight—it's a **CRITICAL vault door collision**. Code-reviewer flagged this as high risk; if shipped, cold traffic would see 3 broken "Bundle parent" cards with no children. This is the kind of bug that passes QA (drawer renders; buttons work; prices display) but creates a user UX disaster (confusing nested structure, misleading "Remove bundle" for single items). **Lesson**: When integrating with existing cart patterns, audit the drawer code first. Don't assume you're the first to use a property prefix.

### 3. `window.dopCart.open()` doesn't refresh cart state
After picker ATC succeeds, drawer toggles visibility but shows pre-ATC cart. Existing upsell flow does `refreshDrawer(); openDrawer()` in correct order. Fix: exposed `dopCart.refresh = refreshDrawer`, picker awaits refresh before open. Promise-resolved to handle async success/error paths. **Lesson**: Cart UI and cart data refresh are separate concerns; don't assume drawer toggle updates state.

### 4. `padding-bottom: 100%` resolves against parent width
Slot images at full height (~500px) on mobile instead of 100×100. The padding-bottom percentage hack resolves against parent's width, not own width. On desktop (column layout), parent ~200px wide, so 100% = 200px padding. On mobile (row layout), parent full-width, so padding explodes. Fix: explicit `width: 100px; height: 100px; padding-bottom: 0` for mobile, conditional on screen size. **Lesson**: Padding-bottom aspect ratio trick assumes stable parent width; mobile layouts break it.

### 5. `display: flex` overrides `[hidden]` HTML attribute
Both `.dop-3pack-slot-empty` and `.dop-3pack-slot-filled` had unconditional `display: flex`. HTML `[hidden]` applies `display: none` at low specificity. Class selector wins → both empty and filled states rendered simultaneously, overlapping. Fix: added `[hidden] { display: none !important }` global rule + state-specific `is-empty .filled { display: none !important }`. **Lesson**: Hidden attribute is weaker than class selectors; you need !important or restructure state logic.

### 6. GraphQL Admin API scopes don't grant on install
Default scopes don't include `write_discounts` or `write_online_store_pages`. Hit twice: first on `discountAutomaticAppCreate` (solved by re-install with broader scopes), second on `pageCreate` (gave up, used admin UI). **Lesson**: When installing GraphiQL on a dev store, enumerate all scopes upfront. Don't discover them mid-mutation.

### 7. Function `discountClasses` is required for new API
First `discountAutomaticAppCreate` mutation failed: "Functions configured to use 'discounts' API type require discountClasses field". The Function's Rust code checks for `DiscountClass::Product`; just mirrored it in mutation: `discountClasses: [PRODUCT]`. **Lesson**: New unified discount API requires explicit class declaration; it's not inferred from the Function logic.

---

## Verification Ladder

- ✅ Function compiles: `cargo check --target=wasm32-unknown-unknown --release`
- ✅ JS syntax: `node --check dopamiles-3pack.js`
- ✅ `shopify theme check`: 0 issues
- ✅ Code review: 6/10 → 9/10 after fixes (2 CRITICAL: `_bundle_id` collision + drawer refresh; 3 HIGH: CSS gate, padding-bottom, hidden spec)
- ✅ Mobile-pro-max hardening (App UI checklist):
  - Slot clear button 28×28 → 44×44 hit area (visible 28px chip via `::before` pseudo)
  - Picker select 30px → 44px min-height + 16px font (avoids iOS auto-zoom)
  - Added `touch-action: manipulation` (300ms tap delay)
  - ATC button: 48px min-height
  - Added `overscroll-behavior: contain` (pull-to-refresh interference)
  - Hover transforms gated on `@media (hover: hover)` + active-press scale for touch
- ✅ End-to-end QA on dopamiles-dev (mobile + desktop):
  - **Positive**: 3 slots fill → ATC → drawer refreshes → 3 lines render + "Bundle saving applied · 25% off" → Function applies 25% per line → math verified
  - **Negative tier-2** (cart 3→2): headline "One more tee · save 25% & unlock free shipping", lines re-discounted at 15%
  - **No-tier** (cart 2→1): headline "Add a 2nd tee · save 15%", line shows full price
  - **Tier-3 reapply** (1+3 = 4 lines): headline "Bundle saving applied · 25%", all 4 lines at 25%

---

## What's NOT Shipped

1. **Phase 02 Admin UI** — Discount config still hardcoded in metafield. For multi-merchant scaling, this is real cost. Deferred until 2nd merchant exists; still YAGNI.
2. **Variant picker UX** — Dev store snowboards single-variant. Real Dopamiles tees (size + color) will surface picker dropdowns in production; pre-implementation review needed on multi-variant data before launch.
3. **Lazy-load browse variants** — 180KB inline product JSON flagged by code-reviewer as L2 (LOW). Acceptable for landing page; worth revisiting if browse_limit grows past 24.
4. **Analytics consumer** — `_bundle_kind: '3-pack'` in payload; nothing reads it yet. Cheap insurance for GA event tracking; YAGNI says drop if not used.
5. **Theme cache busting** — CDN was aggressive during dev cycle. Use `?_v=N` cache-buster from start next time.

---

## Reflection

Every layer pushed back today—Liquid scopes, GraphQL scopes, CSS specificity, padding-bottom percentage math, drawer integration contracts. Code-reviewer was the safety net twice. Mobile-pro-max was the safety net for 90% traffic volume. Ship process is working.

The pivot from "cart-drawer grouping" to "headline announces, discount applies regardless" was the highest-leverage decision. It dropped 30% LOC, eliminated regression risk on kit-picker, and the user experience is identical. YAGNI in action again.

The `_bundle_id` collision lesson is sharp: when integrating with existing drawer patterns, the existing code is the contract. I assumed `_bundle_id` was unused because Phase 01 design didn't mention it. Wrong assumption. The kit-picker from prior work was already using it. This is the kind of bug that passes QA but breaks on cold traffic. Code-reviewer caught it.

End-of-day: Phase 04 ships clean. Bundle Function plan is now 3/4 phases done (01: Function, 03: theme integration, 04: picker). Phase 02 (admin UI) deferred, correct call. Next: ship to real Dopamiles store or run final negative QA on multi-variant products first?

---

## Next Steps (User Decision)

1. **Multi-variant QA**: Test picker UI on real Dopamiles tee data (size + color variant pickers) before production launch
2. **Production deployment**: Coord with Dopamiles on go-live timeline + Phase 02 admin UI roadmap
3. **Phase 02 deferral review**: Monitor merchant scaling; revisit admin UI cost once 2nd merchant onboards

---

**Status**: DONE  
**Summary**: Phase 04 (3-pack picker) shipped code-safe (9/10 after fixes). Pivoted away from cart-drawer grouping (dropped 30% LOC, zero regression). Mobile hardening passed 6 checks. Function deployed, discount active. Two CRITICAL bugs caught by code-reviewer pre-ship. Ready for production subject to multi-variant QA.
