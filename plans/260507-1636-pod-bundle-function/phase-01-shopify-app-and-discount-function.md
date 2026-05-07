# Phase 01 — Shopify App + Product Discount Function + Metafield Schema

## Context Links
- Brainstorm: `plans/reports/brainstorm-260507-1636-pod-bundle-function.md` (§4.2, §6, §10)
- Parent plan: [plan.md](plan.md)
- Related (superseded discount-half): `plans/260506-2236-pod-tee-product-page/phase-04-bundle-builder-quantity-breaks.md`
- Shopify Functions — Product Discount API: https://shopify.dev/docs/api/functions/reference/discounts-allocator
- Function metafield input: https://shopify.dev/docs/api/functions/input-output/metafields

## Overview
- **Priority:** P1 (foundation — all other phases depend on this)
- **Status:** pending
- **Effort:** 3-5 days
- **Description:** Stand up new Shopify app (Remix template). Generate Product Discount Function. Function reads tier config + eligible-collection ID from shop metafields and applies % discount to qualifying line items. Deploys to dev store with smoke test at checkout.

## Key Insights
- Fresh app scaffold (no existing app to extend) — half-day setup at top of phase
- Function runs as WASM on Shopify infra; **Rust** recommended (faster cold start than JS) — confirm with user before scaffold
- Tier values + eligible collection live in **shop metafields** so admin can tune without redeploy
- **Fail-safe required:** malformed metafield JSON → return zero discount targets, never throw at checkout
- Discount class: **non-combinable** with codes — set in `shopify.extension.toml` discount metadata
- Eligibility: count line items whose product belongs to `bundles.eligible_collection_id`; ineligible items don't count toward tier and don't receive discount

## Requirements

**Functional**
- Function input: cart line items (with product ID, variant ID, quantity), shop metafield `bundles.tiers`, shop metafield `bundles.eligible_collection_id`
- Tier rule (default): `[{min: 2, pct: 15}, {min: 3, pct: 25}]` — pick **highest** tier whose `min` ≤ eligible-line-count
- Apply pct discount only to eligible line items (target = product variant)
- Return discount with `discountApplicationStrategy: FIRST` and class `PRODUCT`, non-combinable
- If metafield missing/malformed → return `discounts: []` (no error)
- Ineligible items (not in collection) → unaffected
- Quantity within a single line counts toward tier (e.g. qty=2 of one variant = tier-1 satisfied)

**Non-functional**
- Cold-start <50ms (Rust target)
- WASM bundle size <128KB (Shopify Functions ceiling: 256KB)
- Test fixtures cover: 0 eligible, 1 eligible, 2 eligible, 3 eligible, 4 eligible, mixed eligible+ineligible, malformed metafield, missing metafield
- Deploys via `shopify app deploy` (CLI, not manual upload)

## Architecture

```
Cart calculation
   │
   ▼
┌─────────────────────────────────┐
│  Product Discount Function      │
│  extensions/bundle-discount/    │
│  ┌─────────────────────────┐    │
│  │ src/run.rs              │    │
│  │  1. parse metafield JSON│    │
│  │  2. count eligible lines│    │
│  │  3. select tier (max)   │    │
│  │  4. build discount[]    │    │
│  │  5. fail-safe wrap      │    │
│  └─────────────────────────┘    │
│  input.graphql                  │
│  shopify.extension.toml         │
└─────────────────────────────────┘
   │
   ▼
Discount applied at checkout (server-side, real)
```

**Metafield schema (v1):**
```
shop.metafield.bundles.tiers (json):
  [{"min": 2, "pct": 15}, {"min": 3, "pct": 25}]
```

**Eligibility (pivot):** products tagged `bundle-eligible`. Tag hardcoded in `input.graphql` because Shopify Functions GraphQL doesn't accept runtime variables for `inCollections(ids:)`. `hasTags(tags: ["bundle-eligible"])` works at query build time. UX equivalent — admins create a Smart Collection filtered by tag for the storefront. Metafield-driven tag override deferred (low value, adds a runtime parse path that has to fail-safe).

**Data flow:** Cart → Shopify runtime → Function (input.graphql query) → Function `run()` → discount targets → checkout total recalculated.

## Related Code Files

**To create (new app repo `D:\github local\dopamiles-bundle-app`):**
- `shopify.app.toml` — app config, scopes (`read_products`, `read_discounts`, `write_discounts`)
- `extensions/bundle-discount/shopify.extension.toml` — function config, discount class non-combinable
- `extensions/bundle-discount/src/run.rs` — Function logic (Rust)
- `extensions/bundle-discount/src/lib.rs` — module entry
- `extensions/bundle-discount/Cargo.toml` — Rust deps (`shopify_function`, `serde`, `serde_json`)
- `extensions/bundle-discount/input.graphql` — fetch metafields + cart lines
- `extensions/bundle-discount/tests/fixtures/*.json` — input fixtures (8 cases)
- `extensions/bundle-discount/tests/run.test.rs` — unit tests
- `app/shopify.server.ts` — auth setup (Remix template default)
- `package.json` — Remix template baseline
- `README.md` — local dev + deploy instructions

**To modify (existing repo):**
- None this phase (admin UI is Phase 02; theme is Phase 03)

