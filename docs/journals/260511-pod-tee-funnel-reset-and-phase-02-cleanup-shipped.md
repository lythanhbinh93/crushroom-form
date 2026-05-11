# Pod-Tee Funnel Reset — Wide Audit + Phase 02 Shipped

**Date**: 2026-05-11 13:32 ICT  
**Severity**: High  
**Component**: pod-tee-theme full stack (88 findings, 9-phase plan, phase 02 complete)  
**Status**: Phase 02 shipped (code-complete, smoke-deferred per real-iPhone gate)

## What Happened

Today spanned 2 hours of scope discovery that invalidated a false hypothesis, triggered a width-wide audit, locked a 9-phase improvement plan, and shipped the first deletion phase—all with zero findings flagged by code review.

**Timeline:**
- **11:32 ICT**: Brainstorm locked 3 bugs (A: cart perf, B: Globo PDP, C: collection card "wrong first photo"). User intent: benchmark pod-tee-theme vs competitors, kill custom dopamiles-cart.js if needed. Audit-first approach.
- **12:03 ICT**: Card-loading benchmark finished. Measured 4 stores. Finding: Dopamiles renders 6 images per card. Competitors: 1 img/card. Sloth (same Globo app as Dopamiles) = 1 img/card. **But the benchmark was measuring the wrong theme** — live dopamiles.co runs BuildMyPOD Horizon, not pod-tee-theme. Plan invalidated mid-flight. Scope discovery.
- **12:20 ICT**: User clarified target is pod-tee-theme (preview branch). Plan reshaped: audit-then-backlog, no timeline pressure. "Build it right, publish when ready."
- **~12:30 ICT**: Wide audit completed by code-reviewer subagent. 88 findings. Top 3 surprises below.
- **13:00 ICT**: Planner subagent drafted 9-phase plan from audit. Phases 02–10 locked, dependencies and smoke gates defined. Committed plan at `d6a5366`.
- **13:32 ICT**: Phase 02 (round-3c cleanup) shipped. 237 LOC deleted across 3 files. Code-reviewer: 10/10 ship-ready, zero findings. Smoke gate: real-iPhone verification pending. Committed theme `2187268` + crushroom-form `86155a9`.

## The Brutal Truth

**False hypothesis:**
URL-level benchmark on `dopamiles.co` was looking at the wrong theme entirely. The 6-image-per-card problem I measured lives in BuildMyPOD Horizon, not pod-tee-theme. Would have wasted hours optimizing the card snippet (which was already clean on pod-tee-theme) instead of fixing the real target. Scope clarity from the user (emphasizing "pod-tee-theme preview, not live dopamiles.co") saved the sprint.

**Audit exposed the real bug nests:**
Quiet deletion of round-3c's rejected optimistic-UI code surfaced 14 lingering references buried across two JS files and one Liquid section. None were compiled into syntax errors. All were silent: dead function definitions, unreachable CSS rules, commented docstrings pointing to deleted functions. The halt journal's explicit cleanup list was incomplete without a full code scan.

**Cart.js is broken in plain sight:**
754 LOC tangling cart-drawer, ATC, qty mutations, error surfaces, event rebind, pubsub, and (until today) rejected optimistic helpers all in one IIFE. The file's also a code-review blind spot — `showInjectError` (debug red banner for round-3c, **delete**) and `showProductFormError` (production error surface, **keep**) are visually similar. Deleting the wrong one would have broken user-facing error feedback with zero way to surface cart failures.

**Collection card bug lives in the wrong place:**
User verified the snippet `dopamiles-product-card.liquid` was clean (uses `product.featured_image`). But the collection page (`/collections/all`) doesn't use that snippet — it inlines its own markup with `product.variants.first.featured_media`. Different class prefix (`doc-pcard` vs `dop-pcard`), different image source, different bug. This is a DRY violation: collection-grid + cart-drawer + cart-main all inline variants of line-item and card markup instead of using snippets. Three places to patch, one place to fix.

## Technical Details

### Benchmark surprise
```
Store          | Cards | Images | Per-card | Pattern
Dopamiles      | 16    | 97     | 6.0      | ❌ variant loop per product
Sloth (Globo)  | 17    | 17     | 1.0      | ✓ featured_image + Globo swap
Historee       | 16    | 17     | 1.0      | ✓ featured_image
Shrine         | 3     | 7      | 0.8      | ✓ featured_image
```
But Dopamiles URL was `dopamiles.co` (live = BuildMyPOD), not the preview pod-tee-theme branch. Hypothesis invalidated; audit reoriented to preview.

