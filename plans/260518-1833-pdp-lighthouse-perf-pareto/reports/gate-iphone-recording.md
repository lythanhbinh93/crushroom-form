---
phase: 4
title: "iPhone Recording Gate — fill in observed results"
status: in-progress
template: true
preview_theme_id: 158279991548
test_device: TBD (user fills)
ios_version: TBD (user fills)
safari_clear_history_before_each: required
---

# Phase 4 — iPhone Recording Gate

**Pre-recording state on preview theme 158279991548:**
- Lighthouse 5-run medians (post-L1 preload + post-quality=75 image bytes):
  - Lead `a-new-chapter-begins` — 90 (LCP 2602 ms, TBT 276 ms)
  - Mid `this-is-a-5k-right-t-shirt` — 89 (LCP 2904 ms, TBT 257 ms)
  - Edge `running-its-how-i-scope` — 89 (LCP 2597 ms, TBT 271 ms)
- Regression GREEN: Globo align + media-order + 0 section refetches across all 3 PDPs.
- Preview-bar overhead: ~262 KB of scripts only on preview, not live.

**Why proceeding despite preview-side <90 on mid/edge:** removing the preview-bar's 262 KB and main-thread work on a live theme is expected to lift each PDP's score by 3-5 pts. Real-device perception is the truth — that's what Phase 4 measures.

## URLs to record (real iPhone, Safari, cellular or throttled wifi)

1. **Lead:** https://dopamiles.co/products/a-new-chapter-begins?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548
2. **Mid:**  https://dopamiles.co/products/this-is-a-5k-right-t-shirt?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548
3. **Edge:** https://dopamiles.co/products/running-its-how-i-scope?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548

For each URL: **Settings → Safari → Clear History and Website Data BEFORE loading** (cold-load every time, no warm cache).

## 6-step iPhone script (per PDP)

For each PDP, record the screen and note pass/fail per step:

| Step | Action | Pass criteria | Notes |
|:-:|---|---|---|
| 1 | Cold-load PDP | LCP arrives <3s perceived; no white flash >1s | |
| 2 | Tap a color swatch (Globo) | Hero image swaps within ~200 ms; no flicker, no jump | |
| 3 | Tap "Add to cart" | Cart drawer slides in <300 ms; ATC button shows pressed state | |
| 4 | Open cart drawer, scroll line items | 60 fps scroll; no missing thumbnails; price reads correctly | |
| 5 | Open FAQ accordion below the fold | Accordion expands smoothly; no layout jump above; no scroll lock | |
| 6 | Switch back to PDP, tap sticky-ATC at bottom | Sticky ATC reacts on tap; cart drawer opens; price + ATC state coherent | |

### Skip list (intentionally out-of-scope to record)

- Checkout flow (Shopify-hosted, theme cannot influence beyond initial submit).
- Account / login pages.
- 3rd-party app interactions (Klaviyo modal, FB Pixel — not theme-owned).

## Per-PDP results — fill in below after each recording

### PDP 1 — Lead (`a-new-chapter-begins`)

Recording: [filename/path here]

| Step | Verdict | Note |
|:-:|:-:|---|
| 1 | ⬜ | |
| 2 | ⬜ | |
| 3 | ⬜ | |
| 4 | ⬜ | |
| 5 | ⬜ | |
| 6 | ⬜ | |

**Overall lead:** PASS / FAIL / NOTE

---

### PDP 2 — Mid (`this-is-a-5k-right-t-shirt`)

Recording: [filename/path here]

| Step | Verdict | Note |
|:-:|:-:|---|
| 1 | ⬜ | |
| 2 | ⬜ | |
| 3 | ⬜ | |
| 4 | ⬜ | |
| 5 | ⬜ | |
| 6 | ⬜ | |

**Overall mid:** PASS / FAIL / NOTE

---

### PDP 3 — Edge (`running-its-how-i-scope`)

Recording: [filename/path here]

| Step | Verdict | Note |
|:-:|:-:|---|
| 1 | ⬜ | |
| 2 | ⬜ | |
| 3 | ⬜ | |
| 4 | ⬜ | |
| 5 | ⬜ | |
| 6 | ⬜ | |

**Overall edge:** PASS / FAIL / NOTE

---

## Gate decision

After filling all 3 PDP tables:

- **All 6 steps pass on all 3 PDPs:** Mark this plan complete, clear `260514-1230-pod-tee-publish-and-js-fixes` blockedBy, unblock publish swap.
- **Any step fails on any PDP:** Document which step + PDP + what you saw. Plan returns to P3 for the targeted issue.

## Optional: live-side measurement after iPhone gate

If iPhone gate is green and you want a synthetic confirmation, you can temporarily:
1. Publish theme 158279991548 to live (Online Store → Themes → preview theme → Actions → Publish).
2. Re-run `qa/lighthouse-baseline.mjs` (no preview-bar will load now).
3. Confirm scores are ≥90 everywhere.
4. Either keep live OR revert to BuildMyPOD via "rollback-2026-05-08" (#158282383612) if anything goes wrong.

The publish swap is what `260514-1230-pod-tee-publish-and-js-fixes` Phase 02 will do formally; this is an optional dry-run for measurement.

## When complete

Reply: "Phase 4 gate: all pass" (or "step X failed on Y").

I'll then:
- Mark this plan's `status: completed`
- Clear `260514-1230-pod-tee-publish-and-js-fixes` `blockedBy: [260518-1833-pdp-lighthouse-perf-pareto]` entry
- Suggest running `/ck:cook plans/260514-1230-pod-tee-publish-and-js-fixes` for the publish swap
- Remind you to rotate the Theme Access token (`shptka_...` was in chat transcript)

## Open questions

- Is there a specific iPhone model + iOS version you want documented for repeatability? (For Gate 3 prep memory continuity.)
- Do you want the optional live-side Lighthouse measurement before or after the iPhone gate, or skip it?
