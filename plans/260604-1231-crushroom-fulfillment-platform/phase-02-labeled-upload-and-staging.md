# Phase 2 — Labeled Upload Rework + UploadGroup Photo Staging + Link Creation

## Context Links
- Brainstorm: `plans/reports/brainstorm-260604-1249-cs-fulfillment-platform-matching-workflow-report.md` (Hybrid C, photo-first)
- `couplepix.html` + `assets/couple-pix.js` — EXISTING customer upload form (currently: customer fetches catalog via `action=listProducts`, picks products+qty, uploads one photo per slot). This rework REPLACES the SKU-picker with CS-set labels.
- `google-apps-script-complete.js` — `doPost` (431) ingest→Drive→`Items` JSON (515-526), `normalizeVNPhone_` (411), `jsonOut`, `LockService`
- P0 schema: UploadGroups sheet
- `assets/couple-pix.js` — `last4` (50), phone input (16), croppie crop flow (already built — reuse)

## Overview
- **Priority**: P1 (stages the photos that P3 reconciles to pulled orders). **Status**: code-complete (awaiting deploy + E2E). **Depends**: P1.
- Two pieces: (1) a CS "create upload link" action that sets free-text item **labels** + an optional **"Ghi chú nội bộ"** (internal context note) and mints a `req_id`; (2) a reworked customer upload form that renders **one labeled box per item** (couple ⇒ 2 boxes) and stages photos into an **UploadGroup** keyed by phone. Generic phone link (no `req`) = fallback (no UploadGroup record; CS reconciles from phone-pool in P3).
- **No order is created here.** Poscake is the order origin; CS creates the order in Poscake separately. This phase only STAGES labeled photos by phone so P3 can reconcile them to the pulled order. `createUploadLink` writes an UploadGroup row at status **`awaiting_upload`** (link minted, no photos yet) — the source of the P4 **"Chờ upload" chase list**. Customer upload flips it `awaiting_upload → uploaded`.

## Key Insights
- **The UploadGroup is photo staging only** (NOT a draft order — that concept is removed). It holds labeled photos + phone + internal_note until P3 reconciles it to a pulled Poscake order. The photo usually arrives BEFORE the Poscake order exists; the UploadGroup bridges that wait. No `poscake_order_id` here — the join happens in P3 (by phone, then label).
- The UploadGroup seeded here is partial: `items_json` has `{label}` per box at link creation, gains `{photo_file_id, photo_url}` on upload. SKU/variant/price/customer all come from the PULLED order (P3 reads them), never collected here.
- **Context bridge (shared-pool fix):** any CS can reconcile any order, so the link-sender's chat context (agreed chain/size/notes) is captured at link creation in **`internal_note`** (free-text, e.g. "khách chốt dây bạc 45cm"). It rides on the UploadGroup, and P3 copies it onto the Orders row at reconcile; the reconcile header always shows the phone for Pancake lookup. No ownership rules added (shared pool).
- REUSE the existing croppie crop + Drive upload pipeline in `assets/couple-pix.js` + `doPost`. Only the slot-definition source changes: from customer catalog-pick → from CS-defined labels passed via `?req=`.
- Customers won't understand SKU codes → labels are free-text VN words ("Mặt dây thú cưng", "Vòng đôi"). No catalog, no SKU exposure on the customer form.
- Fallback path is non-negotiable: a generic `?phone=` link (no `req`) must still upload (keeps current behavior); NO UploadGroup is created — P3 reconciles from the phone-pool. Guarantees nothing blocks when CS skips labeling.
- DRY: `saveUpload` writes to the new UploadGroups sheet; it does NOT replace the existing `doPost`→"form data" path. The "form data" sheet still receives photos (so `searchByPhone` phone-pool keeps working); the UploadGroup adds the label structure on top, keyed by `req_id`.

