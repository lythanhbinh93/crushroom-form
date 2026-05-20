---
title: pod-tee mobile sticky ATC — hide on cart drawer open
description: >-
  One CSS rule using :has() to hide the mobile sticky Add-to-Cart bar while the
  cart drawer is open. Binds to .dop-drawer.open directly so all drawer-open
  code paths are covered (Dawn auto-open after ATC, dopamiles openDrawer(), ESC,
  overlay click, programmatic, future modal reuse).
status: in-progress
priority: P3
effort: 15m
repo: 'D:\github local\pod-tee-theme'
branch: feat/pdp-perf-pareto
blockedBy: []
blocks: []
related:
  - sibling: >-
      plans/260520-1010-pod-tee-cart-drawer-offer-revamp (cart drawer revamp —
      independent surface, no overlap)
  - source: >-
      plans/260520-1431-pod-tee-sticky-atc-hide-on-drawer-open/brainstorm-summary.md
      (design rationale, methods evaluated, ultrathink notes)
tags:
  - shopify
  - theme
  - pod-tee
  - dopamiles
  - sticky-atc
  - cart-drawer
  - css
  - mobile
created: 2026-05-20T00:00:00.000Z
---

# pod-tee mobile sticky ATC — hide on cart drawer open

## Overview

Mobile PDP sticky ATC bar remains visible below the cart drawer's Checkout button when drawer is open, creating two competing CTAs and breaking visual hierarchy. Fix: one CSS rule using `:has()` that hides `.dop-mobile-sticky` while `.dop-drawer.open` exists anywhere in the document.

Method decided in [brainstorm-summary.md](./brainstorm-summary.md) — pure CSS, zero JS edit. `:has()` was chosen over body-class-toggle because the cart drawer has multiple open entry points (Dawn product-form.js auto-open, dopamiles `openDrawer()`, programmatic, swipe close) and any JS-class mirror would inevitably desync.

Geometry anomaly (why z-30 paints above z-301 drawer) is suspected stacking-context bug on the sticky ATC's section ancestor. Investigation is **out of scope** for this plan — symptom patch only.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Apply :has() CSS rule and verify on mobile](./phase-01-apply-has-css-rule-and-verify-on-mobile.md) | In Progress |

## Dependencies

None. Touches only `assets/dopamiles-pdp.css` in pod-tee-theme repo. No conflict with concurrent 260520-1010 cart-drawer-offer-revamp plan (different files, different surface).
