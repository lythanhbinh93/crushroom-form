# Phase 01 — Revert Round-3c Perception Debt

## Context Links

- Halt journal: [../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md](../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md)
- Round-3c phase (what's reverted): [../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md](../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md)
- SLC research (next phase target): [../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md](../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md)

## Overview

**Priority:** P0 (blocks Phase 02)
**Status:** pending
**Effort:** ~30 min code + commit
**Owner:** code

Single commit reverting the rejected pieces of round-3c while preserving the observability tools that paid off.

## Key Insights

- **Revert targets (rejected by user 2026-05-09 18:03 ICT):**
  - `injectOptimisticAtcLine` — optimistic line item DOM insertion before fetch
  - `optimisticLineUpdate` qty-spinner version — also "fake animation" by user's standard
  - `[data-dawn-vs]` wrapper + 1500ms reveal-if-no-Globo timer — caused Globo cascade regression
  - `.dop-li-optimistic` entrance animation
  - `.dop-li-price-pending` spinner CSS + `@keyframes dop-spin` IF unused elsewhere
- **Preserve (paid off in round-3c):**
  - Build-tag div in `theme.liquid` (cache-bust signal — works, cheap, useful for round-4 too)
  - `showInjectError` red error overlay helper in `dopamiles-cart.js` (silent-throw surface — useful for round-4)
  - JSON product data island `<script id="dop-product-data">` in `dopamiles-product-hero.liquid` (deterministic data source — may be useful for future cart features even though phase 02 doesn't need it)
- **Round-3a remnants:** check whether `optimisticLineUpdate` qty handler existed pre-round-3c (round-3a shipped the qty optimistic textContent). If pre-existing, this phase removes it too — qty optimistic is also rejected per user feedback.

## Requirements

**Functional:**
- ATC tap → drawer opens with empty/loading state, real cart content swaps in on response (current pre-revert path retained but optimistic line removed; phase 02 will invert ordering)
- Qty +/- → number does NOT change instantly; button shows spinner; swap on response (phase 02 implements button-spinner)
- PDP first paint → Dawn variant-selects renders normally (Globo regression unblocked)
- Build-tag still visible on preview deploy
- Error overlay still wires to throws inside cart.js
- JSON island still emitted in PDP source

**Non-functional:**
- Single commit, single concern (reverts only). No new logic.
- Net LOC: ~85 LOC removed, ~0 added.
- No regression of phases 00-04 of round-2 sprint.

## Architecture

```
BEFORE (round-3c):
PDP load:
  └─ Liquid: <div data-dawn-vs visibility:hidden>{variant-selects}</div> ← REVERT
  └─ JS: setTimeout 1500ms reveal-if-no-Globo                              ← REVERT
  └─ JSON island                                                            ← KEEP

ATC tap:
  └─ injectOptimisticAtcLine(form, qty)   ← REVERT
  └─ setLoading(true) + openDrawer()      ← KEEP for now (phase 02 changes ordering)
  └─ fetch → applyCartMutation            ← KEEP

Qty +/-:
  └─ optimisticLineUpdate (qty + spinner) ← REVERT
  └─ fetch → applyCartMutation            ← KEEP

AFTER phase 01:
PDP load:
  └─ Dawn variant-selects renders normally (visible) — Globo cascade unblocked
  └─ JSON island KEPT

ATC tap:
  └─ setLoading(true) + openDrawer() (current ordering — phase 02 will invert)
  └─ fetch → applyCartMutation

Qty +/-:
  └─ fetch → applyCartMutation (no optimistic; phase 02 adds button-spinner)
```

**Failure-mode coverage:**

| Failure | Detection | Mitigation |
|---|---|---|
| Revert leaves orphaned helper functions referenced elsewhere | grep before commit | Remove all callers in same commit |
| Build-tag accidentally removed during revert | grep `dop-build-tag` post-revert | Revert touches cart.js + product-hero + cart.css only; theme.liquid untouched |
| JSON island accidentally removed | grep `dop-product-data` post-revert | Revert in product-hero only removes the `[data-dawn-vs]` wrapper + reveal timer; preserve JSON island block |
| `showInjectError` removed but still called from another helper | grep `showInjectError\(` | Keep helper itself; phase 02 may reuse it for fetch errors |
| `.dop-li-price-pending` referenced in another file | grep across `assets/` | Likely unused outside cart.css; safe to remove |
| `@keyframes dop-spin` referenced by other CSS | grep `dop-spin` across `assets/` | If used elsewhere, keep keyframes; remove only `.dop-li-price-pending` rule |

## Related Code Files

**Modify (mandatory):**

- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`
  - Remove `injectOptimisticAtcLine` function definition (round-3c added)
  - Remove `escapeHtml` helper IF only called by `injectOptimisticAtcLine` (verify via grep)
  - Remove call site `injectOptimisticAtcLine(form, qty)` inside `bindAddToCartInterceptor`
  - Remove `optimisticLineUpdate` function definition (round-3c version with spinner)
  - Remove call site for `optimisticLineUpdate` in qty +/- handler
  - **KEEP** `showInjectError` helper (general-purpose error surface)
  - Net: ~50 LOC removed
- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`
  - Remove `<div data-dawn-vs style="visibility:hidden">` wrapper around `<product-info>` block (lines around 88-101 per round-3c phase plan)
  - Remove `setTimeout` reveal-if-no-Globo block in inline `<script>` (lines around 194+)
  - **KEEP** `<script type="application/json" id="dop-product-data">` JSON island block
  - Net: ~30 LOC removed
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.css`
  - Remove `.dop-li-price-pending` rule + `@keyframes dop-spin` (verify keyframes unused elsewhere first)
  - Remove `.dop-li-optimistic` + `@keyframes dop-li-enter` rules
  - Net: ~20 LOC removed

**Read for context:**

- `D:\github local\pod-tee-theme\layout\theme.liquid` — confirm build-tag block intact (NOT touched in this phase)
- `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css` — grep for `dop-spin` / `dop-li-price-pending` to confirm no outside callers

**Create:** none
**Delete:** none

## Implementation Steps

### Step 1 — Pre-revert grep audit

```powershell
cd "D:\github local\pod-tee-theme"

# Verify scope of removal — these symbols should only appear in round-3c-added code
rg "injectOptimisticAtcLine" assets/ sections/ snippets/ layout/
rg "optimisticLineUpdate" assets/ sections/ snippets/ layout/
rg "dop-li-optimistic|dop-li-price-pending" assets/ sections/ snippets/ layout/
rg "data-dawn-vs" assets/ sections/ snippets/ layout/
rg "dop-spin\b" assets/ sections/ snippets/ layout/   # keyframes; check if used outside spinner

# Confirm preserved symbols still in scope
rg "dop-build-tag" layout/                # build-tag intact
rg "showInjectError" assets/dopamiles-cart.js   # error overlay helper intact
rg "dop-product-data" sections/dopamiles-product-hero.liquid   # JSON island intact
```

Document any unexpected matches in commit message.

### Step 2 — Revert `dopamiles-cart.js`

Open `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`.

1. Locate `function injectOptimisticAtcLine(form, qty)` definition. Delete entire function block.
2. Locate `function optimisticLineUpdate(li, oldQty, newQty)` definition. Delete entire function block.
3. Inside `bindAddToCartInterceptor` (around line 504-552), remove the line `injectOptimisticAtcLine(form, qty);` — leave the `setLoading(true)` and `openDrawer()` calls as-is for now (phase 02 inverts those).
4. Inside the qty +/- handler, remove the `var rollback = optimisticLineUpdate(...)` block + the `if (rollback) rollback();` call in catch branch. Replace with bare fetch:
   ```js
   try {
     var result = await changeCart(line, newQty);
     applyCartMutation(result);
   } catch (err) {
     showCartError(err);
   }
   ```
5. **KEEP** `showInjectError` helper definition.
6. Check `escapeHtml` — if only called by `injectOptimisticAtcLine`, delete. If called elsewhere, keep.

### Step 3 — Revert `dopamiles-product-hero.liquid`

Open `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`.

1. Locate `<div data-dawn-vs style="visibility:hidden">` wrapper around `<product-info>` block. Remove the wrapping `<div>` open + close tags. Inner content (the `<product-info>` block) remains.
2. Locate the inline `<script>` IIFE near line 194+. Remove the `setTimeout(function() { ... }, 1500)` block that handles reveal-if-no-Globo.
3. **KEEP** `<script type="application/json" id="dop-product-data">` block.
4. **KEEP** existing `<script type="application/json" data-dop-variants-json>` block (pre-existing, not round-3c added).

### Step 4 — Revert `dopamiles-cart.css`

Open `D:\github local\pod-tee-theme\assets\dopamiles-cart.css`.

1. Remove `.dop-li-price-pending { ... }` rule.
2. Remove `@keyframes dop-spin { ... }` block (only if grep from Step 1 confirmed no other consumer).
3. Remove `.dop-li-optimistic { ... }` rule.
4. Remove `@keyframes dop-li-enter { ... }` block.

### Step 5 — Post-revert grep verification

```powershell
# All round-3c symbols gone
rg "injectOptimisticAtcLine|optimisticLineUpdate|dop-li-optimistic|dop-li-price-pending|data-dawn-vs" `
  assets/ sections/ snippets/ layout/
# Expected: 0 matches

# Preserved symbols still present
rg "dop-build-tag" layout/                                  # 1+ match
rg "showInjectError" assets/dopamiles-cart.js               # 1+ match
rg "id=\"dop-product-data\"" sections/dopamiles-product-hero.liquid   # 1 match
```

### Step 6 — Theme check + smoke

```powershell
shopify theme check --section sections/dopamiles-product-hero.liquid
shopify theme check --section assets/dopamiles-cart.js   # if applicable
```

Local smoke (if dev store available): load PDP, tap ATC, confirm drawer opens (will look pre-round-3a — that's expected; phase 02 inverts).

### Step 7 — Single commit

```
git add assets/dopamiles-cart.js sections/dopamiles-product-hero.liquid assets/dopamiles-cart.css
git commit -m "revert(theme): round-3c optimistic UI + Globo wrapper

Reverts the rejected pieces of round-3c per user halt 2026-05-09 18:03:
- injectOptimisticAtcLine (rejected as 'fake animation')
- optimisticLineUpdate qty spinner (same)
- [data-dawn-vs] wrapper + reveal-if-no-Globo timer (caused Globo cascade)
- .dop-li-optimistic / .dop-li-price-pending CSS

Preserved: build-tag (theme.liquid), showInjectError (cart.js), JSON
product data island (product-hero.liquid). Round-4 phase 02 will
apply SLC drawer-after-fetch ordering on top of this baseline."
```

## Todo Checklist

- [ ] Step 1 — pre-revert grep audit recorded
- [ ] Step 2 — `dopamiles-cart.js` reverts applied + `showInjectError` preserved
- [ ] Step 3 — `dopamiles-product-hero.liquid` wrapper + reveal timer removed; JSON island preserved
- [ ] Step 4 — `dopamiles-cart.css` round-3c rules removed
- [ ] Step 5 — post-revert grep shows 0 matches for round-3c symbols, preserved symbols intact
- [ ] Step 6 — `shopify theme check` passes
- [ ] Step 7 — single commit pushed
- [ ] Preview deploy verified — build-tag visible, value updated, Globo swatches paint normally on PDP

## Success Criteria

- 0 grep hits for `injectOptimisticAtcLine|optimisticLineUpdate|dop-li-optimistic|dop-li-price-pending|data-dawn-vs`
- Build-tag visible on preview deploy with new value
- JSON island visible in PDP View Source
- `showInjectError` helper still present in cart.js
- PDP loads with Globo swatches rendering normally (Globo cascade regression unblocked)
- ATC and qty +/- still functional (no optimistic, but no breakage)
- Theme check passes
- Single commit landed; no new logic

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Revert removes a helper used by another path | Low | Med | Pre-revert grep (Step 1) catches; if found, scope down revert |
| `escapeHtml` deleted but still called elsewhere | Low | Low | Step 2.6 grep check |
| `@keyframes dop-spin` deleted but used by other UI (header bag spinner, etc.) | Low | Low | Step 1 grep `dop-spin\b` outside cart.css |
| JSON island accidentally deleted during product-hero edits | Low | Med | Step 5 explicit grep verification |
| Build-tag accidentally removed (file not in scope, but defensive) | Low | Low | This phase doesn't touch theme.liquid |
| Drawer-open path becomes broken without optimistic placeholder (was placeholder masking a bug?) | Low | Med | Local smoke after revert, before commit |

## Security Considerations

- Pure removals; no new logic, no new attack surface.
- `escapeHtml` removal: only safe if `injectOptimisticAtcLine` is its sole caller (Step 2.6 verifies). If `escapeHtml` is reused elsewhere, keep it.

## Next Steps

- Phase 02 (SLC drawer-after-fetch inversion) consumes this clean baseline.
- Phase 03 (CLS via min-height) replaces the deleted `[data-dawn-vs]` mechanism with space reservation.

## Unresolved Questions

1. Was the qty optimistic textContent shipped in round-3a (pre-round-3c) or only round-3c? If round-3a, removing it here is a regression of round-3a's UX (number-jumps-instantly). User has rejected that pattern too, but flag in commit message.
2. Is `escapeHtml` reused outside `injectOptimisticAtcLine`? If yes, keep; if no, remove. Step 2.6 resolves.
3. Does `@keyframes dop-spin` get used by header-bag-count spinner or any other UI? Step 1 grep resolves.
