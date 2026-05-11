# Code Review — Phase 05 cart.js strangler split + Dawn-style ATC

- Date: 2026-05-11
- Reviewer: code-reviewer (Codex-grade adversarial)
- Branch: feat/bug-fix-sprint
- Repo: pod-tee-theme
- Scope: assets/dopamiles-cart.js, assets/dopamiles-cart-helpers.js (new), assets/dopamiles-cart-mutations.js (new), layout/theme.liquid
- LOC delta: +162 / -328 net (cart.js 591 → 422; helpers 98; mutations 146)

## Sign-off

**Verdict:** `fix-first` — 1 critical bug must be fixed before ship; 3 majors should be fixed in same iteration; rest are minor/nit.
**Severity:** 6/10 (cleanup is solid, but introduces a regression in error surfacing on the most common ATC failure path).
**Status:** DONE_WITH_CONCERNS

---

## A. Load-order correctness

A1. `layout/theme.liquid:427-429` — three `<script defer>` tags in correct order: helpers → mutations → cart. Defer preserves order per HTML spec. **OK.**

A2. `dopamiles-cart.js:19-24` — guard uses `console.warn` not `return`. Means even if helpers/mutations missing, cart.js still tries to run. `bindAddToCartInterceptor` and `handleQtyChange` then check `if (window.dopCartMutations) ...` per-call, so a missing dep degrades to "drawer doesn't update" rather than crash. Pragmatically correct (preserves at least the open/close drawer + ATC button disable UX even in degraded state). **OK with minor nit, see N1.**

A3. Top-of-IIFE references — cart.js only reads `window.dopCartHelpers` / `window.dopCartMutations` *inside* functions (`showCartErrBanner`, `refreshDrawer`, `handleQtyChange`, …). Never destructured at IIFE top level. Lazy reference is correct. **OK.**

A4. `dopamiles-cart-mutations.js:23-26` — depends on `window.dopCartHelpers`. If absent, `return` from IIFE so `window.dopCartMutations` is never set; cart.js then sees `undefined` and falls back to console.warn path. Clean dep chain. **OK.**

## B. Dawn-style ATC correctness

B1. `dopamiles-cart.js:346-385` — order is exactly as spec:
- `preventDefault` + `stopPropagation` ✓
- Submit button disable + `'…'` spinner ✓
- `await addToCart(varId, qty)` ✓
- `applyCartMutation(result, mutationCtx())` — populates drawer DOM ✓
- `openDrawer()` — opens after content in place ✓
- catch: `showProductFormError` + NO openDrawer ✓
- finally: re-enable button + restore innerHTML ✓
**OK.**

B2. `setLoading(true)` is **not** called in the new ATC interceptor — correct removal (dimming an empty drawer is meaningless). `setLoading` IS still used by `handleQtyChange` / `handleRemove` / `handleUpsellAdd` where the drawer is already open and dim makes sense. **OK, consistent.**

B3. **CRITICAL — bubble + pubsub now fire BEFORE drawer opens.**
`applyCartMutation` runs before `openDrawer()`. Inside applyCartMutation, `updateBubbleCount(cart.item_count)` increments the header bag bubble (`dopamiles-cart.js:369` invokes `applyCartMutation` at line 197 of mutations.js → `helpers.updateBubbleCount`). On the new flow, this means: user clicks ATC → ~600-1500ms pause with nothing visible except the spinner on the button → bubble flicks up AND drawer slides open simultaneously.

In the **old** flow, the drawer was open immediately and the bubble updated alongside the swap. In the **new** flow, the drawer slide-in is the user's *only* "cart was added" signal — and that signal now waits for the full fetch round-trip.

This is intentional per the spec ("Drawer appears once with real content"). But the spec phase-05 claim about Phase 02 perception fix being a Phase 03 concern is correct only if perceived-perf is otherwise acceptable. **Sub-100ms feedback is now satisfied only by the button spinner.** Verify on a real device: if the spinner is sufficient (Phase 02 says `<50ms` per INP target), B3 is not a bug. If user testing on Phase 02 round-1 specifically complained about "no feedback during fetch," this regresses. **Flag as DONE_WITH_CONCERNS; no code fix needed unless user QA fails.**

