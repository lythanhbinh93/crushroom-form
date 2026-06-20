# Phase 4 — Supplier-Package Generator + Ready Queue + "Đang sản xuất" Tag Writeback

## Context Links
- **#1 USER PRIORITY** — kills worst manual chain (photo→Drive→Sheets→master→PDF→supplier).
- P0 schema: PhotoMap (or finalized Orders columns), Batches. **P0 verified report:** `plans/reports/from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md` — tag writeback = `PUT /shops/2798984/orders/{id}?api_key=` `{tags:[union(36)]}`; prod tag `Đang sản xuất`=**36**; **status < 2 guard**; pre-batch re-check = `GET /shops/2798984/orders/{id}`.
- `google-apps-script-complete.js` — `DriveApp` usage (`doPost` `folder.createFile`), `LockService`, `imageProxy` Drive-read pattern, `Items` JSON (`fileId` per photo).
- `app.py` — filename contract `A. BBBB_XX_YY.ext` (already ported in P3 as `buildSlotName_`).

## Overview
- **Priority**: P1 (top payoff). **Status**: pending. **Depends**: PhotoMap rows for ready orders (P3) + Orders/Batches schema (P0/P1). NOT dependent on auto-sync.
- Cadence: **3×/week batch** — admin multi-selects Ready orders → ONE folder + ONE PDF per batch (not per-order, not daily).
- Admin one-click: take selected Ready orders → **pre-batch cancellation re-check** (`GET /shops/2798984/orders/{id}` — also captures live `status`) → create renamed Drive photo folder + templated PDF spec sheet → log Batch → set Orders `batched` (locks them) → **writeback the production tag 36 "Đang sản xuất"** (`writebackToPoscake(order_id,{tag:36})` from P3 — read tags → append 36 → PUT union; **status < 2 guard**). Output = ready-to-send supplier package.
- **This phase also owns the CS shift surface: the queue tabs in `fulfillment.html`** (Chờ upload / Chờ xử lý / Đang xử lý / Sẵn sàng + Đã gửi xưởng / Hủy filters). The "Sẵn sàng" tab IS the admin batch-selection pool; the other tabs route CS to the right order. Tabs are driven by `Orders.fulfill_status` + UploadGroup status (for the Chờ-upload chase list).

## Key Insights
- DRY the naming: copies/renames Drive files using `buildSlotName_` from P3 (same `A. BBBB_XX_YY.ext`). The photo bytes already exist in Drive (`photo_file_id` in PhotoMap) — COPY into a new per-batch folder with the renamed filename; do NOT re-upload.
- PDF via Sheets-template→export (locked decision): populate a templated Google Sheet (one row/slot: note, size, chain, qty, SKU, slot/filename, last4) then export to PDF via `UrlFetchApp` to the Sheets export URL (`/export?format=pdf&gid=…`) using `ScriptApp.getOAuthToken()` for auth, OR `DriveApp`/Drive API export. Save PDF into the batch folder. The supplier package carries the print note + photo regardless of whether Poscake writeback succeeded.
- Reversible queue: `markReady` (P3) sets `fulfill_status=ready`; package gen consumes ready orders and sets `batched`. Rollback = revert status + delete batch folder (folder url logged in Batches).
- **Queue tabs (CS shift surface).** One tab strip over `Orders.fulfill_status` (+ the UploadGroup chase list):

  | Tab | Source | UI |
  |---|---|---|
  | ⏳ Chờ upload | UploadGroups `awaiting_upload` (link minted, no photos) | age badge from `created_at`; **>24h highlight**; copy-reminder-link action |
  | 📥 Chờ xử lý | Orders `synced` + unclaimed (pulled, photos available, no fresh `claimed_by`) | oldest-first pool |
  | 🔧 Đang xử lý | Orders `reconciling` (claimed, fresh `claimed_at`) | "đang xử lý bởi X" badge |
  | ✅ Sẵn sàng | Orders `ready` not yet batched | multi-select → batch (admin) |
  | filters | Orders `batched` (Đã gửi xưởng) · `cancelled` (Hủy) | read-only history |

  Note the **two-sided waiting**: an order pulled before its photos sits `synced` but won't reconcile cleanly until its UploadGroup arrives; an UploadGroup uploaded before its order sits in Chờ upload→uploaded until `syncOrders` pulls the matching order. The Chờ-upload tab tracks the photo side; the Chờ-xử-lý tab tracks the pulled-order side awaiting reconcile.