## Requirements
**Functional**
- `createUploadLink(labels[], internal_note?)` (CS, in fulfillment.html): input N free-text labels, each with a count (couple⇒2), plus an optional **"Ghi chú nội bộ"** free-text note. Mint `req_id`. Optionally bind a phone if known. Persist an UploadGroups row at status **`awaiting_upload`** (items pre-seeded with labels, no photos yet, `internal_note` stored). Return shareable link `…/couplepix.html?req=REQID[&phone=...]`.
- Reworked `couplepix.html`:
  - If `?req=` present → fetch label set for that `req_id`, render one labeled photo box per (label × count). No catalog dropdown.
  - If no `req=` (generic/phone link) → fall back to existing catalog/phone behavior unchanged.
- `saveUpload(req_id, phone, photos[{label,fileId,fileUrl}])`: customer submit → upload photos via existing Drive flow → upsert the UploadGroups row by `req_id` (set phone_norm, last4, fill `items_json[].photo_file_id`/`photo_url` by label, **flip status `awaiting_upload → uploaded`**) AND append existing "form data" row (so phone-pool fallback still finds them). LockService around write. Returns `req_id`.
- `getUploadLabels(req_id)`: customer form reads the CS-defined label set.

**Non-functional**
- Vietnamese UI; mobile-first (customers on phones) — reuse existing responsive layout + croppie.
- No regression to the generic/phone path (current customers unaffected).

## Architecture (data flow)
```
CS (fulfillment.html) → createUploadLink([{label,count}], internal_note?) → req_id + UploadGroups row (status=awaiting_upload, labels + internal_note seeded) → link ?req=REQID
  (UploadGroups rows at awaiting_upload = the P4 "Chờ upload" chase list)
Customer opens link → getUploadLabels(req_id) → render labeled boxes (couple=2)
  → crop (croppie, existing) → upload to Drive (existing doPost pipeline)
  → saveUpload(req_id, phone, photos[{label,fileId,fileUrl}])
    → LOCK → upsert UploadGroups row (fill items_json[].photo, phone_norm, last4; status awaiting_upload→uploaded) + append "form data" row → UNLOCK
Generic link (no req) → existing catalog/phone form path (unchanged) → "form data" only (no UploadGroup; P3 reconciles from phone-pool)
```

## Related Code Files
**Create (GAS, fulfillment project)**: `createUploadLink`, `getUploadLabels`, `saveUpload` + helper `mintReqId_`. Reuse `normalizeVNPhone_`, Drive upload from `doPost`, `jsonOut`, `LockService`.
**Modify (frontend)**: `couplepix.html` + `assets/couple-pix.js` — add `?req=` branch: fetch labels, render labeled boxes, post to `saveUpload`. Keep existing catalog/phone branch as fallback (guard on `req` param).
**Create (frontend)**: "Tạo link upload" panel in `fulfillment.html`/`assets/fulfillment.js` (label rows + count + copy-link button).
**Read**: `assets/couple-pix.js` (crop + upload patterns), `google-apps-script-complete.js` (`doPost` Drive flow).

## Implementation Steps
1. `mintReqId_` + `createUploadLink` writing an UploadGroups row (status=`awaiting_upload`, items_json seeded with labels, `internal_note`, created_by).
2. `getUploadLabels(req_id)` returns label set for the form.
3. Rework `assets/couple-pix.js`: detect `?req=`; if present, fetch labels and render one box per (label×count); skip catalog. Else keep current path.
4. `saveUpload`: LOCK → upsert UploadGroups row (fill `items_json[].photo` by label + phone fields, flip status `awaiting_upload`→`uploaded`), AND append to "form data" (reuse existing column builder so `Items`/`searchByPhone` stay valid) → UNLOCK.
5. CS link-creation UI in fulfillment.html: add label rows, set count, **optional "Ghi chú nội bộ" textarea**, generate + copy link.
6. E2E: CS makes a 2-label couple link with an internal note → verify an UploadGroups row at status=`awaiting_upload` (chase-list source) carries the note → open as customer → upload into labeled boxes → verify the row flips to status=`uploaded` with correct labels↔fileIds AND "form data" row exists for phone-pool.

