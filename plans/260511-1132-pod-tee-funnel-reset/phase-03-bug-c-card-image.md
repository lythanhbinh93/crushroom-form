# Phase 03 — Bug C Fix: Collection Card Image

**Status:** code-complete (smoke-deferred 2026-05-11)
**Owner:** code
**Effort:** S (1h)
**Depends on:** Phase 02

## Goal
Kill `variants.first.featured_media` in collection-grid card. Use `product.featured_image` to match merchant intent and unify with the 5 home-page card paths (which already use the snippet that uses `featured_image`).

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 6 | P0 | sections/dopamiles-collection-grid.liquid:245 | `product.variants.first.featured_media` — variants order is merchant-input-driven and unstable; first variant may be the wrong color | Switch to `product.featured_image` (matches Sloth + internal snippet) |
| 19 | P1 | sections/dopamiles-collection-grid.liquid:228 | `product.variants.first.inventory_quantity <= 5` — same `variants.first` instability; `inventory_quantity` undefined when `inventory_management != 'shopify'` | Use `product.selected_or_first_available_variant.inventory_quantity` AND gate on `inventory_management == 'shopify'` |

## Files
| Path | Change |
|---|---|
| sections/dopamiles-collection-grid.liquid | edit — fix line 245 image expression + line 228 low-stock guard |

## Steps
1. Replace line 245 `assign card_img = product.variants.first.featured_media | default: product.featured_image` with direct `product.featured_image` usage.
2. Update `<img>` `src=` / `alt=` to read from `product.featured_image` (matching `snippets/dopamiles-product-card.liquid:18-20`).
3. Replace line 228 low-stock guard:
   - `{% assign v = product.selected_or_first_available_variant %}`
   - `{% if v.inventory_management == 'shopify' and v.inventory_quantity > 0 and v.inventory_quantity <= 5 %}` → low ribbon
4. Bump build-tag.

## Gate (real iPhone verification)
- Open `/collections/all` on iPhone. Every card shows the merchant's intended featured photo (Shopify admin → product → media section "selected").
- Spot-check 5 products. None display a wrong color/angle.
- "Low" ribbon only appears on products where `inventory_management == 'shopify'` AND `inventory_quantity <= 5`. No false positives.
- Build-tag visible, bumped.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores `variants.first.featured_media`.

## Risks
| Risk | Mitigation |
|---|---|
| Merchant intentionally relies on variant-first photo on some product | Open Q #1 in audit; if confirmed, scope per-product via tag — defer to round-4 |
| `featured_image` is missing on a draft/legacy product | Liquid `{% if product.featured_image %}` guard around `<img>` (currently absent; add it) |
| `selected_or_first_available_variant` shifts low-stock ribbon visibility | Acceptable — current state was already non-deterministic |

## Shipped

**Diff:** 9 insertions, 13 deletions in `sections/dopamiles-collection-grid.liquid` (720 → 716 LOC).

**Backlog items resolved:**
- #6: `variants.first.featured_media` → `product.featured_image` per merchant intent and Sloth reference pattern
- #19: Low-stock ribbon now gates on `inventory_management == 'shopify'` AND `inventory_quantity <= 5`; uses `selected_or_first_available_variant` instead of unstable `variants.first`

**Code review:** [code-reviewer-260511-1418-phase-03-card-image.md](../reports/code-reviewer-260511-1418-phase-03-card-image.md)
- Severity: 1/10
- Findings: 0
- Verdict: SHIP

**Liquid balance:** if/endif 35/35, comment/endcomment 23/23 ✓

**Halt-rule gate:** Real-iPhone smoke verification (user-side) — pending
- Every card on `/collections/all` displays merchant-intended hero photo
- "Low" ribbon gates on tracked products with inventory_quantity 1-5 only
- Build-tag bumped and visible
