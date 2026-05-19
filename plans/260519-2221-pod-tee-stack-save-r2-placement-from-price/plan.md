---
title: "pod-tee Stack & Save R2 — Placement + From-X Price + Configurable CTA"
description: "Round-2 polish on the just-shipped Stack & Save tiered bundle card. Drops slim bundle-banner, moves card directly below ATC, adds variant-aware 'From $X' pricing for size upcharges, exposes bundle CTA URL via merchant-configurable section setting. Cart-drawer upsell already shipped — verify only. Phase 01 Shopify Function stays as enforcement layer."
status: complete
priority: P2
effort: "2-3h"
repo: D:\github local\pod-tee-theme
branch: "feat/pdp-perf-pareto"
blockedBy: []
blocks: []
related:
  - brainstorm: plans/260519-2221-pod-tee-stack-save-r2-placement-from-price/brainstorm-summary.md
  - parent: plans/260519-1745-pod-tee-stack-save-port (v1 shipped; Round 2 builds on it)
  - perf-floor: plans/260519-1215-pdp-perf-round-2 (mobile Lighthouse >=90 floor — must not regress)
  - touch-point: plans/260519-1410-pod-tee-ux-revisions-pre-publish (shared buy column with just-shipped UX revisions)
  - upstream-infra: dopamiles-bundle-banner.liquid + Phase 01 Shopify Function (tier metafield + bundle-eligible tag wired)
tags: [shopify, theme, pod-tee, dopamiles, pdp, bundle, stack-save, r2]
created: 2026-05-19
---

# pod-tee Stack & Save R2 — Placement + From-X Price + Configurable CTA

## Overview

Round-2 polish on the just-shipped Stack & Save tiered bundle card (`plans/260519-1745-pod-tee-stack-save-port`). Four small in-place edits, ~80 LOC total, no new files. Discount engine (Phase 01 Shopify Function) unchanged. Backward-compat (`bundle_style = "kit"`) preserved.

Changes:
1. Drop slim bundle-banner from PDP (redundant once full card exists). Move full card from below trust trio to right after ATC button.
2. Add merchant-configurable `bundle_cta_url` section setting (default `/collections/all`).
3. Add variant-aware "From $X" pricing — SSR uses `product.price_min`, drops prefix and snaps to picked-size price on `PUB_SUB_EVENTS.variantChange`.
4. Cart-drawer upsell (`dopamiles-bundle-cart-headline.liquid`) — verify only, no code change.

## Goals

- Single bundle UI on PDP, in commit-adjacent slot (immediately below ATC).
- Merchant can swap CTA link without code edit (theme editor URL picker).
- SSR price floor renders correctly under size upcharges; first variant pick snaps to exact.
- Zero Lighthouse mobile regression (>=90 floor).
- Cart-drawer upsell verified live.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [PDP Placement + Banner Removal](./phase-01-pdp-placement-banner-removal.md) | Complete |
| 2 | [Configurable Bundle CTA URL Setting](./phase-02-configurable-bundle-cta-url-setting.md) | Complete |
| 3 | [Variant-Aware From-X Pricing](./phase-03-variant-aware-from-x-pricing.md) | Complete |
| 4 | [QA + Cart Upsell Verification](./phase-04-qa-cart-upsell-verification.md) | Complete (visual QA confirmed; Lighthouse + theme-editor CTA picker live test deferred) |

## Touchpoints (master list)

**Modify**
- `sections/dopamiles-product-hero.liquid` — remove banner render at L188; move stack-save render block from L306 to immediately after `</product-form>` (~L247); add `bundle_cta_url` schema setting; pass `cta_url` render arg.
- `snippets/dopamiles-stack-save.liquid` — accept `cta_url` arg; SSR `unit_cents = product.price_min`; emit `data-has-picked-size="false"`; prefix `From` on totals/savings when no size picked.
- `assets/dopamiles-stack-save.js` — read `data-has-picked-size`; on variantChange flip to true + drop `From` prefix in render output.

**No change**
- `snippets/dopamiles-bundle-banner.liquid` (kept on disk; may still be referenced from `/pages/3-pack` or future surfaces)
- `snippets/dopamiles-bundle-cart-headline.liquid` (already-shipped cart upsell; QA-only)
- `snippets/dopamiles-bundle-inline.liquid` (kit fallback)
- `assets/dopamiles-stack-save.css`
- `layout/theme.liquid`
- Phase 01 Shopify Function / tier metafield

## Cross-plan dependencies