### Wide audit backlog (88 findings)
- **P0 (blockers):** 8 items. All round-3c remnants (optimistic helpers, Globo race pollers, JSON island). Phase 02 owns all 8.
- **P1 (pre-publish):** 22 items. Modularization (cart.js 754 LOC, sections >700 LOC), a11y (button-inside-link nesting, dialog focus trap), bug fixes (Globo CLS via MutationObserver, collection card image source).
- **P2 (polish):** 38 items. Hardcoded copy, dead code (dopamiles-cart-line-item.liquid unused), perf anti-patterns (site-wide CSS loading, parseInt of inventory_quantity on non-Shopify-managed inventory).
- **P3 (nice-to-have):** 20 items. Icon extraction, SVG dedupe, comment cleanup, seldom-accessed page optimizations.

### Phase 02 deletion (verified clean)
**Files touched:**
- `assets/dopamiles-cart.js`: 150 LOC deleted (lines 105–114, 145–207, 222–237, 678, docstring updates)
- `assets/dopamiles-cart.css`: 45 LOC deleted (§12 round-3c styles: `.dop-li-price-pending`, `.dop-li-optimistic`, keyframes)
- `sections/dopamiles-product-hero.liquid`: 42 LOC deleted (lines 196–231 JSON island + feeding docstring)

**Verification gates passed:**
- Code-reviewer ripgrep: 0 lingering references to `injectOptimisticAtcLine`, `optimisticLineUpdate`, `showInjectError`, `dop-li-optimistic`, `dop-product-data`. 
- Preservation audit: `showProductFormError` (production) preserved; `data-dop-variants-json` (variant sync) preserved; `applyCartMutation` (load-bearing) untouched.
- Liquid syntax: no orphan braces, no dangling `{%- endcomment -%}`.
- CSS parsing: §11 LOADING STATE closes cleanly; file ends at 708 (no orphan rules).
- Flow logic: `handleQtyChange` + `bindAddToCartInterceptor` paths still route errors to `showProductFormError` + error banner (honest loading states, not silent failures).

## What We Tried

Round-3c strategy (now deleted) was: optimistic perception UI (fake instant feedback on cart actions). Halt journal from 2026-05-09 rejected this on user feedback ("fake animation" + Globo CSS cascade failure).

**Phase 02's approach:** pure deletion + verification gates. No refactoring, no opportunistic rewrites. Just remove dead code and confirm load-bearing paths still work. Smallest-scope cleanup first; strangler split of cart.js deferred to phase 05 once dead code is gone.

## Root Cause Analysis

Three separate bugs, one cleanup phase:

1. **Round-3c incomplete halt:** User halt journal listed which functions to delete, but didn't capture all 14 lingering references (docstrings, CSS rules, unreachable call site at line 678 inside ATC interceptor's happy path). Full code scan (audit) was required to catch them.

2. **Cart.js dual error surfaces:** The file has `showInjectError` (preview-only red banner, debug surface, round-3c-only) and `showProductFormError` (production-grade error surface, keep). Both use `<div id="dop-cart-err-banner">` internally. Easy to delete the wrong one (the production one) and leave users without error feedback. Grep-gate + preservation audit caught this.

3. **Collection card bug location mismatch:** Three home sections use `dopamiles-product-card.liquid` (clean 1-img snippet). Collection page inlines its own markup with different class names and `variants.first.featured_media`. This is a DRY violation across snippets → sections → templates. Merchant-facing: collection cards show wrong photo because Shopify's `variants.first` order is not stable (merchant can reorder variants in admin; `first` changes). Snippet users never hit this (they use `featured_image`). Collection-grid users always hit it.

## Lessons Learned

