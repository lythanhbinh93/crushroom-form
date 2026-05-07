# Brainstorm — POD Bundle Function (Dopamiles)

**Date:** 2026-05-07
**Store:** Dopamiles (POD graphic-tee, Shopify, Meta-ads driven)
**Repo target:** `pod-tee-theme` (theme) + new Shopify app for Functions
**Status:** Approved — ready for `/ck:plan`

---

## 1. Problem statement

POD tee store on Shopify needs bundle mechanic to **raise AOV**. Meta ad cost fixed; bigger basket = better ROAS. Current state: 1-tee carts dominate, no bundle UX, no bundle discount enforcement.

Constraints:
- POD margin thin (base cost ~50% of price) → discount tiers must be tuned carefully
- Each tee has size + color variants → bundle picker must handle full variant matrix
- POD provider (Printful/Printify) routes per line item by SKU → cannot break line-item structure
- Brand voice = editorial DTC, deadpan humor → 3rd-party app widgets won't match

---

## 2. Requirements (locked from discovery)

| Requirement | Pick |
|---|---|
| Goal | Raise AOV |
| Mechanics | Quantity tier (Buy 2 save 15%, Buy 3 save 25%) **+** Mix & match (pick any 3 from collection) |
| Build vs buy | Custom Shopify Function (own it) |
| Variants | Each item independent — full picker (size + color per slot) |

---

## 3. Approaches evaluated

### A. Quantity tier only — Product Discount Function
- One Function. Reads cart, applies % at threshold. No new template.
- ✅ Ships fast (3-5 days). Auto-applies to all traffic.
- ❌ No Meta-ad hook ("3-pack" angle). Feels like coupon.

### B. Mix-and-match 3-pack page only
- Dedicated `/pages/3-pack` picker. Adds 3 line items + `_bundle_id` property. Function discounts items tagged.
- ✅ Strong Meta-ad creative. Branded UX.
- ❌ 1-2 weeks dev. Picker UI non-trivial.
- ❌ Misses single-tee shoppers who'd add a 2nd organically.

### C. **Both — A as foundation, B as featured experience** (chosen)
- Single Function serves both surfaces. Quantity tier runs always; 3-pack is the cold-traffic landing.
- ✅ DRY (one rule, two front-ends). Catches every scenario.
- ✅ Phase 1 ships value in week 1 even if Phase 2 slips.

### Rejected
- ❌ **3rd-party app** (Bundler, Fast Bundle, Shopify native Bundles) — widget UX off-brand, $15-50/mo lock-in, native Bundles is fixed-only
- ❌ **Liquid-only price math** — breaks at checkout, no real enforcement
- ❌ **Cart Transform Function in v1** — display nicety with real risk to POD provider routing; defer

---

## 4. Recommended solution

### 4.1 Architecture

```
Front-end (theme)              Function (Shopify app)        Checkout
─────────────────              ──────────────────────        ────────
PDP banner                ─┐
Collection card badges    ─┤
/pages/3-pack picker      ─┴──→  Product Discount Function ──→ real %
                                  reads metafield               applied
                                  bundles.tiers (JSON)          server-side
Cart drawer grouping (Liquid)
  via _bundle_id line property
```

### 4.2 Components

| Component | Lives in | Tech |
|---|---|---|
| Product Discount Function | New Shopify app | Rust or JS via Shopify CLI; runs WASM on Shopify infra |
| Tier config | `shop.metafield.bundles.tiers` | JSON: `[{min:2,pct:15},{min:3,pct:25}]` — editable in admin without redeploy |
| PDP/collection banner | `pod-tee-theme` snippet | Liquid; reads same metafield for copy parity |
| `/pages/3-pack` picker | `pod-tee-theme` section | Liquid + JS; localStorage for slot state |
| Cart drawer grouping | `pod-tee-theme` cart-drawer template | Liquid groups items by `_bundle_id` line property |

### 4.3 Key decisions

| Decision | Pick | Rationale |
|---|---|---|
| Discount mechanism | Product Discount Function (not Cart Transform) | Real enforcement; Cart Transform risks POD routing |
| Tier source | Shop metafield JSON | Tune without redeploy |
| Picker location | Dedicated `/pages/3-pack` (not PDP variant) | Clean Meta-ad target, separate attribution |
| Stacking with codes | **No** in v1 | Margin protection (POD base cost) |
| Bundle visual grouping | `_bundle_id` line item property + Liquid | No Cart Transform risk; reversible |
| Free-shipping threshold | Post-discount subtotal | Accept slight regression vs add stacking edge cases |

### 4.4 Phasing

| Phase | Deliverable | Time | Ships |
|---|---|---|---|
| 1 | Function + metafield + PDP/collection banner + cart line for "Buy 2/3 save X%" | 3-5 days | Quantity tier live store-wide |
| 2 | `/pages/3-pack` picker + cart drawer grouping | 5-7 days | Meta-ad landing experience |
| 3 *(optional)* | Cart Transform Function for true grouped parent line | 3-5 days | Defer until data proves need |