None blocking. Three completed plans listed under `related:` as regression guards (parent v1, perf floor, just-shipped UX revisions).

## Unresolved questions

None — all four decisions locked via brainstorm `AskUserQuestion` round (see `brainstorm-summary.md`).

## Validation Log

### Session 1 — 2026-05-19 (critical-questions interview)

**Trigger:** `/ck:plan validate` after fast-mode plan creation.
**Tier:** Standard (4 phases → Fact Checker + Contract Verifier, 10 claims/phase).
**Questions asked:** 4

#### Verification Results
- Claims checked: 12
- Verified: 11 | Failed: 1 | Unverified: 0
- **Failure**: F10 — Phase 4 cited `plans/260519-1215-pdp-perf-round-2/reports/baseline-summary.json`; file does not exist. Actual perf-round-2 outputs: `p2-after-report.md` (5 KB Lighthouse summary) + `section-heights-probe.json`. **Resolved** in Phase 4 step 7 — switched citation to `p2-after-report.md`.

**Side-finding (not a plan failure):** Cart-drawer headline (`snippets/dopamiles-bundle-cart-headline.liquid`) hardcodes `/pages/3-pack` in 4 spots (lines 60, 71, 82, 93). Plan's `bundle_cta_url` setting only applies to Stack & Save card. Decision locked: keep separation (see Q4 below).

#### Questions & Answers

1. **[Risks]** Phase 4 cites a non-existent Lighthouse baseline file. Which should it point to?
   - Options: `p2-after-report.md` (Recommended) | Generate fresh baseline | Skip perf gate
   - **Answer:** Use `p2-after-report.md`
   - **Rationale:** Cheapest correct choice. Existing perf-round-2 final report is the canonical floor; no extra work needed.

2. **[Architecture]** Should the `From $X` prefix always render on SSR, or only when the catalog has size upcharges?
   - Options: Always on (Recommended) | Gate on `price_min != price_max` | Defer to Round 3
   - **Answer:** Always on
   - **Rationale:** Forward-compat. Slight short-term oddness ("From $32" when every variant is $32) is acceptable; once upcharges land, no Liquid/JS branch needs adding.

3. **[Architecture]** Default CTA URL when merchant hasn't set `bundle_cta_url`?
   - Options: `/collections/all` (Recommended) | `/collections/bundle-eligible` | `/pages/3-pack` (current default)
   - **Answer:** `/collections/all`
   - **Rationale:** Most discoverable. All products eligible in current phase → behaviorally equivalent to `/collections/bundle-eligible`. Simpler default.

4. **[Scope]** Cart-drawer headline hardcodes `/pages/3-pack` in 4 spots. Propagate `bundle_cta_url` to it too?
   - Options: No — keep 3-pack as cart-funnel canonical (Recommended) | Yes — add Phase 5 | Yes — promote to theme.settings global
   - **Answer:** No — leave 3-pack as cart-funnel canonical
   - **Rationale:** Cart drawer is late-funnel (shopper already committed); 3-pack picker is the right destination there. PDP card uses the configurable URL for shop-around traffic. Concerns intentionally separated.

