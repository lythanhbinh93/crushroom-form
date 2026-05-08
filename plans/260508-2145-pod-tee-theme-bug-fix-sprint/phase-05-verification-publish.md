# Phase 05 — Verification + publish

**Owner:** both (Claude runs automated tests; user smoke-tests on real iPhone + clicks publish)
**Effort:** ~30 min
**Status:** in-progress (pending Phase 01 completion)
**Depends on:** Phases 01, 02, 03, 04 all complete

## Goal

Confirm all 19 in-scope bugs are fixed before publish. No regressions introduced. Theme ready to go live.

## Steps

### Step 5.1 — Re-run automated test sweep [~10 min, me]

```bash
cd "d:/github local/crushroom-form/plans/reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile"
node comprehensive-sweep.spec.mjs
```

**Compare findings.json before/after:**
- Before: 73 findings (43 a11y + 30 pattern)
- Target after: <15 findings, 0 P0/P1, only known-deferred items remaining

### Step 5.2 — Re-run Lighthouse mobile [~5 min, me]

```bash
npx lighthouse "https://dopamiles.co/?preview_theme_id=158279991548" \
  --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate \
  --output=json --output-path=./lighthouse-home-postfix.json --quiet --chrome-flags="--headless"

npx lighthouse "https://dopamiles.co/products/5k-route-t-shirt?preview_theme_id=158279991548" \
  --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate \
  --output=json --output-path=./lighthouse-pdp-postfix.json --quiet --chrome-flags="--headless"
```

**Targets:**

| Page | Metric | Before | Target |
|------|--------|--------|--------|
| Home | a11y | 0.89 | ≥ 0.95 |
| Home | perf | 1.00 | ≥ 0.95 |
| PDP | CLS | 0.791 | < 0.1 |
| PDP | a11y | 0.89 | ≥ 0.95 |
| PDP | perf | 0.76 | ≥ 0.85 |

### Step 5.3 — Real-iPhone smoke test [~10 min, user]

Open on iPhone Safari: `https://dopamiles.co/?preview_theme_id=158279991548`

Walk through:

1. **Home above-fold** — hero readable, "Shirt." orange italic
2. **Tap hamburger** — drawer opens with dim backdrop behind it
3. **Scroll home → "Shop by niche."** — `niche.` orange italic; product cards black title + gray meta (not blue underlined)
4. **Tap product card** → PDP loads
5. **PDP**:
   - No layout jumping during load (CLS fix)
   - Tap different color swatch → product image swaps
   - Tap different size → price stays correct
   - No empty Color/Size text fields below pills (Globo fixed)
   - Tap "Add to cart" → toast appears "Added — view cart →"
6. **Tap cart icon** → cart page or drawer; item present, qty +/-, checkout button visible
7. **Back to home → tap header search icon** → styled modal opens (not raw text)
8. **Scroll to home newsletter** → "One letter a month. Maybe two." both halves readable on dark bg
9. **Scroll to footer** → 3 distinct columns (SHOP / HELP / DOPAMILES with different content)
10. **Visit `/pages/three-pack`** → 3-pack picker renders (not 404)
11. **Visit `/products/fastest-pace`** → custom dopamiles hero renders with swatches + size pills

### Step 5.4 — axe-core final scan [~5 min, me]

```bash
npx @axe-core/cli "https://dopamiles.co/?preview_theme_id=158279991548" --tags wcag2a,wcag2aa
npx @axe-core/cli "https://dopamiles.co/products/5k-route-t-shirt?preview_theme_id=158279991548" --tags wcag2a,wcag2aa
```

Confirm:
- 0 critical violations
- 0 serious violations
- Only minor/best-practice items remaining (acceptable for ship)

### Step 5.5 — Pre-publish backup [~5 min, user]

Before publishing the new theme:

1. Shopify Admin → Online Store → Themes
2. Find current published theme `buildmypodai-theme`
3. Actions → Duplicate → rename to `rollback-2026-05-08-pre-pod-tee-theme`
4. This is your rollback target if anything breaks post-publish.

### Step 5.6 — Publish [~2 min, user]

1. Shopify Admin → Online Store → Themes
2. Find `dopamiles-bundle-prod-260508` (Draft)
3. Actions → Publish → Confirm
4. Theme is now live on `dopamiles.co`

### Step 5.7 — Live smoke test [~5 min, user]

Repeat Step 5.3 against live URL (no preview_theme_id):
`https://dopamiles.co/`

If anything broken:
- Shopify Admin → Themes → `rollback-2026-05-08-pre-pod-tee-theme` → Actions → Publish
- Message Claude with what broke; we triage hot-fix.

### Step 5.8 — Resume Meta ads [~2 min, user]

If ads were paused during the fix sprint, resume them. Watch for the first 1-2 hours for:
- Conversion rate baseline (any drop?)
- Cart-add events firing in pixel
- No customer support pings about broken pages

## Acceptance criteria

- [ ] axe-core: 0 critical/serious violations on home + PDP (user runs in Step 5.4)
- [ ] Lighthouse mobile PDP: CLS < 0.1, a11y ≥ 0.95 (user runs in Step 5.2)
- [ ] Real-iPhone smoke test: all 11 steps pass (user runs in Step 5.3)
- [ ] Backup theme created (user runs in Step 5.5)
- [ ] Live published, no publish-time errors (user runs in Step 5.6)
- [ ] First 30 min of live traffic: no spike in 4xx/5xx (user monitors in Step 5.7)

## Rollback criteria (if any of these, revert immediately)

- Cart-add fails on live (item doesn't add to cart)
- ATC button broken on >50% of products
- Header / footer renders broken HTML
- Lighthouse perf drops below 0.7 on live PDP
- axe-core scan finds NEW critical violations not in pre-publish list

## Notes

- Step 5.7 (live smoke) is critical — preview != published due to caching, third-party app injection, and live data differences.
- Keep the rollback theme for ≥ 7 days post-publish before deleting.
