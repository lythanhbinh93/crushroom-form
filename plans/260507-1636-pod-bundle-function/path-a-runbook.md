# Path A — Phase 01 Deploy + Phase 03 Validation Runbook

**Date:** 2026-05-08
**Owner:** User (browser + CLI auth required)
**Effort:** 1-2h
**Goal:** Live Function applies bundle discount; theme banner/cart/headline reflects real % from seeded metafield.

## Pre-flight Verified

- ✅ Function compiles (`cargo check --target=wasm32-unknown-unknown --release`)
- ✅ Tag rule: `bundle-eligible` (hardcoded in graphql `hasTags`)
- ✅ Metafield contract: `shop.metafields.bundles.tiers` (JSON, `[{"min":N,"pct":P}]`)
- ✅ Quantity rule: **qty-sum** (Function sums `line.quantity` across eligible lines) — resolves yesterday's Q2
- ✅ Theme snippets all read `shop.metafields.bundles.tiers` (banner/headline/pill consistent)

## Step 1 — Deploy Function

```powershell
cd "D:\github local\dopamiles-bundle-app"
shopify app deploy
```

- Browser auth required on first run (Shopify Partner login)
- Confirms `client_id 0a0674917de5e3c26cf2a3e14be07a7f`
- Wait for "Released to Shopify" success line

## Step 2 — Seed Shop Metafield

In Shopify admin → Settings → Custom data → Shop → Add definition:
- **Namespace + key:** `bundles.tiers`
- **Type:** JSON

Then on the Shop edit page, set value:
```json
[{"min":2,"pct":15},{"min":3,"pct":25}]
```

**Alternative (GraphQL):** Admin GraphQL playground:
```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Shop/<SHOP_GID>",
    namespace: "bundles",
    key: "tiers",
    type: "json",
    value: "[{\"min\":2,\"pct\":15},{\"min\":3,\"pct\":25}]"
  }]) {
    metafields { id key value }
    userErrors { field message }
  }
}
```

## Step 3 — Tag Products

Tag 2-3 tee products with `bundle-eligible`:
- Admin → Products → select product → Tags field → add `bundle-eligible`
- Repeat for 2-3 products to enable testing 1/2/3-pack scenarios

## Step 4 — Create Discount

Admin → Discounts → Create discount → **Custom**:
- Type: **Product discount** (matches Function's `DiscountClass::Product` check)
- Method: **Automatic**
- Function: select **bundle-discount**
- No code, no usage limits, non-combinable
- Save + activate

## Step 5 — Positive QA

| # | Action | Expected |
|---|---|---|
| 1 | Visit PDP of a tagged product | Banner renders with "Save 15% on 2 / 25% on 3" (real % from metafield, not fallback) |
| 2 | Visit collection page | Pill shows on tagged product cards only |
| 3 | Add 1 tagged product (qty 1) to cart | Cart drawer headline: "Add 1 more to save 15%" |
| 4 | Increase to qty 2 | Headline: "You saved 15% — add 1 more for 25%". Discount line appears showing -15% |
| 5 | Add a 3rd tagged item (qty 3 total) | Headline: "Bundle complete — 25% off!". Discount updates to -25% |
| 6 | Mix: 2 tagged + 1 untagged | Discount applies only to 2 tagged lines (15% on 2). Untagged line full price. |

## Step 6 — Smoke Checkout

- Proceed to checkout from each cart state above
- Verify Order Summary shows correct discount amount
- Confirm discount line item label matches Function's `Bundle: save N%` format
- Cancel at payment step (no need to actually pay)

## Step 7 — Sign-off

- ✅ All 6 QA cases pass → Phase 03 promoted to **shipped**
- ❌ Any failure → file issue, do not promote

## Rollback

If Function misbehaves: Admin → Apps → dopamiles-bundle-app → uninstall (or disable the discount). Theme snippets fall back to hardcoded 15%/25% copy automatically.

## Unresolved Going Into Path A

1. **PDP CTA collision** (`dopamiles-bundle-inline.liquid` kit picker + new banner) — observe in QA Step 1; UX call after.
2. **Collection pill + compare_at ribbon stacking on mobile** — observe in QA Step 2.
