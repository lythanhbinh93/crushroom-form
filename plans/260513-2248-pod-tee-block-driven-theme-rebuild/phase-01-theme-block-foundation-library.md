# Phase 01 — Theme-block foundation library + QA pipeline foundation

**Status:** completed (2026-05-14)
**Owner:** code
**Effort:** 6-10h (4-6h blocks + 3-4h QA pipeline) — actual: ~3.5h with parallel subagents + fixup iteration
**Depends on:** funnel-reset transitions to `completed` (today's funnel-reset code-complete unblocks once user confirms — automated QA from this point forward, no more user iPhone gates)
**Gate:** Automated mobile + desktop QA (see `## QA assertions` below) — **30/30 PASS** post-push (qa/reports/phase-01-20260514-1032.md)
**Shipped commits:** theme repo `9612985` (10 blocks + base CSS + supporting edits + review fixes) · plan repo `0cb6db3` (QA pipeline + reports)

## Goal
Two deliverables in one phase:
1. **Blocks:** Create 10 reusable theme blocks under `blocks/dop-*.liquid` with Tier 2 customization (content + size + spacing + alignment + token-color). Establish color-scheme tokens in `config/settings_schema.json`.
2. **QA pipeline:** Build the automated QA infrastructure under `qa/` that runs after every subsequent phase. Mobile (iPhone 14 Chromium + WebKit) is the P0 blocker, desktop is P1.

## Context
- Brainstorm: [`brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md`](../reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md)
- Shopify theme blocks docs: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks
- Existing block conventions: see `sections/dopamiles-home-pillars.liquid` (pillar block), `sections/dopamiles-faqs.liquid` (question block)

## Key insights
- Dawn 15.x supports `"type": "@theme"` block declaration in section schemas — required for theme blocks to be accepted.
- `blocks/*.liquid` files have their own schema with `{% schema %}` block; preset rendering is automatic in editor.
- Color schemes must live in `config/settings_schema.json` under a `color_scheme_group` setting to appear as picker options.
- Tier 2 visual controls (size selects, padding/margin range, alignment) require corresponding CSS — each block ships `<style>` block OR appends to a shared `blocks-base.css`.
- Settings sliders use Shopify's `"type": "range"` with min/max/step + unit.

## Requirements

### Functional
- 10 block files created with schemas
- Each block renders correctly in isolation
- Each block exposes Tier 2 settings as specced in brainstorm
- Block presets defined for theme editor "Add block" UI discovery
- Color-scheme tokens defined in `config/settings_schema.json` mapping to existing `--dop-*` CSS vars

### Non-functional
- Total block CSS payload under 8 KB (conditional load OK)
- Each block file ≤200 LOC per project modularization rule
- Theme check: zero new errors

## Architecture

### 10 theme blocks

| Block | Content settings | Visual settings |
|---|---|---|
| `dop-heading` | text, level (h1/h2/h3), eyebrow, accent_word | size (XS-XXL), weight, case, alignment, color_scheme, padding_top/bottom, margin_bottom |
| `dop-text` | content (richtext) | size (S/M/L), alignment, color_scheme, padding_top/bottom, margin_bottom, max_width (narrow/normal/wide/full) |
| `dop-cta` | label, url | style (primary/secondary/ghost), size (S/M/L), full_width (bool), alignment, color_scheme, margin_top/bottom |
| `dop-cta-pair` | primary {label,url}, secondary {label,url} | style each, size, layout (inline/stacked), alignment, gap, margin_top/bottom |
| `dop-image` | image, alt | aspect_ratio (auto/square/4:3/16:9/3:4), object_fit, corner_radius, alignment, max_width, padding_top/bottom |
| `dop-stat` | number, label, caption | size (S/M/L), alignment, color_scheme, padding_top/bottom |
| `dop-icon-card` | icon (select from dopamiles-icon library), heading, text | layout (icon-top/icon-left), icon_size, alignment, color_scheme, padding |
| `dop-feature-row` | image, heading, text, cta | side (left/right), image_width (40/50/60%), vertical_align, gap, padding |
| `dop-badge-row` | text items (repeating up to 6) | size (S/M/L), color_scheme, alignment, gap, padding_top/bottom |
| `dop-spacer` | — | height (XS=16/S=32/M=64/L=96/XL=128/XXL=192), show_divider (bool) |

### Color-scheme tokens (config/settings_schema.json addition)

```json
{
  "name": "Color schemes",
  "settings": [{
    "type": "color_scheme_group",
    "id": "color_schemes",
    "definition": [
      {"type": "color", "id": "background", "label": "Background"},
      {"type": "color", "id": "text", "label": "Text"},
      {"type": "color", "id": "accent", "label": "Accent"}
    ],
    "role": {"text": "text", "background": "background"},
    "default": {
      "brand-light":  {"background": "#FBFAF8", "text": "#1A1A1A", "accent": "#F26419"},
      "brand-dark":   {"background": "#1A1A1A", "text": "#FBFAF8", "accent": "#F26419"},
      "brand-accent": {"background": "#F26419", "text": "#FFFFFF", "accent": "#FBFAF8"},
      "neutral":      {"background": "#FFFFFF", "text": "#1A1A1A", "accent": "#1A1A1A"}
    }
  }]
}
```

### Mobile scaling
Single value per spacing setting. CSS in `blocks-base.css`:
```css
@media (max-width: 767px) {
  .dop-block { padding-top: calc(var(--block-pad-top) * 0.6); padding-bottom: calc(var(--block-pad-bot) * 0.6); }
}
```

## Related code files

### Create (theme repo: D:\github local\pod-tee-theme)
- `blocks/dop-heading.liquid`
- `blocks/dop-text.liquid`
- `blocks/dop-cta.liquid`
- `blocks/dop-cta-pair.liquid`
- `blocks/dop-image.liquid`
- `blocks/dop-stat.liquid`
- `blocks/dop-icon-card.liquid`
- `blocks/dop-feature-row.liquid`
- `blocks/dop-badge-row.liquid`
- `blocks/dop-spacer.liquid`
- `assets/dopamiles-blocks-base.css` — shared base CSS for blocks (mobile scaling, CSS-var consumption)

### Create (plan dir: plans/260513-2248-pod-tee-block-driven-theme-rebuild/qa/)
- `qa/README.md` — pipeline docs, severity tiers, how-to-run
- `qa/package.json` — playwright + pixelmatch deps
- `qa/.gitignore` — node_modules, package-lock.json
- `qa/lib/preview.mjs` — browser launch, viewport configs, preview URL + cookie helpers
- `qa/lib/assertions.mjs` — shared assertions (whitespace gap, theme integrity, console capture, network failure capture)
- `qa/lib/viewports.mjs` — viewport definitions (iPhone 14, iPhone SE, Desktop 1280) × (Chromium, WebKit where applicable)
- `qa/lib/report.mjs` — markdown report writer + summary printer
- `qa/phase-01.mjs` — Phase 01 specific assertions (renders blocks, theme check baseline, color picker visible)

### Edit
- `config/settings_schema.json` — add color_scheme_group
- `layout/theme.liquid` — load `dopamiles-blocks-base.css`
- `sections/dopamiles-home-hero.liquid` — add `"blocks": [{"type": "@theme"}]` to schema for render-test (full conversion in Phase 02)

## Implementation steps

### Part A — Block library (theme repo)

1. **Block schema design pass** — draft the 10 schemas in a single Liquid spike file, validate via `shopify theme check`.
2. **Color-scheme tokens** — add `color_scheme_group` to `config/settings_schema.json`; verify Theme Editor → Theme Settings shows scheme picker.
3. **Create 10 block files** — one at a time, smallest first (dop-spacer, dop-text, dop-heading, then progressively richer).
4. **Shared base CSS** — `dopamiles-blocks-base.css` with CSS-var consumption pattern + mobile scaling.
5. **Wire conditional load** — `layout/theme.liquid` loads blocks-base.css when any block is in use.
6. **Render-test** — temporarily drop `{"type": "@theme"}` into `dopamiles-home-hero.liquid` schema; insert default preset blocks via fixture template; verify render.
7. **Theme check pass** — `shopify theme check`, zero new errors.
8. **Code-reviewer subagent pass** on the 10 block files + base CSS.
9. **Commit + push** to preview theme 158279991548 (full push, no --only — let CLI sync deletions).

### Part B — QA pipeline foundation (plan dir)

10. **Scaffold `qa/`** — package.json with playwright + (optionally) pixelmatch; install via `npm install`.
11. **Write `qa/lib/viewports.mjs`** — export iPhone-14-Chromium, iPhone-14-WebKit, iPhone-SE-Chromium, Desktop-1280-Chromium configs.
12. **Write `qa/lib/preview.mjs`** — `launchBrowser(viewport)`, `withPreviewCookie(url)`, `getProductHandle(page)`, `getVariantId(productJsonUrl)`.
13. **Write `qa/lib/assertions.mjs`** — port today's QA assertions: `checkWhitespaceGap(page, selector, expectedText, minGapPx)`, `verifyThemeServed(page, expectedSelectors)`, `captureConsole(page)`, `captureNetworkFailures(page)`.
14. **Write `qa/lib/report.mjs`** — append-only markdown writer; severity tagging (P0/P1/P2); exit code derivation.
15. **Write `qa/phase-01.mjs`** — Phase 01 specific suite (see ## QA assertions below).
16. **Run `qa/phase-01.mjs` against current preview** — establish baseline numbers (console count, network failure count); these become the comparison points for later phases.
17. **Write `qa/README.md`** — document viewport configs, severity tiers, how-to-run-locally, where reports land.

### Part C — Integration

18. Commit + push QA scaffolding to plan branch (`claude/add-photo-upload-tool-p3dI0`).
19. Smoke-run `node qa/phase-01.mjs` end-to-end. Must exit 0 with markdown report saved.

## QA assertions (Phase 01)

**Viewports:** iPhone 14 Chromium (P0), iPhone 14 WebKit (P0), iPhone SE Chromium (P1), Desktop 1280 Chromium (P1)

**P0 — fail → halt phase:**
- All 10 `blocks/dop-*.liquid` files render in a test section without theme check errors
- Theme served = pod-tee (selectors: `.dop-hero`, `.dop-logo`)
- Zero new pageerrors vs today's 2026-05-13 baseline (`amount is not defined` × 4 IS the baseline — anything beyond fails)
- Preview URL returns 200 with `theme;desc="158279991548"` in Server-Timing
- WebKit-mobile run completes without crashes (proves WebKit engine works in pipeline)

**P1 — flag → ask user:**
- Color scheme picker visible in screenshot of Theme Editor → Theme Settings
- Theme check warning count within ±5 of baseline (38)
- Lighthouse mobile score within 5pts of phase-08 score (if recorded; if not, this phase establishes the baseline)

**P2 — log only:**
- Screenshots saved for all 4 viewports
- Desktop layout informational notes

## Todo

### Part A — Blocks (theme repo)
- [x] Draft 10 block schemas (spike + validate)
- [x] Add `color_scheme_group` to `config/settings_schema.json` — Dawn rejected `color_scheme_group`; replaced with 9 flat color pickers wired via `snippets/dopamiles-tokens.liquid`
- [x] Create `blocks/dop-spacer.liquid` (simplest)
- [x] Create `blocks/dop-text.liquid`
- [x] Create `blocks/dop-heading.liquid`
- [x] Create `blocks/dop-cta.liquid`
- [x] Create `blocks/dop-cta-pair.liquid`
- [x] Create `blocks/dop-image.liquid`
- [x] Create `blocks/dop-stat.liquid`
- [x] Create `blocks/dop-badge-row.liquid`
- [x] Create `blocks/dop-icon-card.liquid`
- [x] Create `blocks/dop-feature-row.liquid` (most complex)
- [x] Create `assets/dopamiles-blocks-base.css`
- [x] Wire conditional load in `layout/theme.liquid` — unconditional load (8 KB acceptable; reconsider in Phase 08)
- [x] Render-test fixture in `dopamiles-home-hero.liquid` (temporary @theme accept)
- [x] `shopify theme check` pass — 11 errors / 38 warnings preserved (zero new)
- [x] Delegate to code-reviewer subagent — 2 P0 + 9 P1 found; all cleared single iteration
- [x] Commit + push to preview theme — theme repo `9612985`, shopify theme push 158279991548 success

### Part B — QA pipeline (plan repo)
- [x] Scaffold `qa/` with package.json + .gitignore
- [x] Install playwright + pixelmatch (npm install) — playwright only; pixelmatch deferred to Phase 02 if needed
- [x] Write `qa/lib/viewports.mjs`
- [x] Write `qa/lib/preview.mjs`
- [x] Write `qa/lib/assertions.mjs`
- [x] Write `qa/lib/report.mjs`
- [x] Write `qa/phase-01.mjs`
- [x] Write `qa/README.md`
- [x] Run `node qa/phase-01.mjs` end-to-end — must exit 0 — **30/30 PASS post-push**
- [x] Verify WebKit-mobile works (install via `npx playwright install webkit`) — WebKit 26.4 on Windows 11 confirmed
- [x] Commit QA scaffolding to plan branch — plan repo `0cb6db3`

## Success criteria

### Part A — Blocks
- 10 `blocks/dop-*.liquid` files created, schemas validate
- Theme editor "Add block" UI lists all 10 block types
- Block previews render correctly when added to test section
- Color-scheme picker shows 4 brand schemes
- Theme check baseline preserved (11 errors / 38 warnings, no new)
- Code-reviewer DONE or DONE_WITH_CONCERNS

### Part B — QA pipeline
- `node qa/phase-01.mjs` exits 0 against current preview
- Markdown report saved to `qa/reports/phase-01-{date}.md`
- All 4 viewports produce screenshots (Chromium iPhone 14, WebKit iPhone 14, Chromium iPhone SE, Chromium Desktop 1280)
- WebKit engine confirmed working (no install/crash errors)
- Console + network capture works (matches today's QA findings.json schema)
- README documents how to run, how to interpret severity tiers

## Halt rule
1 iteration max for Part A. 1 iteration for Part B. If either fails P0 → halt + scope Phase 01-bugfix iteration.

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Shopify theme block schema spec drift between Dawn versions | Medium | Pin to Dawn 15.4.1 baseline (BASELINE.md commit 9ccdacf8); test in editor live |
| `@theme` block accept doesn't work on Dawn 15 | **High** | Verify on a test section BEFORE locking 10 blocks — fallback: section-specific blocks per brainstorm Approach 1. Mitigate by testing this in step 6 of Part A FIRST. |
| Block CSS payload regression (>8 KB) | Medium | Conditional load; defer loading per template |
| Schema validation errors block push | Low | Theme check pre-commit; iterate locally |
| WebKit browser install fails on Windows | Medium | `npx playwright install webkit` is supported on win32 per Playwright docs. Fallback: skip WebKit-mobile, run Chromium-mobile only (P0), document residual gap. |
| QA pipeline foundation takes longer than 4h | Medium | Strict scope: port today's QA script patterns into reusable lib. Don't over-engineer. |
| Icon-card block depends on dopamiles-icon.liquid | Low | Already exists at `snippets/dopamiles-icon.liquid` (shipped 2026-05-13) |

## Security considerations
- No user input processing in blocks. All settings are merchant-supplied via Admin (trusted).
- Color tokens use `{{ scheme.colors.accent }}` style output — escape via Liquid default for safety.

## Next phase
Phase 02 — Homepage template conversion using these blocks.
