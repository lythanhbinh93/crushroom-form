---
title: "pod-tee Block-Driven Theme Rebuild — Customization + Publish"
description: "Retrofit 24 hardcoded dopamiles-* sections into block-driven schema with Tier 2 customization (size/spacing/alignment/token-color), via 10 reusable theme blocks. Phased by template. Publish to dopamiles.co at end."
status: in-progress
progress: "Phase 01 SHIPPED 2026-05-14 (theme repo 9612985 + plan repo 0cb6db3). 30/30 QA pass on preview theme 158279991548. Phases 02-07 remain."
priority: P1
effort: 20-33h (across 7 phases)
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: [260511-1132-pod-tee-funnel-reset]
blocks: []
related:
  - brainstorm: plans/reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md
  - emulated-qa: plans/reports/web-testing-260513-2207-pod-tee-emulated-iphone-qa.md
  - predecessor: plans/260511-1132-pod-tee-funnel-reset (this plan absorbs its publish goal)
  - shopify-os2-blocks: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks
tags: [shopify, theme, pod-tee, dopamiles, blocks, theme-editor, customization, publish]
created: 2026-05-13
---

# pod-tee Block-Driven Theme Rebuild

## Goal
Convert hardcoded dopamiles-* sections to block-driven schemas so merchant can customize every page in the Shopify theme editor without touching code. Hybrid model: 10 reusable theme blocks under `blocks/dop-*.liquid` + existing section-specific blocks stay. Publish to dopamiles.co live when retrofit complete.

## Source of truth
- Brainstorm: [`plans/reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md`](../reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md)

## Customization tier (locked)
**Tier 2** — content + size selects + padding/margin sliders + alignment + token-bound color schemes. NO free font/color pickers. NO animations. ~10-15 settings per block.

## Phases

| # | Phase | Effort | Gate |
|---|---|---|---|
| 01 | [Theme-block foundation library + QA pipeline foundation](phase-01-theme-block-foundation-library.md) ✅ | 6-10h (actual ~3.5h) | **PASS** — 30/30 |
| 02 | [Homepage template (home-hero, manifesto, newsletter + accept @theme on already-blocked)](phase-02-homepage-template.md) | 4-6h | Automated QA (mobile critical) |
| 03 | [PDP template (product-hero, reasons, trust-trio, bundle, 3pack-picker)](phase-03-pdp-template.md) | 3-5h | Automated QA (mobile critical) |
| 04 | [Collection + cart templates](phase-04-collection-cart-templates.md) | 2-4h | Automated QA (mobile critical) |
| 05 | [Misc pages (contact, page, search, blog)](phase-05-misc-pages.md) | 3-5h | Automated QA (mobile + desktop) |
| 06 | [System pages — DEFERRABLE (404, password, gift-card, customer-*)](phase-06-system-pages-deferrable.md) | 2-3h | Automated smoke (mobile) |
| 07 | [Publish prep + ship (fix 2 JS bugs + theme swap)](phase-07-publish-prep-and-ship.md) | 2-4h | Automated full-regression + 5-min user spot-check + LIVE |

**Total effort:** 22-37h (up from 20-33h after absorbing QA pipeline foundation into Phase 01).

## Definition of done (publish gate)
- 10 theme blocks live + render correctly in editor
- All non-deferred sections accept theme blocks via @theme declaration
- Merchant can build homepage end-to-end in theme editor without code
- Automated mobile + desktop QA passes per phase (mobile P0 blocker)
- Theme check: zero new errors vs baseline (11 errors / 38 warnings pre-existing)
- 2 flagged JS bugs fixed (`amount is not defined`, cart-main script-order)
- Cumulative regression suite passes before publish
- 5-minute user spot-check on real iPhone immediately before publish (final safety net)
- dopamiles.co live theme is pod-tee; BuildMyPOD retired
- Rollback runbook drafted

