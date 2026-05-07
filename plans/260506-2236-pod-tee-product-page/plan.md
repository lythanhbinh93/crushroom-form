---
title: "POD Tee Product Page Template (Dawn-based)"
description: "High-converting Shopify product page for POD tees on Dawn — bundle builder, FBT, mobile-first, Meta-ads optimized."
status: pending
priority: P2
effort: 22h
branch: claude/add-photo-upload-tool-p3dI0
tags: [shopify, dawn, pod, theme, product-page, meta-ads]
created: 2026-05-06
---

# POD Tee Product Page Template

Custom Shopify product page template built atop Dawn 15.x for a single product type (t-shirts) optimized for Meta-ads cold traffic (90% mobile). Lives in a NEW separate repo `D:\github local\pod-tee-theme\`. Plan + phase docs stay here in `crushroom-form`.

## Goal
Ship a `product.pod-tee.json` template with custom sections that:
- Convert mobile-first cold traffic from Meta ads
- Drive AOV via bundle builder (qty breaks) and frequently-bought-together
- Hit LCP <2.5s and fire FB Pixel events correctly
- Stay maintainable: extends Dawn, doesn't fork it

## Status Summary

**2026-05-07 Update:** Phases 01-03 completed. Visual portions of phases 04-05 absorbed into broader Dopamiles full-theme-port (Wave 4). See `260507-1306-dopamiles-full-theme-port/plan.md` for wave-by-wave delivery. Phase 04 (Function code) + Phase 05 (FBT JS) + Phase 06 (Pixel + performance) deferred to next session.

**2026-05-07 Cross-plan Update:** Phase 04 (Function code + bundle UX) **superseded by** `plans/260507-1636-pod-bundle-function/` — that plan delivers the full bundle stack (Function in Rust, Polaris admin, theme integration, 3-pack picker). Phase 04 status remains in_progress until that plan ships; mark completed (superseded) when bundle plan reaches Phase 03.

## Phases

| # | Phase | Status | Effort | Notes |
|---|-------|--------|--------|-------|
| 01 | [Repo Init + Dawn Scaffold](phase-01-repo-init-dawn-scaffold.md) | completed | 2h | Wave 1 foundation (tokens, components) |
| 02 | [Product Template + Hero/Gallery](phase-02-product-template-hero-gallery.md) | completed | 5h | Wave 1 + Wave 2a; section-based refactor |
| 03 | [Trust Blocks (Size Chart, Badges, Urgency, Social Proof)](phase-03-trust-blocks-conversion-supports.md) | completed | 4h | Wave 1 + Wave 2a components + feedback CSS |
| 04 | [Bundle Builder (Quantity Breaks)](phase-04-bundle-builder-quantity-breaks.md) | in_progress | 4h | Section scaffolding done (Wave 4); Function code deferred |
| 05 | [Frequently Bought Together](phase-05-frequently-bought-together.md) | in_progress | 4h | Metafield definitions ready (Wave 3); JS hooks in place |
| 06 | [FB Pixel + Performance Pass](phase-06-fb-pixel-performance-pass.md) | pending | 3h | Performance audit + Pixel integration next |

## Key Decisions Locked

- **Discount engine**: Shopify Functions (native, free) for qty-break discount. Phase-04 documents the integration touchpoint; if user prefers app, swap is isolated to one section.
- **FBT data source**: Manual curation via product metafield `custom.fbt_products` (list.product_reference). No algorithm — cold-start safe, merchant control.
- **Variant picker**: EXTEND Dawn's existing `product-variant-picker.liquid`, do not replace. Layer URL-param sync via small JS module.
- **Sticky mobile ATC**: New snippet, CSS-only show/hide via media query + IntersectionObserver to suppress when main ATC visible.
- **Out of scope (v1)**: non-tee products, cart/checkout customization, email capture popups, multi-language, multi-currency.

## File Ownership Map (no parallel-phase conflicts)

| Phase | Owns (creates/modifies) |
|-------|-------------------------|
| 01 | repo root, `config/settings_schema.json` (baseline only) |
| 02 | `templates/product.pod-tee.json`, `sections/pod-product-hero.liquid`, `snippets/pod-mockup-carousel.liquid`, `snippets/pod-variant-picker.liquid`, `assets/pod-product.css`, `assets/pod-product.js` |
| 03 | `sections/pod-size-chart.liquid`, `sections/pod-trust-badges.liquid`, `sections/pod-social-proof.liquid`, `snippets/pod-urgency-timer.liquid` |
| 04 | `sections/pod-bundle-builder.liquid`, `extensions/pod-qty-discount/` (Shopify Function), appends to `assets/pod-product.js` |
| 05 | `sections/pod-frequently-bought.liquid`, metafield definitions doc, appends to `assets/pod-product.js` |
| 06 | `snippets/pod-fb-pixel.liquid`, performance audits, no new sections |

## Reports
Research and reviews: `d:\github local\crushroom-form\plans\reports\`
Naming: `{role}-260506-2236-{slug}.md`
