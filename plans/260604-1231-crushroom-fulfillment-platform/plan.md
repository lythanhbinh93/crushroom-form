---
title: "Crush Room Fulfillment Platform"
description: "CS-ops platform on CouplePix GAS+Sheets: pull orders FROM Poscake, reconcile uploaded photos, write back production data → supplier package"
status: pending
priority: P1
effort: ~8-12 days
branch: claude/add-photo-upload-tool-p3dI0
tags: [gas, sheets, poscake, fulfillment, cs-ops, vietnamese]
created: 2026-06-04
---

# Crush Room Fulfillment Platform

CS-team ops platform on the EXISTING CouplePix stack (GAS + Sheets + Drive + Vercel static). Zero new infra.
**Poscake is ALWAYS the order origin. The tool NEVER creates orders.** CS creates orders in Poscake (as today). The dashboard **PULLS/syncs orders FROM Poscake** (read), reconciles uploaded photos to them, and **writes back** only production data (print note + photo link + "Đang sản xuất" tag) onto the existing order.
Heart = photo↔order-line association: customer labeled upload stages photos by phone; CS reconciles them to the pulled order line-items. Size/chain stay CS manual free-text (local to dashboard, not in Poscake).

## Loop (target)
CS (in Pancake chat) creates labeled upload link (free-text labels) → customer uploads into labeled boxes → photos stage by phone (**UploadGroup**) → CS creates the order in **Poscake** (as today) → dashboard **syncs orders from Poscake** (line items + customer + shipping ride along) into the **Orders** mirror → **CS reconcile screen**: pulled order line-items ↔ uploaded photos, auto-match by label + phone-pool override, fill note/size/chain (free-text, not in Poscake), MAY override some pulled fields locally → Mark Ready → **writeback** print note + photo link + tag onto the existing Poscake order → Admin batch (3×/week) multi-select Ready → one-click supplier package (renamed folder + PDF) → writeback "Đang sản xuất" → Đã gửi xưởng.

## Architecture
Poscake API (base `https://pos.pages.fm/api/v1`, `?api_key=`, SHOP_ID 2798984 — **all CONFIRMED**). **READ:** `GET /shops/{shop}/orders` (page_size/page_number + `startDateTime`/`endDateTime` + `tag_ids`), `GET …/orders/{id}`, `GET …/orders/tags`. **WRITE:** `PUT …/orders/{id}` `{note_print, note, tags:[ids]}` — tag-add = read-merge-PUT union; prod tag `Đang sản xuất`=36; **only when order status < 2** (immutable once sent to carrier). ↔ GAS ↔ Sheets [Orders (pulled mirror), UploadGroups (photo staging by phone), PhotoMap (photo→order line), Batches, Users] + Drive. Vercel `fulfillment.html` = CS/admin dashboard; reworked `couplepix.html` = `req`-driven labeled customer upload (stages photos into an UploadGroup). Reuses: `jsonOut`, `LockService`, `normalizeVNPhone_`, `searchByPhone` suffix-match, `Items` JSON column, `imageProxy`. Ports app.py: `clean_sku`, `safe_note`, `expand_slots`, `A. BBBB_XX_YY.ext`.

