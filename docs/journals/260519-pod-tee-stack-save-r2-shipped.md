# Pod-Tee Stack & Save R2: Placement + "From $X" Pricing — Shipped

**Date**: 2026-05-19 23:15  
**Severity**: Low  
**Component**: Product Hero / Bundle Card / PDP Layout  
**Status**: Resolved  

## What Happened

Merged 4-phase Stack & Save repositioning plan + variant-aware SSR pricing onto `feat/pdp-perf-pareto` branch. Removed slim banner (above price), relocated full card immediately under ATC button, added merchant-configurable `bundle_cta_url` section setting, implemented "From $X" floor pricing with `variantChange` subscriber flip. QA added 4 scope items mid-implementation (return-policy line, footer copy rewrite, tier-card padding sync, header markup cleanup). All changes validated via theme-check, syntax, and live dev preview.

## Key Decisions & Scope-Adds

**Planned Changes (locked):**
- Slim banner → full card relocation (ATC ↓ → Card ↓ → Return Policy) — removes banner visual clutter per R1 user feedback
- `bundle_cta_url` setting (type: url, default: `/collections/all`) — merchant-facing destination picker in theme editor
- SSR "From $X" floor using `product.price_min` + `data-has-picked-size="false"` literal; `variantChange` event flips flag and drops prefix on real data
- Cart-drawer verify-only (no code delta)

**QA Scope-Adds (during live preview):**
- **Return-policy line placement** — moved above Stack & Save card (was below variant-sync island) for visual hierarchy
- **Footer copy simplification** — stripped strikethrough subtotal, dropped redundant "From", split "You save $X" to salmon/coral kicker on own line (variant-independent, no dynamic "from" needed). Before: `5 tees · ~~From $124.95~~ From $99.95 You save from $25`; After: `5 tees · From $99.95` / `Save $25`
- **Tier-card horizontal padding** — normalized 16px → 18px to align with header/progress/footer stripe edges (was only 16px element)
- **Header markup cleanup** — killed vestigial `.title` flex wrapper + unnamed outer `<div>` (from original 2-col design never fully rendered). Kicker now `display: block; line-height: 1` directly under `.dop-stack-head`. Eliminated phantom top-air (line-box leading) and dead right-column space from `justify-content: space-between` on single child.

## Implementation Verification

- `shopify theme check` — zero new linting offenses on 4 files
- `node -c assets/dopamiles-stack-save.js` — syntax pass; 308 lines (under 320 ceiling)
- JSON schema valid; `bundle_cta_url` entry present + parseable
- Live dev preview (http://127.0.0.1:9292) confirmed all changes including 4 QA scope-adds
- Code-review clean: zero critical/high findings; `product.price_min` standard Liquid drop (used 4× elsewhere); empty `cta_url` falls to `default:` filter; no-JS SSR path preserves "From" prefix; `bindVariantChange` single internal caller

**Files modified (final):**
- `sections/dopamiles-product-hero.liquid`
- `snippets/dopamiles-stack-save.liquid`
- `assets/dopamiles-stack-save.js`
- `assets/dopamiles-stack-save.css`

## Deferred to Follow-Up

- Lighthouse mobile re-baseline vs. `plans/260519-1215-pdp-perf-round-2/reports/p2-after-report.md` (floor: ≥90 mobile median)
- Theme editor `bundle_cta_url` merchant-facing UX live test (schema valid, UX unproven)
- `dopamiles-bundle-banner.liquid` deletion (zero render calls; orphaned by placement change)

## Lessons Learned

**Plan risk notes are QA hooks, not concrete.** The Phase 3 risk note flagged "You save from $X" as awkward but locked it for forward-compat. Live QA revisited and rewrote copy to flat "$X". Pattern: explicit "revisit if QA flags" notes should trigger actual design review during live preview, not be archived as decided.

**Vestigial CSS from design handoffs leaks visible whitespace.** The `.dop-stack-head` flex + `justify-content: space-between` was ported intact from a 2-col design mockup. Only one column materialized in Liquid → phantom top-air (line-box leading artifact) and dead right-column space. When porting design CSS, always audit the HTML tree the design assumed vs. what shipped. Flex/grid containers without expected children don't just reflow; they leave layout ghosts.

**SSR-as-truth + JS-strips-prefix is a clean inversion.** Using `product.price_min` for SSR floor, `data-has-picked-size="false"` literal, then flipping flag + dropping prefix on `variantChange` inverts the typical "JS hydrates static SSR" pattern. Works here because the prefix is text, not structural. Preserving "From" in no-JS path ensures graceful degradation without feature-detect guarding.

---

**Status:** DONE
