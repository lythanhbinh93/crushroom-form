# Phase 01 — Shopify Admin tasks (parallel, user)

**Owner:** user (in Shopify Admin UI + optionally GraphiQL)
**Bugs fixed:** #1 (footer dup), #5 (Globo conflict), #11 (3-pack 404), #19a (template assignment)
**Effort:** ~30 min
**Status:** in-progress
**Depends on:** none — runs parallel with Phase 02-04 (which are now COMPLETE)

## Goal

Fix 4 bugs that don't require touching theme code. Run in parallel with code work in Phases 02-04 to save 30 min.

## Tasks

### Task 1.1 — Footer menu binding (Bug #1)

**Symptom:** SHOP / HELP / DOPAMILES columns all show identical Privacy/Shipping/Terms/Refund links.

**Steps:**
1. Shopify Admin → Online Store → Navigation → Add menu
2. Create 3 distinct menus:
   - **`footer-shop`** items: All Tees (`/collections/all`), By Niche (`/collections/all` or each sub-collection), 3-Pack (`/pages/three-pack`)
   - **`footer-help`** items: Track Order (`/pages/track-order` or external link), Contact (`/pages/contact`), Shipping Policy (`/policies/shipping-policy`), Returns/Refund (`/policies/refund-policy`)
   - **`footer-dopamiles`** items: About (`/pages/about` if exists else create), Story / Why we exist (`/pages/why-we-exist` if exists), Press / Reviews (optional), Contact again
3. Theme customizer → footer section → bind each column to its respective menu
4. Save theme

**Verification:** Refresh `/collections/all` on preview, scroll to footer, confirm 3 columns show distinct content.

### Task 1.2 — Create `/pages/three-pack` (Bug #11)

**Symptom:** `/pages/three-pack` returns 404; template `page.three-pack.json` exists in theme but no page configured.

**Steps:**
1. Shopify Admin → Online Store → Pages → Add page
2. Title: `3-Pack` (or `3-Pack Bundle` / `Pick Your 3-Pack` — match brand voice)
3. URL handle: `three-pack`
4. Right sidebar → Theme template → select `page.three-pack`
5. Visibility: Visible
6. Save

**Verification:** `/pages/three-pack?preview_theme_id=158279991548` renders the 3-pack picker, not the 404 page.

### Task 1.3 — Bulk product template audit + reassignment (Bug #19a)

**Symptom:** Some products (confirmed: `Fastest Pace`) fall back to Dawn default instead of `dopamiles-tee`.

**Steps:**

**Option A — GraphQL audit (recommended if you have admin access):**
1. Shopify Admin → Apps → Shopify GraphiQL App (install if needed) — OR — Shopify Bulk Product Editor / Matrixify
2. Run query:
   ```graphql
   query {
     products(first: 250) {
       edges {
         node {
           handle
           title
           templateSuffix
         }
       }
     }
   }
   ```
3. Filter results: any node with `templateSuffix == null` or `templateSuffix == "default"` is broken
4. For each broken product, run mutation OR manually edit:
   ```graphql
   mutation {
     productUpdate(input: { id: "gid://shopify/Product/XXX", templateSuffix: "dopamiles-tee" }) {
       product { id handle templateSuffix }
       userErrors { field message }
     }
   }
   ```

**Option B — Manual one-by-one (if ≤5 affected):**
1. Shopify Admin → Products → open each affected product (start with `Fastest Pace`)
2. Right sidebar → Theme template → change to `dopamiles-tee`
3. Save
4. Repeat

**Option C — Bulk Editor (if 5-30 affected):**
1. Shopify Admin → Products → select all affected → Bulk edit → Theme template → set to `dopamiles-tee` → Save

**Verification:** Visit `/products/fastest-pace?preview_theme_id=158279991548`, confirm `<section class="dopamiles-product-hero">` renders + variant pickers visible.

### Task 1.4 — Globo Product Options config (Bug #5)

**Symptom:** Globo app injects empty Color + Size text fields below native swatches/pills.

**Steps:**
1. Shopify Admin → Apps → Globo Product Options (or whichever Globo app variant is installed)
2. Find option-level toggle: "Hide for products with native variants" / "Use theme native variants" / "Skip these option names"
3. Either:
   - Disable Globo for `Color` and `Size` option names entirely, OR
   - Configure Globo to skip products that have these as native Shopify variants
4. Save
5. Hard-refresh PDP on preview

**Fallback if Globo tier doesn't allow this:** Tell me — I'll add CSS `.globo-options-fields, [class*="globo"][class*="options"] { display: none; }` to `dopamiles-shared.css` in Phase 02 as a CSS-only mute. Less clean but ships.

**Verification:** PDP `/products/5k-route-t-shirt?preview_theme_id=...` no longer shows the two empty input fields below the size pills.

## Acceptance criteria

- [ ] Footer 3 columns render distinct menu content
- [ ] `/pages/three-pack` returns the 3-pack picker template
- [ ] All 124 products have `templateSuffix == "dopamiles-tee"` (or audit shows 0 misconfigured)
- [ ] PDP no longer shows duplicate Color/Size text fields from Globo

## Output

Once done, message Claude with:
- Number of products fixed in Task 1.3 (was the count surprising?)
- Whether Globo app config worked or fallback CSS hide is needed
- Any unexpected issues
