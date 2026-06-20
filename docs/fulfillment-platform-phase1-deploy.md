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

## What's next after this deploys
P2 = labeled upload + photo staging (UploadGroups). P3 = CS reconcile + writeback. P4 = supplier package. See `plans/260604-1231-crushroom-fulfillment-platform/`.
