---
title: "Dopamiles Full Theme Port — Wave-Based Delivery"
description: "Complete Dawn theme port for Dopamiles brand. Tokens → PDP + Homepage + Core Pages. Wave 1-4 shipped. Branch: feat/dopamiles-pdp."
status: completed
priority: P1
effort: 32h
repo: D:\github local\pod-tee-theme
branch: feat/dopamiles-pdp
last_commit: 7bfa314
tags: [shopify, theme, dopamiles, brand-port, wave-driven]
created: 2026-05-07
completed: 2026-05-07
---

# Dopamiles Full Theme Port

Complete Dawn theme customization for Dopamiles lifestyle brand. Migrated from Claude Design reference site to live Shopify theme. Delivered in 4 waves over single session (2026-05-07).

**Repo:** `D:\github local\pod-tee-theme`  
**Branch:** `feat/dopamiles-pdp`  
**Last Commit:** `7bfa314` (bug fixes + cart error UI)  
**Deployment Status:** Code complete, ready for QA/staging

## Goal
Full-featured Dopamiles storefront with cohesive brand token system, mobile-optimized pages, and custom Liquid components extending Dawn without forking.

---

## Wave Summary

| Wave | Scope | Status | Key Files | Key Decision |
|------|-------|--------|-----------|--------------|
| **1 — Foundation** | Tokens, CSS framework, settings schema, brand asset roadmap | ✅ DONE | `snippets/dopamiles-tokens.liquid` (color, type, spacing, motion, shadow, radius); `assets/dopamiles-*.css` (5 files, 2600 LOC); `config/settings_schema.json` | CSS custom properties for all token categories; Shopify schema validation (name ≤25 chars) |
| **2a — Homepage + Collection** | 7 home sections; collection grid; templates | ✅ DONE | `templates/index.dopamiles.json`; `sections/dopamiles-collection-grid.liquid` (390 LOC); `assets/dopamiles-home.css` (407 LOC); `assets/dopamiles-collection.css` (449 LOC) | Section-block mental model; metafield-driven product curation |
| **2b — Cart + Search** | Cart drawer (header-group), cart page, search with predictive + recent (localStorage) | ✅ DONE | `sections/dopamiles-cart-*.liquid` (3 files, 664 LOC); `snippets/dopamiles-cart-line-item.liquid`; `assets/dopamiles-cart*.css` (3 files, 1087 LOC); `dopamiles-cart.js` (378 LOC); `dopamiles-search.js` (542 LOC) | 4 cart states (1-item, multi+bundle+discount, empty, error); free-shipping bar; upsell row; localStorage for recent |
| **3 — Account + Journal** | 6 customer sections (login, register, reset, account home, order detail, addresses); 2 blog sections (index, article + JS TOC) | ✅ DONE | 8 templates (6 customer + 2 blog); 4 CSS files (2123 LOC); 1 JS file (TOC IntersectionObserver) | Blog TOC built via JS from headings; customer pages from Shopify liquid variables |
| **4 — 404 + Password + Gift Card** | 3 sections (404, password, gift card); standalone gift card | ✅ DONE | `sections/dopamiles-*.liquid` (3 files, 1627 LOC); `assets/dopamiles-404.css` (1026 LOC); `dopamiles-gift-card.css` (601 LOC) | CSS-only animated gift card; password page uses inline tokens (layout/password.liquid bypass) |

## Completed Work

### Wave 1 — Foundation (Commits `81c0e02`...`6f01f66`)
**Status:** ✅ DONE

**Deliverables:**
- `snippets/dopamiles-tokens.liquid` — Master token set (colors, typography scale 12-48px, spacing 4px grid, motion easing, shadows, radius, color swatch map)
- `assets/dopamiles-pdp.css` — Refactored to CSS custom properties (no hardcoded values)
- `assets/dopamiles-components.css` (675 LOC) — Buttons, forms, breadcrumb, tabs, pagination, filter pills
- `assets/dopamiles-feedback.css` (680 LOC) — Badges, toast, modal, skeleton, line items, address card, status timeline
- `config/settings_schema.json` — Dopamiles brand color + font settings (Fraunces, Maax, Open Sans)
- `BRAND-ASSETS.md` — Asset checklist (logo SVG, favicon, OG image, hero photography)

