# Round-3c Perception (G+F) + CLS — Deployed to Shopify Preview

**Date**: 2026-05-09 17:30 ICT  
**Severity**: High  
**Component**: Pod Tee PDP optimistic ATC UI, cart qty price feedback, CLS (R3-1 fix)  
**Status**: Shipped to preview theme 158279991548, awaiting user iPhone screen-recording verification

## What Happened

Deployed round-3c retry of optimistic ATC drawer (G) + qty price feedback (F) with invisible observability layer built-in. Previous attempt (round-3b) reverted after 4 failed iterations converged to exactly the same "didn't work" report. This time: deployed WITH diagnostic surface (build-tag + error overlay) so the next failure is observable, not guessed.

Also shipped CLS R3-1 fix per Gate 2 reviewer: Dawn `<variant-selects>` hidden server-side, revealed if Globo doesn't inject by 1500ms. Avoids the 0.313 CLS reflow from Globo async-injecting after Dawn paints.

Deployed ~17:30. Four critical issues caught by code-reviewer in pre-deploy review, all patched before push. Awaiting user iPhone recording to confirm build-tag visibility (cache-bust signal), error overlay absence (no silent throws), and visual perception of optimistic line + spinner.

## The Brutal Truth

This is iteration #3 on the same feature. Round-3a shipped optimistic drawer-open (immediate visual feedback). Round-3b added the actual payload (optimistic line item + qty price scaling) and was reverted four times without converging. Each iteration was a guess because **we shipped zero diagnostic surface** — every failure looked identical to the user, so every fix was a guess.

The frustrating part: we knew iOS Safari swallows exceptions silently. We knew DOM selector reads are fragile. But we didn't invest ~25 LOC in observability (build-tag + error overlay) until round-3c. Round-3b could have shipped with those tools ON DAY 1 and the failure would have been visible, not invisible.

Spent 6 hours on round-3b iteration loop with no convergence signal. Round-3c inverts the priority: observability before feature. That's the lesson. 

## Technical Details

**Code-reviewer findings (pre-deploy):**

1. **Critical (C1):** `#dop-cart-lines` doesn't exist in empty-cart Liquid branch. First ATC into an empty cart would silently return null, appearing identical to round-3b's "optimistic didn't work" failure. 5-line fallback added: detect empty state, replace with a `<div id="dop-cart-lines">` host, then proceed.

2. **Major (M1-M3):** `data.url` and `variant.image` injected unescaped into href/src. Shopify sanitizes these, but defense-in-depth: wrapped both in `escapeHtml()`. Build-tag preview gate had false-positive risk: `template.suffix contains 'preview'` would match any merchant's `product.preview.liquid` A/B template. Dropped that clause; `request.path contains 'preview_theme_id'` alone is sufficient.

