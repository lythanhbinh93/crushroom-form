# Pod-Tee FB-11: Product Card Niche Label & Price Alignment — Conservative Scope Then Promote

**Date**: 2026-05-19 18:15
**Severity**: Low
**Component**: Pod-Tee product cards (collection + home + search + more-from-niche + cart)
**Status**: Resolved

## What Shipped

After Round 3 close, user added FB-11: hide T-SHIRT product-type label on product cards + left-align price (was space-between with label on left, price on right).

First attempt (commit `69d7d3c`): scoped fix to collection page only via `.dopamiles-collection.css`. Added 2 rules under `.dopamiles-collection-grid` prefix; markup preserved on snippet to keep label for home/other sections.

Scout revealed the snippet (`dopamiles-product-card.liquid`) is shared across 6 sections. Collection-scoped CSS couldn't reach the other five. **Promoted to base styles** (commit `69afbe1`): added `display: none` to `.dop-pcard-niche`; changed `.dop-pcard-row` from `space-between` → `flex-start` in `assets/dopamiles-shared.css` (loaded globally). Removed now-redundant scoped block from collection.css (net: +2 / -9).

## The Insight

Conservative-scope-first → promote-to-base when siblings want it is the right cadence. Reverse order risks unintended bleed; two commits keep diff history honest.

One snippet = 6 consumers meant universal sync was 2-line base-CSS edit, not per-section duplication. Liquid-DRY enabled CSS-DRY.

## Files Touched

- `assets/dopamiles-shared.css` — +2 rules (niche hide + flex-start)
- `assets/dopamiles-collection.css` — -9 lines (removed scoped block)
- `snippets/dopamiles-product-card.liquid` — unchanged

## Next

Publish swap (BuildMyPOD → pod-tee) still pending user manual action in Shopify admin. All code pushed to `origin/feat/pdp-perf-pareto`.
