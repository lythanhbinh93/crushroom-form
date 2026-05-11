# Code Review — Phase 03 Bug C (Collection Card Image)

**File:** `sections/dopamiles-collection-grid.liquid`
**Diff:** +9 / -13 (720 → 716 LOC, single file)
**Branch:** `feat/bug-fix-sprint`
**Scope:** Image source swap + low-stock ribbon hardening

## Severity Score

**1 / 10** — Single-file targeted patch, no critical/major issues. Ship.

## Findings

### Critical
None.

### Major
None.

### Minor
None.

### Nit

**N1. `featured_image.alt` already escaped by Liquid context** — `sections/dopamiles-collection-grid.liquid:245`
- The expression `{{ product.featured_image.alt | default: product.title | escape }}` applies `escape` to the entire defaulted value, which is correct. However Shopify's `image.alt` is plain text (not HTML), and `product.title` correctly gets escaped via the filter chain. No action needed — this matches the snippet at `dopamiles-product-card.liquid:21` and is XSS-safe.
- Note: snippet uses `card_product.featured_image.alt | escape` (no title fallback). Grid uses richer fallback. Acceptable divergence.

## Verification

### Bug C fix (audit item #6) — VERIFIED
- Old: `product.variants.first.featured_media | default: product.featured_image` — unstable because variant order in storefront ≠ admin "selected" image.
- New: `product.featured_image` — Shopify's documented "Product Image" field, which the merchant controls explicitly in the product editor (set by clicking the star/selecting in admin). Matches the same pattern in `snippets/dopamiles-product-card.liquid:18-21`, achieving consistency across the theme.

### Low-stock ribbon hardening (audit item #19) — VERIFIED
- Old: `product.variants.first.inventory_quantity > 0 and ... <= 5` fired on products with inventory tracking disabled (where `inventory_quantity` defaults to `0` or `1` depending on Shopify quirks) producing false "Low" ribbons.
- New: gates on `lv.inventory_management == 'shopify'` before reading qty. Uses `selected_or_first_available_variant` (avoids sold-out first variant skewing signal).
- If/elsif/else chain evaluates correctly:
  - `bestseller` tag → "Bestseller" coral ribbon ✓
  - `new` tag → "New" ribbon ✓
  - `available == false` → "Sold out" ribbon ✓
  - else branch: enters variant lookup; only assigns "Low" if all 4 conditions met (available, mgmt=shopify, qty 1-5)
  - else (no condition met inside) → ribbon_label stays blank (initialized line 218) → ribbon `<span>` skipped at line 252 ✓

### Liquid balance — VERIFIED
- `if`/`endif`: 35 / 35 (counted)
- `comment`/`endcomment`: 23 / 23 (counted)
- New nested `{%- else -%}` → `{%- if ... -%}` → `{%- endif -%}` → outer `{%- endif -%}` is well-formed.

### No-image regression — VERIFIED
- When `product.featured_image` is null, the entire `<img>` is skipped (line 242 guard). The surrounding `.doc-pcard-img` div still renders ribbon (252), bundle pill (257), and quick-add button (259-265). No empty img tag, no broken alt, no layout collapse (CSS likely sizes `.doc-pcard-img` independently — visual confirmation recommended in QA but no code-level risk).

### Scope isolation — VERIFIED
- `git diff --stat` confirms single file, +9/-13. Untracked unrelated files in repo, but no other modifications.
- Globo siblings (quick-add, bundle pill) inside `.doc-pcard-img` untouched.

## Sign-off

**Ship.**

The diff matches the phase plan exactly, is consistent with the existing snippet pattern, fixes both audit items cleanly, and introduces no regressions. Recommended QA: smoke-check one collection grid in preview to confirm cards without `featured_image` still render quick-add + ribbon without visual breakage (CSS-level, not code-level).

## Unresolved Questions

- None.

---

**Status:** DONE
**Summary:** Single-file Phase 03 patch is clean — `product.featured_image` swap + `inventory_management == 'shopify'` gate are both correct, liquid balances, no regressions.
**Sign-off:** ship