3. **Minor (m1-m7):** JSON island `</script>` premature-close risk (rare, but Liquid `| json` doesn't escape `/`). Added `| replace: '</', '<\/'` filter. Spinner accessibility: added `role="status"` for screen-reader announce. Round-3b dead-code grep: zero hits for `scaleMoneyText`, `gallery-active-image` — clean revert.

**Verified:**
- `applyCartMutation` fully wipes optimistic placeholder via `.innerHTML` swap.
- `[data-dawn-vs]` wrapper survives Globo's DOM replacement; wrapper is sibling-parent only, doesn't reparent product-form internals.
- Empty-cart `querySelector('.dop-cart-empty')` path works; empty state is replaced before appending optimistic line.

## What We Tried

Round-3b iterated 4× on optimistic line logic:
1. Attempted DOM selectors (`.dop-product-title`, `.dop-gallery-active-image`, `.dop-price-final`) — fragile across PDPs, prone to null reads.
2. Attempted money parsing (`scaleMoneyText` regex) — locale-specific, brittle.
3. Attempted immediate visual feedback (entrance animation) — hypothesis that placeholder flickered too fast to register.
4. All 4 failed with zero diagnostic surface: user reported "didn't work," code was unreachable via Safari console, guess-loop unbreakable.

Round-3c threw out the iteration loop entirely:
- **Root-cause fix:** JSON data island server-rendered in Liquid. Zero DOM selectors, zero runtime parsing. Deterministic data source. Variant lookup: `find(v => v.id === formVariantId)` → if not found, `showInjectError('variant not found')`.
- **Verification fixes:** build-tag (6-digit epoch, visible top-right, content changes per render) confirms cache-bust. Error overlay (red, fixed position, 5s auto-dismiss) surfaces any throw in mobile Safari recording.
- **Result:** next failure IS observable; iteration will be targeted, not blind.

## Root Cause Analysis

Round-3b failed because **we optimized for code-shipped-count, not for observability budget**.

Three problems stacked:
1. **iOS Safari exception swallowing:** any throw in click handler disappears into the void. No console, no error event, nothing. User sees outcome only ("didn't work"). 
2. **Fragile DOM-selector API:** round-3b's DOM reads assumed stable selectors. But selectors can drift with CSS changes, markup changes, or variant-specific template overrides. Null reads silent-fail in try-free code.
3. **No diagnostic surface:** code was unreachable via inspection. Every failure looked identical. Every fix was a random guess at a different root cause.

The mistake: we knew all three risks existed. We shipped round-3b without defense against any of them. Then we guessed 4 times.

Round-3c doesn't "fix" iOS Safari's behavior — it surfaces it. Build-tag + error overlay cost ~25 LOC and unlock the entire feedback loop. That's the lesson.

## Lessons Learned

1. **Invisible code is undebuggable code.** When you're iterating on a feature that only lives in user screen recordings (no server logs, no console), the 25 LOC of observability IS the feature. Build-tag + error overlay aren't "nice to have" — they're blocking.

2. **Server-rendered data > runtime DOM selectors for deterministic UI.** JSON island pattern: pay one Liquid render cost once per PDP load, get deterministic data source forever. No selector brittle-ness. No null-checks. Just `data.variants.find(...)`.

3. **Empty-cart is the edge case that kills you.** This one was caught by code-reviewer. If we'd shipped round-3c blind, user's first ATC (the G demo) would have silent-skipped because `#dop-cart-lines` didn't exist. Indistinguishable from round-3b's failure.

4. **Code-reviewer is non-negotiable for security/auth code AND for fragile state-machine code.** Cart UI is state machine (empty → first item → many items → qty change). The reviewer's C1 catch prevented recreating round-3b's exact "didn't work" pattern for a different root cause.

5. **Iterating without diagnostic surface = guessing.** Round-3b proved this. Four iterations, zero convergence signal. Round-3c flips the bit: ship the observability first, then iterate. Smarter.

## Next Steps

1. **User iPhone verification (blocking):** user screen-records per phase-06 walk. Sends 15s video. Look for:
   - Build-tag visible top-right, value differs from prior deploy (cache-bust ✓)
   - Zero red error overlays (no silent throws ✓)
   - Optimistic line visible during drawer slide-in (G ✓)
   - Spinner visible during qty +/- for ~300-500ms (F ✓)

2. **Recording review:** if red overlay appears, message tells us exact selector/data point. Fix is 1-line, re-deploy immediately. If no red overlay but user reports "didn't work," pull frame-by-frame recording and ask explicit "what did you expect at frame 6?" — stop guessing.

3. **Phase-05 Gate-3 exit:** round-3c deploy unblocks Gate 3 (real-iPhone smoke). After user verification passes, resume Phase-05 Gate-4 (publish + 24h soak).

4. **Defer (non-blocking):** Globo enablement signal in Liquid (unknown if metafield exists). If known, R3-1 fix becomes deterministic (skip 1.5s timer race). Otherwise, timer is the only option. Acceptable for now.

## Unresolved Questions

- User iPhone screen-recording not yet captured. True convergence = observable in video, not "code merged."
- Is Globo enablement detectable via Liquid metafield? Would let us skip 1.5s timer race in rare slow-3G case.
- iOS Safari 18 behavior under `visibility:hidden` reflow with Globo wrapper-replace — spot-tested in recording, not pre-verified.

---

**Status:** SHIPPED_TO_PREVIEW | Awaiting user iPhone verification gate
