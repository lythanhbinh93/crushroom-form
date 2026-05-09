# Phase 04 — Actual Latency Profile + Trim

## Context Links

- SLC research (latency levers section): [../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md](../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md) — items 1-5 in "Where the actual ms go"
- Halt journal "next steps" #1 (latency baseline TBD): [../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md](../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md)
- Round-2 cart-perf research: `plans/reports/researcher-260509-1104-shopify-cart-performance.md`
- `D:\github local\pod-tee-theme\layout\theme.liquid` — script loading order
- `D:\github local\pod-tee-theme\sections\dopamiles-cart-drawer.liquid` — drawer surface

## Overview

**Priority:** P1 (only if measurements justify; YAGNI applies)
**Status:** pending
**Effort:** ~60 min (capped to prevent scope creep)
**Owner:** code

Measure actual cellular ms breakdown on Dopamiles. Identify the dominant latency contributor. Apply ONE targeted trim if measurements justify. No speculative optimization.

**Hard cap:** 60 min. If measurements surface a bottleneck requiring stakeholder consult (e.g. "defer Klaviyo → analytics impact"), document and DEFER to a future round. Do not ship cross-cutting changes in phase 04.

## Key Insights

- **Phase 02 ordering inversion is the structural fix; phase 04 trims actual milliseconds.** SLC waits ~500ms with button spinner; pod-tee may wait 800-1500ms on cellular due to script contention or larger section bundle.
- **Five candidate levers (SLC research):**
  1. Trim `/cart/add.js?sections=...` bundle if larger than SLC's `[cart-drawer, cart-icon-bubble]`
  2. `<link rel="preconnect">` to shop domain (likely already there)
  3. Lazy-load Globo + non-critical apps to free main thread during ATC fetch
  4. Defer Klaviyo / Vitals / CookieYes from critical path (only if measurements justify; risk: analytics gaps)
  5. Trim drawer Liquid template (shipping bar, upsells, totals row) — server render time
- **Don't pre-optimize.** Measure first. Items 1-2 are cheap and safe. Items 3-5 risk feature regression if rushed.
- **Measurement target:** post-phase-02 ATC tap → drawer-arrives-with-content under Slow 3G. Capture network waterfall + total ms breakdown.
- **Open question Q1 (deferred from plan.md):** why does pod-tee have 599-line custom `dopamiles-cart.js`? Phase 04 lists what custom features depend on it — does NOT decide whether to delete in this phase.

## Requirements

**Functional:**
- Capture cellular network waterfall for ATC tap (button-tap → drawer-visible-with-content) on real iPhone OR Chrome DevTools Slow 3G emulation
- Identify which segment dominates: DNS+TLS, request queue, server render time, response transfer, JS execution, drawer animation
- Document `/cart/add.js?sections=...` actual bundle list (verify ≤2 sections like SLC, or note count)
- If a lever can shave >100ms with low risk → apply it (single commit per lever applied)
- If no clear dominant lever or all levers require risk-heavy changes → document findings and exit phase

**Non-functional:**
- 60-min hard cap
- 0 stakeholder-blocking edits in this phase (Klaviyo defer requires analytics owner ack — out of scope)
- Each applied lever is a separate commit, easy to revert
- No regression of phases 01-03

## Architecture

```
Measurement protocol (~20 min):
  ├─ Open Chrome DevTools mobile emulation (iPhone 12 Pro)
  ├─ Network: Slow 3G throttle, no cache
  ├─ Performance tab: record ATC tap → drawer visible
  ├─ Capture screenshots of:
  │   ├─ Network waterfall (TTFB, transfer, render breakdown)
  │   ├─ /cart/add.js request URL (full sections= list)
  │   ├─ Performance summary (script eval time, layout time)
  │   └─ Lighthouse mobile audit (PDP perf score, CLS, TBT)
  └─ Document in commit message + plan unresolved Qs

Analysis (~10 min):
  ├─ Identify dominant segment(s) — anything >150ms or >25% of total
  ├─ Map to candidate levers 1-5
  ├─ Filter levers by: low-risk (1-2) vs high-risk (3-5)
  └─ Pick at most ONE lever to apply this phase

Targeted trim (~30 min, IF lever picked):
  ├─ If lever 1 (sections= bundle trim): edit cart.js fetch URL
  ├─ If lever 2 (preconnect): edit theme.liquid <head>
  ├─ If lever 3-5: document as follow-up; do NOT ship in this phase
```