B4. `cart:change` custom event still dispatched inside `applyCartMutation` (mutations.js:128). Variant-sync gallery and any other listener of `cart:change` keep working. **OK.**

B5. Double-tap race — second tap hits `submitBtn.disabled = true` from the first tap, so default-form-submit is blocked. But — `document.addEventListener('submit', ...)` is bound on `document`, not on the form, and `e.preventDefault()` is the only thing stopping submission. **If button is disabled, browser doesn't fire `submit` event at all** (disabled type=submit suppresses submit). So second tap is genuinely blocked. **OK.**

B6. **MAJOR — keyboard / Enter-key submit race.** If the user presses Enter on a quantity input *while* the submit button is disabled, the form will still attempt to submit — but the document-level capture handler runs before the form-level default and calls `preventDefault`. Since `submitBtn.disabled` is true, `addToCart` won't be re-invoked? Wait — re-reading: the handler logic `if (!varId) return;` runs unconditionally; it doesn't check `if (submitBtn.disabled)`. So **a second submit during the first fetch WILL fire `addToCart` again**, while the first fetch is in flight. Two `/cart/add.js` POSTs → two line-items added.

Old code had the same problem (same handler structure), so **not a regression** introduced by Phase 05. Pre-existing bug. Flag for future hardening but not blocking. **Pre-existing major; not blocking phase-05.**

## C. Dedupe correctness

C1. `dataset.bound` flag survives swap? The flag is set on each qty / remove / upsell button inside `.dop-cart-lines` / `dop-page-lines` / `dop-page-meta`. When `applyCartMutation` does `dstContent.innerHTML = newContent.innerHTML`, all those child nodes are **replaced**, so new nodes start without `data-bound`. **OK.**

C2. **MAJOR — `bindDrawerSurface` queries scope is `drawer` (the wrapper `#dop-cart-drawer`), not just `#dop-cart-drawer-content`.** Buttons OUTSIDE the swapped content wrap (e.g. close button `#dop-cart-close`, anything in `.dop-drawer-head`) would keep `dataset.bound=1` across swaps and not be re-bound. Looking at current selectors (`.dop-li-qty-dec`, `.dop-li-qty-inc`, `.dop-rm`, `.dop-upsell-add`) — these all live INSIDE `dop-cart-drawer-content` per the section liquid. So in practice **no buttons survive swap unflagged.** Safe **today**, but a footgun: if any future PR adds a `.dop-rm` button to the drawer footer (outside content wrap), the flag will stick and the button will never rebind after first swap. Add a comment or scope the query to `#dop-cart-drawer-content` to make the invariant explicit.

C3. 16 `dataset.bound` occurrences — all wrap `addEventListener` (verified via grep + reading file). **OK.**

## D. Error surfacing

D1. **CRITICAL — `#dop-cart-err-banner` only exists when cart has items.**
`sections/dopamiles-cart-drawer.liquid:60-68` — the banner is rendered INSIDE the `{%- if cart.item_count > 0 -%}` branch. When user adds to an **empty cart** and the request fails (e.g. sold out, invalid variant), the banner doesn't exist in the DOM yet. `showCartErrBanner` will `console.warn` and silently suppress the message. The Dawn-style ATC catches errors via `showProductFormError(form, msg)` so the user *does* see something inline below the ATC button, so the user-visible UX is acceptable for ATC.

But — `changeCartItem` (used by qty/remove) explicitly calls `showCartErrBanner(msg)` on 422. Qty/remove can only fire when cart has items, so the banner WILL exist at that point. **OK for qty/remove** path. **For empty-cart-ATC, the err-banner path is dead** but `showProductFormError` covers it. Net: feature works in practice, but the documentation in cart.js:37-38 ("Surface server error messages…") implies the banner is the primary error path — misleading. Clarify comment.

