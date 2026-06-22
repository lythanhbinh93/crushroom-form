# Fulfillment Platform — Phase 1 Deploy (order-sync + auth)

Backend: [`google-apps-script-fulfillment.js`](../google-apps-script-fulfillment.js). New standalone project + new spreadsheet (isolated from the customer-upload backend). Poscake = order origin; this tool **pulls** orders (read) — never creates them.

## A. One-time Google setup (you)

1. **New Google Sheet** — create a blank spreadsheet, name it e.g. `Crush Room Fulfillment`.
2. **Open Apps Script** — in that Sheet: **Extensions → Apps Script** (this makes the script container-bound, so `getActiveSpreadsheet()` works).
3. **Paste code** — replace the default `Code.gs` contents with all of `google-apps-script-fulfillment.js`. Save.
4. **Add the secret** — Apps Script left sidebar → **Project Settings (gear) → Script Properties → Add**:
   - `PANCAKE_API_KEY` = your Poscake api_key (the one you gave me). **Only here — never in code/repo.**
   - (`SHOP_ID` = `2798984` and `SYNC_WINDOW_DAYS` = `14` are auto-seeded by step 5, but you can add them now too.)
5. **Run `intialSetup`** — in the editor, pick function `intialSetup` → **Run**. Approve the Google auth prompt (Sheets + external requests). This stores the spreadsheet id and creates the tabs: `Orders`, `UploadGroups`, `PhotoMap`, `Batches`, `Users`.
6. **Seed `Users`** — open the new `Users` tab, fill rows under the headers. **The `token` column is REQUIRED** — the dashboard authenticates by token, not auto Google email (a cross-origin `fetch` from the Vercel page can't read the visitor's Gmail — verified empirically). Give each person a long random string:
   | email | role | token | name | active |
   |---|---|---|---|---|
   | you@gmail.com | admin | `a8F3kZ9qLp2mWx7v` | Bình | true |
   | cs1@gmail.com | cs | `Tn5RbY2cQ8wHj4dE` | Lan | true |
   - `role` = `admin` or `cs`. `token` = any hard-to-guess string (treat like a password). `active` = `true`. The CS person logs in by pasting their token once (stored in the browser), or you send them a bookmark `…/fulfillment.html?token=THEIR_TOKEN`.

## B. Smoke test (you, in the editor — no deploy yet)

7. Run function **`testSync`** → **View → Logs**. Expect something like:
   `{"success":true,"window_days":14,"stats":{"fetched":N,"new":N,"updated":0,"skippedTag36":M}}`
   Check the `Orders` tab filled with real recent orders (sku, customer, qty, status, tags).
8. Run `testSync` **again** → second run should show `new:0` and `updated:N` (idempotent — no duplicate rows). ✅ Phase 1 success criterion.

## C. Deploy as Web App (you)

9. Apps Script → **Deploy → New deployment → Web app**:
   - **Execute as:** `User accessing the web app` (so `Session.getActiveUser().getEmail()` resolves the logged-in CS).
   - **Who has access:** `Anyone with Google account` (or your Workspace domain).
   - Deploy → copy the **/exec Web app URL**.
10. Done — the URL is already wired into `assets/fulfillment.js`.

## D. Frontend test (the dashboard)

Frontend = [`fulfillment.html`](../fulfillment.html) + [`assets/fulfillment.js`](../assets/fulfillment.js) + [`assets/fulfillment.css`](../assets/fulfillment.css), wired to the deployed `/exec` URL.