**Failure-mode coverage:**

| Failure | Detection | Mitigation |
|---|---|---|
| No clear bottleneck (latency evenly distributed) | Waterfall analysis | Document and exit phase. SLC pattern (phase 02) may be sufficient. |
| Bottleneck is server render time (Shopify-side) | TTFB > 500ms | Trim `sections=` bundle to lighten server work; if still slow, document — no theme-side fix |
| Bottleneck is Klaviyo/Vitals/CookieYes JS contention | Performance tab shows main-thread blocking by 3p scripts | Document. Defer phase 04.5 with stakeholder consult. Don't ship in this phase. |
| Bundle trim breaks `applyCartMutation` (expects section that's no longer requested) | post-trim smoke fails | Revert trim commit; restore original bundle |
| Preconnect already exists in theme.liquid | grep finds existing link | Skip lever 2, document |
| 60-min cap hit before commit | Wall clock | Document findings as comment in plan, no commit, mark phase 04 done-with-concerns |

## Related Code Files

**Read first (mandatory):**

- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` — find the `/cart/add.js?sections=...` URL construction; document current section list
- `D:\github local\pod-tee-theme\layout\theme.liquid` `<head>` — check existing `<link rel="preconnect">`, `<link rel="dns-prefetch">`, script `defer`/`async` attributes
- `D:\github local\pod-tee-theme\sections\dopamiles-cart-drawer.liquid` — surface what content the drawer renders (shipping bar, upsell, totals row); estimate render cost

**Modify (gated on measurements):**

- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` — IF lever 1 selected: trim `sections=` URL parameter
- `D:\github local\pod-tee-theme\layout\theme.liquid` — IF lever 2 selected: add `<link rel="preconnect">` to shop CDN domain

**Read-only (do not modify in this phase):**

- `assets/klaviyo-*.js`, `assets/vitals-*.js`, `assets/cookieyes-*.js` (or wherever 3p scripts are loaded) — measure their cost; do NOT defer in this phase

**Create:** none
**Delete:** none

## Implementation Steps

### Step 1 — Set up measurement environment (10 min)

1. Open Chrome desktop on Mac/Windows
2. Open DevTools → device emulation → iPhone 12 Pro (390x844)
3. Network tab → throttling → "Slow 3G"
4. Disable cache (DevTools setting)
5. Open Dopamiles preview URL with phase 01-03 deployed: `https://rfeixb-dd.myshopify.com?preview_theme_id=158279991548`
6. Hard reload PDP

**Acceptance:** preview loads under Slow 3G; build-tag visible top-right (round-3c artifact preserved).

### Step 2 — Capture ATC waterfall (10 min)

1. Performance tab → start recording
2. Tap ATC button
3. Wait for drawer to appear with content
4. Stop recording
5. Capture:
   - Total elapsed: tap → drawer-visible (target: <500ms post-phase-02; if >700ms, lever needed)
   - `/cart/add.js` request: queued ms, TTFB ms, content download ms
   - Full `sections=` URL parameter list (e.g. `sections=cart-drawer,cart-icon-bubble,announcement-bar,...`)
   - Main thread events during fetch — any 3p script blocks?
6. Lighthouse mobile audit on PDP (separate run): perf score, TBT, LCP

Record findings as a markdown table in the eventual commit message:

```
ATC latency profile (Slow 3G, iPhone 12 Pro emulation, 2026-05-09):
| Segment | ms | % |
|---------|-----|---|
| Click → fetch start | 30 | 4% |
| DNS+TLS+queue | 80 | 11% |
| TTFB (server render) | 400 | 53% |
| Response download | 120 | 16% |
| applyCartMutation+swap | 50 | 7% |
| openDrawer animation | 70 | 9% |
| TOTAL | 750 | 100% |

sections= list: cart-drawer, cart-icon-bubble (2 — matches SLC; no trim needed)
3p main-thread blocking during fetch: Klaviyo 180ms, Vitals 60ms
```

### Step 3 — Identify dominant lever (5 min)

Decision tree:

- **If TTFB dominates (>40%)** → lever 1 (trim `sections=`) only if bundle >2 sections AND request can be made smaller. If already 2 sections, server render of cart-drawer Liquid is the cost — defer (lever 5 = stakeholder convo).
- **If DNS+TLS+queue dominates** → lever 2 (preconnect). Cheap, safe, ship it.
- **If response download dominates** → check section HTML size; if cart-drawer renders huge upsell/recs block, document for lever 5 follow-up.
- **If 3p scripts block main thread during fetch** → lever 3-4 (defer apps). Risk-heavy; document only.
- **If no clear dominant** → exit phase, document, mark done. Phase 02 inversion is the bulk of the perception fix.

### Step 4a — IF lever 1 (sections= trim) — 15 min

In `assets/dopamiles-cart.js`, find fetch URL:

```js
// e.g.
const url = '/cart/add.js?sections=cart-drawer,cart-icon-bubble,announcement-bar,recommendations';
```

Trim to SLC's exact pair:

```js
const url = '/cart/add.js?sections=cart-drawer,cart-icon-bubble';
```

Spot-test:
- ATC tap → drawer opens with content (cart-drawer section ✓)
- Header bag count updates (cart-icon-bubble section ✓)
- If announcement-bar update was previously expected from this fetch → it now happens on next page load (acceptable trade)
- If recommendations section previously rendered in drawer via this response → check if cart-drawer Liquid `{% render 'recommendations' %}` covers it (likely yes; recommendations is a child of cart-drawer template, not a separate section)

Single commit:

```
perf(theme): trim /cart/add.js sections= bundle to SLC pattern

Was: cart-drawer, cart-icon-bubble, announcement-bar, recommendations (4 sections)
Now: cart-drawer, cart-icon-bubble (2 sections, matches SLC)

Saved ~Xms TTFB on Slow 3G cellular per phase-04 measurement.
announcement-bar updates on next page load (acceptable; rare change).
```

### Step 4b — IF lever 2 (preconnect) — 10 min

In `layout/theme.liquid` `<head>`, before any `<script>` tags:

```liquid
{%- comment -%}
  Round-4 phase 04 — pre-warm DNS+TLS to shop CDN for /cart/add.js fetch.
  Saves ~Xms on first ATC tap (cellular).
{%- endcomment -%}
<link rel="preconnect" href="https://{{ shop.permanent_domain }}" crossorigin>
<link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
```

Single commit:

```
perf(theme): preconnect to shop + cdn for ATC fetch warm-up

~Xms saved on first ATC fetch under Slow 3G (phase-04 measurement).
```

### Step 4c — IF lever 3-5 — DOCUMENT ONLY

If measurements show 3p scripts (Klaviyo, Vitals, CookieYes) blocking main thread during ATC fetch:
- Document in plan unresolved questions
- Note required stakeholder convo (analytics owner)
- Do NOT edit script loading in this phase
- Phase 04 exits with status "done-with-concerns"

### Step 5 — Audit Q1 (custom cart.js justification) — 10 min, read-only

Open `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`. List custom features that would not work with stock Dawn `cart.js`/`cart-drawer.js`/`product-form.js`:

- [ ] Sticky header bag count animation (round-1 fix)
- [ ] Bundle handling (round-2 phase ?)
- [ ] Upsell drawer item
- [ ] Custom totals row
- [ ] Shipping bar
- [ ] Round-1 Bug #3 cartUpdate pubsub publish (red-team finding)
- [ ] Other (list)

Output: bullet list in unresolved questions of THIS phase. Do NOT replace `dopamiles-cart.js` — that's a future-round refactor, scope is too large.

### Step 6 — Phase exit

If any lever applied: commits landed, theme deployed.
If no lever applied: no commits, phase done with measurement findings as artifact (paste into plan unresolved Qs).

```powershell
shopify theme push --theme 158279991548   # only if commits landed
```

## Todo Checklist

- [ ] Step 1 — measurement environment set up; preview loaded under Slow 3G
- [ ] Step 2 — ATC waterfall captured; latency table recorded
- [ ] Step 3 — dominant lever identified (or "no clear dominant" documented)
- [ ] Step 4 — at most ONE lever applied (4a, 4b, OR 4c)
- [ ] Step 5 — custom cart.js feature audit (Q1) recorded as bullet list
- [ ] Step 6 — phase exit: deploy if commits landed, document findings either way
- [ ] 60-min cap honored

## Success Criteria

- ATC latency table recorded (segments + ms + percentages)
- `sections=` bundle list documented (matches SLC's 2 sections, or trim applied)
- At most ONE lever applied per cap rule
- 0 stakeholder-blocking edits shipped (Klaviyo defer is documented, NOT shipped)
- If lever applied: post-trim ATC latency measurably lower (target: ≥100ms saved)
- Phase 02 + 03 still functional (no regression)
- Q1 audit list of custom-cart-js features recorded for future refactor decision

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Measurement environment differs from real iPhone (DevTools throttling ≠ actual cellular) | High | Med | Phase 05 verifies on real iPhone; phase 04 numbers are directional only |
| 60-min cap blown chasing a deep bottleneck | Med | Low | Hard timer; document and exit at 60 min |
| Lever 1 (sections= trim) breaks announcement-bar update | Low | Low | Spot-test; revert if needed |
| Lever 2 (preconnect) already exists | Med | None | Step 5 grep confirms; skip if present |
| Klaviyo/Vitals defer surfaces as right answer but requires analytics owner ack | Med | Low | Document only; do NOT ship |
| Q1 audit reveals custom cart.js can be deleted entirely → tempting refactor | Low | High | Out of scope for phase 04; future round only |
| Server-side render time dominates and is un-fixable from theme | Med | Med | Document; SLC ordering inversion still buys most of the perception win |

## Security Considerations

- No new endpoints, no new credentials, no auth changes.
- Preconnect URLs use `shop.permanent_domain` + `cdn.shopify.com` — both are Shopify-hosted, not user-controlled.
- `sections=` bundle trim: removed sections (e.g. `announcement-bar`) are public content with no security implications.
- Klaviyo/Vitals/CookieYes defer (NOT shipped this phase): if shipped in future, verify CookieYes consent banner still loads pre-interaction (legal requirement in some jurisdictions).

## Next Steps

- Phase 05 (real iPhone) verifies post-phase-04 latency on actual device + cellular
- Future round: revisit Q1 (custom cart.js audit), Q3 (cart-notification surface), and any deferred levers (Klaviyo/Vitals)

## Unresolved Questions

1. **Why does pod-tee have a 599-line custom `dopamiles-cart.js` at all?** Step 5 audit list documents the custom features. SLC trusts stock Dawn. Future round decides delete-or-keep.
2. **Is Dawn's `cart-notification` (small bubble) a viable alternative to drawer for ATC feedback?** Smaller render surface, less to swap. Possible follow-up if drawer-after-fetch (phase 02) still feels slow on real iPhone.
3. **What's the breakdown of cart-drawer Liquid render time?** Shipping bar progress calc + upsell recommendation query are likely cost centers. Phase 04 doesn't trim them; future phase could.
4. **Do Klaviyo/Vitals/CookieYes block main thread during ATC fetch?** Step 2 measurements answer. If yes, defer-script work needs analytics owner ack — flag for future round.
5. **Is `<link rel="preconnect">` already in theme.liquid?** Step 1 read-first check resolves.
6. **Does `applyCartMutation` correctly handle a 2-section response shape if pod-tee currently bundles 4+?** Step 4a smoke verifies before commit.