Total to "real bundle that converts": ~2 weeks. Phase 1 is independently shippable.

---

## 5. UX surfaces (ASCII mockups confirmed in brainstorm)

1. **PDP banner** — strip above ATC; "Add a 2nd tee — save 15% / Make it a 3-pack — save 25%" with CTA to `/pages/3-pack`
2. **3-pack picker** — 3 slot cards (image, size dropdown, color swatches, change link) + browse rail + sticky discount summary + single ATC; mobile stacks vertically with sticky bottom CTA
3. **Cart drawer** — items grouped under collapsible "▼ 3-PACK · 3 items · -$25.50" header by shared `_bundle_id`; free-shipping bar reads post-discount subtotal

Mockup style: ASCII for brainstorm; full Figma/HTML deferred to UX team (per `dopamiles-theme-ux-brief.md` §2 — bundle UX is downstream of cart drawer P0).

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| POD provider routing breaks if line items hidden | Phase 1+2 keep separate line items; Phase 3 (Cart Transform) needs routing test before ship |
| Free-shipping threshold interaction | Set threshold against post-discount subtotal; surface clearly in cart |
| Returns / partial refunds | Shopify pro-rata refund handles default case; document for support team |
| Function deploy / dev-store testing flow | Use Shopify CLI dev store; Function tests via `shopify app function run` before deploy |
| Discount stacking with codes | Configure Function discount class as **non-combinable** in v1 |
| Tier metafield typos in admin | Function validates JSON shape; falls back to no-discount if invalid (fail-safe) |

---

## 7. Success metrics

- **Primary:** AOV +20% within 30 days post Phase 1 ship
- **Secondary:** Bundle attach rate (% of carts with ≥2 tees) >40%
- **3-pack page (Phase 2):** Meta ad CVR ≥ standard PDP CVR; bundle complete rate (slots filled → ATC) >60%
- **Guardrail:** Gross margin per order does not drop more than 8pp vs pre-bundle baseline

---

## 8. Out of scope (v1)

- Cart Transform Function (parent/child line items) — Phase 3 if needed
- Welcome-code stacking with bundle discount
- Bundle of mixed product types (tees + other) — tees only v1
- Subscription bundle / "tee of the month"
- Multi-currency bundle pricing — single currency v1

---

## 9. Next steps

1. ✅ Brainstorm approved → this report
2. → Run `/ck:plan` with this report as context to create phased implementation plan
3. → Plan dir: `plans/260507-1636-pod-bundle-function/`
4. → Phase 1 first (quantity tier Function + theme banner)
5. → Loop UX team for picker page mockup before Phase 2 dev kickoff (per Dopamiles brief handoff timeline)

---

## 10. Resolved decisions (post-brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Shopify app scaffold | **Fresh** — `shopify app init` Remix template; ~half-day setup in Phase 1 |
| 2 | Eligibility scope | **Curated 'bundle-eligible' collection** — Function reads collection ID from metafield `bundles.eligible_collection_id`; eligible items counted against tiers |
| 3 | Tier breakpoints | **2→15%, 3→25%** locked; metafield default ships with these values |
| 4 | Free-shipping threshold | **$75, post-discount basis** — keep current $75; 3-pack ($76.50 net) clears free shipping, 2-pack ($57.80) does not. Gap is intentional upsell ("Add a 3rd → free shipping + bigger discount") |
| 5 | POD provider | **Printify** — SKU-based routing; Phase 1+2 unaffected; Phase 3 Cart Transform requires Printify routing test before ship |
| 6 | Admin UI | **Custom app admin page** (Polaris components) — adds **Phase 1.5** (~2-3 days) between Function ship and theme banner; replaces raw metafield editing |

### Updated phasing

| Phase | Deliverable | Time |
|---|---|---|
| 1 | Shopify app scaffold + Product Discount Function + metafield schema (`bundles.tiers`, `bundles.eligible_collection_id`) | 3-5 days |
| **1.5** | **Custom app admin page (Polaris) for tier + eligible-collection editing** | **2-3 days** |
| 2 | PDP/collection banner + cart line discount display + free-shipping bar (post-discount) | 2-3 days |
| 3 | `/pages/3-pack` picker + cart drawer grouping via `_bundle_id` | 5-7 days |
| 4 *(optional, deferred)* | Cart Transform Function — only after Printify routing validation | 3-5 days |

Total to "real bundle that converts": **~12-18 days** (Phase 1 → 3). Phase 4 deferred indefinitely.

### Headline bundle UX message (cart drawer + PDP)

- Customer with 1 tee: "Add a 2nd tee — save 15%"
- Customer with 2 tees: "Add a 3rd — save 25% **and** get free shipping" *(both incentives in one CTA — strongest possible)*
- Customer with 3+ tees: silent; "Bundle saving applied · -$X · Free shipping" confirmation only