Actually re-reading: this is fine *as-implemented* because addToCart's catch never calls showCartErrBanner (only changeCartItem does, and changeCartItem only fires when items exist). **Downgrade to MINOR — misleading comment.** Mark D1 minor.

D2. **CRITICAL** (real one) — `showCartErrBanner` overwrites the **outer** banner's innerHTML, wiping the inline SVG and the inner `<div id="dop-cart-err-text">` (drawer liquid:63-68). The user sees the error TEXT, but the icon goes missing and the inner text-div is destroyed. On a second 422 within 5s (rare but possible — user spams qty +/- with stale state), the banner still works because innerHTML is set fresh each time. But the icon is gone after first error until the next section swap restores it.

**Fix:** target `#dop-cart-err-text` (the inner div) for `innerHTML`, not the outer `#dop-cart-err-banner`. One-line change.

```js
// dopamiles-cart.js:39-55
function showCartErrBanner(msg) {
  const banner = document.getElementById('dop-cart-err-banner');
  if (!banner) {
    console.warn('[dop-cart] err-banner missing, suppressed error:', msg);
    return;
  }
  const textEl = banner.querySelector('#dop-cart-err-text') || banner; // fallback
  const safe = window.dopCartHelpers
    ? window.dopCartHelpers.escapeHtml(msg)
    : msg.replace(/</g, '&lt;');
  textEl.innerHTML = safe;
  banner.removeAttribute('hidden');
  clearTimeout(banner._dismiss);
  banner._dismiss = setTimeout(() => {
    textEl.innerHTML = '';
    banner.setAttribute('hidden', '');
  }, 5000);
}
```

D3. 422 body parse — `body.message || body.description || 'Unable to update cart'`. Shopify's `/cart/change.js` returns `{ status, message, description }` on errors (message is short, description is long). Fallback chain covers both. **OK.**

D4. `escapeHtml` — escapes `&`, `<`, `>`, `"`, `'`. Order is correct (`&` first to avoid double-escape of `&lt;`). **OK.**

D5. 5s clear timeout — `clearTimeout(banner._dismiss)` runs before setting new `_dismiss`, so newer errors correctly override older. **OK.**

## E. `applyCartMutation` purity

