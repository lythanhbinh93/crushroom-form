# Brainstorm — Lark Bot Notification w/ Copy-Pasteable Photos (Photo Upload Form)

Date: 2026-06-05 · Status: Design approved, ready for `/ck:plan`
Target file: `google-apps-script-complete.js` (CouplePix photo-upload GAS backend)

## Problem

Replace per-upload **email** notification with a **Lark group-bot** notification.
Staff must be able to **copy/paste the actual photos** out of the Lark message (inline images, not links).

Current notify: `MailApp.sendEmail(recipientEmail, subject, body)` — plain text, Drive links only
(`google-apps-script-complete.js:533-545`, recipient const `:19`). Fires in `doPost` after the sheet-row write.

## Key facts (verified)

- Backend is **Google Apps Script** — `UrlFetchApp` can call any HTTP API; no new infra.
- GAS **already holds the photo bytes** at upload time (saved to Drive) and code already builds Drive's
  public thumbnail URL `https://drive.google.com/thumbnail?id=ID&sz=w400` (`:230`) — small (~w400), well under
  Lark's ~10MB image cap. Use this as the upload source → no resize needed.
- **Lark cards embed images only via `img_key`** (no image-by-URL field). `img_key` is obtained **only** by
  uploading bytes to `POST /open-apis/im/v1/images`, which needs a `tenant_access_token` → a **Lark custom app**
  (`app_id` + `app_secret` + image-upload scope). A bare group-bot webhook cannot upload images.
- An `img_key` uploaded by an app renders in the **same-tenant** group-bot webhook card (hybrid pattern confirmed).
- GAS secrets live in `PropertiesService` (same pattern as the Spreadsheet ID, `:23`) — keeps creds out of git.

## Decisions (user-confirmed)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Email vs Lark | **Replace email fully** (remove `MailApp.sendEmail` + `recipientEmail` const) |
| 2 | Scope | **Photo upload form only** (`google-apps-script-complete.js`). Voice-gift `google-apps-script-voice.js:361` OUT |
| 3 | Photos in card | **Copy/paste-able inline images** — real bytes uploaded to Lark |
| 4 | Wiring | **Hybrid**: custom app uploads images → `img_key`; existing **group-bot webhook** posts the card |
| 5 | How many | **All uploaded photos** (one `img` element per slot) |
| 6 | Platform | **Lark international** (`open.larksuite.com`) |
| 7 | Secret storage | **Script Properties**: `LARK_WEBHOOK_URL`, `LARK_APP_ID`, `LARK_APP_SECRET` |
| 8 | Signing secret | **None** for now |

## Design — single file: `google-apps-script-complete.js`

### Remove
- `recipientEmail` const (`:19`) — used only at the send site.
- Email block (`:533-545`).

### Add
1. **Config helper** `setLarkConfig_(webhookUrl, appId, appSecret)` — one-time, writes the 3 Script Properties.
2. **Token** `getLarkTenantToken_()` — `POST /open-apis/auth/v3/tenant_access_token/internal` with app_id/secret;
   cache in `CacheService`/Script Property (~2h TTL), refetch on expiry.
3. **Image upload** `uploadLarkImage_(driveFileId)` — fetch the `…/thumbnail?id=ID&sz=w400` bytes (or
   `DriveApp.getFileById(id).getBlob()`), `POST /open-apis/im/v1/images` multipart (`image_type=message`,
   Bearer token) → return `img_key`. (`UrlFetchApp` auto-builds multipart when payload holds a Blob.)
4. **Notify** `notifyLark_(phone, items, samePhoto, message)`:
   - upload each `items[i]` photo → `img_key` (skip/placeholder on per-image failure)
   - build `interactive` card: header `"Khách vừa tải ảnh lên · <SĐT>"` (blue) → `div` SĐT + slot count →
     `hr` → per item: `img` (img_key) + `div` `lark_md` `N. SKU — Name · [Xem Drive](fileUrl)` → note if present
   - `POST` card to `LARK_WEBHOOK_URL` (`msg_type:"interactive"`), `muteHttpExceptions:true`
   - whole function wrapped in `try/catch` + `Logger.log` — a Lark failure must never break the upload response.
5. **Call site** — replace deleted email block with `notifyLark_(phone, items, samePhoto, e.parameter['message'])`.

### Deploy steps (in design/runbook)
1. Lark group → Settings → Bots → **Add Bot → Custom Bot** → copy webhook URL.
2. Lark Developer console → create **custom app** → add **image upload** (`im:resource`/message image) scope →
   copy `app_id` + `app_secret`; publish/enable in tenant.
3. GAS editor → run `setLarkConfig_('<webhook>', '<app_id>', '<app_secret>')` once.
4. Re-deploy web app (new version).

## Acceptance criteria

- Customer uploads photos → staff Lark group receives ONE interactive card containing: SĐT, slot count,
  **every uploaded photo inline (copy/paste/drag works)**, per-product SKU/name + Drive link, customer note.
- **No email** sent.
- Upload still returns `"Upload Done"` even if Lark token/upload/post fails (try/catch; failure logged only).

## Risks

- **Silent miss if Lark down** — accepted (email fully replaced); try/catch keeps upload working, logs failure.
- **Card `img` + webhook + app-uploaded img_key** — stable pattern but exact tag fields get **one live test POST**
  at implementation to confirm rendering.
- **Token cache** — must honor ~2h expiry; refetch on `code != 0` / 401.
- `UrlFetchApp` daily quota (~20k) + per-upload N image POSTs — non-issue at this volume.

## Out of scope

Voice-gift notification (`google-apps-script-voice.js:361`), admin panel, card action buttons, retries/queue,
signing-secret verification, full-resolution image upload (use w400 thumbnail).

## Unresolved questions

- Lark app image-upload scope exact name on current console (`im:resource` vs message-image) — confirm at setup.
- Whether to also show `samePhoto` single image once vs repeated per slot when customer reused one photo (minor; default: one `img` per slot, dedupe identical img_key).
