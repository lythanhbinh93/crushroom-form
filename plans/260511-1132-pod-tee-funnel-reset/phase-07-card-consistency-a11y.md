# Phase 07 — Card Consistency + A11y

**Status:** pending
**Owner:** code
**Effort:** M (2-3h)
**Depends on:** Phase 03 (image expression already fixed)

## Goal
Unify all 5 product-card render paths to use `snippets/dopamiles-product-card.liquid`. Eliminate button-inside-link a11y violation. Promote editorial card to `<aside>` with aria-label. Wire or remove the dead quick-add button.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 22 | P1 | sections/dopamiles-collection-grid.liquid:233-317 | `<a class="doc-pcard">` wrapping `<h3>` + price + `<button class="doc-quick">` — button inside link is invalid HTML | Move quick-add button OUTSIDE `<a>` (absolute-positioned over it) OR change wrapper to `<div>` with `<a>` around image/title only |
| 23 | P1 | snippets/dopamiles-product-card.liquid:12 | Snippet uses `<h4>` for product title; heading hierarchy questionable | Change `<h4>` → `<h3>` (parent section uses `<h2>`) |
| 39 | P2 | snippets/dopamiles-product-card.liquid + sections/dopamiles-collection-grid.liquid:233-317 | Snippet used by 3 home sections; collection-grid inlines duplicate markup with different class prefix (`doc-pcard` vs `dop-pcard`) | Migrate collection-grid to use snippet; extend snippet with `bestseller_ribbon`, `low_stock`, `sold_out` params |
| 21 | P1 | sections/dopamiles-collection-grid.liquid:200-214 | Editorial card `.doc-ad-card` is `<div>` inside grid of `<a>` cards | Change `<div>` → `<aside class="doc-ad-card" aria-label="Editorial card">` |
| 52 | P2 | sections/dopamiles-collection-grid.liquid:263-269 | Quick-add button has aria-label but no handler — clicking does nothing | Either wire to `/cart/add` via `dopamiles-collection.js` OR remove button |

## Files
| Path | Change |
|---|---|
| snippets/dopamiles-product-card.liquid | edit — `<h4>` → `<h3>`; add `bestseller_ribbon`, `low_stock`, `sold_out`, `show_quick_add` params; restructure to put quick-add button OUTSIDE the `<a>` |
| sections/dopamiles-collection-grid.liquid | edit — replace inline card markup (233-317) with `{% render 'dopamiles-product-card' with bestseller_ribbon: …, low_stock: …, show_quick_add: true %}`; change `.doc-ad-card` `<div>` → `<aside>` |
| sections/dopamiles-niche-favorites.liquid | verify — already uses snippet; confirm new params optional |
| sections/dopamiles-more-from-niche.liquid | verify — already uses snippet |
| sections/dopamiles-home-shop-grid.liquid | verify — already uses snippet |
| assets/dopamiles-collection.js | edit (Phase 06 file) — add quick-add handler delegating to `/cart/add` if `show_quick_add` |

## Steps
1. Update snippet: change `<h4>` → `<h3>`. Add params: `bestseller_ribbon` (bool), `low_stock` (bool), `sold_out` (bool), `show_quick_add` (bool). Restructure DOM:
   ```
   <article class="dop-pcard">
     <a class="dop-pcard__link" href="…">
       <img …><h3>…</h3><span class="price">…</span>
     </a>
     {% if show_quick_add %}<button class="dop-pcard__quick" data-product-handle="…">+</button>{% endif %}
   </article>
   ```
2. Add CSS in `dopamiles-shared.css` or `dopamiles-pdp.css` (whichever loads on collection page — see phase-08) for `.dop-pcard__quick` absolute positioning.
3. In collection-grid.liquid: delete inline `<a class="doc-pcard">…</a>` block (233-317). Replace with `{% render 'dopamiles-product-card' with show_quick_add: true, bestseller_ribbon: bestseller, low_stock: low %}`. Compute `bestseller` + `low` flags inline before the render.
4. Change `.doc-ad-card` `<div>` → `<aside class="doc-ad-card" aria-label="Editorial card">` (line 200-214).
5. Update niche-favorites + more-from-niche + home-shop-grid to pass new params (or default to false).
6. In `dopamiles-collection.js` (Phase 06): add click handler on `.dop-pcard__quick` → POST `/cart/add` with first-available variant of product, then trigger drawer open via `window.dopCart`.
7. Bump build-tag.

## Gate (real iPhone verification)
- `/collections/all` cards render same DOM as home `/niche-favorites` cards.
- VoiceOver reads card as "link, [title], [price]". Quick-add button reads separately.
- HTML validator: 0 button-inside-link errors.
- Editorial card reads as "Editorial card aside, [content]".
- Quick-add button: tapping adds 1 unit of first-available variant; drawer opens.
- Heading order: `<h2>` section title → `<h3>` card title. Build-tag visible, bumped.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores inline markup + button-inside-link.

## Risks
| Risk | Mitigation |
|---|---|
| Snippet param changes break 3 existing home callers | Default all new params to `false`; existing calls unaffected |
| `.doc-pcard` vs `.dop-pcard` CSS divergence loses ribbons/dots | Audit CSS rules tied to `doc-pcard*` BEFORE delete; migrate to `dop-pcard*` |
| Quick-add `first-available-variant` is sold-out → 422 | Disable button if `product.available == false`; error banner if 422 |
| `<aside>` inside CSS grid breaks layout | Inherit display rules; verify in DevTools grid view |
