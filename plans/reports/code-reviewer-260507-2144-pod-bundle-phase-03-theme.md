# Code Review — POD Bundle Phase 03 (Theme Integration)

**Date:** 2026-05-07 21:57
**Repo:** `D:\github local\pod-tee-theme` branch `feat/bundle-function`
**Phase spec:** `plans/260507-1636-pod-bundle-function/phase-03-theme-integration-banner-and-cart.md`
**Scope:** 4 new snippets + 1 CSS + 4 modified sections (~430 LOC)

## Score: 5 / 10

Architecture sound, copy/state-machine logic clean, accessibility+XSS solid. **Blocking bug:** shared tier helper uses `{% render %}` scope-isolated assigns — consumers will render BLANK percentages in production. Must refactor before merge.

---

## Critical (BLOCKING)

### C1. Shared `dopamiles-bundle-tiers.liquid` is broken — render scope isolation

**File:** `snippets/dopamiles-bundle-tiers.liquid` and all 3 consumers

**Problem:** The helper assigns `bundle_tier_2_pct`, `bundle_tier_3_pct`, `bundle_top_pct` inside a snippet rendered via `{% render %}`. Shopify Liquid `{% render %}` creates an **isolated scope** — assigns inside the snippet **do not propagate** to the calling template.

Consumers do:
```liquid
{%- render 'dopamiles-bundle-tiers' -%}
... save <b>{{ bundle_tier_2_pct }}%</b>      ← renders ""
```

Output in production: `Add a 2nd tee, save <b>%</b>` — empty bold tags, no number. Same bug in cart-headline and collection-pill.

This affects the **fallback path too** — even if metafield missing, defaults `15` / `25` are scoped to the snippet and never reach the consumer. So the "graceful fallback before Phase 01 deploy" promise is broken at every render.

