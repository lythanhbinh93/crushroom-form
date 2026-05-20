---
phase: 1
title: 'Apply :has() CSS rule and verify on mobile'
status: in-progress
priority: P3
effort: 15m
dependencies: []
---

# Phase 1: Apply :has() CSS rule and verify on mobile

## Overview

Insert one CSS rule into `pod-tee-theme/assets/dopamiles-pdp.css` to hide the mobile sticky Add-to-Cart bar while the cart drawer is open. Verify on mobile DevTools emulation + real iPhone Safari + real Chrome Android.

## Requirements

**Functional**
- When cart drawer is open on mobile (viewport ≤ 960px), sticky ATC bar must be invisible.
- When cart drawer closes, sticky ATC bar returns to its prior visibility state (which is governed by the existing `IntersectionObserver` in [dopamiles-mobile-sticky-atc.js](d:\github%20local\pod-tee-theme\assets\dopamiles-mobile-sticky-atc.js) — untouched).
- Works for every drawer-open path: Dawn product-form.js auto-open after ATC add, dopamiles `openDrawer()` call, programmatic mutation of `.dop-drawer` class, future modals reusing `.dop-drawer`.

**Non-functional**
- Zero JS changes.
- Zero new dependencies.
- One file modified, one new CSS rule.
- Specificity (0,3,1) outranks the existing `@media (max-width: 960px) .dop-mobile-sticky { display: flex }` rule (0,1,0). `!important` kept as safety-belt and intent signal.

## Architecture

The fix uses the CSS `:has()` relational pseudo-class to bind sticky ATC visibility directly to the drawer's actual `.open` state — the same class the drawer's own CSS already uses for its slide-in transition at [dopamiles-cart.css:44-46](d:\github%20local\pod-tee-theme\assets\dopamiles-cart.css#L44-L46).

```css
body:has(.dop-drawer.open) .dop-mobile-sticky {
  display: none !important;
}
```

No state mirroring. No JS sync. No race conditions during the 320ms drawer slide-in. CSS evaluates `:has()` reactively as DOM mutates.

## Related Code Files

**Modify**
- `pod-tee-theme/assets/dopamiles-pdp.css` — add the rule adjacent to the existing `.dop-mobile-sticky` block (~line 748).

**Read for context (no edit)**
- `pod-tee-theme/assets/dopamiles-cart.css` — confirms `.dop-drawer.open` is the canonical state class.
- `pod-tee-theme/assets/dopamiles-mobile-sticky-atc.js` — confirms IntersectionObserver state is untouched by the fix; will continue working on drawer close.

**No change**
- All other files in pod-tee-theme.

## Implementation Steps

1. **Locate insertion point**: Open `d:\github local\pod-tee-theme\assets\dopamiles-pdp.css`. Find the `.dop-mobile-sticky` block at ~line 748 (preceded by the comment `/* ── mobile sticky ATC ─────────────────────────────────────────────── */`).

2. **Insert rule** after the existing `.dop-mobile-sticky { ... }` block (around line 760, before the `.ms-info` selectors). Use this exact block with the comment:

   ```css
   /* Hide while cart drawer is open. Binds directly to drawer state — covers
      every drawer-open path (Dawn auto-open after ATC, dopamiles openDrawer(),
      ESC close, programmatic, future modal reuse of .dop-drawer). */
   body:has(.dop-drawer.open) .dop-mobile-sticky {
     display: none !important;
   }
   ```

3. **Save and validate Liquid**: no Liquid change — skip `shopify theme validate`.

4. **Deploy to dev theme** via existing dev-theme push workflow (matches branch `feat/pdp-perf-pareto`). Respect `.shopifyignore` from [shopify_theme_push_overwrites_merchant_json memory](C:\Users\BINH%20LY\.claude\projects\d--github-local-crushroom-form\memory\shopify_theme_push_overwrites_merchant_json.md) so merchant theme-editor settings aren't clobbered.

5. **Verify on Chrome DevTools mobile emulation** (iPhone XR 414×896 or Moto G4 412×823):
   - Load any PDP.
   - Scroll until sticky ATC appears at bottom.
   - Click cart icon / add item to open drawer.
   - Confirm sticky ATC is gone the instant drawer starts sliding in (no overlap with Checkout button area).
   - Close drawer.
   - Confirm sticky ATC reappears after drawer slides out (assuming main ATC still off-screen).

6. **Verify on real iPhone Safari** (any iOS 15.4+). Same script as step 5.

7. **Verify on real Chrome Android** (Chrome 105+ or Samsung Internet 21+). Same script.

8. **Edge-case check**: trigger Dawn's auto-open-after-ATC path by clicking the sticky ATC button itself. Confirm sticky ATC hides immediately when drawer auto-opens after the add.

## Success Criteria

- [x] Rule inserted in `dopamiles-pdp.css` at the documented location.
- [x] No JS files touched.
- [ ] Mobile DevTools emulation: sticky ATC hides on drawer open, reappears on drawer close.
- [ ] Real iPhone Safari: same behavior verified.
- [ ] Real Chrome Android: same behavior verified.
- [ ] Sticky-ATC auto-open-after-ATC-click path: sticky ATC hides during drawer slide-in (no flash of overlap).
- [ ] No regression to desktop (sticky ATC remains `display: none` outside `@media (max-width: 960px)`).
- [ ] No regression to non-cart overlays (search modal, account modal — they don't use `.dop-drawer` class so are unaffected).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Browser without `:has()` support (Samsung Internet <21, Chrome <105, very old Android stock) sees the bug | Low (~2% 2026 traffic) | Cosmetic only — checkout still works | Accepted per brainstorm. Holdout devices unlikely to complete checkout reliably anyway. |
| Future drawer renamed away from `.dop-drawer.open` | Low | Rule silently stops matching | Phase-01 success criteria includes the verification script that catches this on next QA cycle. |
| Specificity collision with future styles | Low | `!important` safety-belt overrides | `!important` is intentional; documented in code comment. |
| `:has()` performance on drawer-open mutation | Negligible | None measurable | Modern engines optimize `:has()` for class-state mutations. Single-selector scope, no descendant chains. |

## Verification Reference

Brainstorm summary documents the full method matrix and ultrathink rationale: [brainstorm-summary.md](./brainstorm-summary.md).
