# pod-tee Block-Rebuild QA Pipeline

Automated Playwright QA for the [`260513-2248-pod-tee-block-driven-theme-rebuild`](../plan.md) plan.
Runs after every phase to catch regressions before merge.

## Prerequisites

```
Node 20+
```

```bash
cd plans/260513-2248-pod-tee-block-driven-theme-rebuild/qa
npm install
npx playwright install chromium webkit
```

WebKit is supported on Windows 11 via `playwright install webkit` (confirmed 2026-05-14, WebKit 26.4 / playwright webkit v2287).

## How to Run

```bash
# Phase 01 baseline suite
node phase-01.mjs

# Future phases (once written):
node phase-02.mjs
# ...
```

Exit 0 = all P0 assertions passed (phase can proceed).
Exit 1 = one or more P0 failures (phase is halted — do not merge).

### Known infrastructure noise (run again if hit)

The preview URL goes through Cloudflare → Shopify. Two intermittent CF behaviors can flake the QA:

1. **CF cache hit omits Server-Timing header.** The `server-timing-theme-id` check is **P1 informational** (downgraded 2026-05-14); the real "correct theme served" signal is the `theme-served` selector check (P0).
2. **CF rate limit / 503.** Running QA repeatedly within seconds can trip CF and return HTTP 503. Wait 20-30s between runs to let CF reset. If 503 is persistent, theme push may have failed — verify via `shopify theme list`.

LCP measurements also vary 20-50% across runs depending on CF cache state. **Single-shot LCP is not authoritative.** Run 2-3x for a reliable read. Cold cache after `shopify theme push` is typically the worst case (saw 6432ms once vs steady-state 1.4-1.6s).

## Severity Tiers

| Tier | Condition | Action |
|---|---|---|
| **P0** | New JS pageerror on mobile, wrong theme served, HTTP non-200, WebKit crash | Exit 1 — halt phase. |
| **P1** | Console warning count spike, network failures beyond analytics 401s, desktop regressions | Flagged in report — exit 0 but ask user before proceeding. |
| **P2** | Screenshots, desktop layout notes, pre-existing issues | Logged only — auto-proceed. |

## Viewports

| ID | Label | Engine | Priority |
|---|---|---|---|
| `iphone14-chromium` | iPhone 14 — Chromium | Chromium | P0 |
| `iphone14-webkit` | iPhone 14 — WebKit | WebKit | P0 |
| `iphonese-chromium` | iPhone SE — Chromium | Chromium | P1 |
| `desktop-1280-chromium` | Desktop 1280 — Chromium | Chromium | P1 |

Mobile (P0) failures block the phase. Desktop/SE (P1) failures are flagged but do not block.

## Preview Theme

- Store: `dopamiles.co`
- Preview theme ID: `158279991548`
- Preview URL pattern: `https://dopamiles.co{path}?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548`
- Preview cookie (`_secure_session_id`) is set by Shopify on first hit and persisted across in-context navigations.

## Where Reports Land

```
qa/reports/phase-NN-YYYYMMDD-HHMM.md   ← markdown report per run
qa/shots/{viewport}/                    ← screenshots (gitignored)
```

Reports directory is gitignored by default (`reports/*.md`). To preserve a run, copy the report to the plan's main `reports/` directory.

## Known Baseline (as of 2026-05-14)

These are pre-existing issues carried forward from the funnel-reset plan. They are NOT counted as new errors by the QA pipeline.

| Issue | Error text | Source | Browsers |
|---|---|---|---|
| `amount is not defined` | V8: `"amount is not defined"` / WebKit: `"Can't find variable: amount"` | `dopamiles-pdp-variant-sync.js:48` — `Shopify.formatMoney` eval-based variant | All |
| `[dop-cart] dopCartHelpers not loaded` | console warning | `cart-main.liquid:234` duplicate `<script>` tag | All |

Fix target: Phase 07 (publish prep) of this plan.

### Baseline numbers (2026-05-14 first run — phase-01-20260514-0957.md)

| Viewport | pageerrors (baseline) | console errors | warnings | network failures |
|---|---|---|---|---|
| iphone14-chromium | 3 (all baseline) | 3 | 1 | 8 (0 non-analytics) |
| iphone14-webkit | 2 (all baseline) | 3 | 0 | 0 |
| iphonese-chromium | 3 (all baseline) | 3 | 4 | 8 (0 non-analytics) |
| desktop-1280-chromium | 1 (all baseline) | 1 | 0 | 3 (1 non-analytics) |

WebKit reports fewer network failures because it has stricter CORS/preflight handling that silently drops some requests rather than emitting `requestfailed`.

Desktop homepage hero: `width=1178px height=2133px` — recorded for future layout regression reference.

## File Structure

```
qa/
├── README.md                  ← this file
├── package.json               ← playwright dep
├── .gitignore                 ← node_modules, shots/, reports/*.md
├── phase-01.mjs               ← Phase 01 suite (baseline + theme integrity)
├── lib/
│   ├── viewports.mjs          ← viewport definitions (iPhone 14 ×2, SE, Desktop)
│   ├── preview.mjs            ← launchBrowser, previewUrl, withPreviewCookie, getProductHandle, getVariantId
│   ├── assertions.mjs         ← checkWhitespaceGap, verifyThemeServed, captureConsole, captureNetworkFailures
│   └── report.mjs             ← writeReport, printSummary, exitCode, datestamp
├── reports/                   ← generated per-run markdown reports (gitignored)
└── shots/                     ← screenshots per viewport (gitignored)
```

## Adding a New Phase Script

1. Copy `phase-01.mjs` to `phase-NN.mjs`.
2. Add phase-specific assertions inside `runViewport()` (or a separate function called from it).
3. Tag each result with the correct severity (`P0` / `P1` / `P2`).
4. Run `node phase-NN.mjs` — must exit 0 before the phase is considered done.
