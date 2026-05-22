---
phase: 4
title: "Merchant config and ship"
status: pending
priority: P2
effort: "~45m"
dependencies: [1, 2, 3]
---

# Phase 04: Merchant config and ship

## Overview

Configure the size-guide block in Theme Editor with a real T-shirt sizing chart image, verify on real devices, run 3-push protection test, then publish.

## Requirements

- Functional:
  - Theme has at least one `size_guide_image` block configured with `product_type: "T-shirt"` (or whatever pod-tee tees use) and an uploaded chart image.
  - "Size Guide" link appears on every tee PDP (any product where `product.type == "T-shirt"`).
  - Link absent on products without matching block (test with a cap or sticker product if any exists in store).
  - Modal renders the correct chart image with correct alt text.
- Non-functional:
  - Image weight ≤200KB (compressed JPG or PNG); avoid bloating PDP.
  - Image dimensions ≥800px wide for retina clarity.
  - Verified on real iOS 16 device.

## Architecture

Configuration happens in Theme Editor (live admin), not in repo. Image asset is uploaded to `shop_images` (Shopify CDN), not committed to repo.

Verification matrix:
- Desktop Chrome (current) — golden path
- Desktop Safari (current) — golden path
- Mobile Safari iOS 16.x — per memory[`feedback_ios_safari_aspect_ratio_child_height_bug`]
- Mobile Chrome Android (current) — golden path

## Related Code Files

- None (config-only phase). Possible: add screenshot to plan `reports/` for documentation.

## Implementation Steps

1. **Source / create sizing chart image:**
   - Find or design a T-shirt sizing chart (size × chest/length/sleeve in inches AND cm). Image-only, units baked in.
   - Optimize: ≤200KB, ≥800px wide, JPG (charts) or PNG (with transparency). Use [ai-multimodal] skill or ImageMagick if generating.
   - Save as reference at `plans/260522-1302-pdp-size-guide-port-from-buildmypod/reports/size-chart-tshirt-final.png` for source-of-truth.

2. **Open Theme Editor for `dopamiles-product-hero` section:**
   - Shopify admin → Online Store → Themes → [unpublished theme] → Customize → Products → Default product.
   - Click `dopamiles-product-hero` section → Add block → Select "Size guide image".

3. **Configure block:**
   - `product_type` = `T-shirt` (must match `product.type` exactly — verify spelling in Products admin)
   - `image` = upload the chart image
   - `alt` = `T-shirt sizing chart with measurements in inches and centimeters`
   - Save.

4. **Smoke test on preview PDP:**
   - Open any tee product in preview theme: `https://crushroom.myshopify.com/products/<handle>?preview_theme_id=<id>`
   - Verify: "Size Guide" link visible next to Size label
   - Click → modal opens with chart image
   - ESC closes; backdrop closes; close button closes
   - Repeat for product with `product.type != "T-shirt"` (cap/sticker) → link absent

5. **Real-device QA (CRITICAL — iOS 16):**
   - Test on real iOS 16.x Safari device (BrowserStack or physical).
   - Verify: modal renders correctly, image scales, no layout inflation bug.
   - Test on iOS 17+ for control.
   - Test on Android Chrome.

6. **3-push protection test** (gates Phase 03 success):
   ```powershell
   cd "d:/github local/pod-tee-theme"
   # baseline — record current product.json hash from admin
   shopify theme push --theme=<PREVIEW_THEME_ID>
   shopify theme push --theme=<PREVIEW_THEME_ID>
   shopify theme push --theme=<PREVIEW_THEME_ID>
   # reload preview PDP, confirm Size Guide image still present
   ```
   If image disappears after any push → `.shopifyignore` failed → return to Phase 03.

7. **Lighthouse audit:**
   - Run Lighthouse on tee PDP (preview theme).
   - Compare a11y + performance to baseline at `plans/260518-1833-pdp-lighthouse-perf-pareto/reports/baseline-summary.json`.
   - Acceptable: ≤2 point a11y regression, ≤5% perf regression.
   - If image weight pushes LCP regression: re-compress, swap to AVIF if Shopify renderer supports.

8. **Publish:**
   - If preview is a separate theme from live: use Theme Editor "Publish".
   - If swap-based: rename strategy per memory[`project_pod_tee_wave_1_shipped`] atomic swap process.

9. **Post-publish smoke test:**
   - Live PDP shows Size Guide link
   - Modal opens correctly
   - Cap/sticker products do NOT show link

10. **Update docs/journal:**
    - Add entry to `docs/journals/` documenting the ship.
    - Add `[Size Guide pattern](size_guide_pdp_pattern.md)` to memory if the pattern is reusable.

## Success Criteria

- [ ] Size guide block configured with real T-shirt chart image
- [ ] Link visible on all tee PDPs
- [ ] Link hidden on non-tee products
- [ ] Modal opens, image renders, all close methods work
- [ ] iOS 16 real-device verification passed
- [ ] 3-push protection test passed (image survives)
- [ ] Lighthouse a11y not regressed
- [ ] Live theme published
- [ ] Journal entry written

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Image weight kills LCP / mobile perf | Compress to ≤200KB, AVIF/WebP if Shopify renderer supports |
| Wrong `product.type` spelling between block setting and product admin | Use Products admin to copy/paste exact string; document handleize forgiveness |
| iOS 16 layout bug shows up on real device but not desktop | Have rollback theme ready (per memory[`project_pod_tee_wave_1_shipped`] atomic-swap process) |
| Theme push wipes config despite `.shopifyignore` (Phase 03 failure) | 3-push test catches this BEFORE publish; rollback to Phase 03 |
| Customer-facing copy issues (alt text typos, "Size guide" capitalization) | Final copy review before publish; check against brand voice in `docs/dopamiles-theme-ux-brief.md` |
| Globo color swatch app interferes with modal trigger placement | Verify in dev — trigger is on Size option, Globo only touches color; should be safe (memory: pod-tee Globo coexistence already handled in variant-sync) |