## Decisions (locked)
- #1 priority = supplier-package generator (kills worst manual chain). Sequence to a WORKING package ASAP.
- **Poscake is the order origin. The tool NEVER creates orders.** Dashboard PULLS orders from Poscake (read), reconciles photos, writes back production data onto the existing order. No order-create, no draft-becomes-order, no "Push to Poscake".
- **Line items (SKU, variant, price), customer, shipping all come WITH the pulled order** — no catalog/product picker, no products sync, no Products sheet. (Was a P0 blocker — now DROPPED.)
- UploadGroup (photo staging by phone, from the labeled upload) STAYS. PhotoMap (binds photo→order line) STAYS. Orders = pulled mirror.
- CS may **override some pulled fields locally** (e.g. correct a SKU/note for the supplier spec) — local to the dashboard; not necessarily written back to Poscake.
- Labeled upload uses CS-set **free-text labels** (`?req=`); generic phone link = fallback (CS reconciles from phone-pool).
- Two-sided waiting: order may arrive in Poscake BEFORE or AFTER photos. Reconcile when both present. `awaiting_upload` chase list stays; add `order_synced` (order pulled, awaiting photos) state.
- Batch cadence = **3×/week** admin multi-select. Size + chain = **CS manual free-text** everywhere.
- **CS daily-ops layer (approved 2026-06-11):** shared pool (any CS reconciles any order, no link-sender ownership); soft claim (`claimed_by`/`claimed_at`, badge, manual + 4h-idle auto-release; LockService stays write guard); `internal_note` context bridge at link creation; queue tabs in `fulfillment.html` (Chờ upload chase list w/ >24h highlight / Chờ xử lý / Đang xử lý / Sẵn sàng); post-Ready spec edits via reopen (no Poscake write); `batched`=admin-only; pre-batch Poscake-READ cancellation re-check. No-photo (khắc) orders OUT of scope. See `plans/reports/brainstorm-260611-0924-cs-daily-ops-queues-and-claims-report.md`.

## Phases
| # | Phase | Status | Depends on | File |
|---|-------|--------|-----------|------|
| 0 | Live API spike (read + order-UPDATE writeback) + Sheets schema + auth lock | **GREEN — API done; setup config open** | — | [phase-00](phase-00-api-spike-and-schema-lock.md) |
| 1 | Datastore + orders-mirror sync (read) + auth/roles | pending | P0 | [phase-01](phase-01-orders-ingest-and-auth.md) |
| 2 | Labeled upload rework + UploadGroup photo staging + link creation | **code-complete** (awaiting deploy + E2E) | P1 | [phase-02](phase-02-labeled-upload-and-staging.md) |
| 3 | **CS reconcile + writeback** (pulled line-items ↔ photos auto-match, note/size/chain, local field override, writeback tag+note+link) | pending | P2 | [phase-03](phase-03-cs-reconcile-surface.md) |
| 4 | Supplier-package generator + ready queue + tag writeback | pending | P3 + P0/P1 schema | [phase-04](phase-04-supplier-package-generator.md) |
| 5 | Status board, polish, retire Streamlit, docs | pending | P1-P4 | [phase-05](phase-05-status-board-polish-retire.md) |

### Hard dependency (CLEARED ✅)
order-CREATE + products/catalog API blockers DROPPED (confirmed not needed). The remaining write gate **order-UPDATE is CONFIRMED:** `PUT …/orders/{id}` writes `note_print`/`note`/`tags` (prod tag 36, read-merge-PUT union). Constraint: writeback only when order **status < 2** (immutable after carrier handoff) — any later order is best-effort; the supplier package (reads dashboard data, not Poscake) ships regardless. P0 is GREEN.

### Front-load option
P4 package gen depends only on PhotoMap + Orders/Batches schema (P0) — NOT on auto-sync or writeback. After P0 + minimal P1 (auth + schema) + one order reconciled via P3, P4 ships the #1 payoff. Then harden orders sync, labeled-upload staging, and the writeback.

