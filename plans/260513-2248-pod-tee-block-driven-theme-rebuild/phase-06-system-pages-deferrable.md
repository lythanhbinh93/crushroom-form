# Phase 06 — System pages (DEFERRABLE)

**Status:** pending — explicit DEFER candidate
**Owner:** code
**Effort:** 2-3h
**Depends on:** Phase 05
**Gate:** Automated smoke (mobile P1, desktop P2). Even if executed, this phase's QA is INFORMATIONAL (low-traffic pages, lower bar). Run `node qa/phase-06.mjs` if proceeding.

## Goal
Add `@theme` block accept to 404, password, gift-card, customer-* sections. Low priority — these pages have low traffic + low customization need. Marked DEFERRABLE so plan can skip to Phase 07 (publish) if calendar tight or appetite low.

## Sections in scope

| Section | Notes |
|---|---|
| `dopamiles-404.liquid` | Error page — 6 settings |
| `dopamiles-password.liquid` | Coming-soon page — 4 settings (also layout-bypass — see memory: shopify-layout-bypass-templates-quirk) |
| `dopamiles-gift-card.liquid` | Gift card display — 0 settings currently (also layout-bypass) |
| `dopamiles-customer-login.liquid` | 7 settings |
| `dopamiles-customer-register.liquid` | 7 settings |
| `dopamiles-customer-account.liquid` | 0 settings |
| `dopamiles-customer-addresses.liquid` | 0 settings |
| `dopamiles-customer-order.liquid` | 0 settings |
| `dopamiles-customer-reset.liquid` | 0 settings |

## Decision gate
Before starting: ask user "skip Phase 06 and go straight to Phase 07 publish?" — if yes, mark this phase as `cancelled` and proceed.

## Implementation steps (if proceeding)
1. Add @theme accept to 404, password, gift-card, customer-* (one-line schema additions each)
2. **Layout-bypass templates** (password, gift-card) — `@theme` blocks need inline CSS reference (theme.liquid not loaded). Memory note `shopify-layout-bypass-templates-quirk` applies.
3. Theme check
4. Skip iPhone QA — emulated QA covers these low-traffic pages

## Todo
- [ ] Extend `dopamiles-404.liquid` schema
- [ ] Extend `dopamiles-password.liquid` schema + inline CSS for layout-bypass
- [ ] Extend `dopamiles-gift-card.liquid` schema + inline CSS for layout-bypass
- [ ] Extend 5 customer-* sections
- [ ] Theme check pass
- [ ] Emulated QA (Playwright)
- [ ] Push to preview

## Success criteria
- All system pages render correctly
- Layout-bypass templates still work (password page + gift card view)

## Risk assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Layout-bypass templates don't get theme block CSS | Medium | Inline `<style>` per layout-bypass section as memory suggests |
| Customer account routes change rendering (Shopify-managed) | Low | Don't touch form schemas |

## QA assertions (Phase 06 — if proceeding)

**Script:** `qa/phase-06.mjs`
**Viewports:** iPhone 14 Chromium (P1 since this phase is low-priority)

**P1 — flag → ask user:**
- `/404` test URL returns 404 status, rendered 404 page contains expected copy
- `/password` renders if password page enabled in store settings
- `/account/login` form renders all 3 fields (email, password, submit)
- `/account/register` form renders
- Customer pages do NOT crash (no console pageerrors)

**P2 — log only:**
- Layout-bypass templates (password, gift-card) inline CSS present
- All form actions point to correct Shopify endpoints

## Halt rule
1 iteration max. **If skipped entirely (deferrable):** mark plan status `phase-06: cancelled-deferred-post-launch`.

## Next phase
Phase 07 — Publish prep + ship.
