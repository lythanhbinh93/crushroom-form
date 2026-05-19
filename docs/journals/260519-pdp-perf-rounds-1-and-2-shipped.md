# PDP Lighthouse Performance — Rounds 1 & 2 Shipped

**Date**: 2026-05-18 to 2026-05-19
**Severity**: High (publish gate)
**Component**: pod-tee-theme PDP Lighthouse perf (preview 158279991548)
**Status**: Resolved — publish unblocked

## What Happened

Two rounds of Lighthouse perf optimization executed back-to-back on dopamiles.co PDP preview theme over 24 hours. **Round 1** diagnosed LCP bottleneck (preload), fixed via L1, hit lead gate (90) but left mid/edge 1pt shy. **Round 2** filtered noise from dev-browser extension screenshots, applied two low-risk levers (preconnect kill + content-visibility), and cleared the strict every-PDP >= 90 gate across all three representative PDPs. Both plans closed with GREEN Globo + media-order regression suites and a real-iPhone recording validation from the user.

Final state: Lead 91, Mid 91, Edge 92 (5-run preview median). LCP improvements on Mid (-48%) and Edge (-49%) were dramatic. The medium-risk CSS bundle phase (P3) auto-cancelled per halt rule — the cheaper levers were sufficient.

## The Brutal Truth

Round 1 felt like we were chasing a problem that half-existed. The preload fix (L1) was textbook bottleneck work — LCP was measured at 5.6s on mid, preload knocked it to 3.2s. Median jumped +15 points. But we still fell 4 points short on mid/edge, so the plan mandated a P3. That's when Round 2 kicked off, and **the user's Lighthouse Insights screenshots were almost entirely noise.**

847 KiB of "unused JavaScript" — all Chrome extensions. 237 KiB minify savings — every line from Bubble, Similarweb, logHelper plugins in dev mode. Real theme cost was 26 KiB and 0 KiB respectively. The frustration wasn't the findings; it was the risk of spiraling into medium-risk work (CSS bundle) to chase extension artifacts. Would have wasted 40-90 min on cascade safeguards for gains that don't exist on live.

What saved us: brutal filtering. The brainstormer explicitly called out what's fake vs. real. Mid image is legitimately 263 KB on 3G — that's physics, not a bug. We didn't try to right-size it (lead already passes 90). We didn't hunt the 3 ms forced-reflow in dopamiles-header.js. Instead: kill the unused preconnect (5 min, zero risk), add content-visibility on 6 below-fold sections (30 min, CSS-only).

That second lever was the silver bullet. Turning off style/layout work for sections that weren't visible yet freed 100+ ms of TBT. Mid went 89 → 91. Edge 89 → 92. Both hit the gate. P3 auto-cancelled. Done.

The iPhone gate also mattered emotionally. After sprint-testing two perf rounds via Lighthouse simulation, the user pulling up the real device and saying "looks great on iPhone" was the confidence boost that publish swap can proceed. No surprises on actual hardware.

## Technical Details

### Round 1: Baseline → L1 (Preload) → L6 (Attempt+Revert) → Image Quality

**Phase 01 Baseline (P1 Baseline commit none — measurement only)**
- Ran median-of-3 Lighthouse mobile runs on 3 PDPs (auto-picked by `variants.count`).
- Lead: 85. Mid: 71. Edge: 71. LCP was the culprit.
- Mid hero image 263 KB, discovered late (no preload). LCP 5612 ms — 2.2× over gate.
- Edge LCP 5152 ms. Lead LCP 3354 ms (smallest hero).
- Review-blocking-resources: 0 (phase-08 head-gating intact).
- CLS / TBT healthy.
- **Key caveat:** preview-bar scripts added 262 KB (188 KB vendor + 74 KB app) that die on publish. Real live score is 3-5 pts higher than preview measured. Documented for post-publish validation.

