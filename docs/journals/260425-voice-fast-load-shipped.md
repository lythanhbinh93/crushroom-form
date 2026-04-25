# Voice Page Fast Load — Shipped Sub-1s

**Date**: 2026-04-25
**Severity**: Low (perf win, no incidents)
**Component**: voice.html, voice-upload.js, google-apps-script-voice.js, cloudflare-worker-voice-proxy.js
**Status**: Resolved

## What Shipped

Recipient `voice.html` cold load went **6s → <1s** in the same morning. Two stacked changes:

1. **Precomputed peaks at upload** (`assets/voice-peaks-extractor.js` + GAS schema bump). Customer's browser decodes audio once via `AudioContext.decodeAudioData`, stores 200 signed peaks + duration in sheet alongside audio. Recipient passes them straight to `WaveSurfer.create({ url, peaks, duration })` — zero fetch + decode for waveform.
2. **CF Worker getVoice cache** (`/voice/<slug>` route on existing `voice-proxy` Worker). Edge-caches GAS responses for 1 h. Admin Publish handler prefetches both metadata + audio so first recipient hits warm caches everywhere.

Combined with shipped P6 (Worker streaming proxy + audio prefetch), recipient experience is now:
- Cold (after publish prefetch): ~400 ms
- Warm: ~150 ms
- Pure GAS bypassed entirely after first publish-time hit

## What Surprised Us

### 1. WaveSurfer + detached `<audio>` silently fails to render
First attempt at the fast path used `WaveSurfer.create({ media: detachedAudio, peaks, duration })`. WaveSurfer accepted the call without error, created its shadow DOM with two `<canvas>` elements, but **never painted any peaks** — `getImageData` returned all-zeros. Browser-detected by puppeteer pixel inspection, not by any console error.

Fix: drop the detached `<audio>` entirely. Pass `url` instead so WaveSurfer creates its own internal media element. Player wired to `wavesurfer.playPause()` instead of `audio.play()`. With `peaks + duration` provided, WaveSurfer skips fetch + decode and renders peaks immediately; audio lazy-loads when user taps play.

**Lesson**: WaveSurfer's `media` option is for elements you *insert into the page*. Detached `new Audio()` elements break the renderer's hidden coupling to in-DOM events. Test with `getImageData` to verify canvas actually painted, not just that DOM nodes exist.

### 2. `cf.cacheTtl` doesn't reliably cache GAS responses
First implementation used `fetch(GAS_URL, { cf: { cacheTtl, cacheEverything, cacheKey }})`. Two consecutive Worker hits both took 2.6-2.9 s — no cache. `cf-cache-status` header was null on every response.

Root cause likely: GAS web apps return 302 redirects to session-token URLs on `script.googleusercontent.com`. The cf-cache subsystem keys on the redirect target, which has unique tokens per request, defeating the cache key.

Fix: explicit Workers Cache API. `caches.default.match()` + `.put()` with our own deterministic key (`voice-meta:<slug>`). Verified hit/miss progression with three back-to-back fetches: 2891 → 55 → 57 ms. **50× speedup.**

**Lesson**: For Worker subrequests to APIs that redirect, prefer the explicit Cache API over `cf.cacheTtl`. The latter is a hint to CF's edge cache layer that interacts unpredictably with origin redirects.

### 3. Peaks format ambiguity (signed vs unsigned)
WaveSurfer docs don't specify whether `peaks` should be `[-1, 1]` signed or `[0, 1]` unsigned. Plan had `Math.abs()` (unsigned). A 5-min source review of the renderer confirmed it expects signed values and renders above + below the center axis — unsigned would produce a half-waveform.

Fix: per-bucket extraction keeps the sample with largest absolute magnitude **but preserves its sign**. Verified visually after deploy: waveform shape matches actual audio dynamics.

**Lesson**: Renderer specs lie. The 10-min spike to read source paid off vs shipping unsigned-peaks first and discovering the half-waveform later.

## Architecture Now

```
Customer upload:
  audio Blob → AudioContext.decode → 200 signed peaks → POST to GAS
                                                         ↓
                                            Sheet row stores peaks + duration

Admin Publish:
  POST publishVoice → on success:
    fetch /voice/<slug>     → warms metadata cache at CF edge
    fetch /<audio_file_id>  → warms audio cache at CF edge

Recipient (voice.html?id=<slug>):
  fetch <worker>/voice/<slug>   → ~50 ms (CF edge cache)
                                ↓
            WaveSurfer.create({ url: <worker>/<file>, peaks, duration })
                                ↓
            Waveform paints instantly from peaks
            Audio lazy-loads on user tap
```

## Files Touched (this session, post-MVP)

- New: `assets/voice-peaks-extractor.js`, `cloudflare-worker-voice-proxy.js`, `wrangler.toml`
- Modified: `voice-upload.html`, `assets/voice-upload.js`, `assets/voice-page.js`, `assets/admin-voice-tab.js`, `google-apps-script-voice.js`, `docs/deployment-guide.md`
- Sheet schema: appended `peaks` + `audio_duration` columns (positions L, M)

## Known Trade-offs

- **Cache stale window on re-publish**: 1 h edge + 10 min browser. Acceptable for gift pages (rarely re-edited).
- **Legacy rows** (no peaks): fall back to CSS-only decorative bars + plain `<audio>`. Still <1 s with cached metadata.
- **Worker on `*.workers.dev`**: no custom domain yet. Sub-1 s without it; revisit if branding matters.

## Next Steps

- Commit + push (uncommitted: ~9 files including this journal)
- Mark all phase files in `plans/260425-0959-voice-page-fast-load/` as completed
- Optional follow-up: image proxy / CDN if Drive thumbnail latency becomes the next bottleneck

## Takeaway

Three correct calls in a row: (1) brutal honesty on what's possible (<2 s impossible with full audio decode), (2) precompute on the device that already has the data (customer's browser), (3) explicit Cache API > magic options for non-trivial origin behaviors. Total wall-clock: ~2 hours from "I want faster than 2 s" to <500 ms first recipient.
