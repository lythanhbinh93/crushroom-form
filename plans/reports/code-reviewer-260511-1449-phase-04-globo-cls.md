# Code Review — Phase 04 Bug B (Globo CLS + double-render)

**Date:** 2026-05-11 14:49
**Reviewer:** code-reviewer (Codex-grade pre-second-review)
**Branch:** `feat/bug-fix-sprint`
**Scope:** `sections/dopamiles-product-hero.liquid` + `assets/dopamiles-pdp.css` (2 files, +78/-59)
**Plan ref:** `plans/260511-1132-pod-tee-funnel-reset/phase-04-bug-b-globo-cls.md`

---

## TL;DR

**Severity: 6/10** — Functional logic is sound; MutationObserver pattern is correct.
**One CRITICAL latent bug** found that will not affect SHIP behavior but contradicts comment claims and creates future maintenance landmine. **Two HIGH** issues that Codex will absolutely flag.

**Sign-off: fix-first (1 fix, ~5 min) → then ship.** The fix is removing a now-orphaned `!important` rule in `dopamiles-shared.css` that contradicts the new Phase 04 approach.

---

## CRITICAL — Conflicting legacy rule still in shared.css

**File:** `assets/dopamiles-shared.css:150-155`

```css
product-info > .globo-swatch-product-detail ~ variant-selects,
.globo-swatch-product-detail ~ variant-selects,
.globo-swatch-product-detail + variant-selects,
product-info:has(.globo-swatch-product-detail) variant-selects {
  display: none !important;
}
```

**Problem:** This is the round-2/round-3a-era rule. Phase 04 comment at `sections/dopamiles-product-hero.liquid:90` claims the new strategy is to target Dawn's `<variant-selects>` ONLY via `[data-dawn-vs] variant-selects` so Globo siblings are unaffected. Reality: shared.css **also** hides `<variant-selects>` whenever a Globo swatch sibling exists, with `!important` (highest non-inline specificity).