## Cross-plan dependency
This plan begins after [`260511-1132-pod-tee-funnel-reset`](../260511-1132-pod-tee-funnel-reset/plan.md) iPhone QA passes (its current sole blocker — funnel-reset already had a user iPhone QA gate; this plan adopts automated QA going forward). Funnel-reset's "publish" goal is absorbed into this plan's Phase 07.

## QA strategy

**Locked decision (2026-05-13 22:58 ICT):** User-side iPhone QA replaced with automated emulated QA between every phase. 5-min user spot-check retained at publish moment only.

### Viewports (per phase)

| Viewport | Resolution | Browser engine | Priority |
|---|---|---|---|
| iPhone 14 | 390×844 | Playwright Chromium | **P0 — blocks merge** |
| iPhone 14 | 390×844 | Playwright **WebKit** | **P0 — blocks merge** (closes ~80% of Safari-only gap) |
| iPhone SE | 375×667 | Playwright Chromium | P1 — flag if regress |
| Desktop | 1280×800 | Playwright Chromium | P1 — flag if regress |

Mobile (P0) failures HALT phase. Desktop/SE (P1) failures are FLAGGED but the phase can proceed if user confirms.

### Severity tiers

| Tier | Condition | Action |
|---|---|---|
| **P0** | New JS pageerror in mobile, theme check new errors, phase-specific must-pass assertion fails, theme served = wrong theme | Halt phase. Snapshot. Scope next iteration. |
| **P1** | Lighthouse mobile score drops 5-10pts, new network failures, visual diff >5%, desktop layout regression | Flag in report. Ask user before proceeding. |
| **P2** | Pre-existing flagged issues, animation timing, minor visual diff <5%, desktop-only quirks | Log in report. Auto-proceed. |

### Pipeline structure

Lives under `qa/` in this plan dir. Built in Phase 01.

```
qa/
├── README.md              # Pipeline docs (created in Phase 01)
├── package.json           # playwright dep
├── lib/
│   ├── preview.mjs        # Browser + viewport + preview cookie helpers
│   ├── assertions.mjs     # Shared assertions (whitespace gap, console capture, theme integrity)
│   ├── viewports.mjs      # Viewport + browser configs
│   └── report.mjs         # Markdown report writer
├── phase-01.mjs           # Per-phase scripts (one per phase, sharing lib/)
├── phase-02.mjs
├── ...
├── phase-07.mjs
├── shots-{phase}-{viewport}/  # Screenshots per run
└── reports/
    └── {phase}-{date}.md  # Human-readable QA reports
```

Per-phase script invocation: `cd qa && node phase-NN.mjs` → exits 0 (pass) or 1 (fail). Generates report + screenshots.

### Residual risk acknowledged

Automated emulation does NOT catch:
- Real iOS Safari rendering quirks beyond what WebKit emulation reproduces
- Real touch feel (inertia, gesture conflicts, tap latency)
- True device CPU/thermal throttling
- Globo / FB Pixel runtime behavior with live store data

**Risk-acceptance posture (2026-05-13 23:00 ICT):** User is fully delegating QA to automation. After full project completion (Phase 07 code-complete), user hands the code to **Codex** for manual code review — that is the final pre-publish gate, replacing user real-device QA. Codex catches code-level issues (logic, security, maintainability). It does NOT catch rendering quirks or touch feel — residual gap is accepted.

**Optional safety net (user discretion):** A 5-min real-iPhone spot-check between Codex sign-off and live theme swap is recommended but not gated by this plan. User can run if appetite exists.

## Halt rule
1 iteration max per phase. **P0 automated QA failure** → snapshot + halt + scope next iteration. No inline retry. **P1 flagged** → user decides proceed/halt.

## Out of scope
- Refactoring existing section blocks (FAQ Q&A, accordion, pillar, review) — they work
- Migrating to a different theme base (still Dawn 15.x)
- Removing or replacing app blocks (Globo, FB Pixel)
- Free font/color pickers, animations, per-breakpoint values (Tier 3 escalation rejected)
- A/B testing block layouts
