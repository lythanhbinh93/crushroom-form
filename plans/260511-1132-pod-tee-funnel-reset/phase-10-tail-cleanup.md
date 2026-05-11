# Phase 10 — Tail Cleanup (P2 remainder + P3 backlog burndown)

**Status:** pending
**Owner:** code
**Effort:** L (parallel-friendly, total ~6-8h split)
**Depends on:** all prior phases stable

## Goal
Burn down remaining P2 items not covered upstream + all 20 P3 nice-to-haves. Touch ≤1 file per sub-step. Many of these are XS edits; bundle into 2-3 commits at most.

## Backlog items addressed
### Remaining P2s
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 36 | P2 | sections/dopamiles-product-hero.liquid:111-117 | Tortured `stock_class` assign Liquid | Direct conditional `<div class="dop-stock{% if low %} low{% endif %}">` |
| 37 | P2 | snippets/dopamiles-gallery.liquid:17 | `aria-hidden` via double-replace negation hack | `{% if forloop.first %}false{% else %}true{% endif %}` |
| 38 | P2 | snippets/dopamiles-gallery.liquid:25 | `fetchpriority` on first image — variant change confusion | None; acceptable. Document. |
| 40 | P2 | sections/dopamiles-product-hero.liquid:179-184 | Inline `style` on `.price-tail` | Move to `.dop-btn-cta .price-tail` CSS class |
| 41 | P2 | sections/dopamiles-product-hero.liquid:183 | Empty `<span class="price-tail">` when sold-out | `aria-hidden="true"` or omit when empty |
| 42 | P2 | assets/dopamiles-pdp.js:15,23 | `console.log` in production | Wrap in `if (window.dopDebug)` OR delete |
| 46 | P2 | sections/dopamiles-cart-drawer.liquid:127-141 | Nested `cart.items` O(n²) | Acceptable for carts <20; document. Or build single-pass `bundle_groups` map |
| 47 | P2 | sections/dopamiles-cart-drawer.liquid:212-215 | `has_upsell` scan — OK | None |
| 48 | P2 | snippets/dopamiles-cart-line-item.liquid (113 LOC) | Snippet unused; cart-drawer + cart-main inline duplicate markup | Refactor sections to use snippet OR delete snippet. Decision: REFACTOR (DRY) |
| 49 | P2 | assets/dopamiles-cart.js:60-69 | `[hidden]` attribute vs CSS display | Verify in CSS; standard UA stylesheet wins |
| 51 | P2 | sections/dopamiles-collection-grid.liquid:138 | Inline regex onchange (replaced in Phase 06) | Confirm done |
| 53 | P2 | sections/dopamiles-collection-grid.liquid:294-313 | `.doc-color-dots` redundant title vs aria-hidden | OK; document |
| 54 | P2 | layout/theme.liquid:436 | `request.path contains 'preview_theme_id'` (dead — preview_theme_id is query param) | Drop the `request.path` half |
| 56 | P2 | snippets/dopamiles-3pack-slot.liquid:42 | Empty `alt=""` on meaningful image | Verify context; add alt if not presentational |
| 57 | P2 | sections/dopamiles-product-hero.liquid:159 | `data-type: 'add-to-cart-form'` Dawn convention | None |
| 58 | P2 | sections/dopamiles-fbt.liquid:13-23 | FBT cent truncation | Acceptable; doc |
| 59 | P2 | sections/dopamiles-fbt.liquid:97 | FBT submit button — no aria-describedby | Add `aria-describedby="dop-fbt-saving"` to button + ID to saving line |
| 62 | P2 | sections/dopamiles-product-hero.liquid:46-50 | Eyebrow metafield fallback — OK | None |
| 63 | P2 | sections/dopamiles-product-hero.liquid:212-231 | JSON island bloat — deleted in Phase 02 | Confirm done |
| 66 | P2 | layout/theme.liquid:438-440 | Build-tag div no `aria-hidden` | Add `aria-hidden="true"` |
| 67 | P2 | sections/dopamiles-product-hero.liquid:553 | `<details open>` accordion — OK | None |
| 68 | P2 | sections/dopamiles-product-hero.liquid:560 | `{{ product.description }}` raw HTML — internal threat model OK | Document |