## Todo List
- [x] `mintReqId_` + `createUploadLink` (seed UploadGroups row at `awaiting_upload` + `internal_note` + `created_by`)
- [x] `getUploadLabels(req_id)` endpoint (public; never leaks `internal_note`)
- [x] `couple-pix.js` `?req=` labeled-box branch (early-return; generic catalog path untouched)
- [x] `saveUpload` (UploadGroups upsert + status `awaiting_upload`→`uploaded` + best-effort "form data" mirror, LockService; `ItemCount`/size caps)
- [x] CS "Tạo link upload" UI (labels + count + "Ghi chú nội bộ" + copy)
- [~] E2E: **deployment leg VERIFIED live 2026-06-22** (probe `?action=getUploadLabels&req_id=…` → `{"success":false,"error":"không tìm thấy link…"}` = P2 routing live + UploadGroups readable + public access OK). **Upload-flip leg pending** merchant manual test (create link → `awaiting_upload` row → customer upload → `uploaded` + `photos_json`). Merchant SKIPPED `FORM_DATA_SHEET_ID` → no form-data mirror (UploadGroup is sole record; reversible by setting the prop, no redeploy).

## Code-complete notes (2026-06-20)
- The labeled `?req=` flow talks to the **fulfillment** backend (one round-trip): `getUploadLabels` (GET) + `saveUpload` (POST). Generic `?phone=` links stay on the CouplePix backend, unchanged.
- `saveUpload` mirrors into the CouplePix "form data" sheet only when `FORM_DATA_SHEET_ID` is set (best-effort; never blocks the customer).
- Shipped UploadGroups schema = two columns `labels_json` (seed `[{label,count}]`) + `photos_json` (fill `[{label,box_index,photo_file_id,photo_url,filename}]`), plus `created_by` + `updated_at` + `bound_order_id` — see plan.md datastore + phase-00 (reconciled to match shipped code).
- Review fixes applied: `ItemCount`≤60 + 12 MB/image cap on the public endpoint; `intialSetup` now auto-upgrades the UploadGroups header when the sheet has no data rows; orphan (`group_updated=false`) logged.
- Known gaps (by design): labeled uploads don't fire the CouplePix Lark ping (dashboard queues surface them in P3/P4); a crafted phoneless POST stages a phone-less UploadGroup (the customer form requires a phone).

## Success Criteria
- CS creates a labeled link (labels + count + optional "Ghi chú nội bộ" + generate); link mints an UploadGroups row at status=`awaiting_upload` carrying any internal note (visible in the P4 chase list).
- Customer with a `?req=` link sees labeled boxes; couple label shows 2 boxes; uploads land tagged with the right label and flip the UploadGroup `awaiting_upload → uploaded`.
- Generic/phone link (no `req`) uploads exactly as today (no regression; no UploadGroup created).
- Uploaded photos remain discoverable via `searchByPhone` (phone-pool fallback intact).

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Customer dumps all photos in box 1 / ignores labels | M×M | Labels reduce not eliminate mess; P3 reconcile override from phone-pool covers it |
| CS skips link creation (sends generic link) | M×M | Generic path preserved → P3 reconciles from phone-pool, never blocks |
| Dual-write (UploadGroups + form data) partial failure | L×H | Single LockService section; write form-data first (proven path), then UploadGroups; on UploadGroups fail, photo still in pool |
| Rework breaks existing customer form | M×H | `req`-branch is additive; guard on param; regression-test generic path in success criteria |
| `req_id` collision / guessable link | L×M | Random id; link only exposes labels (no PII unless phone in URL); treat as low-sensitivity |

## Security Considerations
- `createUploadLink` behind `requireRole_` (cs/admin); `getUploadLabels`/`saveUpload` are public (customer-facing) like existing `doPost`, but write only to the UploadGroup (no SKU/price/customer/order data — those live on the PULLED Poscake order, read by CS in P3).
- Do NOT leak product/SKU/price data to the customer form — labels are CS free-text words only.
- Sanitize label/phone server-side; reuse `normalizeVNPhone_`.

## Next Steps
P3 (CS reconcile) joins a pulled Orders row to its UploadGroup by phone, soft-claims the order, reads the `internal_note` context bridge, auto-matches photos to line-items by label (phone-pool override), fills note/size/chain, and writes back tag+note+link to the existing Poscake order. P2 must ship before P3 can auto-match by label (but P3's phone-pool fallback works even without P2).
