# Phase 02 — SLC Pattern Inversion (ATC + Qty)

## Context Links

- SLC research (the smoking gun): [../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md](../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md)
- Phase 01 baseline: [./phase-01-revert-round-3c-perception-debt.md](./phase-01-revert-round-3c-perception-debt.md)
- Cart code: `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` (599 LOC)
- `bindAddToCartInterceptor` call site: ~line 504-552
- `applyCartMutation` (drawer swap): ~line 335-393

## Overview

**Priority:** P0 (core round-4 fix)
**Status:** pending
**Effort:** ~45 min code + commit
**Owner:** code

Apply SLC's drawer-after-fetch ordering. Two small inversions, single file, single concern.

## Key Insights

- **The fix is 5 LOC of inversion.** Not new logic — reordered existing logic.
- **SLC sequence:** button-spinner-on → fetch → swap drawer content → open drawer (with content already in place).
- **Pod-tee current sequence:** open drawer (empty/loading) → fetch → swap (visible flicker).
- **User perception:** SLC user sees ONE coherent event (drawer arrives with truth). Pod-tee user sees THREE events (drawer-open, content-swap, un-dim) — middle event has no information, reads as "fake animation."
- **Button-spinner already exists** in pod-tee's submit handler (round-3a's `submitButton.textContent = '…'` or similar). Acts as <50ms click feedback. Don't remove — that's the honest loading state SLC also has.
- **Qty +/- parallel:** remove `optimisticLineUpdate` (already gone post-phase-01). Add button-spinner via `button.classList.add('loading')` on the +/- button. fetch. `applyCartMutation` swap clears the spinner via full innerHTML replacement. Rollback path restores button state on fetch failure.
- **`applyCartMutation` invariant to verify:** does it work when drawer is HIDDEN? It currently runs while drawer is open (existing path). Phase 02 will run it while drawer is hidden, then call `openDrawer()`. Read lines 335-393 to confirm no assumption-of-open.

## Requirements

**Functional:**
- ATC tap → submit button shows spinner immediately (<50ms feedback). Drawer remains hidden during fetch. On `/cart/add.js` response, swap drawer content, THEN slide drawer open. Drawer arrives with real cart content.
- Qty +/- on cart page → +/- button shows spinner immediately. Number does NOT change instantly. Fetch runs. On `/cart/change.js` response, full line swap via `applyCartMutation`. Spinner gone with the swap.
- ATC error path (network failure, sold out, etc.) → submit button spinner clears, error surfaced via existing `showCartError` or `showInjectError` (red overlay). Drawer never opens. User sees button-spinner-fail-error pattern.
- Qty +/- error path → button spinner clears, error surfaced. Quantity unchanged in DOM.

**Non-functional:**
- Single file, single concern: `assets/dopamiles-cart.js`.
- Net LOC: ~10 LOC delta (mostly reordering).
- No regression: phases 00-04 of round-2 still green.
- `applyCartMutation` must be safe to call when drawer is hidden.

## Architecture

```
ATC tap (NEW SLC pattern):
  ├─ e.preventDefault()
  ├─ submitButton: add 'loading' class + show spinner   ← <50ms click feedback (already exists)
  ├─ try:
  │   ├─ result = await fetch('/cart/add.js?sections=...')
  │   ├─ applyCartMutation(result)                       ← swap drawer content while drawer hidden
  │   └─ openDrawer()                                    ← slide in with real content
  ├─ catch (err):
  │   ├─ showInjectError(err.message)                    ← red overlay
  │   └─ (drawer never opens)
  └─ finally:
      └─ submitButton: remove 'loading' class

Qty +/- (NEW pattern):
  ├─ e.preventDefault()
  ├─ button.classList.add('loading')                     ← inline spinner on +/- button
  ├─ try:
  │   ├─ result = await fetch('/cart/change.js?...')
  │   └─ applyCartMutation(result)                       ← swap clears spinner
  ├─ catch (err):
  │   ├─ button.classList.remove('loading')              ← restore button
  │   └─ showCartError(err)
```