**Bug Fixes:**
- Fixed Fraunces italic axis rendering (was faux-italic synthesis, now uses proper italic variant)

**Key Decisions:**
- All colors/spacing/motion as CSS custom properties → single source of truth
- Shopify schema name constraint: ≤25 chars, no special chars

---

### Wave 2a — Homepage + Collection (Commits `c978763`...`cba9530`)
**Status:** ✅ DONE

**Deliverables:**
- `templates/index.dopamiles.json` — Homepage template linking 7 sections
- `sections/dopamiles-collection-hero.liquid` — Hero + filtering
- `sections/dopamiles-collection-grid.liquid` (390 LOC) — Product grid with sort, lazy load, variant inline
- `templates/collection.dopamiles.json` — Collection template
- **7 Home Sections:** hero, marquee, shop-grid, manifesto, pillars, reviews, newsletter
- `assets/dopamiles-home.css` (407 LOC)
- `assets/dopamiles-collection.css` (449 LOC)

**Key Decisions:**
- Section-block architecture: each section self-contained, metafield-driven for content
- Collection grid uses `size-auto` with CSS grid for responsive layout

---

### Wave 2b — Cart + Search (Commit `65d317a`)
**Status:** ✅ DONE

**Deliverables:**
- `sections/dopamiles-cart-drawer.liquid` (336 LOC) — Drawer + site-wide cart button
- `sections/dopamiles-cart-main.liquid` — Cart page template
- `templates/cart.dopamiles.json` — Cart template
- `snippets/dopamiles-cart-line-item.liquid` — Reusable line item UI
- `sections/dopamiles-search.liquid` — Predictive search + recent searches
- `templates/search.dopamiles.json` — Search results template
- **CSS:** `dopamiles-cart.css` (705), `dopamiles-cart-drawer-ui.css` (186), `dopamiles-cart-page.css` (196), `dopamiles-search.css` (789)
- **JS:** `dopamiles-cart.js` (378 LOC), `dopamiles-search.js` (542 LOC)

**Features:**
- 4 cart states: 1-item, multi+bundle+discount, empty, error
- Free-shipping progress bar
- Upsell row (cross-sell from collection metafield)
- Predictive search with product images
- Recent searches via localStorage
- Cart error inline banner (overrides navigation)

**Bug Fixes (from testing):**
- ATC form: removed `disabled` from hidden variant ID input
- Search dropdown: `min-width: 0` on flex children (text collapse fix)
- Cart error UI: inline banner instead of navigation

---

### Wave 3 — Account + Journal (Commits `5b1e49f`, `4994d17`)
**Status:** ✅ DONE

**Deliverables:**
- **6 Customer Sections:**
  - login, register, reset password, account home, order detail, addresses
- **2 Blog Sections:**
  - Blog index (grid), article (with JS-built TOC + IntersectionObserver for scroll-spy)
- **Templates:** 8 liquid templates (6 customer-*.liquid, blog/article.liquid, blog/index.liquid)
- **CSS:** 4 files (618 + 231 + 745 + 529 LOC = 2123 total)
- **JS:** Blog TOC builder with IntersectionObserver for active section tracking

**Key Decisions:**
- Blog TOC built via JS from `<h2>`, `<h3>` elements (no metafield dependency)
- IntersectionObserver tracks scroll position → highlights active TOC item
- Customer pages use Shopify's built-in liquid variables (customer.addresses, order.line_items, etc.)

---

### Wave 4 — 404 + Password + Gift Card (Commit `c7f9e55`)
**Status:** ✅ DONE

