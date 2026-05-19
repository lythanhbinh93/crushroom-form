---
phase: 1
title: "Phase 01 — JS bug fix gate (auto-cleared) + Phase 02 rollback runbook"
generatedAt: 2026-05-19T06:38Z
qaRun: qa/reports/phase-01-20260519-1336.md
verdict: PHASE_01_GATE_CLEARED (no fix needed — 30/30 PASS, 0 pageerrors current state)
nextDecision: PHASE_02_PUBLISH_SWAP (user-gated; hard-to-reverse)
---

# Phase 01 close + Phase 02 rollback runbook

## Phase 01 verdict — auto-cleared

Plan was written 2026-05-14 with `BASELINE_PAGEERROR_PATTERNS = ["amount is not defined", "Can't find variable: amount"]` (1 baseline pageerror at dopamiles-pdp-variant-sync.js:48 — the `window.Shopify.formatMoney` delegation eval-bug).

QA run today (2026-05-19 06:36): **30/30 PASS** across 4 viewports. Every viewport reports `0 new pageerrors (0 baseline ... ignored)`. The baseline pattern is no longer matched anywhere — the bug doesn't fire.

The fix arrived indirectly during the bug-fix-sprint round 2 (2026-05-16, see [obs 642](docs/journals/...)) and / or one of the recent perf rounds that touched `dopamiles-pdp-variant-sync.js`. Bug B (`cart-main` duplicate init) is also clean — `dopamiles-cart-main.liquid:234-239` documents the section-level removal that resolved it.

**No code change in Phase 01.** Phase 01 gate (zero pageerrors) is met on the current preview theme. Move directly to Phase 02.

### Latent risk note (defensive hardening NOT applied)

`dopamiles-pdp-variant-sync.js:47-49` still delegates to `window.Shopify.formatMoney` IF present. If a future Shopify platform script restores the eval-based legacy implementation, the bug COULD re-surface. Defensive hardening (remove the delegation, always use inline `formatWithDelimiters`) is a 2-line change but is NOT in scope this round — QA gate is already met. Logged as low-priority followup.

## Phase 02 — Publish swap (USER-GATED)

### Current theme inventory (verified 2026-05-19 via `shopify theme list`)

| Role | Name | ID |
|---|---|---|
| **LIVE** | BuildMyPOD - Spirituality v1.1.4 | 156076146940 |
| unpublished | BuildMyPOD - Spirituality v1.1.5 | 156142993660 |
| unpublished | rollback-2026-05-08 | 158282383612 |
| unpublished | Dawn | 145602019580 |
| unpublished | CR-v1-9-0-official | 145603231996 |
| **TARGET** | dopamiles-bundle-prod-260508 (pod-tee) | 158279991548 |

### Publish steps

**Option A — Shopify admin UI (recommended, safest):**
1. Open https://admin.shopify.com/store/crushroom/themes
2. Find `dopamiles-bundle-prod-260508` (#158279991548) in the Theme Library
3. Click `...` → `Publish` → confirm
4. Shopify swaps the live theme atomically; customer traffic sees the new theme within seconds (CDN propagation)

**Option B — Shopify CLI (faster, requires Theme Access token with publish scope):**
```powershell
$env:SHOPIFY_CLI_THEME_TOKEN = "shptka_..."
shopify theme publish --store=rfeixb-dd.myshopify.com --theme=158279991548
```
Note: Theme Access tokens may or may not have publish scope depending on the role granted. If the CLI errors with 403, fall back to Option A.

### Post-publish verification (immediate)

1. Open https://dopamiles.co/ in a fresh browser (or incognito) — confirm the dopamiles brand (Fraunces serif headings, Inter body, dop- prefix in inspector classes).
2. Spot-check one PDP (`/products/a-new-chapter-begins`) — confirm Globo color swatches load, hero image preload visible in Network tab, add-to-cart works.
3. Spot-check cart drawer behavior (any product, ATC, drawer slides in, qty +/-).
4. Run QA pipeline against the LIVE URL (not preview):
   ```bash
   cd plans/260514-1230-pod-tee-publish-and-js-fixes/qa
   PREVIEW_THEME_ID="" node phase-01.mjs https://dopamiles.co/
   ```
   (May need a one-line script tweak to drop `preview_theme_id`; alternatively skip this and rely on real-iPhone perception.)
5. Real-iPhone 1-minute spot-check (Settings → Safari → Clear History first; then load home + PDP + cart).

If anything looks wrong → execute rollback runbook below.

### Rollback runbook (1-minute swap back to BuildMyPOD)

**Trigger:** any of these post-publish:
- Brand visual regress on any page
- Add-to-cart broken
- Checkout submit broken
- Console pageerrors spiking on real traffic
- Conversion rate drops >20% in the first hour (per analytics)
- User reports

**Step 1 — Immediate rollback (Shopify admin):**
1. https://admin.shopify.com/store/crushroom/themes
2. Find `BuildMyPOD - Spirituality v1.1.4` (#156076146940)
3. Click `...` → `Publish`
4. Customers see BuildMyPOD within seconds

**Step 1 alt — CLI rollback:**
```powershell
shopify theme publish --store=rfeixb-dd.myshopify.com --theme=156076146940
```

**Step 2 — After rollback, before re-attempting:**
1. Capture the issue: screenshot, console log, network HAR if possible.
2. Re-open the pod-tee theme on preview, reproduce.
3. Decide: fix on `feat/pdp-perf-pareto` branch → push to preview → re-deploy → re-verify before the next publish attempt.

**Multiple rollback options in inventory:**
- `BuildMyPOD - Spirituality v1.1.4` (156076146940) — current live, safest target
- `BuildMyPOD - Spirituality v1.1.5` (156142993660) — newer untested
- `rollback-2026-05-08` (158282383612) — purpose-built rollback
- Default to **v1.1.4** unless you have specific reason to choose another.

### Archive BuildMyPOD (after publish gate green)

ONLY after a confidence period (recommendation: 48-72h of stable live traffic on pod-tee):
1. Admin → Themes → `BuildMyPOD - Spirituality v1.1.4` → `...` → `Archive`
2. Archived themes are read-only but recoverable.
3. Do NOT delete. Keep for future rollback even after archival.

## Open questions / decisions for user

- Publish via CLI or via admin? CLI is one command but Theme Access token's publish scope is unverified.
- Publish window: now, or during low-traffic hours?
- Do the optional real-iPhone spot-check pre-publish, or rely on the already-GREEN Phase 4 iPhone gate from `260518-1833-pdp-lighthouse-perf-pareto`?
- Archive BuildMyPOD now (after publish) or wait 48-72h?
