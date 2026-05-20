---
phase: 1
title: Mobile .dop-section padding rule
status: completed
priority: P3
effort: 15min
dependencies: []
---

# Phase 1: Mobile .dop-section padding rule

## Overview

Add a single mobile-only `@media` rule that halves `.dop-section` padding from `64px 0` to `32px 0` on viewports ≤960px. Reduces mobile section-to-section gap from 128px stacking to 64px. Desktop unchanged.

## Requirements

**Functional**
- On viewport ≤960px, every element with `.dop-section` class has `padding: 32px 0`.
- On viewport >960px, padding remains `64px 0` (existing rule unchanged).
- Affects 6 PDP sections that use `.dop-section`: fbt, niche-favorites, reasons, more-from-niche, reviews-placeholder, faqs.

**Non-functional**
- Zero JS changes.
- Zero Liquid changes.
- Single 3-line CSS rule added.
- Specificity: `@media (max-width: 960px) .dop-section` = (0,1,0) — same as base rule. Source order wins; new rule is appended after base, so it overrides on mobile.
- Mobile breakpoint `max-width: 960px` matches existing PDP mobile patterns at [dopamiles-pdp.css:805](d:\github%20local\pod-tee-theme\assets\dopamiles-pdp.css#L805) and line 821 — consistent.

## Architecture

Single CSS rule appended directly after the existing base rule. No new tokens, no new selectors, no JS plumbing. Existing `border-top: 1px solid var(--dop-line)` from the base rule stays intact — the visual divider between sections remains visible.

```css
.dop-section { padding: 64px 0; border-top: 1px solid var(--dop-line); }

@media (max-width: 960px) {
  .dop-section { padding: 32px 0; }
}
```

## Related Code Files

**Modify**
- `pod-tee-theme/assets/dopamiles-pdp.css` — append the rule immediately after the existing `.dop-section { padding: 64px 0; ... }` block at ~line 523.

**Read for context (no edit)**
- `pod-tee-theme/snippets/dopamiles-tokens.liquid` — confirms `--dop-s-6: 32px` exists as a token (informational; rule uses literal `32px` to match the existing rule's literal `64px` and avoid token churn this round).

**No change**
- All other files.

## Implementation Steps

1. **Locate insertion point**: open `d:\github local\pod-tee-theme\assets\dopamiles-pdp.css`. Find the `.dop-section { padding: 64px 0; border-top: 1px solid var(--dop-line); }` rule at ~line 523, under the `/* ── section shell ─────────────────────────────────────────────── */` comment.

2. **Insert the mobile rule** immediately after the base rule, before `.dop-section-head`:

   ```css
   /* Mobile: halve section padding to compress vertical rhythm.
      Desktop 64px breathing room intentional on wider canvas. */
   @media (max-width: 960px) {
     .dop-section { padding: 32px 0; }
   }
   ```

3. **No Liquid change** — skip `shopify theme validate`.

4. **Push to preview theme** (after Phase 2 completes — combined push to minimize round-trips):
   ```
   shopify theme push --theme=158279991548 --only=assets/dopamiles-pdp.css
   ```
   Or push Phase 1 alone if Phase 2 is deferred.

5. **Visual verification** (Chrome DevTools mobile emulation @ 412×823): load a PDP, scroll through every section boundary, eyeball gaps. Each gap should be ~64px (down from ~128px).

6. **Real-device verification**: iPhone Safari + Chrome Android — same script.

## Success Criteria

- [x] Rule inserted in `dopamiles-pdp.css` after the existing `.dop-section` base rule.
- [x] No JS files touched.
- [x] No Liquid files touched in this phase.
- [ ] Mobile DevTools emulation: PDP section-to-section gap visibly halved (128px → 64px).
- [ ] Desktop emulation: no visible change in section spacing.
- [ ] Real iPhone Safari: section spacing feels more compact, no awkward content-against-border collisions.
- [ ] Real Chrome Android: same as iPhone.
- [ ] No regression to in-section layout (heading + grid + see-all link still aligned).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 32px feels too tight on some sections | Low-Med | Cosmetic; sections feel cramped | Visually verify after applying; can tune to 40-48px if needed |
| Existing in-section content has `margin-top` that combined with 64px padding gave intended spacing — halving padding creates visual imbalance | Low | Cosmetic | Verification step catches this; tune per-section if needed |
| Phase 2 not delivered, empty sections still compound the gap | Med | Mobile gap is improved but still larger than desired on PDPs with empty FBT | Phase 2 addresses this; phase plan is sequential |
| Breakpoint `max-width: 960px` is wrong threshold for some devices | Low | Tablet-sized devices may get unintended mobile rule | Matches existing patterns at lines 805, 821; consistent |