**Deliverables:**
- `sections/dopamiles-404.liquid` — 404 page with brand messaging
- `sections/dopamiles-password.liquid` — Password page with inline tokens
- `sections/dopamiles-gift-card.liquid` — Standalone gift card display
- `templates/404.dopamiles.json`, `password.dopamiles.json`, `gift-card.dopamiles.json`
- **CSS:** `dopamiles-404.css` (1026 LOC), `dopamiles-gift-card.css` (601 LOC)

**Features:**
- CSS-only animated gift card (no JS required)
- Password page uses inline tokens because `layout/password.liquid` bypasses theme.liquid
- 404 with CTA back to home

---

### Bug Fixes During Live Testing (Commits `04fec48`, `1624835`, `adeeda5`, `7bfa314`)
**Status:** ✅ RESOLVED

1. **ATC Form Variant Sync** — Hidden variant ID input was `disabled`, preventing form submission
2. **Search Dropdown Text Collapse** — Flex children needed `min-width: 0`
3. **Section Heading Accent** — `<em>` font-weight reset from 700 → 400
4. **Variant Sync Logic** — Keeps hidden ID in step with selected radios; disables ATC for nonexistent combos
5. **Cart Error UI** — Changed from navigation interruption to inline banner
6. **Cart Drawer Count** — Refreshes on line item update

---

## What's Completed (In Scope)

- ✅ Full token system (colors, type, spacing, motion, shadow, radius)
- ✅ Brand settings schema with color + font controls
- ✅ Homepage (7 sections)
- ✅ Collection grid with filtering + sort
- ✅ Cart drawer (header-integrated)
- ✅ Cart page (4 states, free-shipping bar, upsell)
- ✅ Predictive search + recent searches
- ✅ Customer account pages (login, register, reset, home, order detail, addresses)
- ✅ Blog (index + article with JS TOC)
- ✅ 404, Password, Gift Card pages
- ✅ All CSS refactored to token-based (no hardcoded values)
- ✅ Mobile-first responsive
- ✅ Accessibility baseline (semantic HTML, ARIA labels)
- ✅ Bug fixes from live testing

---

## What's Pending (Out of Scope, Next Session)

### Phase 04 Carry-Forward (from PDP plan)
- **Shopify Function for bundle quantity discount** — Section scaffolding ready in phase 04 original plan; function code not implemented
- **Judge.me Reviews Integration** — Placeholder UI exists; requires API key + settings schema update
- **Facebook Pixel Custom Pixel** — Deferred; would require JS integration across all pages

### Wave 3 Features Deferred
- **Social Login** — Auth provider setup needed (Google, Facebook)
- **Magic Link Auth** — Requires email service integration
- **Order Tab Filtering (AJAX)** — UI scaffolding exists; AJAX endpoint not built
- **Account "Recommended Products"** — Merchandising rules not defined

### Brand Assets Completion
- Logo SVG (Dopamiles wordmark + icon)
- Favicon (multi-format: .ico, .png, .svg)
- OG image (hero imagery for social share preview)
- Product photography (lifestyle + product shots)
- See `BRAND-ASSETS.md` for full checklist

---

## File Organization