E1. `applyCartMutation(result, ctx)` reaches outside `mutations.js` for: `helpers.parseSectionDoc`, `helpers.updateBubbleCount`, `helpers.publishCartUpdate`. All via the explicit `helpers` ref at line 28. No back-reference to cart.js scope. `LOADING_CLASS` is NOT used inside mutations.js (loading state is the caller's concern). **OK, fully pure.**

E2. **MAJOR — `refreshPageTotals` summary regression.**
`dopamiles-cart.js:246-269` — `refreshPageTotals` only swaps `dop-page-meta` + `dop-page-lines`, NOT `dop-page-summary`. The fullstack-developer noted this matches "pre-phase-05 behavior." Verified — original code (HEAD:dopamiles-cart.js:380-395) also only swapped meta + lines.

**BUT** — Phase 02 visual probe (per `applyCartMutation` docstring in mutations.js:67-69) discovered the summary was stale post-qty-change. Phase 02 added summary to the swap-pair list inside `applyCartMutation`. `refreshPageTotals` is the **defensive fallback** path — if it ever fires, summary will be stale (same Phase 02 bug). Fullstack punted on this.

**Fix:** add `'dop-page-summary'` to the `pairs` array. Three lines. No risk — summary swap only happens if element exists.

```js
const pairs = [
  ['dop-page-meta',    'dop-page-meta'],
  ['dop-page-lines',   'dop-page-lines'],
  ['dop-page-summary', 'dop-page-summary'],  // matches applyCartMutation
];
```

This makes `refreshPageTotals` consistent with `applyCartMutation`. (And honestly, the array isn't even pairs — just three identical IDs. Could be flattened to `['dop-page-meta','dop-page-lines','dop-page-summary'].forEach(id => ...)` like mutations.js does.)

E3. `setLoading` is still defined at cart.js:144-148 but no longer called by ATC. Still used by qty/remove/upsell handlers. **Not dead code, just narrower scope.** OK.

## F. CSS / liquid side effects

F1. `.dop-cart-loading` (cart.css:703-707) → `opacity: 0.55; pointer-events: none; transition: opacity 150ms ease`. Applied via `setLoading(true)` only on qty/remove/upsell paths (drawer already open). No assumption about empty-drawer-then-populate. **OK.**

F2. Drawer slide-in (cart.css:40, `.dop-drawer.open` transition 320ms) — runs after `openDrawer` adds `.open` class. In the new flow, `openDrawer` runs AFTER `applyCartMutation` has populated DOM. Slide-in transition still works correctly. **OK.**

F3. The `dop-drawer-content-wrap` is `display:contents` (drawer liquid:58) — innerHTML swap doesn't affect drawer layout. **OK.**

## G. Load-order verification (re-check)

`layout/theme.liquid:425-429`:
```liquid
{%- comment -%} Dopamiles cart drawer JS — site-wide, handles open/close + AJAX mutations {%- endcomment -%}
{%- comment -%} Phase 05: helpers + mutations load before cart.js (defer preserves order) {%- endcomment -%}
<script src="{{ 'dopamiles-cart-helpers.js' | asset_url }}" defer="defer"></script>
<script src="{{ 'dopamiles-cart-mutations.js' | asset_url }}" defer="defer"></script>
<script src="{{ 'dopamiles-cart.js' | asset_url }}" defer="defer"></script>
```

All three `defer="defer"`. Spec compliant. **OK.**

---

## Critical / Major / Minor / Nit summary

### Critical (must fix before ship)

- **C-1 (D2)** — `showCartErrBanner` overwrites outer banner innerHTML, destroying inline SVG icon and `#dop-cart-err-text` inner element. Target `#dop-cart-err-text` for innerHTML instead. **Effort: 2 min.**

### Major (should fix this iteration)

- **M-1 (E2)** — `refreshPageTotals` doesn't swap `dop-page-summary`. Defensive fallback path inherits Phase 02 stale-summary bug. Add summary to swap list. **Effort: 1 min.**
- **M-2 (C2)** — `bindDrawerSurface` queries the drawer wrapper, not the content wrap. Currently no bug because all bound selectors live inside content wrap, but a footgun for future additions. Either scope to `#dop-cart-drawer-content` OR add a comment locking the invariant. **Effort: 2 min.**
- **M-3 (B3 perception)** — Bubble updates simultaneously with drawer slide-in (post-fetch). User has only the button spinner during 600-1500ms fetch. Spec-compliant; flag for real-device QA. **Effort: 0 (verify, don't fix unless QA fails).**

### Minor

- **m-1 (D1)** — Comment at cart.js:37-38 implies err-banner is primary error surface, but ATC failures use `showProductFormError` instead. Clarify comment.
- **m-2 (A2)** — Dep guards use console.warn not early return. Pragmatic but mention in code comment that degraded behavior is intentional.

### Nit

- **N-1** — `refreshPageTotals` uses `pairs` array of identical-source/dest pairs (cart.js:257-260). Could be a flat array like mutations.js does (mutations.js:110). Cosmetic.
- **N-2** — `mutationCtx()` is called on every qty/remove/upsell/ATC. Cheap, but could be a module-level const if SECTION_ID / PAGE_SECTION_ID never change.
- **N-3** — `dopamiles-cart-mutations.js:79-81` — `var rebindSurface = ctx && ctx.rebindSurface;` pattern is repeated three times. Tiny destructure with default would be cleaner. Skip.

---

## Codex-bait flags

These are what an automated adversarial reviewer (Codex / Sonnet code-bot) will likely flag — pre-empt with explanations:

1. **"Three scripts loaded with defer — does load order matter?"** YES, and defer preserves source order per HTML spec. Documented in code comment.
2. **"console.warn instead of throw on missing deps."** Intentional graceful degradation — drawer open/close still works even if mutation scripts fail to load.
3. **"`if (window.dopCartMutations)` guards repeated 4 times in cart.js."** Belt-and-suspenders after the top-of-file warn-only guard. Acceptable. Could be one boolean cached at top, but per-call read is cheap and avoids stale capture.
4. **"`applyCartMutation` is called from 4 sites with same `mutationCtx()`."** Yes — `mutationCtx` is the explicit decoupling boundary. Refactoring it away would either re-couple mutations.js to cart.js scope or require a closure.
5. **"`dataset.bound` is a string '1', not boolean."** HTML dataset values are always strings; that's fine. The check `=== '1'` matches.
6. **"`fetchCart` inside `addToCart` doubles round-trips."** Yes — `/cart/add.js` returns line item not cart, so we need item_count from /cart.js for the bubble. Documented in comment.
7. **"`refreshPageTotals` defined but only callable externally."** Yes — it's a defensive fallback; primary path uses applyCartMutation. Not called internally; not exposed on window either. **Dead code candidate** — confirm with fullstack whether to drop entirely. If kept, fix E2.
8. **"`document.addEventListener('submit', …, { capture: true })` will fire for ALL forms, even non-cart ones."** Yes — but the first check `if (!form) return;` exits cheaply. Capture phase is required to beat Dawn's own product-form.js listener.

---

## Behavioral checklist verification

- [x] Concurrency: Double-submit blocked by `submitBtn.disabled` (browsers suppress submit on disabled buttons). Qty debounce via `btn.disabled` works.
- [x] Error boundaries: All `try/catch/finally` blocks rebalance UI state. catch on ATC shows inline form error; catch on qty/remove logs + re-enables button.
- [x] API contracts: `applyCartMutation(result, ctx)` contract is documented in mutations.js docstring. `ctx.rebindSurface` is optional (typeof check).
- [x] Backwards compatibility: `window.dopCart.{open,close,refresh}` exposed unchanged. `cart:change` custom event still dispatched. `cart:open` listener preserved.
- [N/A] Input validation: client-only code; server-side validation owned by Shopify Cart API.
- [N/A] Auth/authz: Shopify cart endpoints.
- [N/A] N+1 / queries.
- [x] Data leaks: `escapeHtml` applied before innerHTML insert. No PII or stack traces leaked to user (catch blocks log to console only).

---

## Recommended Actions (prioritized)

1. **C-1: Fix `showCartErrBanner` to target `#dop-cart-err-text` inner div.** Trivial. Blocking.
2. **M-1: Add `dop-page-summary` to `refreshPageTotals` swap list.** Trivial. Same file, same iteration.
3. **M-2: Scope `bindDrawerSurface` query to `#dop-cart-drawer-content`, OR add inline comment locking the invariant.** Two lines, prevents future regression.
4. **m-1, m-2: Comment clarity passes.** Optional, same iteration.
5. **M-3: Real-device QA on iPhone for ATC perceived latency.** No code change unless QA fails.

**Recommendation:** Single inline iteration to land C-1 + M-1 + M-2 (~5 min total). Then ship to preview for QA. Do NOT halt — these are surgical fixes, not a re-architecture. Discipline rule from the brief specifies halt-on-critical; the critical here is a one-liner, well within "fix-first" scope.

---

## Unresolved Questions

1. Was the Phase 03 perception work (drawer-appears-with-spinner) considered as bridging the new pause between ATC click and drawer slide-in? Or is the submit-button spinner the entire perceived-perf budget? B3 hinges on this.
2. Is `refreshPageTotals` still externally referenced anywhere (theme code, app blocks)? If not, drop it entirely — primary path covers it.
3. The error banner only exists when `cart.item_count > 0`. For change-to-zero (remove last item), the API call's response section will re-render the empty state which removes the banner. If the error fires *during* that response handling (race), the banner could be gone before showCartErrBanner runs. Worth a real-device test (remove-last-item with throttled connection).

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 05 split is well-executed and dependency-isolated; one critical XSS-adjacent UI bug (banner SVG destruction) and two majors (page-summary fallback regression, surface-query footgun) need fixing in the same iteration before ship.
**Sign-off:** fix-first
**Critical findings:** 1
**Codex-bait flags:** 8 listed above with pre-emptive responses