**Why Codex will flag it:**
1. **Contradicts the documented Phase 04 intent.** The journal narrative says "round-3c cascade was wrong, we now target Dawn only." Shipping with the cascade rule still live means the new and old strategies overlap.
2. **Defeats `[data-dawn-revealed]` unlock.** If Globo is present but for some reason `revealDawn()` is later called (it won't on the ship path, but Codex hunts for "what if"), this rule with `!important` will win over `[data-dawn-vs][data-dawn-revealed] variant-selects { display: block }` (specificity 0,2,1 vs Globo-sibling rule 0,1,2 + !important). Result: Dawn cannot be revealed once Globo is in DOM.
3. **Dead code masquerading as live.** Future devs reading shared.css will get conflicting mental models.

**Fix (5 min):** Delete shared.css lines 142-155 (the entire `── GloboSwatch / Globo Product Options PDP duplicate-picker mute ──` block). The Phase 04 CSS in pdp.css now owns this concern.

**Severity:** Critical for code clarity. Practically: with Globo enabled the shared.css `!important` rule co-hides Dawn alongside the new rule, so behavior is unchanged on ship — but the moment Globo's app-embed CSS gets re-prioritized, OR a future "show Dawn alongside Globo" feature lands, the latent rule will fire.

---

## HIGH — Race window between `globoPresent()` and `observer.observe()`

**File:** `sections/dopamiles-product-hero.liquid:490-494`

```js
if (!globoPresent()) {
  var globoObserver = new MutationObserver(function() {
    if (globoPresent()) globoObserver.disconnect();
  });
  globoObserver.observe(section, { childList: true, subtree: true });
```

**Problem:** Between the `!globoPresent()` check (line 490) and `observe(...)` (line 494) there are 3-4 microtasks. If Globo injects synchronously between those lines (extremely rare but possible because Globo is an app-embed sync script in some configurations), the MutationObserver will miss the injection and the 5000ms timer will reveal Dawn even though Globo is present → double-render.

**Why Codex will flag it:** Classic check-then-act TOCTOU pattern.

**Defensible response:** The 5000ms safety re-checks `globoPresent()` before revealing — line 497: `if (!globoPresent()) revealDawn();`. So even if the observer misses the injection, the timer's final check catches it. **Net behavior: safe.** Worth a 1-line code comment confirming this defense-in-depth.

**Severity:** Low risk in practice, but Codex will mark it. Add a comment, no logic change needed.

---

## HIGH — `inert` browser support edge case + `aria-hidden` redundancy

**File:** `sections/dopamiles-product-hero.liquid:97`

```html
<div data-dawn-vs aria-hidden="true" inert>
```

**Codex bait #1 — `inert` polyfill:**
- iOS Safari ≥15.5 — globally fine (>97% support per caniuse 2026)
- iOS 15.0-15.4 — `inert` is no-op, but `display:none` (from CSS) already removes it from a11y tree, so safe.
- **Verdict:** Belt-and-suspenders is correct. Defensible.

**Codex bait #2 — `aria-hidden` on `display:none` element:**
When Dawn is `display:none` (via `[data-dawn-vs] variant-selects { display: none }`), the element is already removed from the accessibility tree. The `aria-hidden="true"` on the wrapper is technically redundant.

**However** — the CSS hides only the inner `<variant-selects>` element, not the wrapper `[data-dawn-vs]` div. The wrapper itself still exists in layout flow. If a future change re-renders content inside `[data-dawn-vs]` outside `<variant-selects>` (e.g., a label, the hidden `[data-dop-variant-id]` input that lives elsewhere — line 218), the `aria-hidden` IS needed. Keep it.

**Codex bait #3 — reveal atomicity:**
```js
function revealDawn() {
  dawnEl.setAttribute('data-dawn-revealed', '');
  dawnEl.removeAttribute('aria-hidden');
  dawnEl.removeAttribute('inert');
}
```
Three DOM ops in sequence. Not atomic, but well within a single microtask — no observable intermediate state to a user. **Safe.**

**Severity:** Informational. No fix needed; flag as defensible.

---

## MEDIUM — Observer subtree scope is broad

**File:** `sections/dopamiles-product-hero.liquid:494`

```js
globoObserver.observe(section, { childList: true, subtree: true });
```

**Problem:** Observer watches the entire section subtree. The section includes the gallery, the form, the variant picker, sticky ATC hooks, etc. Every time Dawn's `product-info.js` does a section refetch on variant change (line 214-217: "Dawn's product-info.js refetches the section after variant change and replaces `<variant-selects>` + form children") — the observer fires.

**Cost per mutation:** One `section.querySelector(GLOBO_SELECTOR)` call. Cheap (CSS selector, modern browser, well-indexed). But the observer runs for 5 seconds, and a user mashing variant radios in that window can trigger 20-50 mutation batches.

**Codex will flag:** "Performance — unbounded mutation observer over hot DOM."

**Defensible response:**
- 5-second window. The observer auto-disconnects after that.
- Each call is one query selector — sub-millisecond on modern devices.
- `globoPresent()` returns early on match → no further work.
- Profiled cost vs benefit (preventing CLS = -0.313 layout shift, a Core Web Vitals win): acceptable trade.

**Optional optimization (NOT required for ship):** Wrap callback in `requestIdleCallback` fallback to `setTimeout 0`. Don't bother — adds complexity for sub-ms work.

**Severity:** 3/10. Defensible as-is.

---

## MEDIUM — `data-dawn-vs` global selector scope

**File:** `assets/dopamiles-pdp.css:227-228`

```css
[data-dawn-vs] variant-selects { display: none; }
[data-dawn-vs][data-dawn-revealed] variant-selects { display: block; }
```

**Codex will flag:** "Global attribute selector — does any other section use `[data-dawn-vs]`?"

**Verified:** `Grep "data-dawn-vs"` shows only 2 files: this section + this CSS. Single source of use. **Safe.**

**Forward risk:** If a future related-products carousel re-renders product cards using this section template, multiple `[data-dawn-vs]` instances will exist. The CSS would still work correctly (each isolates to its own `<variant-selects>` child). The JS would create one observer per `<product-info>` instance — also OK because each IIFE re-scopes `section`.

**Severity:** 2/10. Forward-compatible.

---

## MEDIUM — Section element replacement edge case

**File:** `sections/dopamiles-product-hero.liquid:477`

```js
var dawnEl = section.querySelector('[data-dawn-vs]');
```

**Problem:** Dawn's `product-info.js` (verified at `assets/product-info.js:141, 158`) refetches and replaces the section subtree on variant change. The cached `dawnEl` reference may point to a detached node after a variant change.

**Codex will flag:** "Stale DOM reference — `revealDawn()` could be called on a detached node."

**Defensible response:** `revealDawn()` writes attributes on `dawnEl`. If the node is detached:
- `setAttribute('data-dawn-revealed', '')` on detached node — succeeds silently, no effect on live DOM.
- The currently-attached `[data-dawn-vs]` (post-refetch) won't have the attribute → stays hidden.
- But: the CSS rule `[data-dawn-vs] variant-selects { display: none }` still applies to the new node, so Dawn stays hidden. **User sees Globo (if present) or sees nothing (5s timer ran before refetch, but refetch happens only on user interaction, which requires picker visibility) — practical edge case is empty.**

Actual risk: low. The 5s safety reveal happens long before any user interaction would trigger a section refetch (user can't change variant if Dawn is hidden + Globo not yet present). So the cached `dawnEl` is reliably live when `revealDawn()` runs.

**Defensible.** Optional hardening: re-query inside `revealDawn()`:
```js
function revealDawn() {
  var el = section.querySelector('[data-dawn-vs]');
  if (!el) return;
  el.setAttribute('data-dawn-revealed', '');
  el.removeAttribute('aria-hidden');
  el.removeAttribute('inert');
}
```
**Effort: 30 sec.** Recommend adding for Codex defense.

**Severity:** 3/10.

---

## LOW — `.dop-vs-slot min-height` may create empty gap on 1-option products

**File:** `assets/dopamiles-pdp.css:220-223`

```css
.dop-vs-slot { min-height: 80px; }
@media (min-width: 750px) {
  .dop-vs-slot { min-height: 100px; }
}
```

**Problem:** On products with only 1 option (color OR size only), Dawn picker is ~50px tall. Slot creates a 30px empty gap below it.

**Codex will flag:** "Magic number — 80/100px chosen how?"

**Defensible response:** This is the audit's accepted CLS trade. Empty space (no shift) > variable space (shift). The 80/100 numbers come from measuring Globo's typical render height (color circles + size pills ≈ 76-96px). Comment block at CSS line 217-222 explains intent.

**Optional improvement:** Add `max-content` size hint or `min-height: clamp(80px, ..., 100px)` — overkill for now.

**Severity:** 2/10. Accept trade.

---

## LOW — Comment in JS references "audit Q#3" — dangling pointer

**File:** `sections/dopamiles-product-hero.liquid:467`

```js
// Decision tree (single GLOBO_SELECTOR — audit Q#3 unified):
```

Comment references an external audit by question number. If audit is renumbered/lost, comment becomes opaque. Not a blocker.

---

## Round-3c regression risk check (per prompt area E)

**E.16 — Visibility cascade safety:** ✅
- `.dop-vs-slot` (outer wrapper) has NO hiding rule. Globo can inject as child of `.dop-vs-slot` or sibling and is unaffected.
- `[data-dawn-vs]` (inner) has `aria-hidden + inert` only — neither produces visual hiding cascade.
- CSS targets ONLY `variant-selects` custom element by tag name. Globo's `.globo-color-swatch` div is NOT a `<variant-selects>` element — cannot match.
- **The round-3c cascade hiding bug cannot recur.**

**E.17 — Globo injects INSIDE `[data-dawn-vs]`:** ⚠️ UNVERIFIED
- If Globo's swatch app injects its DOM as a **child** of `<product-info>` (inside `[data-dawn-vs]`), our `inert` attribute on `[data-dawn-vs]` would freeze Globo's interactions until 5s reveal.
- **However** — `globoPresent()` matches the Globo selector → observer disconnects → `revealDawn()` strips `inert` → Globo interactive.
- Wait: there's an order bug. `revealDawn()` is only called by the 5s timer if `!globoPresent()`. If Globo is present, observer disconnects but `revealDawn()` is NOT called → `inert` stays. **If Globo injects inside `[data-dawn-vs]`, Globo is frozen.**

**This is a latent bug.** Mitigation: when observer detects Globo, also call a partial reveal that strips `inert` + `aria-hidden` but does NOT add `[data-dawn-revealed]` (so Dawn stays display:none, but Globo siblings/descendants are interactive). Suggested code:

```js
var globoObserver = new MutationObserver(function() {
  if (globoPresent()) {
    globoObserver.disconnect();
    // Strip inert/aria-hidden so Globo (if injected inside [data-dawn-vs])
    // is interactive. Leave Dawn hidden via CSS (no data-dawn-revealed).
    if (dawnEl) {
      dawnEl.removeAttribute('aria-hidden');
      dawnEl.removeAttribute('inert');
    }
  }
});
```

**Effort: 2 min. Severity: 4/10 unless verified that Globo injects as sibling, not child.**

**Recommendation:** ASK user to verify Globo's actual injection target before shipping. If sibling → no action. If child → add the snippet above.

---

## Summary table

| # | Area | Severity | Codex bait? | Fix effort |
|---|------|----------|-------------|------------|
| 1 | Conflicting legacy rule in shared.css | **Critical** | Yes (red flag) | 5 min |
| 2 | TOCTOU race observer setup | High | Yes | 1-line comment |
| 3 | `inert` + `aria-hidden` rationale | Info | Maybe | None (defensible) |
| 4 | Observer subtree breadth | Med | Yes | None (defensible) |
| 5 | `[data-dawn-vs]` global scope | Med | Maybe | None |
| 6 | Stale `dawnEl` re-query | Med | Yes | 30 sec |
| 7 | `dop-vs-slot` magic numbers | Low | Maybe | None |
| 8 | Globo-inside-data-dawn-vs `inert` freeze | Med-High | Maybe | 2 min + user verify |
| — | Round-3c cascade regression | None | — | Verified safe |

---

## Recommended Actions (ordered)

1. **MUST: Delete `assets/dopamiles-shared.css` lines 142-155** (the legacy Globo-sibling mute rule). Phase 04 pdp.css now owns this. ← **5 min, blocking**
2. **SHOULD: Re-query `[data-dawn-vs]` inside `revealDawn()`** for defense vs Dawn section re-render. ← 30 sec, optional
3. **SHOULD: Verify Globo injection target** (child or sibling of `[data-dawn-vs]`?). If child, add 2-line `inert`-strip on observer match. ← User verify, 2 min
4. **NICE: 1-line code comment** at line 497 noting "5s timer re-checks `globoPresent()` to close TOCTOU window."

---

## Positive observations

- Comment quality is excellent — round-3c context, cascade-fix rationale, decision tree all documented inline.
- Single `GLOBO_SELECTOR` constant (good DRY vs the old code that scattered globo selectors across muteNative + reveal-timer).
- MutationObserver pattern is textbook-correct: scoped to section, disconnects on match, disconnects on safety timeout.
- `revealDawn()` cleanly groups all hide-strip operations — atomic semantics.
- Removed `muteNativeWhenGlobo` + 4 setTimeouts → net -34 LOC of polling fragility, +40 LOC of declarative CSS+observer.
- `dop-vs-slot` reserves space → CLS-by-design instead of CLS-by-firefighting.

---

## Unresolved Questions

1. **Q (BLOCKING for hardening):** Does GloboSwatch inject DOM as a **sibling** of `[data-dawn-vs]` or as a **child of `<product-info>`** inside `[data-dawn-vs]`? Browser inspection on a live PDP with Globo enabled would resolve. If sibling: ship as-is + delete shared.css block. If child: also add observer-match inert-strip.
2. **Q (informational):** Is the `dopamiles-shared.css` Globo-mute block referenced by any other section template? (Quick grep: appears not — only PDP uses Globo swatch.) If confirmed unused, safe to delete the entire `── GloboSwatch / Globo Product Options PDP duplicate-picker mute ──` comment block.
3. **Q (forward-looking):** Are there any non-PDP templates rendering `dopamiles-product-hero.liquid`? Recommendations carousel? If yes, observer-per-card scoping needs review.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 04 logic is sound but legacy `!important` rule in `dopamiles-shared.css:150-155` contradicts the new approach and creates a maintenance landmine — should be deleted before ship. One unverified edge case re: Globo injection target.
**Sign-off:** fix-first — delete shared.css legacy block (5 min) → verify Globo injection target (user) → ship.
**Codex prep notes:** Codex will likely flag (a) the legacy shared.css rule as a contradiction with new intent — fix it before submission, (b) the TOCTOU window between `globoPresent()` and `observe()` — counter with "5s timer re-checks, safe-by-design", (c) the observer subtree breadth — counter with "5s lifetime, sub-ms callback cost, CLS trade-off", (d) the `aria-hidden`+`inert`+`display:none` triple-hide — counter with "belt-and-suspenders for iOS 15.0-15.4 `inert` no-op fallback + future-proof against wrapper non-`variant-selects` content". The Globo-injection-target question is the one item where Codex may legitimately have more context than us — defer to user verification.