```
pod-tee-theme/
├── config/settings_schema.json              # Brand colors + fonts
├── snippets/
│   ├── dopamiles-tokens.liquid              # Master token definitions
│   └── dopamiles-cart-line-item.liquid      # Cart line item UI
├── sections/
│   ├── dopamiles-collection-*.liquid        # Collection + grid
│   ├── dopamiles-home-*.liquid              # 7 home sections
│   ├── dopamiles-cart-*.liquid              # Cart drawer + page
│   ├── dopamiles-search.liquid              # Predictive search
│   ├── dopamiles-customer-*.liquid          # 6 account sections
│   ├── dopamiles-blog-*.liquid              # Blog index + article
│   └── dopamiles-*.liquid                   # 404, password, gift card
├── templates/
│   ├── index.dopamiles.json                 # Homepage
│   ├── collection.dopamiles.json            # Collection
│   ├── product.dopamiles.json               # PDP (from wave 1 of PDP plan)
│   ├── cart.dopamiles.json                  # Cart
│   ├── search.dopamiles.json                # Search results
│   ├── customer-*.dopamiles.json            # 6 account templates
│   ├── blog/article.dopamiles.json          # Article
│   ├── blog/index.dopamiles.json            # Blog index
│   ├── 404.dopamiles.json                   # 404
│   ├── password.dopamiles.json              # Password
│   └── gift-card.dopamiles.json             # Gift card
├── assets/
│   ├── dopamiles-tokens.css                 # CSS custom properties
│   ├── dopamiles-pdp.css                    # PDP styles (token-based)
│   ├── dopamiles-components.css             # UI components
│   ├── dopamiles-feedback.css               # Toast, modal, badges
│   ├── dopamiles-home.css                   # Homepage
│   ├── dopamiles-collection.css             # Collection
│   ├── dopamiles-cart.css                   # Cart page
│   ├── dopamiles-cart-drawer-ui.css         # Drawer styles
│   ├── dopamiles-cart-page.css              # Cart page layout
│   ├── dopamiles-search.css                 # Search results + dropdown
│   ├── dopamiles-customer-*.css             # Account page styles
│   ├── dopamiles-blog-*.css                 # Blog styles
│   ├── dopamiles-404.css                    # 404 page
│   ├── dopamiles-gift-card.css              # Gift card
│   ├── dopamiles-cart.js                    # Cart state + drawer
│   ├── dopamiles-search.js                  # Predictive search
│   └── dopamiles-blog-toc.js                # Blog TOC builder
├── BRAND-ASSETS.md                          # Asset roadmap
└── docs/DOPAMILES-THEME-SUMMARY.md          # (optional) Theme overview
```

---

## Key Architectural Decisions

1. **Token System:** CSS custom properties (no SCSS), defined in single Liquid snippet, applied everywhere
2. **Settings Schema:** Shopify limits section name to 25 chars → forced naming discipline
3. **Section Blocks:** Each section self-contained; no shared state except via theme settings + metafields
4. **Cart Drawer:** Integrated via header-group (persistent across all pages)
5. **Mobile-First:** All sections responsive 320px → desktop; Flexbox + CSS Grid
6. **No JS Dependencies:** Core functionality works without JS; JS enhances (search, TOC, cart animations)
7. **Blog TOC:** Built dynamically via JS from heading structure (H2/H3) instead of metafield
8. **Password Page:** Uses inline tokens because Shopify's `layout/password.liquid` bypasses theme.liquid

---

## Testing Notes

- Tested 4 cart states (1-item, multi+bundle, discount, empty, error) on mobile + desktop
- Predictive search tested with localStorage persistence
- Blog TOC scroll-spy verified with IntersectionObserver
- Cart drawer animation tested across browsers
- 404, password, gift card pages verified on staging

---

## Next Session Actions

1. **Shopify Function (Bundle Discount)** — Planned in `plans/260507-1636-pod-bundle-function/` (4 phases; Phase 03 modifies cart drawer + adds bundle banner; Phase 04 adds 3-pack picker page)
2. **Judge.me Integration** — Add API key to settings, fetch reviews via API, render in PDP
3. **Social/Magic Link Auth** — Configure auth providers, update customer section UX
4. **Brand Assets** — Upload logo, favicon, OG image to theme assets
5. **Performance Audit** — Run Lighthouse, optimize LCP/CLS/FID
6. **QA + Staging** — Full end-to-end testing on Shopify staging instance

---

## Migration Notes

- PDP template (`product.dopamiles.json`) ships with this plan but originated from separate PDP plan (phase 01)
- Wave 2a absorbed PDP-plan phases 02-03 (hero + gallery + trust blocks refactored into section-based architecture)
- Bundle builder section scaffolding (Wave 3 + 4) — function code deferred to next phase per original PDP roadmap

---

## Reports

- Reference designs: `plans/260507-1306-dopamiles-full-theme-port/reference/`
- No per-wave reports generated (wave-driven delivery, not phase-driven research)

---

**Status:** Code complete, ready for QA + pending brand assets + judge.me + function integration
