---
title: "Pod-Tee Theme Funnel Reset — Wide Audit + Backlog-Driven Improvements"
description: "Audit every pod-tee-theme file → ranked improvement backlog → ship phases organically. No timeline pressure. Build right, then publish to replace BuildMyPOD live theme."
status: in-progress
priority: P1
effort: ~60-90 min audit + N phases (sized after audit)
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: []
blocks: []
progress: "Phases 02 + 03 + 04 completed; Phase 05 code-complete (smoke-deferred); Phases 06-10 pending."
last_updated: 2026-05-11
related:
  - brainstorm: C:\Users\BINH LY\.claude\plans\the-current-bug-lexical-locket.md
  - card-loading-benchmark: plans/reports/brainstormer-260511-1203-card-loading-benchmark.md
  - superseded-round-4: plans/260509-1821-pod-tee-cart-perf-round-4/plan.md
  - parent-sprint: plans/260509-1057-pod-tee-bug-fix-round-2/plan.md
  - halt-postmortem: docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md
  - slc-research: plans/reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md
tags: [shopify, theme, pod-tee, dopamiles, funnel-reset, wide-audit, backlog-driven, pre-publish]
created: 2026-05-11
updated: 2026-05-11
---

# Pod-Tee Theme Funnel Reset

## Context

Live `dopamiles.co` runs `BuildMyPOD - Spirituality v1.1.4` (Horizon schema). The 4 bug-fix sprints have been improving `pod-tee-theme` on preview, intended to replace BuildMyPOD when ready. The card-loading benchmark surfaced this scope correction — the URL-level benchmark was measuring the wrong theme.

User intent (locked 2026-05-11 12:20): build pod-tee-theme right via wide audit + many improvements, then publish. No timeline pressure.

## Approach — Audit-then-backlog

1. **Phase 01 — Wide audit (local files only).** Read every theme file (snippets, sections, JS, CSS, layouts, templates). Produce a ranked backlog: bugs, perf anti-patterns, A11y gaps, dead code, modularization opportunities, missing tests/docs. Output report at `plans/reports/brainstormer-260511-1220-pod-tee-wide-audit.md`.
2. **Phases 02+ — Drafted from backlog.** Each phase = 1-3 related backlog items. Halt rule: 1 iteration max per phase. Phases written incrementally, not all upfront. Plan grows organically as audit findings prioritize.

## Known bugs feeding into audit

| Bug | Wording | Source |
|---|---|---|
| A — Cart ATC perf | Round-3c "fake animation" rejection | Halt journal |
| B — Globo PDP swatches | "Globo is critical" | Halt journal |
| C — Collection card "wrong first photo" | User flagged 2026-05-11 | Brainstorm |
| + many more | TBD from wide audit | Phase 01 |

## Locked decisions

- Audit target: **local `pod-tee-theme` files only** (preview URL not reliably accessible; live `dopamiles.co` is BuildMyPOD, not relevant)
- Competitor benchmarks: historee / sloth / shrine done — Sloth (same Globo, 1-img/card) is the proven reference pattern; reuse where applicable
- Real-iPhone verification gates: user-side, per phase, on preview URL after each ship
- Halt rule: 1 iteration max per phase
- Preserved across phases: build-tag, error overlay, JSON product data island
- Ship plan: publish when all "many tasks" done — no rush

## Phases

| # | Phase | Status | Effort |
|---|---|---|---|
| 01 | [Wide audit — every file, ranked backlog](phase-01-audit.md) | completed | 60-90 min |
| 02 | [Round-3c rejection cleanup](phase-02-round-3c-cleanup.md) | completed (iPhone verified 2026-05-11) | M (3-4h) |
| 03 | [Bug C fix — collection card image](phase-03-bug-c-card-image.md) | completed (iPhone verified 2026-05-11) | S (1h) |
| 04 | [Bug B fix — Globo CLS + double-render](phase-04-bug-b-globo-cls.md) | completed (iPhone verified 2026-05-11) | L (3-5h) |
| 05 | [dopamiles-cart.js strangler split](phase-05-cart-js-strangler.md) | code-complete (smoke-deferred) | L (4-6h) |
| 06 | [product-hero JS extraction + collection filter drawer](phase-06-product-hero-extraction.md) | pending | L (4-6h) |
| 07 | [Card consistency + a11y](phase-07-card-consistency-a11y.md) | pending | M (2-3h) |
| 08 | [Perf pass — conditional CSS, font swap, 3pack gating](phase-08-perf-pass.md) | pending | L (4-6h) |
| 09 | [Copy, tokens, locales](phase-09-copy-tokens-locales.md) | pending | M (2-3h) |
| 10 | [Tail cleanup — P2 remainder + 20 P3s](phase-10-tail-cleanup.md) | pending | L (6-8h) |

## Out of scope

- Live BuildMyPOD theme fixes (will be retired on publish)
- Customer-side A/B testing
- Multi-tenant (Dopamiles is the only target)
- Re-platforming away from Shopify

## References

- Brainstorm: `C:\Users\BINH LY\.claude\plans\the-current-bug-lexical-locket.md`
- Card-loading benchmark: `plans/reports/brainstormer-260511-1203-card-loading-benchmark.md`
- Superseded round-4: `plans/260509-1821-pod-tee-cart-perf-round-4/plan.md`
- Halt journal: `docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md`
- SLC research: `plans/reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md`