### All P3s (#69-#88, 20 items)
Sweep summary (most are 1-line):
- #69 — drop `dopamiles-chrome.css` removal comment AND confirm `assets/dopamiles-chrome.css` (14 LOC) deletion
- #71 — preset content acceptable; document
- #72-73 — extract SVG chevron + arrow icons to snippet `dopamiles-icon.liquid`
- #74 — gallery `<div tabindex="0">` add `role="region"` + `aria-label`
- #76 — confirm `.dawn-backup.json` keep-for-rollback policy in README
- #77 — value-less `data-dop-variant-id` OK; document
- #78 — Fraunces 9..144 variable axis — accept download cost OR limit to 9..72
- #79 — drawer count stale on cache; minor UX — accept
- #80 — track FBT metafield wiring TODO in followup
- #81 — ALL_CAPS const block — OK
- #82 — `dop:variant-media-change` 2KB event detail — internal use OK
- #83 — extract `retryUntilGloboMuted()` (already replaced by MutationObserver in Phase 04) — confirm removed
- #84 — tokens snippet docs OK
- #85 — toolbar SVGs `aria-hidden` correct — OK
- #86 — `assign upsell_products = ''` unused — delete
- #87 — `.loading-overlay__spinner` second selector likely never matches — drop
- #88 — `id="price-{{ section.id }}"` unreferenced — delete

## Files
Mixed; touch ≤1 file per sub-commit. Primary files:
| Path | Change |
|---|---|
| sections/dopamiles-product-hero.liquid | edit — #36, #40, #41, #67, #68, #86 (cleanup), #87, #88 |
| snippets/dopamiles-gallery.liquid | edit — #37, #74 |
| snippets/dopamiles-cart-line-item.liquid | promote to canonical (#48) |
| sections/dopamiles-cart-drawer.liquid | edit — use snippet for line items (#48), #86 |
| sections/dopamiles-cart-main.liquid | edit — use snippet for line items (#48) |
| assets/dopamiles-pdp.js | edit — #42 |
| assets/dopamiles-pdp.css OR shared | edit — `.price-tail` rule (#40) |
| sections/dopamiles-fbt.liquid | edit — #59 |
| layout/theme.liquid | edit — #54 (drop dead path check), #66 (aria-hidden on build-tag), #69 (drop comment) |
| sections/dopamiles-collection-grid.liquid | verify #51 done; cleanup orphan classes from Phase 07 |
| assets/dopamiles-chrome.css | DELETE if confirmed unused (#69 followup) |
| README.md | edit — document `.dawn-backup.json` policy (#76) |
| snippets/dopamiles-icon.liquid | create — SVG chevron + arrow icons (#72, #73) |

## Steps
1. Group items by file. Commit 1: product-hero cleanup (#36, #40, #41, #67, #68, #87, #88).
2. Commit 2: gallery snippet (#37, #74) + new icon snippet (#72, #73).
3. Commit 3: cart line item refactor (#48) — promote `snippets/dopamiles-cart-line-item.liquid` to canonical, refactor cart-drawer + cart-main to use it.
4. Commit 4: pdp.js console.log (#42), fbt aria-describedby (#59), theme.liquid (#54, #66, #69), unused vars (#86), chrome.css cleanup.
5. Commit 5: README docs (#76, plus FBT TODO #80, plus document accepted-as-is items).
6. Bump build-tag once per commit.

## Gate (real iPhone verification)
- All 5 commits ship via single preview build. Smoke test entire funnel: home → collection → PDP → ATC → drawer → checkout button.
- HTML validator: 0 new errors vs Phase 09 baseline.
- DevTools console: 0 errors, 0 leaked `console.log`.
- Lighthouse score same-or-better than Phase 08.
- Build-tag visible, bumped.

## Halt rule
1 iteration max PER COMMIT. If any of the 5 commits fails verify: snapshot that commit, halt, do not iterate inline.

## Rollback
Each commit independently revertible. Rolling back 1 commit does not cascade — items are not interdependent.

## Risks
| Risk | Mitigation |
|---|---|
| Cart line-item snippet refactor (#48) breaks bundle-parent/child rendering | Confirm both `_bundle_id` and `_bundle_parent` paths render correctly; run cart with a real bundle |
| Icon snippet (#72/#73) renders differently in 6+ call sites due to CSS specificity | Pass class param via `{% render 'dopamiles-icon' with class: '…' %}`; sample 3 call sites before bulk-replace |
| `assets/dopamiles-chrome.css` deletion breaks something via residual asset_url ref | Grep before delete |
| `.dawn-backup.json` policy change deletes accidentally | Read-only README docs; no file changes |
| Cumulative diff size makes review hard | 5 commits, not 1 — reviewer can scope per commit |
