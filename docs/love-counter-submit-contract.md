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
| `maleFilename` | yes | string | Original filename, for the sheet reference. |
| `femaleData` | yes | base64 | As above. |
| `femaleFilename` | yes | string | |
| `title` | no | string ≤120 | Defaults to `❤️ Been Love Memory ❤️` at render time if blank. |
| `heart_text` | no | string ≤60 | Small line above the day number. |
| `text_message` | no | string ≤200 | Short caption. Not the voice-gift 1000-char letter. |
| `bgData` | no | base64 | 1200×675 JPEG q0.82. Page falls back to a gradient when absent. |
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

## Out of scope this phase

The milestone timeline (10 × avatar/link/text/position) from the current Shopify
template. When it lands, store it as a single `milestones_json` column — not 40
sheet columns.