**Source:** [Shopify Liquid render docs](https://shopify.dev/docs/api/liquid/tags/render) — "Outside a snippet or app block, you can't access variables created inside the snippet or app block."

**Fix options (pick one):**

1. **Inline the helper** in each of the 3 consumers (15-line liquid block). Violates DRY but works; smallest diff.
2. **Convert helper to capture-able output** — return a JSON string the consumer parses, or render markup directly (helper takes a `mode:` arg). Heavier refactor.
3. **Use a section snippet pattern** — pre-compute in each section's top-level liquid (where `cart`/`product` are available) before the snippet calls. Cart drawer and product hero have access; collection grid card already runs in a `for` loop, easy to pre-assign per-card.
4. **Hoist to a single global render in `theme.liquid`** — won't work; render scope still isolated even at layout level.

**Recommended:** Option 1 (inline). The helper is only 15 lines, used in 3 places. Simpler than option 2 callbacks. Aligns with KISS.

**Verification gate:** Render a PDP locally with a bundle-eligible product and `shop.metafields.bundles.tiers` BLANK — banner copy must show "save 15%" / "save 25%", not "save %". Repeat at cart drawer with 1 eligible item, and collection grid card.

---

## High

### H1. CSS tokens `--dop-paper` and `--dop-radius` don't exist

**File:** `assets/dopamiles-bundle.css` lines 20, 22, 97

```css
background: var(--dop-paper, #f6f3ec);   ← --dop-paper is NOT defined
border-radius: var(--dop-radius, 8px);   ← --dop-radius is NOT defined
```

Tokens defined in `snippets/dopamiles-tokens.liquid` use `--dop-page` (#FAFAFA) and `--dop-r` (8px). The fallback values silently mask the bug — banner renders fine today, but:
- If merchant changes `dop_paper` setting expecting banner to follow, banner won't update.
- Visual drift: bundle banner uses #f6f3ec (warm cream), but the rest of the theme uses #FAFAFA (cold off-white). Inconsistent surface.

**Fix:** rename to existing tokens:
```css
background: var(--dop-page, #FAFAFA);
border-radius: var(--dop-r, 8px);
```

Also affects `.dop-bundle-cart-headline` (line 97 same `--dop-paper`).

---

## Medium

### M1. `dopamiles-bundle-tiers.liquid` doesn't validate `tier.pct` is numeric

**File:** `snippets/dopamiles-bundle-tiers.liquid` line 28-33

If Phase 02 validator regresses or admin uploads malformed JSON via Shopify CLI, `tier.pct` could be `"15%"` (string with suffix). Liquid would render `save 15%%` (double percent). Phase 02 validator is Phase 02's responsibility, but defense-in-depth at display layer is cheap.

**Fix:** add `| times: 1` to coerce or `if tier.pct > 0` check. Optional given Phase 02 already validates.

### M2. Tier ordering assumption — only `min == 2` and `min == 3` recognized

**File:** `snippets/dopamiles-bundle-tiers.liquid` line 28-33

If Phase 01/02 ever add a 4-pack tier (`min: 4, pct: 30`), helper silently ignores it. `bundle_top_pct` remains 25, collection pill says "Save up to 25%" while Function applies 30%. Drift between storefront copy and checkout.

**Fix:** iterate dynamically — find max `pct` across all tiers regardless of `min`:
```liquid
for tier in tiers_value
  if tier.pct and tier.pct > bundle_top_pct
    assign bundle_top_pct = tier.pct
  endif
  if tier.min == 2 ...   ← keep specific assigns for banner copy
endfor
```

Lower priority since plan scope is fixed at 2-pack/3-pack, but cheap future-proofing.

### M3. Cart-headline counts QUANTITIES, not unique line items — semantic mismatch with Function?

**File:** `snippets/dopamiles-bundle-cart-headline.liquid` line 26

Snippet uses `assign eligible_qty = eligible_qty | plus: item.quantity`. This means 1 line × qty 3 → "3+ eligible" silent state. Need to confirm **Phase 01 Function uses the same counting rule** (sum of quantities, not distinct line count). If Function counts distinct lines, headline drifts: shopper sees "Bundle saving applied" but checkout shows no discount.

**Recommendation:** confirm with `dopamiles-bundle-app/extensions/.../run.ts` that `inputs.cart.lines.reduce((acc, l) => acc + l.quantity, 0)` matches headline. If Function counts distinct lines, change `| plus: item.quantity` to `| plus: 1`.

---

## Low

### L1. `data-eligible-qty` attribute unused

**File:** `snippets/dopamiles-bundle-cart-headline.liquid` line 32

Attribute exposed but no JS reads it. Either wire JS for live updates after AJAX cart mutations (cart drawer re-renders via fetch), or drop the attribute. Recommend keeping — useful breadcrumb for future JS hook + harmless now.

### L2. Eligibility tag check inconsistency — banner uses `is_bundle_eligible` flag, others inline

**File:** `dopamiles-bundle-banner.liquid` lines 14-19 vs `dopamiles-bundle-collection-pill.liquid` line 13

Banner does the check via intermediate `is_bundle_eligible = false` then `if … contains 'bundle-eligible'`. Pill does it inline. Both correct; just inconsistent style. Pick one. The pill's pattern (inline `{%- if product.tags contains 'bundle-eligible' -%}`) is shorter and idiomatic.

### L3. SVG inside flex `<p>` — semantically odd

**File:** `dopamiles-bundle-cart-headline.liquid` line 49-51

A `<p>` set to `display:flex` with an inline `<svg>` child is semantically a paragraph containing a checkmark glyph. Works, screen-reader-safe (svg has `aria-hidden="true"`), but a `<div>` would be more idiomatic for icon+text patterns. Cosmetic.

### L4. Bundle-banner CTA `&rarr;` arrow has no fallback for screen readers

**File:** `dopamiles-bundle-banner.liquid` line 38

```liquid
<a href="/pages/3-pack" class="dop-bundle-banner-cta">
  Build a 3-pack
  <span aria-hidden="true">&rarr;</span>
</a>
```

`aria-hidden` correctly hides the arrow. Good. (Listed for visibility, no fix needed.)

---

## Edge Cases (Scout)

| Scenario | Behavior | OK? |
|---|---|---|
| Metafield missing entirely | C1 bug → blank `%` | NO — blocking |
| Metafield blank string | C1 bug → blank `%` | NO — blocking |
| Metafield malformed (object instead of array) | `for tier in tiers_value` no-ops, defaults stay (but stuck in snippet scope) | NO — blocking due to C1 |
| Cart with mix of eligible + non-eligible items | Counts only eligible | OK |
| Cart with single eligible line × qty 3 | Triggers "3+" silent state | Maybe — see M3 |
| Product has both `bundle-eligible` tag AND uses `dopamiles-bundle-inline.liquid` (kit picker) | Both render — banner above ATC, kit picker below | OK if intended; banner CTA `/pages/3-pack` and kit picker may confuse shoppers (two CTAs). Spec section "Next Steps" flagged this. |
| Mobile viewport 375px | Banner stacks (CSS `@media (max-width: 600px)` flex-direction: column) | OK — verified in CSS |
| Collection card pill positioning | Parent `.doc-pcard-img` has `position: relative` (line 329 of collection.css) — pill `position: absolute` will anchor correctly | OK |
| RTL languages | `&rarr;` arrows hardcoded LTR | Out of scope per spec (i18n future) |
| Settings reset (no `dop_paper` set, only setting absent) | H1 fallback triggers, but inconsistent surface color | Med |

---

## Positive Observations

- Tag-gating eligibility (vs collection check) correctly mirrors Phase 01 Function — single source of truth, no drift.
- All metafield interpolation uses default Liquid escaping (no `| raw`) — XSS-safe.
- Cart-drawer headline correctly placed inside `cart.item_count > 0` guard.
- `<aside>` with `aria-label`, real `<a href>` CTA, `aria-hidden` on decorative SVG — accessibility done right.
- Free-ship bar already uses `cart.total_price` (line 12, cart-drawer) — phase requirement pre-met, no regression.
- CSS scoped via `.dop-bundle-banner-*` namespace — no collision with existing `.dop-bundle` (kit picker) classes.
- Mobile-first stacking media query is correct.
- File naming follows project kebab-case + descriptive convention.
- Banner only renders for tagged products — non-eligible PDPs see nothing.
- Comments at top of each snippet explain purpose, args, fallback behavior — future-LLM-friendly.

---

## Recommended Actions (priority order)

1. **C1** — Refactor `dopamiles-bundle-tiers.liquid` usage. Recommend inlining the 15-line block in each of the 3 consumers (banner, cart-headline, pill). Delete the helper file. Verify with metafield-blank PDP that "save 15%" / "save 25%" renders.
2. **H1** — Rename `--dop-paper` → `--dop-page`, `--dop-radius` → `--dop-r` in `dopamiles-bundle.css`.
3. **M3** — Cross-check Function quantity-counting rule; align cart-headline if drift exists.
4. **M2** — Generalize `bundle_top_pct` to handle future tiers.
5. **M1** — Add `| times: 1` numeric coercion (optional defensive).
6. **L2** — Optional cleanup, post-merge.

---

## Metrics

- Files changed: 8 (4 new, 4 modified)
- LOC added: ~270 (snippets 158 + CSS 153 - inline-bundle 118 unchanged)
- Type/lint: Liquid no syntax errors (visual scan); recommend `shopify theme check` pre-merge for theme-check warnings on the 4 new snippets.
- Test coverage: N/A (theme — manual QA required, but user opted static-only)
- Accessibility: Pass (aria-label, real anchor, hidden decorative SVG)
- XSS: Pass (no `| raw`, default Liquid escaping)

---

## Unresolved Questions

1. **Function counting rule** — does Phase 01 Function (`dopamiles-bundle-app/extensions/.../run.ts`) sum line quantities or count distinct lines for tier qualification? Affects M3.
2. **Banner + kit-picker coexistence** — if a product has both `bundle-eligible` tag AND uses `dopamiles-bundle-inline.liquid`, shoppers see two CTAs (banner → /pages/3-pack vs kit picker on same PDP). Intended? Spec mentioned coexistence in Phase 04 follow-up.
3. **Pill on already-discounted products** — collection-grid pill renders even if product also has a `compare_at_price` ribbon. Two badges stacked. Visually crowded but spec-allowed; flag for design review.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Reviewed Phase 03 theme integration. Found one blocking bug (render scope isolation breaks all 3 consumers of shared tiers helper — fix before merge) and one high-priority CSS token mismatch. Architecture, accessibility, and XSS posture are solid; refactor is small (~30 LOC churn).