**Failure-mode coverage:**

| Failure | Detection | Mitigation |
|---|---|---|
| `applyCartMutation` requires drawer-open precondition | Read lines 335-393; spot-test before commit | If true, refactor to swap-then-open in same function; or add `prepareSwapHidden()` helper |
| Fetch hangs (network stall) | submit button stuck in 'loading' | AbortController with 8s timeout; on abort, clear spinner + error overlay |
| `/cart/add.js` returns 422 (sold out) | response.ok false | Parse JSON error, surface via `showInjectError`. Drawer not opened. |
| `setLoading(true)` no longer called → drawer body never dimmed | Visual: drawer arrives with content; no need to dim | Remove `setLoading` from ATC path entirely (drawer is hidden until ready) |
| Drawer was already open (e.g. user added second item) | `if (drawer.isOpen) skip openDrawer()` | `openDrawer()` should be idempotent — verify or add guard |
| `applyCartMutation` swaps cart icon bubble even when drawer hidden | Should still work — bubble lives in header, independent of drawer | Verify response includes `cart-icon-bubble` section |
| Qty button still has 'loading' class after swap (full innerHTML replaces button) | innerHTML replace removes class with the node | Verified: full swap replaces the button node, no leak. Rollback path sets remove on the SAME node it added to (still in DOM if fetch fails before swap). |

**SLC's section bundle:** `[cart-drawer, cart-icon-bubble]`. Pod-tee's current bundle TBD — phase 04 measures and trims if larger. Phase 02 does NOT change bundle, only ordering.

## Related Code Files

**Modify (mandatory):**

- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`
  - `bindAddToCartInterceptor` (~line 504-552): invert ordering — remove `setLoading(true)` + `openDrawer()` from BEFORE the fetch; place `openDrawer()` AFTER `applyCartMutation(result)`
  - Qty +/- handler (search for `.dop-li-qty-input` or `dop-qty-` button binding): add `button.classList.add('loading')` before fetch, `remove('loading')` in catch branch (swap clears it on success path)
  - Net: ~10 LOC delta

**Read for context (no edits this phase):**

- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` lines 335-393 (`applyCartMutation`) — verify safe-to-call with drawer hidden
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` `openDrawer` function — verify idempotency
- `D:\github local\pod-tee-theme\sections\dopamiles-cart-drawer.liquid` — surface what content the swap brings in
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.css` — confirm `.loading` class on submit button + qty button shows spinner (likely already exists from round-1; if not, add minimal CSS)

**Create:** none
**Delete:** none

## Implementation Steps

### Step 1 — Read `applyCartMutation` for hidden-drawer safety

Open `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` lines 335-393.

Verify:
- Function does NOT depend on `drawer.classList.contains('open')` or similar
- Function does NOT trigger animation/transition that requires drawer visible
- Function swaps innerHTML by section name, regardless of drawer state

If any dependency on drawer-open exists, document in unresolved questions and split into `swapDrawerContent(result)` (DOM-only) + `openDrawer()` (animation-only).

### Step 2 — Read `openDrawer` for idempotency

Search for `function openDrawer` or `openDrawer = ` in cart.js. Verify:
- Calling when already open → no-op (or harmless re-trigger)
- Calling when hidden → animates open

If not idempotent, add guard: `if (drawerEl.classList.contains('is-open')) return;` at top.

### Step 3 — Invert ATC ordering

In `bindAddToCartInterceptor` (~line 504-552), find the current block:

```js
// CURRENT (post-phase-01)
setLoading(true);
openDrawer();
try {
  const result = await addToCart(varId, qty);
  applyCartMutation(result);
} catch (err) {
  showCartError(err);
  closeDrawer();
}
```

Replace with:

```js
// PHASE 02 — SLC drawer-after-fetch
// submitButton.classList.add('loading') already runs upstream (existing button feedback).
try {
  const result = await addToCart(varId, qty);
  applyCartMutation(result);  // swap drawer + bubble content while drawer is hidden
  openDrawer();               // slide in with real content
} catch (err) {
  showInjectError(err && err.message || 'add-to-cart failed');
  // drawer never opens on error; user sees button-spinner clear + red overlay
} finally {
  if (submitButton) submitButton.classList.remove('loading');
}
```

Notes:
- `setLoading(true)`/`setLoading(false)` calls dropped from ATC path. The "drawer body dim" was masking optimistic placeholder swap; phase 02 has no placeholder, no dim needed.
- Use `showInjectError` (preserved from phase 01) for error overlay surface.
- `submitButton` ref must be in scope; if not, lift it from the form lookup at top of handler.

### Step 4 — Qty +/- button-spinner pattern

Find the qty +/- handler (search `change` listener on `.dop-li-qty-input` OR click listener on `.dop-li-qty-btn`/`button[data-qty-action]`).

Replace existing handler body with:

```js
// PHASE 02 — qty change with button-spinner pattern
const button = e.currentTarget;
button.classList.add('loading');
button.disabled = true;
try {
  const result = await changeCart(line, newQty);
  applyCartMutation(result);  // full swap replaces button node — spinner gone
} catch (err) {
  button.classList.remove('loading');
  button.disabled = false;
  showCartError(err);
}
```

**No `optimisticLineUpdate` call** — that helper is gone post-phase-01.
**No price spinner injection** — spinner is on the button itself, not the price column.
**Rollback path:** if fetch throws before `applyCartMutation`, button still in DOM → remove `loading` class + re-enable.

### Step 5 — Spinner CSS sanity check

Verify `.loading` class on `.dop-btn-cta` (ATC button) and `.dop-li-qty-btn` (qty buttons) shows a spinner.

```powershell
rg "\.loading" assets/dopamiles-cart.css assets/dopamiles-pdp.css assets/dopamiles-shared.css
```

If `.loading` rule is missing for qty buttons, add minimal CSS:

```css
.dop-li-qty-btn.loading {
  position: relative;
  color: transparent !important;
  pointer-events: none;
}
.dop-li-qty-btn.loading::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 14px;
  height: 14px;
  border: 2px solid var(--dop-line, #ccc);
  border-top-color: var(--dop-ink, #000);
  border-radius: 50%;
  animation: dop-btn-spin 0.6s linear infinite;
}
@keyframes dop-btn-spin { to { transform: rotate(360deg); } }
```

(Use new keyframe name `dop-btn-spin` to avoid collision with phase-01-removed `dop-spin`.)

### Step 6 — Local smoke (if dev store available)

- Tap ATC: button shows spinner; drawer NOT open during fetch; drawer slides in with real content; spinner clears
- Tap qty +: button shows spinner; number unchanged during fetch; line replaced on swap (new qty + new price together)
- Force network failure (DevTools offline): button spinner clears, red overlay shows error, drawer never opens

### Step 7 — Single commit

```
git add assets/dopamiles-cart.js assets/dopamiles-cart.css
git commit -m "feat(theme): SLC drawer-after-fetch ordering for ATC + qty

Per SLC competitor research — invert drawer ordering so it opens AFTER
/cart/add.js returns with content already swapped. User perceives ONE
coherent event (drawer arrives with truth) instead of THREE (open empty,
swap mid-flight, un-dim).

ATC: button-spinner → fetch → swap → open drawer.
Qty: button-spinner → fetch → swap (replaces button via innerHTML).

Replaces rejected round-3c optimistic UI strategy. ~10 LOC net delta."
```

### Step 8 — Theme check + deploy

```powershell
shopify theme check
shopify theme push --theme 158279991548
```

## Todo Checklist