**Phase 02 L1 — Preload + srcset (Commit 2976586)**
- Added `<link rel=preload>` in head for `product.media[0]` with full imagesrcset.
- Matched srcset on gallery `<img>` tags (400w / 800w / 1200w).
- Deployed via `shopify theme push --only` (2 files: theme.liquid, dopamiles-gallery.liquid).
- Result: Lead 90 ✓, Mid 86 (-4), Edge 89 (-1). LCP improvements: Mid -2405 ms (-43%), Edge -2552 ms (-50%).
- Regression suite GREEN. Globo color swap still updates hero image (preload doesn't fight display toggle).
- Verdict: P3 needed. Halt rule didn't trigger.

**Phase 03 L6 Attempted & Reverted (Commit c928dd7 → revert 8b6b377)**
- Dropped Inter from Google Fonts request. Saved 48 KB wire bytes.
- Deployed.
- **Result: NO perf gain.** Score stayed 90/86/89.
- Root cause: phase-08's font-swap trick (media="print" onload) already removed Inter from the critical path. Dropping the bytes post-hoc didn't move the needle. Visual fidelity loss was real and immediate — test users noticed thinner text.
- Reverted. Documented as a negative result with the why. **Lesson: measure the trace BEFORE deciding to kill bytes.**

**Phase 03 L6 Alternative — Image Quality=75 (Commit b7003ce)**
- Reduced hero image JPEG quality from 80 → 75 (WebP already at 75 by default).
- Cumulative effect: median 5-run 90 / 89 / 89 (Mid still -1, Edge still -1).
- Real bytes saved ~5-8 KB per image variant. Compression tradeoff acceptable to merchant.

**Phase 04 iPhone Gate (Commit none)**
- User recorded real-device screen playback on personal iPhone.
- Verdict: "looks great on iPhone."
- Publish plan unblocked.

### Round 2: Noise Filtering → Preconnect Kill → Content-Visibility

**Trigger: Brainstormer (260519)**
- User shared Lighthouse Insights screenshots with alarming reds (847 KiB unused JS, 237 KiB minify, 2.1s exec).
- Brainstormer filtered: 847 KiB = Bubble + Similarweb + logHelper extensions (not theme); 237 KiB = same source; 2.1s exec includes WPM (65 KB, 150-183 ms) + Trekkie (28 KB, 93-97 ms) + extensions (real). True theme cost: 26 KiB unused JS (WPM), 0 KiB minify savings, ~1.5s real exec. Recommendation: **don't chase extension artifacts.**
- Ranked real 1st-party levers: L4 (CSS bundle +2-4 pts, medium cascade risk), content-visibility (+1-3 pts, low risk), preconnect kill (zero risk).
- Ordered low→high risk with halt after each step.

**Phase 01 P1 — Kill Unused Preconnect (Commit e9a2bac)**
- Removed `fonts.shopifycdn.com` preconnect from `layout/theme.liquid` (3 lines deleted).
- No measurement — trivial. Verified curl + cookie jar that header no longer emits the tag.
- Zero risk.

**Phase 02 P2 — Content-Visibility on Below-Fold (Commit e4ea6d2)**
- Six sections painted up-front: fbt, niche-favorites, reasons, more-from-niche, reviews-placeholder, faqs.
- Applied `content-visibility: auto` + `contain-intrinsic-size` via Shopify section-ID prefix selectors on outer wrapper divs (`[id*="__dopamiles-reasons"]` etc.).
- **Pre-deploy Playwright probe measured real heights** at 412×823 / DPR 1.75 on live PDP:
  - dopamiles-fbt: 682 px → set 700 px
  - dopamiles-niche-favorites: 403 px → set 500 px
  - dopamiles-reasons: 1300 px → set 1300 px
  - dopamiles-more-from-niche: 305 px → set 400 px
  - dopamiles-reviews-placeholder: 1405 px → set 1500 px
  - dopamiles-faqs: 823 px → set 900 px
- CSS-only change (no Liquid, no JS).
- **Result: 5-run median 91 / 91 / 92. HALT gate cleared.**
- LCP unchanged (already optimized by L1). TBT transformed: Mid 257 → 162 ms (-37%), Edge 271 → 165 ms (-39%).
- Regression GREEN. Globo align intact. Zero section refetches.

**Phase 03 P3 — CSS Bundle (Auto-Cancelled)**
- Plan halt rule: if every-PDP 5-run median ≥ 90 strict, skip P3.
- P2 result was 91/91/92. Halt triggered.
- Phase 03 (concatenate 7 site-wide CSS files into 1, staging-theme dry-run, pixel-diff QA) — the medium-risk insurance step — **cancelled per rule, not needed.**

**Post-Round 2 Code-Reviewer Flagging**
- Reviewer noted `dopamiles-reasons` had zero headroom: probed height 1300 px, intrinsic set to 1300 px (0% margin).
- Risk: if content varies by product (custom fields, new features), scroll-in CLS could spike.
- **Action: Commit aa0cca2 bumped dopamiles-reasons to 1400 px** (1300 → 1400, +8% headroom).
- Final scores: 91 / 91 / 92 (TBT/LCP stable; no re-regression).

### Cumulative Arc (Pre-Round-1 → Round-2 end)

| PDP | Baseline | After L1 | After RND1 | After RND2 P2 | Δ total |
|---|---:|---:|---:|---:|---:|
| **Lead** | 85 | 90 | 90 | 91 | +6 |
| **Mid** | 71 | 86 | 89 | 91 | +20 |
| **Edge** | 71 | 89 | 89 | 92 | +21 |

LCP (milliseconds):
| PDP | Baseline | After L1 | RND2 P2 | Δ |
|---|---:|---:|---:|---:|
| Lead | 3354 | 2597 | 2599 | -755 (-23%) |
| Mid | 5612 | 3207 | 2908 | **-2704 (-48%)** |
| Edge | 5152 | 2600 | 2607 | **-2545 (-49%)** |

TBT (milliseconds) — content-visibility's signature win:
| PDP | Baseline | RND2 P2 | Δ |
|---|---:|---:|---:|
| Lead | 248 | 261 | +13 (no-op; small hero) |
| Mid | 278 | 162 | **-116 (-42%)** |
| Edge | 276 | 165 | **-111 (-40%)** |

## What We Tried

1. **L6 (Inter drop):** Removed Google Fonts request for Inter. Saved 48 KB. No Lighthouse perf gain because phase-08's swap trick already removed Inter from critical path. Visual regress was immediate (thinner fallback font). Reverted same session.
2. **Chasing extension artifacts:** Initial instinct was to pursue the 847 KiB / 237 KiB Lighthouse complaints. Brainstormer filtering revealed zero actionable theme cost. Saved ~60 min of wrong-direction investigation.
3. **Guessing `contain-intrinsic-size` values:** Considered single global 800px placeholder for all 6 sections. Playwright probe showed 305–1405 px range. Per-section values were mandatory to avoid CLS on scroll-in for 4 of 6 sections.

## Root Cause Analysis

**Round 1:**
- Phase-08 removed render-blocking and optimized CSS, but **never preloaded the LCP image.** Result: browser parses HTML → renders critical CSS → discovers `<img>` mid-body → requests image late → image arrives at 5+ seconds on slow 3G. LCP dominated the trace on mid/edge because those hero images were larger (263 KB and 174 KB vs. lead's 54 KB).
- Font dropping (L6) seemed plausible until we checked the trace. Phase-08's swap trick had already gated Inter off the critical path. Bytes without contribution are easy to miss if you don't trace.

**Round 2:**
- After Round 1's iPhone gate (real device passes), the user naturally asked "can we squeeze more?" but most Lighthouse Insights were dev-browser pollution. Extension pressure is real on local machines, invisible on live. The brainstormer's explicit filtering prevented a cascade fix spiral on fake data.
- Content-visibility was the true breakthrough. Six sections painting up-front consumed ~120–170 ms of TBT during initial paint; deferring their style/layout to scroll-in freed that budget. Simpler fix than CSS bundling, lower risk, same outcome.

## Lessons Learned

1. **The silver bullet was the lower-risk lever, not the big-ticket play.** Plan ranked CSS bundle (L4) as plausibly the biggest gain (+2–4 pts). Reality: content-visibility cleared the gate for +1–3 pts estimated, zero cascade risk. Halt-after-each-step discipline saved 40–90 min of medium-risk work and a staging-theme dry-run that wasn't needed.

2. **Lighthouse audit signals are inflated by dev-browser extensions.** When a user shares Lighthouse Insights with 847 KiB unused JS and 237 KiB minify savings, real theme cost was 26 KiB and 0 KiB. Must filter signal from noise explicitly, or risk endless whack-a-mole. The preview-bar overhead (262 KB) is another synthetic inflation — documented but not synthetically subtracted.

3. **Negative results are valid data.** L6 (Inter drop) was attempted, reverted, and memorialized in the log. Bytes without trace impact don't buy perf. Document the why, don't hide the revert.

4. **Measure heights, don't guess `contain-intrinsic-size`.** Playwright probe revealed 305–1405 px range. A single global 800 px placeholder would have CLS-bumped 4 of 6 sections on scroll-in. Per-section measurement also enabled code-reviewer to flag zero headroom on `dopamiles-reasons` (1300 px probed) and recommend +8% safety margin (1400 px final).

5. **Preview-bar overhead matters in score interpretation.** 262 KB of `cdn.shopify.com/shopifycloud/preview-bar/*.js` only exists on preview, not live. Real publish-side score is probably +3–5 pts per PDP higher than preview readings. iPhone recording gate (user validation) is the confidence check before publish.

6. **Store name vs. permanent .myshopify.com domain matters for CLI.** Admin URL `/store/crushroom/...` vs. permanent domain `rfeixb-dd.myshopify.com`. CLI auto-detected the wrong one on first attempt; passing `--store=rfeixb-dd.myshopify.com` explicitly fixed it. Memory-worthy for future Shopify CLI pushes.

7. **Theme Access token exposure via transcript.** User's token was rotated after Round 2 due to transcript capture during CLI push. Trade-off accepted; env-var-based deploy (`SHOPIFY_CLI_THEME_TOKEN=shptka_... shopify theme push`) is simpler than interactive auth but carries token-rotation risk. Document when used.

## Next Steps

- **Publish swap:** Block `260514-1230-pod-tee-publish-and-js-fixes` Phase 02 is unblocked. Both perf gates (Lighthouse ≥90 and real iPhone) are GREEN.
- **Optional live-side measurement:** Publish preview theme temporarily, re-run 5-run baseline against live (no preview-bar overhead). Expect +3–5 pts per PDP (94–96 range). Deferred to publish plan closeout, not blocking publish.
- **Token rotation:** User already rotated theme access token. No action required.
- **Tech debt note:** The 7-site-wide CSS files remain separate (P3 auto-cancelled). If another round of perf work is needed in future, CSS bundle is the next-lowest-hanging-fruit lever (+2–4 pts, medium cascade risk). Phase 03 playbook and safeguards are already documented in Round 2 plan for easy reference.

## Files Modified

All commits on `pod-tee-theme @ feat/pdp-perf-pareto`:
- `2976586` (L1 preload + srcset): `layout/theme.liquid`, `snippets/dopamiles-gallery.liquid`
- `8b6b377` (revert Inter drop): revert of `c928dd7`
- `b7003ce` (image quality=75): `assets/dopamiles-pdp.css` (image generation rule)
- `e9a2bac` (preconnect kill): `layout/theme.liquid` (3 lines removed)
- `e4ea6d2` (content-visibility): `assets/dopamiles-pdp.css` (39 lines appended with per-section rules)
- `aa0cca2` (dopamiles-reasons headroom): `assets/dopamiles-pdp.css` (1300 → 1400 px contain-intrinsic-size)

Branch branch pushed to GitHub `lythanhbinh93/pod-tee-theme @ feat/pdp-perf-pareto`.
