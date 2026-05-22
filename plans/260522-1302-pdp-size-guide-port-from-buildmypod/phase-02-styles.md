---
phase: 2
title: "Styles"
status: complete
priority: P2
effort: "~30m"
dependencies: [1]
---

# Phase 02: Styles

## Overview

Style the `.dop-size-guide-link` trigger (dashed-underline + icon alignment) and the `.dop-size-guide-modal` container (centered, responsive, mobile-full-width). Reuse Dawn modal base styles where present.

## Requirements

- Functional:
  - Trigger reads as a guide link (dashed underline), not a primary nav link.
  - Modal centers on desktop, fills mobile viewport with safe-area padding.
  - Image inside modal scales to container width, retains aspect ratio.
- Non-functional:
  - No FOUC: trigger styles should not cause layout shift on PDP load.
  - Respect memory[`backdrop_filter_traps_fixed_descendants`]: do not add `backdrop-filter` on any ancestor of the modal.
  - Respect memory[`feedback_ios_safari_aspect_ratio_child_height_bug`]: avoid `height: 100%` inside aspect-ratio containers on the modal image.

## Architecture

<!-- Updated: Validation Session 1 - F1 (pod-tee uses dopamiles-pdp.css, not pdp.css; convention is append-to-shared-stylesheet) -->

CSS location: **append to existing `assets/dopamiles-pdp.css`**.

Rationale:
- Verified convention: every PDP-area section loads `{{ 'dopamiles-pdp.css' | asset_url | stylesheet_tag }}` (dopamiles-bundle.liquid:101, dopamiles-fbt.liquid:189, dopamiles-faqs.liquid:53, dopamiles-mobile-sticky-atc.liquid:56, dopamiles-reviews-placeholder.liquid:91, dopamiles-reasons.liquid:84).
- Loaded as critical preload at `layout/theme.liquid:86` — already on every PDP page.
- One stylesheet for entire PDP surface → no extra HTTP request, no section-stylesheet bundling surprises.
- `assets/pdp.css` referenced in earlier brainstorm summary does NOT exist — the real file is `dopamiles-pdp.css`.

## Related Code Files

- Modify: `assets/dopamiles-pdp.css` — append size-guide trigger + modal styles (~50 LOC added)

## Implementation Steps

1. **Trigger styles** (`.dop-size-guide-link`):
   ```css
   .dop-size-guide-opener {
     display: inline-block;
     margin-inline-start: 0.75rem;
   }
   .dop-size-guide-link {
     display: inline-flex;
     align-items: center;
     gap: 0.375rem;
     background: transparent;
     border: 0;
     padding: 0;
     font: inherit;
     font-size: 0.875rem;
     color: rgb(var(--color-foreground));
     text-decoration: underline dashed rgba(var(--color-foreground), 0.5);
     text-underline-offset: 3px;
     text-decoration-thickness: 1.5px;
     cursor: pointer;
   }
   .dop-size-guide-link:hover {
     text-decoration-color: rgb(var(--color-foreground));
   }
   .dop-size-guide-link:focus-visible {
     outline: 2px solid rgb(var(--color-foreground));
     outline-offset: 2px;
   }
   .dop-size-guide-link svg {
     width: 1em;
     height: 1em;
     flex-shrink: 0;
   }
   ```

2. **Modal styles** (`.dop-size-guide-modal`):
   ```css
   .dop-size-guide-modal[open] {
     position: fixed;
     inset: 0;
     z-index: 100;
     display: flex;
     align-items: center;
     justify-content: center;
     background: rgba(0, 0, 0, 0.5);
     padding: 1rem;
   }
   .dop-size-guide-modal__inner {
     position: relative;
     background: rgb(var(--color-background));
     border-radius: 12px;
     max-width: 720px;
     width: 100%;
     max-height: 90vh;
     overflow-y: auto;
     padding: 1.5rem;
   }
   .dop-size-guide-modal__close {
     position: absolute;
     top: 0.75rem;
     inset-inline-end: 0.75rem;
     background: transparent;
     border: 0;
     padding: 0.5rem;
     cursor: pointer;
     border-radius: 999px;
   }
   .dop-size-guide-modal__close:hover {
     background: rgba(var(--color-foreground), 0.08);
   }
   .dop-size-guide-modal h2 {
     margin: 0 0 1rem;
     font-size: 1.25rem;
   }
   .dop-size-guide-modal img {
     display: block;
     width: 100%;
     height: auto;
   }
   @media (max-width: 749px) {
     .dop-size-guide-modal[open] { padding: 0.5rem; }
     .dop-size-guide-modal__inner { max-height: 95vh; padding: 1rem; }
   }
   ```

3. **Verify in dev** (`shopify theme dev`):
   - Trigger renders inline with Size label, dashed underline visible
   - No layout shift when trigger appears (reserve space? Or accept reflow on first variant-picker render — likely fine since picker is below-the-fold initial paint)
   - Modal opens, centers, image scales correctly
   - ESC + backdrop click + close-button click all close the modal
   - Focus visible on trigger via keyboard navigation

4. **Test on real iOS Safari 16 device** (per memory[`feedback_ios_safari_aspect_ratio_child_height_bug`]). Use BrowserStack or a real device — F12/desktop will not reproduce.

## Success Criteria

- [ ] Trigger renders inline with Size option label, no layout break
- [ ] Modal renders centered on desktop, full-width on mobile
- [ ] Image scales to container, no overflow
- [ ] ESC + backdrop + close button all close
- [ ] Keyboard navigation: Tab reaches trigger, Enter opens modal, Tab cycles within modal, ESC closes
- [ ] iOS Safari 16 layout passes (no inflated heights or stuck overlays)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Dawn `<details-modal>` provides its own open/close styles that conflict | Inspect computed styles in dev; scope our CSS via `.dop-size-guide-modal` class to win specificity |
| Modal `position: fixed` inside a `backdrop-filter` ancestor breaks (memory[`backdrop_filter_traps_fixed_descendants`]) | Modal is rendered at section bottom; check hero section's outer wrapper for backdrop-filter — if present, move modal to closer-to-body via `<details-modal>` natural behavior |
| iOS Safari 16 aspect-ratio bug on image inside modal | Use `width: 100%; height: auto` — no aspect-ratio + child height:100% combination |
| Sticky header overlaps modal | Modal z-index 100 vs sticky header z-index — verify; bump if needed |
| ~~Section stylesheet vs `assets/pdp.css` location wrong choice~~ | RESOLVED by validation: use `assets/dopamiles-pdp.css` per existing PDP-section convention |
