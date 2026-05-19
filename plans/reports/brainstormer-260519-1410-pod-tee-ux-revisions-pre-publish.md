---
title: "pod-tee UX Revisions Pre-Publish — 10 items / 5 patterns / 5 phases"
generatedAt: 2026-05-19T14:10Z
trigger: "user paused publish swap (plans/260514-1230-pod-tee-publish-and-js-fixes Phase 02) to iterate on UX feedback before going live"
blocks: plans/260514-1230-pod-tee-publish-and-js-fixes (publish swap waits on these revisions landing on preview)
risk_priority: brand-visual-regress-css-cascade-bugs (carried from Round 2 perf)
design_approved_by_user: 2026-05-19
locked_decisions:
  toggle_scope: theme-editor section settings only (global)
  defaults: show by default (preserve current behavior)
  removals_method: CSS-only display:none on wrappers
  removals_viewport: all viewports
  atc_redesign: visual only (drop price-tail, center label, 20px font)
recommended_next: /ck:plan
---

# pod-tee UX Revisions Pre-Publish

## Problem statement

User paused the publish swap (`260514-1230-pod-tee-publish-and-js-fixes` Phase 02) to fix 10 UX issues observed on preview theme 158279991548 before going live. Feedback collected iteratively over 1 session with annotated screenshots. Brutal honesty filter applied: not all items justify a fix (e.g. footer duplicate-menu side observation is admin-fix not theme code).

## Scout findings

- Project: Shopify theme `pod-tee-theme` (Dawn-based, dopamiles brand) on branch `feat/pdp-perf-pareto` (Round 2 perf shipped).
- 10 feedback items map to **5 root patterns** across 5 files.
- Same risk priority as Round 2: avoid CSS cascade bugs.
- In-flight: publish swap plan blocked until these revisions ship and verify on preview.
- Existing convention: `.dop-*` and `.doc-*` class prefixes; section settings via `{% schema %}` JSON in each section file.

## Consolidated feedback (10 → 5 patterns)

### Pattern A — Pure removals (3 items)

| Item | Touchpoint | Lines |
|---|---|---:|
| FB-1: drop PDP breadcrumb | `sections/dopamiles-product-hero.liquid` | 46-54 |
| FB-2: drop T-SHIRT eyebrow | `sections/dopamiles-product-hero.liquid` | 64-69 |
| FB-6a: drop collection breadcrumb | `sections/dopamiles-collection-grid.liquid` | 30-39 |

### Pattern B — Toggle + clean-when-hidden (5 items)

| Item | New setting | Touchpoint | Notes |
|---|---|---|---|
| FB-3: stock-line toggle | `show_stock_availability` (default true) | `dopamiles-product-hero.liquid:155-173` | Sold-out message stays visible regardless |
| FB-5: orphan dividers | `:empty {display:none}` safety net + Liquid audit | `dopamiles-bundle-inline.liquid` snippet + bundle-addon block wrappers in `dopamiles-product-hero.liquid` | Eliminate hairline rows when bundle disabled / blocks toggled hidden |
| FB-6b: collection lede gap | already conditional; tighten right-column flex gap | `dopamiles-collection-grid.liquid:56-58` + `dopamiles-collection.css` | Mobile single-stack collapses cleanly |
| FB-8: collection eyebrow toggle | `show_eyebrow` (default true; drop `default:` filter) | `dopamiles-collection-grid.liquid:45-50` | |
| FB-9: card swatch toggle | `show_color_dots_on_cards` (passes to snippet) | `dopamiles-collection-grid.liquid:250` (caller passes to `dopamiles-product-card`) | |

### Pattern C — ATC redesign (1 item, 2 touchpoints)

- FB-4: drop `.price-tail` from Liquid, center label, font 17-18px → **20px**
- Files: `sections/dopamiles-product-hero.liquid:221-248` + `sections/dopamiles-mobile-sticky-atc.liquid`
- JS cleanup: dead `.price-tail` update path in `assets/dopamiles-pdp-variant-sync.js`

### Pattern D — Toolbar Dawn migration (1 item)

- FB-7: combine Filter + Sort → single drawer; sort `<fieldset>` inside drawer body
- Touchpoint: `sections/dopamiles-collection-grid.liquid:115-152` + filter drawer snippet
- A11y: drawer focus management, ESC close, `aria-controls`

