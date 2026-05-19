---
phase: 2
title: "Lede Max-Width Fix"
status: pending
priority: P1
effort: "10min"
dependencies: [1]
---

# Phase 2: Lede Max-Width Fix

## Overview

Lede paragraphs (home sections "Shop by niche", "What you're actually getting", "From the back of the pack" + footer subscribe lede) render in a narrow column on mobile, wrapping awkwardly to 3+ lines. Single shared CSS rule fixes all 4 instances.

## Requirements

- **Functional:** Lede paragraphs use the full available column width on mobile (≤ ~560 px viewport). On desktop, retain typography-friendly max-width (45-75 chars per line per Bringhurst).
- **Non-functional:**
  - Single CSS file edit (whichever file owns the shared selector).
  - Zero Liquid edits, zero new settings.
  - Verify on home + footer.

## Architecture

Step 1 — locate the selector(s). Grep candidates:

```
grep -rn "doc-hero-lede\|dop-lede\|dop-subhead\|home-section-lede" assets/dopamiles-*.css
```

Likely candidates:
- `.doc-hero-lede` (in `dopamiles-collection.css` based on collection-grid markup at line 57; if the home uses a copy of this class, it's the share)
- A `.dop-lede` rule in `dopamiles-home.css` or `dopamiles-shared.css`
- A footer-specific `.dop-footer-lede` or similar in `dopamiles-footer.css`

Step 2 — apply the fix. Two options:

**Option A (recommended): `max-width: 60ch`**

```css
.dop-lede,
.doc-hero-lede {
  max-width: 60ch;
}
@media (max-width: 560px) {
  .dop-lede,
  .doc-hero-lede {
    max-width: none;
  }
}
```

60ch on desktop = ~45-75 chars per line (typography sweet spot). On mobile, ch units would still produce ~10-12em which is too narrow for ~360 px viewport → release to `max-width: none` and let the parent container constrain.

**Option B: `max-width: none` always**

```css
.dop-lede,
.doc-hero-lede {
  max-width: none;
}
```

Simpler. Desktop loses the typographic constraint (lines may run >75 chars wide on a 1920 desktop). Brand sacrifice for code simplicity.

Decision deferred to runtime — choose after grep confirms the actual selectors and current values.

## Related Code Files

- **Modify (TBD by grep):** likely `assets/dopamiles-shared.css` OR `assets/dopamiles-home.css` + `assets/dopamiles-collection.css` + `assets/dopamiles-footer.css`
- **No-touch:** all Liquid

## Implementation Steps

1. Grep for current lede selectors and existing `max-width` values:
   ```
   grep -rn "lede\|subhead" assets/dopamiles-*.css
   ```
2. Pick Option A (60ch + mobile release) or Option B (no max-width) based on grep findings.
3. Apply edit to the shared file. If selectors are split across files, deduplicate by consolidating into `dopamiles-shared.css` (preferred) or keep per-file overrides.
4. Commit: `style(home, footer, collection): relax lede max-width on mobile`.
5. Push to preview via `shopify theme push --only=...` for the changed file(s).
6. Verify on home (3 sections) + footer + collection hero (the lede if it's the same selector).

## Success Criteria

- [ ] Lede `<p>` elements use full viewport width on mobile ≤ 560 px.
- [ ] Desktop typography stays readable (≤ 75 chars per line OR explicit Option B choice).
- [ ] All 4 screenshots from feedback (home NO.01, NO.03, NO.04 + footer) resolve.
- [ ] No other paragraph styling regresses (paragraphs outside `.dop-lede` / `.doc-hero-lede` scope unchanged).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Lede class is used elsewhere (e.g. PDP story) → wider-than-expected change | Grep all uses before commit; if too broad, scope to home + footer + collection only |
| Mobile reflow shifts the page baseline → LCP/CLS regression | Re-run perf-probe-feature-variant to confirm no section refetch; spot-check Lighthouse if uncertain |
| Existing max-width was set for layout reason (not typography) | Read the original CSS comment / git-blame if present |