## Datastore (Sheets, schemas locked in P0)
- **Orders** (pulled mirror — Poscake is origin) — PK `poscake_order_id`+`line_index`. `display_id`, `parent_order_id` (split hint), `status` (Poscake), `bill_phone`/`phone_norm`/`last4`, `sku`, `variant_id`, `product_name`, `price`, `qty`, `customer_json` ({name,address,cod} pulled), `note_print` (writeback target), `tags_json`, `fulfill_status` (`synced`|`reconciling`|`ready`|`batched`|`cancelled`), `note_size`/`note_chain` (CS local), `local_overrides_json` (CS local field corrections), `claimed_by`/`claimed_at` (soft claim), `internal_note` (CS context bridge from link), `req_id` (links the upload), `writeback_state` ({tag,note,link} flags), `synced_at`/`reconciled_at`.
- **UploadGroups** (photo staging by phone, from the labeled upload) — **shipped header** (P2): `req_id` (PK), `phone`, `last4`, `status` (`awaiting_upload`|`uploaded`), `labels_json` (`[{label,count}]`, seeded at link creation), `photos_json` (`[{label,box_index,photo_file_id,photo_url,filename}]`, filled at upload), `internal_note`, `created_by`, `created_at`, `updated_at`, `bound_order_id` (set by P3 reconcile). Bridges photos until an Orders row is reconciled to them. *(Supersedes the earlier `items_json` single-column sketch — labels are seeded before photos exist, so a two-column split is cleaner.)*
- **PhotoMap** — package input keyed `(poscake_order_id, line_index, slot)`: `photo_file_id`, `photo_url`, `sku_clean`, `note_yy`, `size`, `chain`, `qty`, `last4`, `req_id`, `mapped_by`, `mapped_at`. May FOLD into Orders columns (decide P0).
- **Batches** — package log: batch_id, order_ids, folder_url, pdf_url, created_at, by, tag_pushed.
- **Users** — email → role (cs|admin) allowlist.
- **Products — REMOVED.** (Line items come from the pulled order; no catalog cache.)

## New GAS endpoints
`createUploadLink` (CS→req_id+labels) · `saveUpload` (customer upload→UploadGroup) · `getUploadLabels` (form) · `syncOrders` (Poscake orders LIST/GET → Orders mirror, READ) · `listOrders` (dashboard) · `getReconcileData` (order line-items + matched/phone-pool photos) · `savePhotoMap`/`reconcile` (bind photos + note/size/chain + local overrides → Ready) · `claimDraft`/`releaseDraft` (soft claim) · `reopenOrder` (post-Ready spec edit, admin when batched) · `writebackToPoscake` (order-UPDATE: tag + print-note + photo-link on existing order) · `markReady` · `generateSupplierPackage` · `whoami`/auth. **REMOVED:** `pushOrderToPoscake`, `syncProducts`, `listProductsCatalog`.

## Cross-cutting risks
Concurrency → LockService + upsert keyed by `poscake_order_id`+`line_index` / `req_id`. GAS quotas (UrlFetch/day, 6-min exec) → paginate, batch writes, manual trigger first. **Writeback status-window rule:** Poscake rejects a PUT once order **status >= 2** (sent to carrier) — read live status before any writeback; if >= 2, skip (best-effort) and never block the package. Tag-add = read-merge-PUT **union** (never bare `[36]`, never drop existing tags). CS skips labeling → generic link, CS reconciles from phone-pool. Writeback partial → degrade affected piece to manual; package still ships from dashboard data.

## Unresolved questions
**P0 API gates — ALL RESOLVED ✅** (writeback endpoint, read/date filter, sku/variant + customer/shipping/COD paths, SHOP_ID, api_key, size/chain location, tag shape, pagination — confirmed in `from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md`).

**Remaining setup config (to start P1):**
1. Reuse existing "form data" spreadsheet + existing GAS project, or a new GAS project (recommended) on the shared spreadsheet?
2. Do ALL CS staff have Google accounts (auth: Google-identity vs token)?
3. Status int → stage map (derive from `status_name`) to fix the safe writeback window (status < 2).
4. Fold PhotoMap into Orders columns or keep a separate sheet?
5. Notify email for Ready/package events? [ops brainstorm leans no — YAGNI; dashboard queue only — confirm.]

**Ops layer (from 2026-06-11 brainstorm):**
6. Soft-claim auto-release window = **4h idle** OK, or should it match shift length?
7. Chase-list reminder stays **manual** (CS copies link into Pancake) — revisit auto-reminder only if non-upload rate proves high?