### Pattern E — Lede max-width (1 item, 4 instances)

- FB-10: lede `<p>` max-width too narrow on mobile
- 3 home sections + footer subscribe; **single shared CSS selector fix**
- Likely `.doc-hero-lede` / `.dop-lede` in `assets/dopamiles-shared.css` or per-section CSS

## Side observation (out of scope this round)

Footer shows 3 duplicate menu columns (SHOP / HELP / DOPAMILES all listing same 4 policy links). Admin-side fix (each column's menu setting points to same Shopify auto-menu). Not theme code. User will fix via admin separately.

## Locked decisions (Discovery answers)

| Question | Answer |
|---|---|
| Toggle scope | Theme-editor section settings only (global per section). No metafields. |
| Default state for new toggles | Show by default (preserve current — safest for publish swap) |
| Removals method | CSS-only `display: none` on wrappers. Preserves a11y markup (`<nav aria-label="Breadcrumb">`); fully reversible by editing one CSS line |
| Removals viewport scope | All viewports (matches screenshots showing intended state) |
| ATC redesign scope | Visual only: drop price-tail, center label, font 17→20px. Price-elsewhere unchanged (already shows above ATC) |
| Sold-out behavior in FB-3 | Stock toggle hides "In stock" line BUT keeps "Sold out" message — buyers need to know they can't buy regardless of merchant preference |

## Evaluated approaches

### Approach 1 — One unified PR ("FB Round 1")
Pros: atomic; one cycle of brainstorm-plan-cook; one round of QA.
Cons: 10 items in one diff is hard to review and bisect; cascade risk concentrated.

### Approach 2 — Patterns-as-phases (RECOMMENDED)
5 phases by root pattern. Each phase ships independently with visual smoke + regression after deploy. Bisect-friendly. Halt rule per phase.
Pros: matches Round 2 cascade-discipline; phase-level revert is clean; isolates risk.
Cons: 5 deploy cycles vs 1 (overhead).

### Approach 3 — Risk-first ordering
Phase 1: zero-risk (pure CSS adds + footer admin fix). Phase 2: toggles. Phase 3: ATC + toolbar.
Pros: fast easy-wins live first.
Cons: combines patterns within phases; bisect harder.

**Chosen: Approach 2.** Matches the user's locked risk priority (cascade bugs) and the proven Round 2 pattern that delivered 91/91/92.

## Recommended solution — 5 phases ordered low→high cascade risk

### Phase 1 — Pure removals via CSS-only (10 min, near-zero risk)

Add scoped CSS rules in `dopamiles-pdp.css` + `dopamiles-collection.css`:

```css
/* dopamiles-pdp.css — append */
.dopamiles-product-hero .dop-crumbs { display: none; }
.dopamiles-product-hero .dop-eyebrow { display: none; }
```

```css
/* dopamiles-collection.css — append */
.dopamiles-collection-grid .doc-crumbs { display: none; }
```

All viewports. Markup preserved for screen readers. Reversible by deleting the rules.

### Phase 2 — Lede max-width fix (10 min, low risk)

Grep for current `.doc-hero-lede` / `.dop-lede` rules; relax to `max-width: 60ch` (typography sweet spot per Bringhurst, 45-75 chars per line) OR set `max-width: none` inside the mobile media query.

Single CSS rule edit covers 3 home sections + footer. Touchpoint TBD by grep — likely `dopamiles-shared.css` or per-section partial.

### Phase 3 — ATC redesign (30-45 min, low-medium risk)

1. Liquid: delete `<span class="price-tail">...</span>` from `dopamiles-product-hero.liquid:236-242` and the mobile sticky-ATC equivalent.
2. CSS: `.dop-btn-cta { justify-content: center; font-size: 20px; }`
3. JS: remove dead `.price-tail` update path from `dopamiles-pdp-variant-sync.js` (was patching on variant change).
4. Visual diff: PDP button + sticky-ATC button + sold-out state.

UX validation: price already shows in `.dop-price` block above ATC — removing price-tail does NOT lose the commit-confirmation signal.

### Phase 4 — Toggle pattern × 5 touchpoints (1-2h, medium risk)

ONE canonical pattern applied 5 times:

**Canonical pattern:**
- Liquid: `{%- if section.settings.show_X != false -%}` wraps the entire block including its wrapper. Spacing flows via flex/grid `gap` on parent → no orphan margin when child elided.
- CSS safety net: `.dop-section:empty { display: none; }` for any wrapper we miss.
- Section setting: `show_X: boolean, default: true`.

Applied to each of 5 touchpoints listed in Pattern B table above. Sold-out message in FB-3 stays visible regardless of toggle.

### Phase 5 — Toolbar Dawn migration (1h, highest cascade risk)

Combine Filter + Sort into single drawer (Dawn convention):

1. Liquid: `.doc-toolbar-left` button label becomes `Filter and sort`; move `<select>` from `.doc-toolbar-right` INTO the filter drawer body as a `<fieldset>` at top.
2. CSS: `.doc-toolbar` becomes single-row `[button | spacer | count-pill]`. Count-pill keeps "tees" or generalizes to "products" (decided in phase).
3. JS: re-attach `data-dop-sort` handler inside drawer; keep immediate-apply on change (parity with current).
4. A11y: drawer focus management, ESC close, `aria-expanded` toggle.

**Cascade-risk safeguards** (matches Round 2 Phase 3 pattern):
- Playwright pixel-diff on collection page × 3 viewports before/after
- Sort dropdown URL-param preservation verified
- Drawer focus / ESC behavior verified

## Halt rule per phase

After each phase deploy: visual smoke (user eyeball preview) + existing regression suite (`perf-probe-feature-variant.mjs` covers Globo + media-order + section-refetch). If any visible regression, **revert that phase only** — others remain shipped.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| CSS cascade bug in Phase 4 toolbar restructure | Playwright pixel-diff QA on 3 viewports before promoting |
| `:empty` CSS rule unintentionally hides legitimate non-empty wrappers | Scope `:empty` to specific section-wrapper classes, not global. Audit before commit |
| Toggle defaults to ON but section setting JSON migration breaks existing merchants | All `default: true` means existing themes deployed see no change. Schema additions are append-only |
| ATC font 20px breaks button height / line-wrap on certain product names | Verify on edge PDP (long product name) before commit |
| Sort-in-drawer migration loses URL state | Test sort-by URL params persist through filter open/close |

## Success criteria

- All 10 feedback items reflected in preview theme 158279991548
- 4 new section settings added (`show_stock_availability`, `show_eyebrow`, `show_color_dots_on_cards`, plus any FB-5-specific toggles); all default true
- Globo + media-order + section-refetch regression suite stays GREEN through all 5 phases
- Visual diff on collection toolbar (Phase 5) passes Playwright pixel-diff threshold
- No new lint/Liquid-syntax/CSS-parse errors (Shopify theme push succeeds each phase)
- Lighthouse 5-run median doesn't regress below Round 2 final (lead 91 / mid 91 / edge 92) — these are perf-neutral changes but worth confirming

## Implementation considerations

- All work continues on `pod-tee-theme @ feat/pdp-perf-pareto`
- Theme Access token: user rotated after Round 2; need fresh `shptka_...` for deploys this round
- Each phase = 1-3 commits; one push per phase
- After Phase 5 closes, publish swap (`260514-1230-pod-tee-publish-and-js-fixes` Phase 02) is unblocked and ready for user-initiated manual publish via admin

## Next step

Hand off to `/ck:plan` for phased plan scaffold. Plan dir: `plans/260519-1410-pod-tee-ux-revisions-pre-publish/`.

## Open questions (deferred to plan phase)

- Lede max-width target: `60ch` (typography rule) or `100%` on mobile (max-width: none in mobile breakpoint)?
- Count pill copy in Phase 5: keep "tees" (brand-specific) or generalize to "products" (future-proof)?
- Phase 5 sort-apply UX: immediate apply on change (current behavior) or batch with an "Apply filters" button (Dawn convention)?
- Phase 4 sub-decision: for FB-5 orphan dividers, audit needs to find the actual wrapper elements — exact selectors TBD at runtime via grep + DOM inspection of preview theme
- Theme Access token: existing one valid, or need re-issue from user before phase deploys?
