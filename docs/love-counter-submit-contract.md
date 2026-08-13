# Love Counter — submit contract

Single source of truth for the parameter names exchanged between
`love-counter-upload.html` (customer form) and the GAS `submitCounter` handler.

**Why this file exists:** the voice feature drifted three times because the
contract lived only in two files at two moments — `admin-voice-tab.js` reads
`row.uploaded_at` / `row.message_text` / `j.base64` while the GAS returns
`timestamp` / `text_message` / `data`. Change this document first, then both
sides.

## Transport

`POST` to the voice GAS web-app URL, body `application/x-www-form-urlencoded`
(built with `URLSearchParams`). GAS reads every field off `e.parameter.*`.
Response is JSON: `{ ok: true }` or `{ ok: false, error: "..." }`.

Same transport as the voice gift form — base64 in the POST body, because Drive
resumable PUT is blocked by browser CORS (see
`plans/260424-1431-voice-gift-qr-upload/plan.md`, "Architectural Pivots").

## Request parameters

| Param | Required | Type | Notes |
|---|---|---|---|
| `action` | yes | `"submitCounter"` | Its own handler. Do **not** reuse `finishUpload` — that region is owned by the in-flight worker phase. |
| `type` | yes | `"counter"` | Row discriminator. Blank/absent on legacy rows means `"voice"`. |
| `phone` | yes | E.164 string | From intl-tel-input `getNumber()`. GAS re-normalises via `normalizeVNPhone_`. |
| `order_id` | yes | string | Prefilled from `?order=` and set readonly when present. |
| `start_date` | yes | `YYYY-MM-DD` | **Store verbatim, apostrophe-prefixed.** See "Date handling" below. |
| `male_name` | yes | string | Male partner, rendered on the left. Mirrors the old template's `male_name` metafield. |
| `female_name` | yes | string | Female partner, rendered on the right. Mirrors `female_name`. |
| `maleData` | yes | base64, no `data:` prefix | 400×400 JPEG q0.85, circular crop. |
| `maleFilename` | yes | string | Accepted but **ignored for the Drive name** — see "Drive file naming" below. |
| `femaleData` | yes | base64 | As above. |
| `femaleFilename` | yes | string | |
| `title` | no | string ≤120 | Defaults to `❤️ Been Love Memory ❤️` at render time if blank. |
| `heart_text` | no | string ≤60 | Small line above the day number. |
| `text_message` | no | string ≤200 | Short caption. Not the voice-gift 1000-char letter. |
| `bgData` | no | base64 | 675×1200 JPEG q0.82 — **9:16 portrait**, because the page is opened by scanning a QR on a phone and is painted full-viewport with `cover`. Page falls back to a gradient when absent. |
| `bgFilename` | no | string | |
| `audioData` | no | base64 | Optional. Compressed client-side when the browser supports it. |
| `audioFilename` | no | string | |
| `audioMime` | no | string | e.g. `audio/mpeg`. Defaults server-side when blank. |
| `audio_title` | no | string ≤120 | Shown above the player. |
| `peaks` | no | JSON array string | Precomputed waveform. Best-effort; blank is fine. |
| `audio_duration` | no | number (seconds) | `0` means unset. |

Audio is **optional** for the Love Counter — the day count is the product, the
voice is a bonus. The public page hides the whole player block when
`audio_file_id` is empty.

## submitGift (`link` / `image` gifts)

`POST action=submitGift` upserts the two simple gift types on
`(phone, order_id, type)`. Required: `phone`, `order_id`,
`type ∈ {link, image}`. For `link`: `media_link` — https, host allowlisted to
YouTube/Spotify (`GIFT_LINK_HOSTS`; server-side boundary, mirrored client-side
for inline validation only). For `image`: `imgData` (base64 JPEG,
400×400 q0.85 crop) or `keepImage=1`. Optional both: `text_message` (≤1000),
`imgData`/`keepImage` on link gifts (decoration). Same rules as every submit
handler: publish-lock, keep-flags fail closed via `resolveKeptSlot_`, fresh
data wins, slug + published_at kept, canonical Drive names, csvSafe_/apostrophe
cell hygiene. `GET action=getGift&id=SLUG` serves the published page (type,
text_message, media_link, image fields, published_at — never slug/phone);
both types publish to `gift.html?id=` (`GIFT_PAGE_BASE_URL`). `media_link` is
staff-editable through `editVoice` with the same allowlist validation.