- **Chase-list reminder is manual:** the "Chờ upload" copy-reminder action copies the upload link to clipboard so CS pastes it into Pancake. No automated customer reminder (YAGNI).
- **Pre-batch cancellation safety net.** Cancel is manual in both systems (CS cancels in Poscake + marks `cancelled` in dashboard). To guard against a forgotten dashboard cancel, `generateSupplierPackage` **re-checks each selected Ready order's live status via `GET /shops/2798984/orders/{id}`** before building; any order that reads cancelled is flagged and dropped from the batch (CS confirms). The same read also returns `status` — orders already at `>= 2` (shipped) get a tag-writeback that will best-effort-skip (still packaged). Prevents shipping a cancelled order to the supplier.
- **Batched → locked.** On successful package gen, the source Orders flip to `batched`, which makes them read-only to CS (admin-only reopen, per P3). The package already left for the supplier.
- Tag writeback is the LAST step and is best-effort: `writebackToPoscake(order_id, {tag:36})` (read current tags → append 36 → `PUT …/orders/{id}` `{tags:[union]}`). The status < 2 guard means an already-shipped order is skipped; if the PUT fails for any reason, the package is still generated — flag `tag_pushed=false` for manual retry. Never let tag failure discard a built package.

## Requirements
**Functional**
- **Queue-tabs view (`listQueues`):** the CS shift surface — tab strip (Chờ upload / Chờ xử lý / Đang xử lý / Sẵn sàng) + filters (Đã gửi xưởng / Hủy), driven by `Orders.fulfill_status` + UploadGroup status + claim freshness (table above). "Chờ upload" rows (UploadGroups `awaiting_upload`) show age + >24h highlight + **copy-reminder-link** action (copies upload link for manual Pancake paste). "Sẵn sàng" is the admin batch-selection pool with **multi-select checkboxes**.
- `markReady(order_id)`: (P3 already sets ready on a clean reconcile + writes note/link back) — this re-validates / re-flags if needed and covers the phone-pool path. Sets `fulfill_status=ready`.
- `generateSupplierPackage(order_ids[])`:
  1. **Pre-batch cancellation re-check:** for each selected order, `GET /shops/2798984/orders/{id}` → read live `status`/`status_name`; any that read cancelled are flagged + excluded; CS confirms before proceeding (or marks them `cancelled` in the dashboard). Capture `status` for the tag-writeback guard.
  2. LOCK. Create Drive folder `Batch_{date}_{seq}` (or per-order subfolder).
  3. For each PhotoMap slot: copy `photo_file_id` → folder, rename to `buildSlotName_` + ext.
  4. Populate PDF-template Sheet rows (note, size, chain, qty, SKU, slot/filename, last4) → export PDF → save to folder.
  5. Write Batches row (batch_id, order_ids, folder_url, pdf_url, by, created_at).
  6. Set orders `fulfill_status=batched` (locks them; admin-only reopen per P3). UNLOCK.
  7. `writebackToPoscake(order_id, {tag:36})` per order — read current tags → append 36 → `PUT …/orders/{id}` `{tags:[union]}`; status < 2 guard; idempotent on existing 36; set `tag_pushed`; best-effort.
- Admin gets folder URL + PDF URL to send to supplier.

**Non-functional**
- Single package gen within 6-min exec (cap orders/batch). Drive copy + PDF export are the heavy ops.
- Idempotent-ish: re-running on an already-batched order warns, doesn't silently double-create (check `fulfill_status`); tag writeback idempotent on an order that already has the tag.

