# Phase 09 — Copy, Tokens, Locales

**Status:** pending
**Owner:** code
**Effort:** M (2-3h)
**Depends on:** Phase 06 (variant string consumption already moved to external JS)

## Goal
Move hardcoded UI strings to `locales/en.default.json` or section settings. Fix the empty-string-defeats-`default` bug in tokens snippet. Add settings for low-stock copy + return-policy line.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 31 | P2 | sections/dopamiles-product-hero.liquid:121-125 | "Ships in 7 days" hardcoded in 3 places | Section settings `low_stock_text` + `in_stock_text` OR `locales/en.default.json` |
| 32 | P2 | sections/dopamiles-product-hero.liquid:330,357,370 | "Add to cart"/"Sold out"/"Unavailable" literals in JS | Consume `window.variantStrings.*` (done in Phase 06; double-check) |
| 33 | P2 | sections/dopamiles-product-hero.liquid:536 | "30-day returns. No questions, no restocking." hardcoded | Section setting `return_policy_text` |
| 44 | P2 | sections/dopamiles-cart-drawer.liquid:75-77 | "Free shipping unlocked." | Locales |
| 45 | P2 | sections/dopamiles-cart-drawer.liquid:305-307 | "Bag's empty." / "That's a perfectly fine state to be in." / "Shop all tees →" | Locales + section settings |
| 55 | P2 | snippets/dopamiles-tokens.liquid:14-18 | `{{ settings.dop_ink \| default: '#1A1A1A' }}` — `default` does NOT fire on empty string | Replace with `{% if … != blank %}…{% else %}…{% endif %}` |
| 70 | P3 | sections/dopamiles-cart-drawer.liquid:222-224 | "Add for free shipping →" / "You might also like →" | Locale-bind |

## Files
| Path | Change |
|---|---|
| locales/en.default.json | edit — add `cart.free_shipping_unlocked`, `cart.empty_*`, `cart.add_for_free_shipping`, `cart.you_might_also_like`, `product.add_to_cart`, `product.sold_out`, `product.unavailable` (or confirm existing keys) |
| sections/dopamiles-product-hero.liquid | edit — add settings + use them; verify Phase 06 variantStrings consumption |
| sections/dopamiles-cart-drawer.liquid | edit — replace literals with `{{ 'cart.foo' \| t }}` |
| snippets/dopamiles-tokens.liquid | edit — replace `default` filter with `!= blank` guard for all 8-12 token defaults |

## Steps
1. Add to `locales/en.default.json`:
   - `cart.free_shipping_unlocked` → "Free shipping unlocked."
   - `cart.empty_title` → "Bag's empty."
   - `cart.empty_subtitle` → "That's a perfectly fine state to be in."
   - `cart.empty_cta` → "Shop all tees →"
   - `cart.add_for_free_shipping` → "Add for free shipping →"
   - `cart.you_might_also_like` → "You might also like →"
   - Confirm `products.product.add_to_cart`/`sold_out`/`unavailable` exist (Dawn defaults).
2. Replace literals in `dopamiles-cart-drawer.liquid:75-77, 222-224, 305-307` with `{{ 'cart.foo' | t }}`.
3. In `dopamiles-product-hero.liquid` schema (bottom of file): add settings `low_stock_text`, `in_stock_text`, `return_policy_text` with defaults matching current copy.
4. Use `{{ section.settings.low_stock_text }}` etc. at lines 121-125, 536.
5. Confirm Phase 06 already wires `window.variantStrings.*` in variant-sync JS; if any string remains literal, fix.
6. In `dopamiles-tokens.liquid`: for every `{{ settings.X | default: 'Y' }}` (lines 14-18 + similar through 215), replace with `{% if settings.X != blank %}{{ settings.X }}{% else %}Y{% endif %}`. Audit all token defaults systematically.
7. Bump build-tag.

## Gate (real iPhone verification)
- Theme Editor → cart drawer empty state shows section setting values (not hardcoded).
- Theme Editor → product PDP shows custom low/in-stock + return-policy text.
- Clear `settings.dop_ink` in Theme Editor → tokens fall back to `#1A1A1A`, no `var(--dop-ink: ;)` invalid CSS in DevTools.
- Locale switch to a second language file (if any) translates strings.
- Build-tag visible, bumped.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores literals.

## Risks
| Risk | Mitigation |
|---|---|
| Existing locale keys collision | Grep `locales/en.default.json` for keys before adding |
| Section setting defaults trigger Theme Editor re-render of every PDP | Acceptable; one-time |
| Empty-string-defeats-default bug exists elsewhere in tokens snippet | Sweep entire `dopamiles-tokens.liquid` (215 LOC) not just lines 14-18 |
| Translator picks up new keys but breaks existing translation file structure | Add new keys to bottom of relevant section; no existing-key changes |