## Publish-lock (`published_locked`)

Both customer submit handlers (`submitCounter`, `finishUpload`) reject with
`{ ok:false, error:"published_locked" }` when the existing row for the same
`(phone, order_id, type)` has `status === "published"` — the printed QR is
live, so the customer form can never overwrite a published gift. The check
runs BEFORE any Drive save (no orphaned files). Pending/archived rows keep
resubmit-with-kept-slug; archive→restore (status back to `pending`) unlocks.
Staff endpoints (`editVoice`, `replaceMedia`, `publishVoice`, `archiveVoice`)
are deliberately ungated — staff are the post-publish edit path. The forms
also read `status` from `getSubmission` and show a locked panel instead of
the steps.

## Drive file naming

The server names every saved file `<phone>_<order>[_slot].<ext>`
(`driveFileName_`), e.g. `0912345678_DH123_male.jpg`,
`0912345678_DH123_audio.mp3` — slot names match `MEDIA_SLOTS_BY_TYPE`, audio
extension follows `audioMime`. The `*Filename` params (and `finishUpload`'s
`imgFilename`/`audioFilename`, `replaceMedia`'s `filename`) are still accepted
so payload shapes don't change, but their values never become the Drive name:
staff find a customer's media by searching the phone number in the Drive
folder, and device names like `IMG_3121.jpeg` made that impossible. Nothing
reads files by name (the sheet stores file IDs), so a re-submission may repeat
a name — Drive keeps both files.

## Date handling — the one trap

`start_date` arrives as the raw `YYYY-MM-DD` string from `<input type="date">`.

1. **Validate server-side** against `/^\d{4}-\d{2}-\d{2}$/` before writing.
2. **Write it apostrophe-prefixed** (`"'" + startDate`), exactly like `phone` at
   `google-apps-script-voice.js:350-351`. Without the apostrophe, Sheets
   autocasts it to a date cell; `getValues()` then returns a JS `Date`, and
   `JSON.stringify` serialises Vietnam midnight as the **previous day** in UTC.
   `csvSafe_` does not protect against this — digits do not match its guard.
3. **Return it as a raw string** from the read endpoint. Note
   `handleGetVoice_` whitelists its response fields
   (`google-apps-script-voice.js:496-506`), so a newly appended column is
   invisible to the page until it is explicitly added there.
4. **Compute the day count client-side**, never in a cached server render.
   Resolve "today" as `Intl.DateTimeFormat('en-CA', { timeZone:
   'Asia/Ho_Chi_Minh' })`, then diff both `YYYY-MM-DD` values through
   `Date.UTC` for an exact integer day count.

## Day count — inclusive

The displayed number is **`diff + 1`**: the start date itself is day 1, per the
Vietnamese convention *ngày đầu tiên = ngày 1*. A couple who set today as their
start date sees **1**, not 0.

```js
function loveDays(startStr, todayStr) {
  const [ay, am, ad] = startStr.split('-').map(Number);
  const [by, bm, bd] = todayStr.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000) + 1;
}
```

Verified in-browser across the boundaries that usually break date math: same day
→ 1, next day → 2, across 29 Feb 2024 → 3, across a northern-hemisphere DST
switch → 3 (the UTC basis makes DST irrelevant, and Vietnam has none anyway).

**This differs from the old Shopify template by +1.** That template computed
`current | minus: love_day | divided_by: 86400 | ceil`, and because Liquid's
`divided_by` does integer division against the `86400` integer literal, it
floored before `ceil` ever ran — showing **0** on the first day. A customer
migrated from an old page will see their number increase by one.

Recompute on `visibilitychange` so a page left open overnight ticks over
instead of showing yesterday's count.

The form additionally sets `max` to today (Vietnam time) and `min` to
`1900-01-01`, so a future start date — which would render a negative count —
cannot be submitted, and a mistyped year like `0202` is rejected.

## Row identity

Rows are found by **`(phone, order_id, type)`**. The voice code keys on
`(phone, order_id)` alone (`voiceFindRowByKey_`), which collides the moment one
customer buys both SKUs on one order. The same fix is required in the admin DOM
key — `makeRowKey` at `assets/admin-voice-tab.js:698` is also `phone|order_id`,
and `publishRow` uses it to pick which card to update.

Known accepted limit, inherited from voice: quantity ≥ 2 of the same SKU on one
order overwrites the earlier submission, because identity is the lookup key and
writes are upserts. Revisit with per-submission IDs only if a real multi-unit
order appears.

## editVoice (admin) — staff field edits

`POST action=editVoice` lets the admin panel correct text/date fields on an
existing row without a customer re-submission and without hand-editing the
sheet (which drops the `start_date` apostrophe and bypasses `csvSafe_`).

Identity params (all required): `phone`, `order_id`, `type`. Unlike
publish/archive, `editVoice` REJECTS an absent type (`type required`) — the
other actions' resolve-to-voice default is exactly the wrong-row hazard an
edit must not inherit.

**Partial update:** only POSTed fields change. The server iterates its
whitelist, never the request keys, so `status`, `slug`, `phone`, file IDs and
every other column are unreachable by construction.

| type | field | rule |
|---|---|---|
| voice | `text_message` | ≤1000, clearable |
| counter | `start_date` | `YYYY-MM-DD`, not future (VN time), ≥ `1900-01-01`, **required non-empty**, written apostrophe-prefixed |
| counter | `male_name` | ≤40, required non-empty |
| counter | `female_name` | ≤40, required non-empty |
| counter | `title` | ≤120, clearable |
| counter | `heart_text` | ≤60, clearable |
| counter | `audio_title` | ≤120, clearable |
| counter | `text_message` | ≤200, clearable |

"Clearable" = sending the field as an empty string blanks the cell. Omitting
the field leaves it untouched. Over-limit values are truncated with `.slice()`,
matching `submitCounter`. All text goes through `csvSafe_`.

Response: `{ ok: true, updated: ["male_name", ...] }` or
`{ ok: false, error: "..." }` (`row_not_found`, `nothing_to_update`, or a named
validation error).

**Status is NOT reset.** A staff edit is already reviewed; a published row
stays published and the live page picks the change up on next fetch
(`getCounter` is uncached → instant; the voice page metadata sits behind the CF
worker cache for up to its TTL). Contrast: customer re-submission resets status
to `pending`.

## replaceMedia (admin) — staff media replacement

`POST action=replaceMedia` replaces one media slot on an existing row. Old
Drive files are never deleted — they are the recovery path.

Identity (all required): `phone`, `order_id`, `type` — same strictness as
`editVoice` (absent type is rejected).

| type | slot | columns written | notes |
|---|---|---|---|
| voice | `image` | `image_file_id`, `image_url` | 400×400 JPEG q0.85, square crop (matches voice-upload.js) |
| voice | `audio` | `audio_file_id`, `audio_url`, `peaks`, `audio_duration` | ≤35MB; compressed client-side best-effort |
| counter | `male` | `male_image_file_id/_url` **+ `image_file_id/_url`** | thumbnail mirror, same as submitCounter |
| counter | `female` | `female_image_file_id/_url` | 400×400 JPEG q0.85 circular crop |
| counter | `bg` | `bg_file_id`, `bg_url` | 675×1200 JPEG q0.82 — 9:16 portrait |
| counter | `audio` | `audio_file_id`, `audio_url`, `peaks`, `audio_duration` | the ONLY removable slot (`remove=1` clears all four) |

Payload params: `slot`, then either `remove=1` (counter audio only) or `data`
(base64, no `data:` prefix) + `filename` + `mime` (audio; images are always
JPEG). Audio replacements SHOULD send freshly computed `peaks` +
`audio_duration`; the server **always overwrites both** on an audio slot —
blank when not supplied — because peaks belonging to the previous audio are
worse than no peaks (the page falls back to decorative bars).

The slot table above is the server-side whitelist (`MEDIA_SLOTS_BY_TYPE`,
iterated by `hasOwnProperty` lookup): an unknown or prototype-key slot fails
closed, and no slot can name a non-media column. Status/slug are untouched —
same staff-is-the-reviewer rule as `editVoice`.

Crop geometries are the customer form's, verbatim — the admin must never
produce a file the public page renders differently than a customer upload.

## getSubmission (customer form) — returning-customer prefill

`GET action=getSubmission&phone=&order_id=&type=` returns the caller's own
prior submission so the upload form can hydrate its preview for editing.

Identity (all required): `phone` (re-normalised via `normalizeVNPhone_`),
`order_id`, `type` — absent `type` is REJECTED (`type required`), same
strictness and same reason as `editVoice`: the resolve-to-voice default would
hydrate the wrong product's row.

**Not-found is not an error.** A blank start is the normal new-customer path:

- found → `{ ok: true, found: true, submission: { ...whitelist... } }`
- not found → `{ ok: true, found: false }`

**Response whitelist** — built by the pure `buildSubmissionResponse_(row)`,
which iterates THIS list, never the row's columns, so a column added later
stays private until deliberately exposed (same principle as `getCounter`):

| type | fields |
|---|---|
| counter | `start_date` (via `toDateString_` → `YYYY-MM-DD`), `male_name`, `female_name`, `title`, `heart_text`, `text_message`, `audio_title`, `male_image_file_id`, `female_image_file_id`, `bg_file_id`, `audio_file_id`, `status`, `has_slug` |
| voice | `text_message`, `image_file_id`, `audio_file_id`, `status`, `has_slug` |

Image file ids render client-side via the existing
`drive.google.com/thumbnail?id=` pattern; `audio_file_id` presence drives the
preview's audio chip (the form never streams).

**The slug is NEVER returned.** It is the public-page capability token — the
printed QR URL — and this endpoint is reachable by anyone who can guess
`(phone, order_id)`. `has_slug` is a boolean derived from it, enough for the
"mã QR giữ nguyên" messaging. `phone` is likewise never echoed back.

Trust level (recorded, accepted): anyone holding `(phone, order_id)` can
already OVERWRITE this row via the public resubmission upsert; this read
returns strictly less than what an overwrite implies knowing. The standing
no-auth posture is unchanged and remains the product's largest open item.

Read-only — no lock, no status change, no cells written.

## submitCounter keep-flags — returning-customer resubmission

`submitCounter` is a whole-row upsert requiring `maleData`/`femaleData`, which
would force a returning customer who only fixes the date to re-crop and
re-upload every photo. Additive, optional params fix that:

| Param | Effect when `1` AND an existing `(phone, order_id, counter)` row is found |
|---|---|
| `keepMale` | reuse the existing row's `male_image_file_id/_url` (+ thumbnail mirror pair) instead of requiring `maleData` |
| `keepFemale` | reuse `female_image_file_id/_url` instead of requiring `femaleData` |
| `keepBg` | reuse `bg_file_id/_url` instead of reading `bgData` |
| `keepAudio` | reuse `audio_file_id/_url` **and the row's `peaks` + `audio_duration` + `audio_title` is still taken from the posted params** — the audio bytes are kept, the title remains editable |

Rules, enforced server-side (pure `resolveKeptMedia_`, testable):

- A keep-flag is **ignored when no existing row matches** — the fresh-data
  requirement then applies unchanged (`male photo required`, …). A keep-flag
  can never conjure media out of nothing.
- Fresh data wins: `keepMale=1` + non-empty `maleData` saves the fresh image
  (belt-and-braces — the form never sends both).
- A kept slot whose existing cell is blank behaves as if the flag were absent
  (relevant for optional bg/audio: keeping "no background" is just… no
  background).
- The new-customer path (no flags, no existing row) is byte-identical to the
  original contract above. No existing param changed meaning.

## finishUpload keep-flags — returning voice customers

The same pattern, applied to `finishUpload`'s two media slots:

| Param | Effect when `1` AND an existing `(phone, order_id, voice)` row is found |
|---|---|
| `keepImage` | reuse the row's `image_file_id/_url` instead of reading `imgData` |
| `keepAudio` | reuse the row's `audio_file_id/_url` **and its `peaks` + `audio_duration`** — satisfies the audio-required rule without re-uploading |

Same rules as submitCounter's flags (shared `resolveKeptSlot_`): ignored
without a matching row or with a blank cell, fresh data wins, and the
no-flag path is byte-identical to the original contract. Audio remains
REQUIRED for a voice row — `keepAudio` is a third way to satisfy it
(`fileId`, `audioData`, or a kept file), never a way around it.

Note the voice form auto-generates `order_id` (`AUTO-…`) when the link
carries none, so keep-flags only ever engage on staff links that carry the
real `?order=` — a bare-page revisit cannot find its previous row.

`finishUpload` now also **keeps the slug and `published_at` across a
re-submission**, exactly like `submitCounter`: the QR is printed on a
physical product, so a republish must reuse the existing slug. Status still
resets to `pending` for staff review.

## Out of scope this phase

The milestone timeline (10 × avatar/link/text/position) from the current Shopify
template. When it lands, store it as a single `milestones_json` column — not 40
sheet columns.