1. **Live store URL benchmarks are scope traps if the URL runs the wrong codebase.** "Measure dopamiles.co" sounded right. But dopamiles.co != pod-tee-theme (it's BuildMyPOD Horizon). Set URL targets explicitly in scopes: "measure pod-tee-theme preview at {URL}, or measure {store} only if it runs pod-tee-theme." Otherwise hypotheses can run against the wrong system for hours before discovery.

2. **Halt rules need full grep-gate verification, not just manual lists.** The 2026-05-09 halt journal said "delete these 8 functions" but missed 6 docstring references, 4 CSS rules, and 1 call site because they weren't syntactic errors. Next halt rule: "list items to delete, then audit runs ripgrep to find all references." Otherwise dead code lives as silent comments and stale-but-valid CSS.

3. **Dead code in comments is still dead code.** The `dop-product-data` JSON island existed to feed `injectOptimisticAtcLine`. When round-3c was rejected, the island should have been deleted too (it feeds nothing now). But the island isn't a function call — it's a `<script>` block that ships to the browser. Silent waste: it's 30 LOC of JSON serialization per PDP, shipping every page for zero utility. Only a full code scan caught this.

4. **DRY violations across snippets and sections hide in naming.** Collection-grid uses `doc-pcard` (inline). Niche-favorites uses `dop-pcard` (snippet). Same semantic card, different class prefix, different implementation. When the bug is "wrong photo on cards," a grep for `featured_image` finds 5 places (all snippet), but the 6th place (section inline) uses `variants.first` and never shows up. Always audit both markup patterns (inline + snippet) when bugs are semantic (like card rendering).

5. **Code review gates catch syntax but not semantic load-bearing verification.** Code-reviewer saw the phase 02 changes and said "10/10 ship-ready." The review caught "preserve `showProductFormError`, not `showInjectError`" — but that was a 2-line grep check, not a logic review. Real verification (ATC + qty changes + remove + error surface) will come from user on live iPhone. This is correct (ship-ready code + user-side gate = confidence) but worth noting: code review ≠ end-to-end verification.

## What Survives

- **Phase 02 code-clean.** 237 LOC deleted, zero findings, zero regressions in load-bearing paths.
- **9-phase plan locked.** Phases 03–10 drafted from audit findings, dependencies declared, effort estimated, smoke gates per phase. Plan at `d6a5366`.
- **Audit report as ground truth.** 88 findings, 5 open questions. Phases built from this artifact; future decisions rooted in a single audit sweep (not fuzzy memory).
- **Build-tag + error overlay + variant-sync JSON.** Preserved across phases; verified as load-bearing for future phases.

## Next Steps

**Phase 02 shipped; real-iPhone verification pending.**

User will:
1. Open pod-tee-theme preview on iPhone
2. Tap ATC button on PDP → verify drawer opens with no "optimistic" line animation or fake spinner
3. Tap qty +/− in drawer → verify error banner surfaces if anything fails
4. Tap remove → verify line deletes without hanging
5. If all pass: phase 02 is verified; proceed to phase 03 (collection card image fix)

**Phase 03 scope:** Bug C root cause in `sections/dopamiles-collection-grid.liquid:245` — switch from `product.variants.first.featured_media` to `product.featured_image`. 1 line change. DRY: same fix unifies 6 card render paths (currently 5 use snippet cleanly, 1 section inlines buggy markup). Expected 1h effort.

**Phase 04:** Bug B (Globo CLS) — MutationObserver + min-height slot wrapper. 3–5h.

**Phase 05:** Cart.js strangler (754 LOC → 3 files, none >450 LOC). 4–6h.

Phases 06–10 follow, each targeted, each gated on real iPhone. No timeline pressure; build it right, then publish to replace BuildMyPOD live when all phases are stable.

**Open questions to resolve before phase 03 ships:**
1. Does merchant intentionally rely on `variants.first` photo for any product? (Scope Bug C per-product via tag if yes.)
2. Globo selector inconsistency: mute detection uses `.globo-swatch-product-detail, [class*="globo-swatch-product"]` but reveal uses `....[class*="globo-color-swatch"]`. Which is canonical? (Live check on dopamiles.co.)
3. FBT multi-item form: does `/cart/add` with `items[][id]` redirect or refresh in-place? (Verify live before phase 05 strangler touches FBT handling.)

---

**Status**: DONE  
**Summary**: Brainstorm revealed false hypothesis (wrong theme benchmarked). User reframed to pod-tee-theme audit. Wide audit → 88 findings → 9-phase plan → Phase 02 (pure deletion) shipped code-clean. Real-iPhone verification next gate.  
**Journal file**: D:\github local\crushroom-form\docs\journals\260511-pod-tee-funnel-reset-and-phase-02-cleanup-shipped.md