- [ ] Step 1 — `applyCartMutation` confirmed safe-to-call when drawer hidden
- [ ] Step 2 — `openDrawer` idempotency confirmed (or guard added)
- [ ] Step 3 — `bindAddToCartInterceptor` ordering inverted (drawer-open AFTER fetch)
- [ ] Step 4 — qty +/- handler uses button-spinner pattern, no optimistic
- [ ] Step 5 — `.loading` CSS present for ATC button + qty buttons
- [ ] Step 6 — local smoke: ATC + qty + error path all clean
- [ ] Step 7 — single commit landed
- [ ] Step 8 — preview deploy + theme check pass

## Success Criteria

- `bindAddToCartInterceptor` calls `openDrawer()` AFTER `applyCartMutation(result)` (verified by grep + visual code review)
- Qty +/- handler has 0 calls to `optimisticLineUpdate` and adds `.loading` class to button
- ATC path: drawer is HIDDEN until fetch returns; drawer slides in WITH real content visible
- Qty path: button shows spinner during fetch; line replaced on swap (no intermediate state)
- Error path: button spinner clears, red overlay surfaces error message, drawer does not open
- No regression of phase 01 behavior (build-tag, JSON island, `showInjectError` still functional)
- Single commit; ~10 LOC delta

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `applyCartMutation` assumes drawer is open (animation, focus management) | Med | High | Step 1 reads code first. If true, split into swap + open. |
| `openDrawer` not idempotent → second ATC tap mid-animation breaks | Low | Med | Step 2 adds guard if needed |
| Qty button `.loading` rule doesn't exist for `.dop-li-qty-btn` | Med | Low | Step 5 adds minimal CSS |
| `submitButton` ref out of scope at finally block | Low | Med | Lift ref to top of handler in Step 3 |
| Drawer slide-in feels slow because user waited 500-1500ms with no drawer visible | Med | High | This is the SLC tradeoff (one event vs three). Phase 04 trims latency. Halt rule applies if user still rejects. |
| `applyCartMutation` swap doesn't include `cart-icon-bubble` | Low | Med | Verify section bundle in cart.js fetch URL; ensure both sections requested |
| Round-1 Bug #3 cartUpdate pubsub still publishes | Low | Med | This phase doesn't touch the pubsub call; verify still in code post-edit |
| User perceives drawer-after-fetch as "slower" because the empty-drawer-open used to give immediate feedback | Med | Med | Button-spinner provides <50ms feedback; SLC proves users accept this. If rejected, halt. |

## Security Considerations

- **Error path surface:** `showInjectError` uses `textContent` (not innerHTML) — safe even if Shopify returns error message containing HTML. Verified in phase-01-preserved helper.
- **AbortController on fetch (optional, defer to phase 04):** if added, ensure abort signal doesn't leak open requests. YAGNI for now.
- **CSRF:** `/cart/add.js` and `/cart/change.js` are Shopify endpoints with built-in protection. No new auth surface.
- **Race condition (rapid double-tap ATC):** existing submit handler should disable button during loading state. Verify `button.disabled = true` is set; if not, add in Step 3.

## Next Steps

- Phase 03 (CLS via min-height) — independent, can run in parallel pre-deploy
- Phase 04 (latency profile) — needs phase 02 + 03 deployed for clean baseline
- Phase 05 (real iPhone verification) — gates on all phases shipped

## Unresolved Questions

1. **Does `applyCartMutation` work when drawer is hidden?** Step 1 must verify before commit. If not, scope grows (split function).
2. **Is the existing submit button `.loading` CSS rule sufficient feedback?** SLC's spinner is inline-text-replaced. Pod-tee may show different spinner style. Acceptable visually as long as <50ms feedback exists.
3. **What's the current `sections=` bundle in the fetch URL?** Phase 04 measures; phase 02 doesn't change. If bundle includes cart-page section (full reload), phase 04 trims.
4. **Does `cart-icon-bubble` get swapped via `applyCartMutation`?** Verify section response shape. If not, manual count update from `cart.item_count` (per round-2 phase 02 red-team finding #2).
5. **Should we add AbortController + 8s timeout?** Defensive but YAGNI for now — Shopify endpoints respond <2s in 99% of cases. Defer to phase 04 if measurements show stalls.
