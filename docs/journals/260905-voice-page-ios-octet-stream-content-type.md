# 2026-09-05 — Voice QR page dead on iPhone: Drive's opaque Content-Type

## Symptom
`qr.crushroom.vn/voice?id=970658f1c6` reported as "cannot load" on iPhone Safari. Desktop/Android fine.

## What it actually was
- The row's audio (`1wv1zX4H5Cs1PRVHa99fzmlRnfxjI2tfC`) is not audio: ffprobe shows an 85 s 1920×1080 H.264 QuickTime clip with an AAC track. A customer picked a video as the "voice" file; both the client MP3 compressor and the peaks extractor failed on it, and the form's best-effort fallback uploaded the raw file (Drive MIME `video/quicktime`, blank peaks, duration 0 → plain `<audio>` fallback path on the page).
- Drive's `uc?export=media` serves that file as `application/octet-stream` + `nosniff`. The healthy MP3 row comes back `audio/mpeg`. The worker copied the label through.
- Chromium ignores the label and probes the container, so it played. iOS AVFoundation trusts the label and, with no extension in `/<fileId>`, refuses to open the stream.

## Fix
Worker audio route now recovers the media type from magic bytes when the upstream label is opaque: one extra edge-cached fetch of bytes 0-11 (Safari's opening probe is `Range: bytes=0-1`, too short to sniff from the request's own body). Trusted labels pass through untouched, so MP3 rows pay nothing. Test: `tests/worker-audio-content-type.test.js` (fails against the pre-fix worker, 30 assertions pass after). `wrangler dev --local` against real Drive: broken file → `video/quicktime` on HEAD and on the 0-1 Range probe; MP3 row → `audio/mpeg`, body byte-identical to production.

## Not proven
No Safari available here. The iOS refusal is inferred from AVFoundation's documented Content-Type dependence plus the one header that differs between the broken and healthy rows. Confirm on a real iPhone after `wrangler deploy`.

## Left open (deliberately out of scope)
- `assets/voice-upload.js` still accepts video files as audio and silently falls back to the raw upload when compression fails. A visible rejection or an audio-track extraction would stop this class of row at the source.
- The row itself still carries a 2.4 MB video as its "voice". Staff can transcode to MP3 and swap it via admin replaceMedia if the customer intended audio only.