11. Make sure you ran step 6 (a **token** in your `Users` admin row) and `testSync` populated `Orders` (or you'll sync from the UI).
12. Open the dashboard — either:
    - **Local:** serve the repo (`python -m http.server 8000`) → open `http://localhost:8000/fulfillment.html`, OR
    - **Vercel:** push the repo → open `https://crushroom-form.vercel.app/fulfillment.html`.
13. Paste your **token** → Đăng nhập. You should see your name·role; as **admin** a **"Đồng bộ đơn"** button appears.
14. Click **Đồng bộ đơn** → the `Orders` fill and the table shows real orders (masked phone, SKU, product, qty, Poscake status, tags). Filter chips switch `fulfill_status`.

✅ Phase 1 done when: login works, sync populates the table, a non-allowlisted token gets rejected.

## Notes / guardrails
- **api_key** lives only in Script Properties. `listOrders` masks phones and omits COD (role-gated detail comes in P3).
- Sync pulls only the recent **date window** (default 14 days) and **skips orders already tagged `Đang sản xuất` (id 36)** — i.e. "orders without the production tag", matching today's manual filter.
- Re-sync **preserves CS-set fields** (size/chain, claim, overrides) once an order moves past `synced`.
- Start with the **manual "Đồng bộ" button**; add a time-driven trigger only after manual sync is proven stable.
- Writeback to Poscake (tag/note) is **Phase 3/4** — Phase 1 is read-only against Poscake.

## E. Phase 2 — Labeled upload + photo staging (UploadGroups)

Adds: CS "Tạo link upload" panel → mints a `?req=` link with free-text photo **labels** + an optional internal note; the customer form renders **one labeled box per (label × count)** and stages photos into an `UploadGroups` row (status `awaiting_upload → uploaded`). The labeled `?req=` flow talks to **this** (fulfillment) backend; generic `?phone=` links keep using the CouplePix backend unchanged.

### E1. New Script Properties (Project Settings → Script Properties)
| Key | Value | Required | Notes |
|---|---|---|---|
| `UPLOAD_FOLDER_ID` | Drive folder id for customer photos | yes (auto-seeded) | `intialSetup` seeds the CouplePix folder `1JB9vANvnKu52WQX4Mg1fYqF6i-Jthhs7`; change to a dedicated folder if desired. |
| `FORM_DATA_SHEET_ID` | spreadsheet id of the **CouplePix** backend (the one holding the `form data` sheet) | optional | When set, each labeled upload is **mirrored** into `form data` so the existing phone-pool (`searchByPhone`) + admin view still find these photos. Leave blank to skip the mirror — the `UploadGroups` row is still the primary record. |

> Re-run `intialSetup` once (or add `UPLOAD_FOLDER_ID` by hand) so the upload folder is set.

### E2. Re-deploy + re-authorize
`saveUpload` uses **Drive** (`DriveApp.createFile`) and, if `FORM_DATA_SHEET_ID` is set, opens the **CouplePix spreadsheet**. Both are new scopes vs Phase 1, so the next run prompts a fresh Google auth dialog — approve it. Then **Deploy → Manage deployments → Edit → New version** (so the live `/exec` serves the P2 code: `createUploadLink`, `getUploadLabels`, `saveUpload`).
- **Execute as:** keep `User accessing the web app`. **Who has access:** `Anyone` (the customer upload form is anonymous, like the CouplePix `doPost`).

### E3. Smoke test
1. Dashboard → **＋ Tạo link upload** → add 2 labels (e.g. `Vòng đôi` count 2 via "Cặp đôi", `Mặt dây` count 1), type a "Ghi chú nội bộ", **Tạo link** → copy the link. Check `UploadGroups` has a row at `status=awaiting_upload` with `labels_json`, `internal_note`, `created_by`.
2. Open the copied `…/couplepix.html?req=…` link → you should see **labeled boxes** (couple = 2), no catalog. Upload + crop each → **Gửi ảnh**.
3. Verify the `UploadGroups` row flipped to `status=uploaded` with `photos_json` (label ↔ file ids). If `FORM_DATA_SHEET_ID` is set, a new `form data` row exists too (phone-pool intact).
4. **Regression:** open the plain `couplepix.html` (no `?req=`) → the catalog/phone flow is unchanged.

✅ Phase 2 done when: a labeled link mints an `awaiting_upload` row; a `?req=` upload flips it to `uploaded` with correct label↔file mapping; the generic catalog form still works.

### Notes / guardrails (P2)
- The customer form **never** sees SKU/price/internal_note — only the CS free-text labels.
- `getUploadLabels`/`saveUpload` are public (anonymous customer), like the CouplePix `doPost`. `createUploadLink` is token-gated (cs/admin).
- The `form data` mirror is **best-effort** — a mirror failure never blocks the customer (photo is already in Drive + `UploadGroups`).
- Labeled uploads do **not** fire the CouplePix Lark notification (that lives in the CouplePix backend); they surface in the dashboard queues instead (P3/P4).

## F. Phase 3 — CS reconcile + writeback to Poscake

Adds the **reconcile screen**: click a synced order → match staged/phone-pool photos to its pulled line-items, fill note/size/chain, **Sẵn sàng** → writes the print note + photo links onto the EXISTING Poscake order (`PUT …/orders/{id}`). Soft-claim coordinates shared-pool CS. The tool still **never creates an order**.

### F1. Re-deploy + re-authorize
`writebackToPoscake` makes an outbound **`PUT`** to Poscake (new scope vs read-only P1). Run `intialSetup` once (it now appends the `writeback_state` + `reconciled_at` columns to the Orders sheet via `ensureColumns_`), approve the auth prompt, then **Deploy → Manage deployments → Edit → New version**. New actions served: `getReconcileData`, `claimDraft`, `releaseDraft`, `markReady`, `reopenOrder` (GET) + `saveReconcile` (POST).

### F2. ⚠️ Verify the live single-order GET shape BEFORE relying on writeback
The writeback reads the order's LIVE status first (the `status<2` carrier guard). In the Apps Script editor, run a one-liner against a real order id and check the shape:
```
function probeOrderShape() { Logger.log(JSON.stringify(pancakeGet_('/orders/REAL_ORDER_ID')).slice(0, 400)); }
```
- If the order object is at `…data.status` (object) or `…data[0].status` (array) or a bare `status`, the code already handles all three.
- If `status` is missing, `markReady` still succeeds but the writeback **safe-skips** and records `writeback_state.reason="unexpected order shape"` — that's the signal the shape needs another unwrap. (A real shipped order records `reason="status>=2…"` instead — the two are deliberately distinct.)

### F3. Smoke test (one order, status < 2)
1. Sync orders, open one from the table → soft-claim stamps (header shows "đang giữ: you"); the matched photos (from the `?req=` UploadGroup) + phone-pool photos appear per line.
2. Toggle a photo onto each line, fill **size** + **dây/chain**, watch the filename preview (`1._{last4}_{SKU}_{note}`). **Lưu khớp** → `PhotoMap` rows + `fulfill_status=reconciling`.
3. **Sẵn sàng** (confirm) → `fulfill_status=ready`, claim cleared, and the Poscake order's `note_print` gets the composed note + photo links. Re-open the order in Pancake to confirm.
4. Force a **status≥2** order → Mark Ready still succeeds but `writeback_state` shows `skipped` (note stays in the dashboard for the P4 package). **Reopen** a ready order → back to `reconciling` (no Poscake write).

✅ Phase 3 done when: a status<2 order reconciles + writes its note back; a status≥2 order safe-skips; the production tag is NOT duplicated (tag write lands in P4); order count in Poscake is unchanged (never creates).

### Notes / guardrails (P3)
- Writeback body is **whitelist-built** (`note_print` / `tags` only) — it can never touch items/price/qty.
- The production **tag 36** write is deferred to **P4** (batch send); Mark-Ready writes only the note.
- Soft-claim is a coordination hint (4h auto-release); LockService guards the real writes.
- Phone-pool photo override needs `FORM_DATA_SHEET_ID` set (same prop as the P2 mirror); without it, reconcile uses only the `?req=` UploadGroup photos.

## What's next after this deploys
P4 = supplier-package generator (renamed Drive folder + PDF from `PhotoMap`/ready orders) + the production-tag writeback at batch send (`writebackToPoscake_(id,{tag:true})` is already built). See `plans/260604-1231-crushroom-fulfillment-platform/`.
