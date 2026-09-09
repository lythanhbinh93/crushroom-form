# Gift cover photos were stored at 400px — and the first fix landed on a branch nobody deploys (2026-09-09)

## Reported
"Why is the image low quality" on `https://qr.crushroom.vn/voice?id=4f45fd87b3`.
Then, after the first fix: "uploaded new but image still low quality."

## Root cause
`croppie.result({ size: { width: 400, height: 400 } })` in the customer forms.
That crop is the ONLY copy of the photo that is ever stored — GAS
`saveImageToDrive_` writes the bytes unchanged and keeps no original. The
recipient card is up to 600 CSS px wide and phones render at 2-3x, so the
browser stretched a 400 px file to roughly 1200-1800 device px.

Drive's `thumbnail?id=…&sz=w<N>` endpoint serves **min(N, stored)** and never
upscales, so the page's `sz=w800` request could never be satisfied. Measured on
the reported gift: `w400`, `w800`, `w1600`, `w4000` and `uc?export=download` all
returned the identical 24,051-byte 400x400 JPEG. Measured on a 1080x1080 file
for the opposite control: w400→400, w800→800, w1200→1080, w1600→1080. The
endpoint scales properly; only the stored master was short.

## The second bug, which was mine
The first fix was committed to `claude/add-photo-upload-tool-p3dI0`, the
checked-out branch. The live site serves
`claude/image-upload-crop-tool-01MphMPWnWdwdJ3TStSruvX9` — the repo's
`origin/HEAD`. The working branch is 275 ahead and 51 behind it, and the two
have genuinely different code: the deployed branch carries the whole unified
gift chooser (`simple-gift-upload.js`, `gift-page.js`, `image-upload.html`,
`gift.html`) that the working branch does not have at all. So the first fix
changed real files, passed its tests, and could not have had any effect. The
user found out by uploading a photo.

Byte-matching settled it in one call: the live `voice-upload.js` (38,793 bytes,
sha `6bdff946fab0`) matched the deployed branch exactly and matched neither
version on the working branch (26,683 / 26,157 bytes).

## Fix (on the deployed branch, `10feba1`)
Masters raised to 1200x1200 q0.85 and both pages raised to `sz=w1200`:

- `voice-upload.js` and `simple-gift-upload.js` — customer crops
- `voice-page.js` and `gift-page.js` — display requests
- `admin-voice-tab.js` — the four square 280-viewport staff replacement slots
  (voice, link, image, video), so a staff replacement cannot silently
  re-downgrade a gift

Love Counter avatars stay 400x400: they render inside a small circle, which is
a different render, and `love-counter-form-crop-geometry.test.js` pins that.

## Test work
`tests/photo-master-resolution.test.js` (15 assertions) pins master >= 1200 and,
the part that is easy to lose, **page request >= master** — raising the master
alone achieves nothing if a page still asks for less.

`tests/simple-gift-form-steps.test.js` had an assertion named "crop geometry
matches the voice form" that never read the voice form; it hardcoded 400. It
would have passed with both forms wrong together, which is exactly what
happened. Rewritten to read `voice-upload.js` and compare, then mutation-checked
by setting the gift form to 800 and confirming it fails. Suite 22/22 green,
negative control fails 2 on the pre-fix sources.

## Not fixed
Gifts published before today, including `4f45fd87b3`. The original upload was
never kept, so the only repair is a re-upload through the admin voice tab.

## Lessons
1. **Check which branch is deployed before fixing anything user-visible.** The
   checked-out branch is not evidence. Byte-match the live asset against
   candidate branches; it costs one command and would have saved a whole round.
2. A crop that is the sole stored copy must be sized for the largest render
   (CSS width x DPR), not for the upload payload.
3. When an image looks soft, measure the served bytes first. Identical bytes
   across several `sz=` values proves the stored file is the limit and no
   front-end change can help.
4. A parity test that hardcodes the value it claims to compare is not a parity
   test. Make it read both sides, then mutate one side to prove it fails.
5. Tie producer to consumer with an asserted inequality (request >= master), or
   a later change to either side silently reintroduces the downscale.