#### Confirmed Decisions
- Phase 4 Lighthouse baseline → `p2-after-report.md` (Phase 4 step 7 updated; comment marker added).
- Phase 3 `From $X` always-on in SSR — no plan change (already aligned).
- Phase 2 default `bundle_cta_url = /collections/all` — no plan change (already aligned).
- Cart-drawer headline stays hardcoded to `/pages/3-pack` — no plan change (documented in plan's "No change" list; explicit decision now logged).

#### Impact on Phases
- Phase 4: baseline citation fixed.
- Phases 1, 2, 3: no edits needed; decisions confirm the plan as-written.

### Whole-Plan Consistency Sweep — 2026-05-19

Re-read `plan.md` + all 4 phase files after the Phase 4 baseline edit.

Searched for:
- Stale `baseline-summary.json` references → none remaining outside this log's historical note.
- Conflicting "From $X" gating logic across Phase 3 + JS spec → all references consistent (always-on).
- Conflicting CTA URL defaults across Phase 2 (snippet default), Phase 2 (JS fallback), Phase 1 (description) → all three say `/collections/all`.
- Cart-headline `/pages/3-pack` references in plan text → cart-headline correctly listed under "No change" in plan.md touchpoint table; Phase 4 verifies cart-headline runs unchanged.

**Files reread:** plan.md, phase-01, phase-02, phase-03, phase-04
**Decision deltas checked:** 4
**Reconciled stale references:** 1 (baseline-summary.json → p2-after-report.md in Phase 4)
**Unresolved contradictions:** 0

Plan eligible for implementation.

## Implementation Log — 2026-05-19

### Sequence
1. Phases 1-3 implementation: ~25min, in-place edits on three files (`sections/dopamiles-product-hero.liquid`, `snippets/dopamiles-stack-save.liquid`, `assets/dopamiles-stack-save.js`).
2. Code-reviewer subagent gate: DONE, zero critical, zero high. Probes returned clean: `product.price_min` standard drop, empty-string `cta_url` falls through `default:` filter, no-JS SSR path preserves `From` prefix, `dataset.hasPickedSize` ↔ `data-has-picked-size` strict-equality verified, `bindVariantChange` new signature has single internal caller. One non-blocker: `dopamiles-bundle-banner.liquid` orphaned (zero live render calls in repo) but kept on disk per plan decision.
3. Live QA via dev preview (`http://127.0.0.1:9292`) surfaced four scope-adds beyond original 4-phase plan.

### Scope-adds (QA-driven, not in original plan)

| # | Change | Files | Rationale |
|---|--------|-------|-----------|
| A | Return-policy line moved above Stack & Save card (was below variant-sync island) | `sections/dopamiles-product-hero.liquid` | Visual hierarchy: ATC → 30-day-returns reassurance → bundle CTA. Decoupling per user. |
| B | Footer copy simplified to two-line layout: `5 tees · From $X` / `Save $Y` (savings as kicker, dropped strikethrough subtotal, dropped redundant `From` on subtotal + `from` on savings) | `snippets/dopamiles-stack-save.liquid`, `assets/dopamiles-stack-save.js`, `assets/dopamiles-stack-save.css` | Plan Phase 3 risk note flagged "You save from $X" as awkward; QA was the trigger to act. Savings is per-unit flat $-off (variant-independent) so `from` was aesthetic-only. |
| C | Tier card horizontal padding normalized: 16px → 18px to align vertically with header/progress/footer stripes | `assets/dopamiles-stack-save.css` | Visual consistency across 4 stripes (was the only stripe at 16px). |
| D | Header markup simplified: dropped `.title` flex wrapper + unnamed outer `<div>` (vestigial from 2-col design that never materialized); kicker now `display: block; line-height: 1` directly under `.dop-stack-head` | `snippets/dopamiles-stack-save.liquid`, `assets/dopamiles-stack-save.css` | Eliminated phantom top-air + dead right column from `justify-content: space-between` on a single-child flex. Header now: 14px top padding → kicker → 6px → h3 → 6px → p. |

### Deferred to follow-up

- **Lighthouse mobile re-baseline** — perf-gate (≥90 mobile median against `plans/260519-1215-pdp-perf-round-2/reports/p2-after-report.md`). Risk: low (no new bytes; in-place edits + 1 CSS file w/ ~10 LOC delta).
- **Theme-editor CTA URL picker live test** — verify `bundle_cta_url` URL picker UX in `https://crushroom.myshopify.com/admin/themes/158541545724/editor?hr=9292`. Static JSON schema validates; live UX test outstanding.
- **`dopamiles-bundle-banner.liquid` cleanup** — orphan snippet, kept on disk per plan scope boundary. Delete in a later commit once R2 has soaked.

### Files touched (final)
- `sections/dopamiles-product-hero.liquid` — banner removed, Stack & Save block relocated under ATC + return-line, `bundle_cta_url` schema setting, `cta_url` render arg
- `snippets/dopamiles-stack-save.liquid` — `cta_url` arg, `unit_cents = product.price_min`, `data-has-picked-size`, From-prefixes, two-line footer, header markup simplified
- `assets/dopamiles-stack-save.js` — `hasPickedSize` state + flip on variantChange, From-prefix gating in render(), per-tier `.total` mutation, `/collections/all` fallback, dropped unused subtotal selector + savings prefix
- `assets/dopamiles-stack-save.css` — tier card padding 16→18px, footer save as kicker (block, 12px, F3C4B3, drop strikethrough rule), header simplification (block layout, kicker `display:block; line-height:1`, dropped `.title` selector)

### Verification
- `shopify theme check` — zero new offenses on the four modified files
- `node -c assets/dopamiles-stack-save.js` — passes
- `wc -l assets/dopamiles-stack-save.js` — 308 (under 320 ceiling)
- JSON schema parses; `bundle_cta_url` entry verified via Node parser
- Visual QA on live dev preview confirmed by user 2026-05-19

