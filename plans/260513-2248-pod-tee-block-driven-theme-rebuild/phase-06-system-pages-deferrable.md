# Phase 06 — System pages (DEFERRABLE)

**Status:** pending — explicit DEFER candidate
**Owner:** code
**Effort:** 2-3h
**Depends on:** Phase 05
**Gate:** none — skip-able

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

## Halt rule
1 iteration max. If anything breaks customer-account flows → halt + revert that file.

## Next phase
Phase 07 — Publish prep + ship.
