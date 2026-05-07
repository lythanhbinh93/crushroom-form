# Pod Bundle Function Plan Locked

**Date**: 2026-05-07 16:36
**Severity**: Medium
**Component**: Dopamiles POD Tee Store — Discount Engine
**Status**: Planned (4 phases, ready for Phase 01 implementation)

## What Happened

Brainstorm + planning session to solve low AOV on Dopamiles POD-tee Shopify store. Designed a quantity-tier + mix-and-match 3-pack bundle mechanic, locked all critical decisions, created 4-phase implementation plan with cross-plan updates. No code shipped.

## Key Decisions

- **Mechanic**: Quantity tier discount (2→15%, 3→25%) + mix-and-match 3-pack picker on `/pages/3-pack`
- **Discount engine**: Shopify Product Discount Function (Rust), enforced server-side. Skip Cart Transform v1.
- **Eligibility**: Curated `bundle-eligible` collection; collection ID stored in shop metafield
- **Tier config**: Shop metafield JSON `bundles.tiers`, edited via custom Polaris admin page
- **Free shipping**: $75 threshold (post-discount basis) — intentional gap pushes 2-pack→3-pack upsell
- **Cart grouping**: Line item property `_bundle_id` + Liquid grouping (visual only, no Cart Transform)
- **Stacking**: Non-combinable v1

## Why This Matters

1. **DRY win**: Single Discount Function handles both surfaces (quantity tier + 3-pack picker produce 2-3 line items; same rule covers both)
2. **YAGNI win**: Dropped Cart Transform v1 — POD provider routing risk + display nicety not worth dev cost
3. **Upsell ladder**: Free-shipping gap at $75 (post-discount) creates strongest single-message conversion push for 2-pack carts: "Add a 3rd → free shipping + bigger discount"
4. **Cross-plan supersession**: Discovered `pod-tee-product-page` Phase 04 was in-progress on bundle UI side; this plan supersedes its discount-engine half

## Open Questions (Next Session Blockers)

1. Confirm Rust as Function language (or TypeScript fallback)
2. Shopify app distribution model: custom app vs. public app
3. Printify integration: real-time variant sync or batch import for bundle-eligible subset?
4. 3-pack picker UX: product carousel vs. grid vs. searchable modal
5. Admin tier editor: inline JSON input vs. form builder
6. Metafield storage: single `bundles` root or separate `bundle.tiers` + `bundle.collection_id`?

## Artifacts Created

- `plans/reports/brainstorm-260507-1636-pod-bundle-function.md` (user-approved brainstorm)
- `plans/260507-1636-pod-bundle-function/` plan directory:
  - `plan.md` (overview + unresolved Qs)
  - `phase-01-shopify-app-and-discount-function.md`
  - `phase-02-admin-polaris-page.md`
  - `phase-03-theme-integration-banner-and-cart.md`
  - `phase-04-3pack-picker-and-cart-grouping.md`
- Cross-plan updates:
  - `plans/260506-2236-pod-tee-product-page/plan.md` (marked Phase 04 superseded)
  - `plans/260507-1306-dopamiles-full-theme-port/plan.md` (noted bundle function as peer)

## Lesson

Brainstorm-to-plan token efficiency: thorough brainstorm eliminated need for researcher spawns. Planner moved directly to structure. Saved meaningful token budget without cutting decision rigor.

**Status**: DONE
**Summary**: `d:\github local\crushroom-form\docs\journals\260507-pod-bundle-function-planned.md`
