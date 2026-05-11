# Phase 01 — Wide Audit of pod-tee-theme

**Status:** pending
**Owner:** code (agent — code-reviewer or researcher subagent)
**Blocks:** all subsequent phases
**Effort:** 60-90 min agent work, read-only
**Mode:** local file audit only — no URL benchmarks (live theme is BuildMyPOD, not pod-tee-theme; preview not publicly accessible)

## Goal

Produce a **ranked improvement backlog** for `pod-tee-theme` covering every code file. Output drives all subsequent phase plans.

## Scope — every file in pod-tee-theme

| Path | What to look for |
|---|---|
| `snippets/*.liquid` | Modularization, dead code, duplicated logic, hardcoded values, image-resolution patterns, A11y gaps |
| `sections/*.liquid` | Section schema issues, render path inefficiencies, fallbacks-for-impossible-cases, hardcoded values |
| `assets/*.js` | Dead code, perf anti-patterns, missing error handling, duplicate utilities, listener leaks, custom-vs-stock-Dawn divergence |
| `assets/*.css` | Dead rules, !important abuse, hardcoded vs token usage, layout-shift sources |
| `layout/theme.liquid` | Script defer/async, preload/preconnect, render-blocking third-party, header-section count |
| `templates/*.json` | Section composition issues, unused sections, ordering |
| `config/settings_schema.json` | Setting bloat, missing settings for merchant control |
| `locales/*.json` | Missing strings, hardcoded copy elsewhere |

## Backlog item shape

Each finding gets:

```
| # | Severity | Area | File:line | Issue | Fix shape | Effort | Depends on |
```

- **Severity:** P0 (ship-blocker) / P1 (high impact pre-ship) / P2 (polish) / P3 (nice-to-have)
- **Area:** perf / a11y / bug / modularize / dead-code / docs / test
- **Effort:** XS (<15min) / S (<1h) / M (1-3h) / L (3-8h)
- **Depends on:** other item #s OR external (e.g. "Globo metafield availability")

## Known seed bugs to verify in audit

1. **Bug A — Cart ATC perf** — confirmed file: `assets/dopamiles-cart.js` (599 LOC). Inventory functions, classify load-bearing vs cosmetic, map bundle line-grouping hooks (`_bundle_id`), find stock Dawn equivalents.
2. **Bug B — Globo PDP swatches** — trace `[data-dawn-vs]` wrapper status, reveal-timer, min-height candidate slots in `sections/dopamiles-product-hero.liquid` + `assets/dopamiles-pdp.css`.
3. **Bug C — Collection card "wrong first photo"** — verified: `snippets/dopamiles-product-card.liquid` renders 1 img (clean). Real card render path is `sections/dopamiles-collection-grid.liquid` (full file read; identify card-render block and image-source expression). Map card render paths used by collection page vs home sections vs niche/related sections.

## Cross-cutting checks

| Check | Method |
|---|---|
| Modularization opportunities (>200 LOC files) | `find . -name "*.liquid" -o -name "*.js" \| xargs wc -l \| sort -rn \| head -20` |
| Round-3c leftover code | grep `injectOptimisticAtcLine\|dop-li-optimistic\|data-dawn-vs` — should be flagged for removal |
| Hardcoded values that should be tokens | grep hex colors, px values, hardcoded strings in liquid/CSS |
| A11y | `aria-` attribute coverage, `alt=""` on imgs, semantic HTML, focus management |
| Dead code | unused snippets (grep for `render '`/`include '` references), unused CSS classes |
| Third-party app touchpoints | Globo, Klaviyo, Hotjar, FB Pixel, GA — render-blocking? defer-able? |
| Build-tag / error overlay / JSON island | confirm still present, document their files for preservation across phases |
| Image-rendering pattern audit | grep `featured_image`, `media[0]`, `image_url` filter usage — sites where `width:` param picks wrong resolution |
| Custom-cart.js vs stock-Dawn divergence | Side-by-side: `assets/dopamiles-cart.js` features vs Dawn's `cart.js + product-form.js + cart-drawer.js + cart-notification.js` |

## Output

Single report: `plans/reports/brainstormer-260511-1220-pod-tee-wide-audit.md`

Required sections:
1. **TL;DR** — Top 5 P0s, top 5 P1s, total backlog count by severity
2. **File-size & modularization map** — files >200 LOC, suggested splits
3. **Ranked backlog table** — every finding, sortable by severity/effort/area
4. **Round-3c leftover sweep** — what's still in the codebase from the rejected approach
5. **Bug A/B/C verification** — file-level confirmation or correction of brainstorm hypotheses
6. **Phase suggestions** — group backlog items into 4-8 phases by file ownership + dependency
7. **Open questions** — anything that needs user input or live-store check (Globo metafield, Klaviyo config, merchant data quality, etc.)

## Method

Delegate to `code-reviewer` subagent (or `researcher` if code-reviewer too narrow). Prompt must include:
- Work context: `D:\github local\pod-tee-theme`
- Branch: `feat/bug-fix-sprint`
- Report path: `plans/reports/brainstormer-260511-1220-pod-tee-wide-audit.md` (in crushroom-form repo)
- Read-only (no edits)
- Backlog format (above)
- Halt rule context (per round-3c)
- Token budget: report should fit in single agent context (<200K tokens)

## Gate

User reviews backlog report. Approves which items become Phase 02, 03, 04+. No code edits until that signoff.

## Halt rule

Doesn't apply (read-only). If audit's first pass under-covers, run a second pass with focused prompt rather than iterating inline.

## Files touched

None. Read-only across pod-tee-theme.

## Success criteria

- Backlog has ≥20 items (wide audit; if fewer, audit was too narrow)
- Every file >200 LOC has been read and either flagged or marked OK
- Bug A/B/C have file-level verdicts (not hypotheses)
- Round-3c leftover sweep returns explicit list
- Phase suggestions provide a starting framework for plan growth