**To create (in `crushroom-form` for tracking):**
- None — code lives in app repo

## Implementation Steps

1. **Confirm Function language** with user (Rust vs JS). Default Rust.
2. `shopify app init` in `D:\github local\dopamiles-bundle-app` — pick Remix template, link to Dopamiles dev store
3. `shopify app generate function` → pick `product_discounts` API → name `bundle-discount` → language Rust
4. Edit `extensions/bundle-discount/input.graphql`:
   - query `cart.lines.merchandise.__typename`, `... on ProductVariant { id, product { id, inCollection(id: $collectionId) } }`, `quantity`
   - query `shop.tiersMetafield: metafield(namespace: "bundles", key: "tiers") { value }`
   - query `shop.collectionMetafield: metafield(namespace: "bundles", key: "eligible_collection_id") { value }`
5. Implement `src/run.rs`:
   - Parse `tiersMetafield.value` as `Vec<{min, pct}>` — on error, return empty discount
   - Read `collectionMetafield.value` — on missing, return empty discount
   - Sum quantity of lines where `merchandise.product.inCollection == true`
   - Select tier with highest `min` ≤ sum
   - Build `Vec<Discount>` with `targets: ProductVariant{id, quantity}` for each eligible line
   - Wrap entire function body in fail-safe match → log + return empty on any panic-equivalent
6. Set `shopify.extension.toml` discount class to `[[extensions.targeting]] target = "purchase.product-discount.run"`, `combines_with = { product_discounts = false, order_discounts = false, shipping_discounts = true }`
7. Write 8 test fixtures in `tests/fixtures/`:
   - `00-empty-cart.json`, `01-one-eligible.json`, `02-two-eligible.json`, `03-three-eligible.json`, `04-four-eligible.json`, `05-mixed.json`, `06-malformed-metafield.json`, `07-missing-metafield.json`
8. `shopify app function run --path extensions/bundle-discount --input tests/fixtures/02-two-eligible.json` for each fixture; assert expected discount %
9. Seed Dopamiles dev store metafields (manually via admin or GraphQL) with default tiers + test collection ID
10. `shopify app deploy` to push function version + activate
11. **Smoke test at checkout:** add 1 tee → no discount. Add 2 → 15% off. Add 3 → 25% off. Add a non-eligible item alongside → still works.

## Todo List

- [ ] Confirm Function language with user (Rust vs JS)
- [ ] `shopify app init` new Remix app, link to Dopamiles dev store
- [ ] `shopify app generate function` — product_discounts, Rust
- [ ] Write `input.graphql` (cart lines + 2 metafields)
- [ ] Implement `src/run.rs` (parse, count, select tier, build discount, fail-safe)
- [ ] Configure `shopify.extension.toml` (non-combinable with code/order discounts)
- [ ] Create 8 test fixtures
- [ ] Run `shopify app function run` against all fixtures, all pass
- [ ] Seed shop metafields on dev store (defaults + test collection)
- [ ] `shopify app deploy`
- [ ] Smoke-test 5 checkout scenarios (1, 2, 3 eligible; mixed; ineligible-only)
- [ ] Document local dev + deploy in README.md

## Success Criteria

- All 8 fixture tests pass via `shopify app function run`
- Dev store checkout shows correct discount for each tier
- Malformed metafield does NOT break checkout (fail-safe verified)
- Function deployed and active on Dopamiles dev store
- Cold-start measured <50ms (via `shopify app function run --benchmark` or equivalent)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Function panics on malformed input → checkout breaks | Med | Critical | Wrap `run()` body in `Result` match; default to empty discount; add fixture test 06+07 |
| Metafield collection ID format mismatch (gid vs numeric) | Med | High | Standardize on full GID; validate format in admin UI (Phase 02) |
| Discount class wrong → stacks with codes accidentally | Low | High | Explicit `combines_with = false`; manual test with promo code in cart |
| Cold start exceeds 50ms → checkout latency | Low | Med | Rust over JS; minimize deps; benchmark before deploy |
| Function deploy fails silently (version not active) | Low | Med | Confirm via Partner dashboard "Discount activated" status post-deploy |
| Shopify Functions API version drift | Low | Med | Pin API version in `shopify.extension.toml`; track Shopify changelog |

## Security Considerations

- **Function input validation:** Treat all metafield input as untrusted JSON. Use `serde_json::from_str` with explicit struct; fail-safe on error.
- **No PII in Function:** Function reads only product IDs, collection membership, quantities — no customer data needed.
- **Auth scopes:** App requires `read_products`, `read_discounts`, `write_discounts`; metafield writes happen in Phase 02 (different scope).
- **Discount metadata tampering:** Metafield is shop-scoped; only admin users with metafield-write permission can change tiers. Phase 02 surfaces this safely.
- **Combinability:** Explicit `combines_with` block in extension config — defense against accidental stacking that would break margin.

## Next Steps

- **Blocks:** Phase 02 (admin UI assumes metafield schema from this phase)
- **Blocks:** Phase 03 (theme banner reads `bundles.tiers` metafield seeded here)
- **Follow-ups:** Update `260506-2236-pod-tee-product-page/phase-04` status to reflect Function delivery moved here