## Architecture (data flow)
```
listQueues → tab strip (Chờ upload | Chờ xử lý | Đang xử lý | Sẵn sàng) + filters (Đã gửi xưởng | Hủy)
             driven by Orders.fulfill_status (+ UploadGroup status for Chờ upload, + claim freshness).
             "Chờ upload": age + >24h highlight + copy-reminder-link.
markReady → fulfill_status=ready
Admin "Tạo gói NCC" (select Sẵn sàng orders) → generateSupplierPackage(order_ids)
  → PRE-BATCH RE-CHECK: per order, GET /shops/2798984/orders/{id} → read status → drop/flag cancelled (CS confirms); keep status for tag guard
  → LOCK
  → DriveApp.createFolder(Batch_…)
  → per PhotoMap slot: DriveApp.getFileById(photo_file_id).makeCopy(buildSlotName_, folder)
  → populate template Sheet → export PDF (UrlFetchApp export URL + OAuth token) → save to folder
  → Batches.append(...) ; orders.fulfill_status=batched (locked)
  → UNLOCK
  → writebackToPoscake(order_id, {tag:36}) per order [read tags→append 36→PUT union; status<2 guard; best-effort] → tag_pushed
  → return {folder_url, pdf_url, tag_pushed, dropped_cancelled[]}
```

## Related Code Files
**Create (GAS, fulfillment project)**: `listQueues` (tabs over Orders.fulfill_status + UploadGroup status + claim freshness), `markReady`, `generateSupplierPackage`, helpers `createBatchFolder_`, `copyRenamedPhoto_`, `buildSpecPdf_` (populate template + export), `recheckPoscakeStatus_(order_ids)` (`GET …/orders/{id}` per order → status). Reuse `buildSlotName_` (P3), `writebackToPoscake` (P3 — tag-36 union + status < 2 guard), `DriveApp`/`LockService` patterns.
**Create (Sheets)**: a PDF-template tab/spreadsheet (columns: STT, Filename, SKU, Note, Size, Chain, Qty, Last4). Decide reuse-of-existing-master vs new (P0 Q).
**Create (frontend)**: **queue tab strip** (Chờ upload / Chờ xử lý / Đang xử lý / Sẵn sàng + Đã gửi xưởng / Hủy filters; age badge + >24h highlight + copy-reminder-link on Chờ upload) + "Tạo gói NCC" button (on Sẵn sàng) + pre-batch cancelled-flag panel + result panel (folder/PDF links, tag status) in `fulfillment.html`/`assets/fulfillment.js`.

## Implementation Steps
1. `markReady` with P3 validation gate.
2. `listQueues` + queue tab strip (Chờ upload / Chờ xử lý / Đang xử lý / Sẵn sàng + Đã gửi xưởng / Hủy). Chờ-upload: age from UploadGroup `created_at`, >24h highlight, copy-reminder-link. Sẵn sàng: multi-select for batch.
3. `recheckPoscakeStatus_` (pre-batch cancellation read) + cancelled-flag UI panel.
4. `createBatchFolder_` + `copyRenamedPhoto_` (makeCopy with `buildSlotName_`). Handle missing fileId gracefully (skip+report).
5. Build PDF template Sheet; `buildSpecPdf_` populates rows + exports PDF to folder.
6. `generateSupplierPackage` orchestration (pre-batch re-check → LOCK → status transitions incl. Orders→`batched` → Batches row → tag writeback).
7. Tag writeback via `writebackToPoscake(order_id, {tag:36})` per order (read tags → append 36 → PUT union; status < 2 guard); best-effort + `tag_pushed` flag.
8. Frontend result panel: copyable folder + PDF links; tag status; retry-tag button; list of dropped-cancelled orders.
9. E2E: one ready order → generate → pre-batch re-check passes → open folder (renamed photos present) + PDF (correct spec) + Orders flipped `batched` + Poscake shows tag. Plus: a Ready order cancelled in Poscake is caught by the re-check and excluded.

## Todo List
- [ ] `markReady` + validation gate
- [ ] `listQueues` + queue tab strip (Chờ upload age/>24h/copy-reminder · Chờ xử lý · Đang xử lý · Sẵn sàng multi-select · Đã gửi xưởng/Hủy filters)
- [ ] `recheckPoscakeStatus_` pre-batch cancellation read + flag panel
- [ ] `createBatchFolder_` + `copyRenamedPhoto_` (makeCopy + rename)
- [ ] PDF template Sheet + `buildSpecPdf_` export
- [ ] `generateSupplierPackage` orchestration (re-check → LOCK + status incl. Orders→batched + Batches + tag writeback)
- [ ] Tag writeback via `writebackToPoscake` best-effort + flag
- [ ] Frontend queue tabs + generate + result panel (incl. dropped-cancelled list)
- [ ] E2E: folder + PDF + Orders batched + live tag verified; cancelled-order re-check excludes it

## Success Criteria
- Queue tabs render the right rows per status: Chờ upload (UploadGroup `awaiting_upload`, with age + >24h highlight + copy-reminder), Chờ xử lý (Orders `synced` unclaimed), Đang xử lý (Orders `reconciling`, with "bởi X"), Sẵn sàng (Orders `ready`), + Đã gửi xưởng (`batched`) / Hủy (`cancelled`) filters.
- One click on a multi-selected batch of ready orders yields: a pre-batch re-check that drops any Poscake-cancelled order, ONE Drive folder of correctly-renamed photos (`A. BBBB_XX_YY.ext`) across all selected orders, ONE PDF spec sheet, a Batches log row, `fulfill_status=batched` (locked) on each, and tag 36 "Đang sản xuất" PUT (union) onto each status < 2 order.
- A Ready order cancelled in Poscake (but not yet marked Hủy in the dashboard) is caught by the pre-batch re-check and excluded from the package.
- Tag-writeback failure still leaves a usable folder+PDF and `tag_pushed=false`.
- Re-running on a batched order warns instead of duplicating; re-tagging an already-tagged order does not duplicate the tag.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| PDF export via export-URL auth fails in web-app context | M×H | Spike `ScriptApp.getOAuthToken()` + export URL early; fallback: Drive API `files.export` or render template tab → `getAs(PDF)` |
| Drive copy/export exceeds 6-min on big batch | M×H | Cap orders/batch (e.g. ≤20 slots); paginate; checkpoint |
| Missing `photo_file_id` (unmapped slot slipped through) | L×H | P3 gate + skip-and-report per slot; mark batch incomplete |
| Tag writeback corrupts order (wrong endpoint/body) | L×H | Only the P0-confirmed `PUT …/orders/{id}` `{tags:[union(36)]}`; only `tags` sent (never items); read-merge-PUT union; status < 2 guard; best-effort; never block package |
| Tag-add drops existing tags (overwrite) | M×H | Read current tag ids → append 36 → PUT the union, never bare `[36]` |
| Double-generate creates orphan folders | M×M | Status check (`batched`) before gen; log folder_url for cleanup |
| Cancelled order shipped to supplier (forgotten dashboard cancel) | M×H | Pre-batch re-check reads live Poscake status per order; drops cancelled before any photo copy; CS confirms |
| Re-check adds N extra read calls per batch (quota) | L×M | Batch is ≤20 orders, 3×/week; one `GET …/orders/{id}` per order well within quota |
| Queue tab status drift (stale status) | L×M | Tabs read `Orders.fulfill_status` + UploadGroup status directly (single source); claim freshness computed at read (4h rule), no cached duplicate state |

## Security Considerations
- `markReady`/`generateSupplierPackage` require `admin` role (`requireRole_`). `listQueues` is `cs`-or-`admin` (the CS shift surface).
- Drive copies inherit batch-folder sharing; set folder sharing deliberately (link-view for supplier) — document, don't leave world-writable.
- api_key for the tag writeback only from `scriptProp`.
- PDF/folder URLs are sensitive (customer notes) — share link scope = view-only.

## Next Steps
P5 adds status board over `fulfill_status`, retires Streamlit (this replaces app.py's ZIP export), updates docs. Add time-driven tag-retry only if manual proves stable.
