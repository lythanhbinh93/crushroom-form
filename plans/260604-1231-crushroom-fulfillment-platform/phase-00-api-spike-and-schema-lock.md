# Phase 0 — Live API Spike + Sheets Schema + Auth Lock

## Context Links
- **VERIFIED RESULT (authoritative):** `plans/reports/from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md` — live probes on shop 2798984; all 7 read gaps + the write gate CLOSED.
- API research: `plans/reports/researcher-260604-1220-poscake-pancake-pos-api-report.md` (original, superseded by the verified report)
- GAS backend: `google-apps-script-complete.js` (router, `jsonOut`, `scriptProp`, `normalizeVNPhone_`)
- Photo source schema: `Items` JSON column in "form data" (`doPost` lines 477-484)

## Overview
- **Priority**: P0 (BLOCKER — was the only thing gating downstream correctness).
- **Status**: **P0 GREEN — ready for P1.** API spike DONE + GREEN. Pull-model fully feasible; no order-create, no products/catalog API needed (those blockers stay dropped). Read + write both confirmed by live probes. Only genuinely-open items are SETUP config (spreadsheet/GAS reuse, CS Google accounts, status-code legend, api_key→PropertiesService) — see Unresolved.
- De-risk DONE. Real Poscake API called on shop 2798984; real JSON captured; every read gap resolved; write gate confirmed. Sheet schemas + auth design locked below.
- **The tool NEVER creates orders** (Poscake is the origin). Old order-CREATE + products/catalog gates DROPPED — confirmed not needed. The remaining write gate **order-UPDATE** is CONFIRMED: `PUT /shops/{shop}/orders/{id}` writes `note_print` / `note` / `tags`. Order *read* (list/get + date/tag filters) CONFIRMED live.

## CONFIRMED API (live, shop 2798984) — replaces all prior UNVERIFIED gates
- **Base** `https://pos.pages.fm/api/v1` · **Auth** `?api_key=<KEY>` (query param, live-confirmed) · **SHOP_ID** `2798984` · 33,342 orders. api_key lives in GAS `PropertiesService` at build time — NEVER in repo/code.
- **READ — list:** `GET /shops/{shop}/orders?api_key=&page_size=&page_number=&startDateTime=&endDateTime=&updateStatus=&tag_ids=[..]`. Paginated (`page_size`/`page_number`). `startDateTime`/`endDateTime` epoch date filter LIVE-confirmed (last 3d = 72 orders). `tag_ids=[36]` tag filter; `updateStatus` selects the time-type the date window applies to. For "orders WITHOUT Đang sản xuất": pull recent by date + client-side exclude tag 36 (safe default).
- **READ — single:** `GET /shops/{shop}/orders/{order_id}?api_key=`.
- **READ — tags list:** `GET /shops/{shop}/orders/tags?api_key=` (LIVE: 56 tags). Production tag **`Đang sản xuất` = id 36**; also `37 Đã có hình`, `47 Chờ cắt/hàn vòng`, `44 Đã soạn (khắc Laser)`.
- **Order → platform field map (LIVE-verified):** SKU/variant = `items[].variation_info.display_id` (e.g. `COUPLEPIX-DCM`); product name = `items[].variation_info.name`; qty = `items[].quantity`; product base = `items[].variation_info.product_display_id` (`COUPLEPIX`); customer phone = `bill_phone_number`; customer name = `bill_full_name`; shipping = `shipping_address.{full_name,phone_number,address,full_address,province_name,district_name,commune_name}`; COD/total = `cod` / `total_price` / `money_to_collect`; status = `status` (int) + `status_name`; tags = `tags:[{id,name}]`. Note fields: `note_print` (print note, usually empty — primary writeback target), `note` (internal; today holds size/chain free-text e.g. "snak chain 60cm"), `note_image` (a pancake.vn image URL).
- **WRITE (writeback) — CONFIRMED:** `PUT /shops/{shop}/orders/{order_id}?api_key=` body = only the fields to change: `{ "note_print": "...", "note": "...", "tags": [36, ...existing ids] }`. To ADD tag 36 without dropping others: read the order's current tag ids, append 36, PUT the union.
- **⚠️ HARD CONSTRAINT:** cannot PUT-update an order once **status >= 2** (sent to carrier / ĐVVC); items immutable after status >= 1 (we never touch items — only `note_print`/`note`/`tags`). → **Writeback must happen PRE-shipping.** Any order already at status >= 2 when we try to tag will reject → best-effort, MUST NOT block the supplier package (package builds from dashboard data). Need a status int→stage map on a sample to define the safe window (aggs: status 3 dominates @30,571 — likely shipped/done; 11=`waitting`).
- **BONUS — webhooks:** `order.created` / `order.updated` events exist → optional push-sync instead of polling (later optimization; polling fine for v1).

## Key Insights
- Pull-model GREEN. The pulled order CARRIES line items, customer, shipping — dashboard reads them, never builds them. No catalog/products API.
- order-UPDATE write gate CONFIRMED + SAFE: only `note_print`/`note`/`tags` written, never items; every write reversible. New hard rule: **only writeback when order status < 2**; tag-add = read-merge-PUT union (idempotent on an existing tag).
- The customer-photo side is ALREADY solved: photos linked by phone last4 via `searchByPhone` suffix-match; per-photo records live in `Items` JSON. Platform keys Poscake `bill_phone_number` → same normalized phone (reuse `normalizeVNPhone_`).

## Requirements — API discovery DONE (see CONFIRMED API above). Remaining = setup config.
**Functional (remaining for P0 close):**
- Lock the 5 sheet schemas (**Orders** pulled mirror, **UploadGroups**, PhotoMap, Batches, Users) using the confirmed field map. No Products sheet.
- Decide & document auth approach (Google identity vs token) — gated on "do all CS staff have Google accounts?".
- Map `status` int → stage on a sample to set the safe writeback window (the < 2 cutoff). Derive from `status_name` across the recent-orders sample.
- Decide reuse vs new: existing "form data" spreadsheet + existing GAS project, or a new GAS project on the shared spreadsheet (recommend new project).
- Confirm api_key stored in GAS `PropertiesService` (`PANCAKE_API_KEY`); never in repo.

**Non-functional**
- No production code in P0 beyond config; the API spike script was disposable and is done.

## The gaps to close — ALL CLOSED (live, shop 2798984) ✅
1. **Order-UPDATE writeback** ✅ — `PUT /shops/{shop}/orders/{id}` body `{note_print, note, tags:[ids]}`. Tag-add = read-merge-PUT union; production tag `Đang sản xuất` = **id 36**. Photo link goes in `note_print`/`note` (`note_image` PUT-writability unconfirmed but not needed; `note_print` suffices). **Hard rule:** writeback only when **status < 2**.
2. **Orders read filter** ✅ — `startDateTime`/`endDateTime` (epoch) + `page_size`/`page_number` LIVE-confirmed; `tag_ids=[..]` tag filter. "Without production tag" = pull by date window + client-side exclude tag 36.
3. **SKU/variation field location** ✅ — `items[].variation_info.display_id` (e.g. `COUPLEPIX-DCM`); base id `items[].variation_info.product_display_id`.
4. **Customer/shipping/COD field paths** ✅ — `bill_full_name` / `bill_phone_number` / `shipping_address.{...}` / `cod` / `total_price` / `money_to_collect`.
5. **Size + chain storage** ✅ — NOT structured in Poscake; today live as free-text in `note` (e.g. "snak chain 60cm"). Design's CS-manual free-text branch CONFIRMED.
6. **Pagination** ✅ — `page_size`/`page_number`. Rate-limit ceiling not probed; design sync with small page_size + backoff (low-risk: batch ≤20, 3×/week).
7. **Split-order detection** — NOT yet probed on a real split couple-order. Carry into P1 as a minor follow-up (group by `bill_phone` + close `created_at` heuristic as the default; capture a `parent_order_id`-style field if one surfaces on a sample).

## Architecture (spike — DONE)
```
Spike (DONE, shop 2798984) → GET /shops/2798984/orders (date window) → JSON captured + field paths mapped
                           → GET /shops/2798984/orders/tags → 56 tags, Đang sản xuất = id 36
                           → PUT /shops/2798984/orders/{id} {note_print,note,tags} confirmed (status < 2 only)
Result → plans/reports/from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md
```

## Related Code Files
**Read**: `google-apps-script-complete.js` (UrlFetchApp pattern in `imageProxy`, `scriptProp` for key storage), `app.py` (`clean_sku`, `safe_note` — confirm Poscake SKU survives clean_sku rules).
**Create (throwaway)**: `plans/260604-1231-crushroom-fulfillment-platform/spike/poscake-probe.gs` (or `.js`) — NOT deployed to prod.
**Create (deliverable)**: `plans/reports/planner-260604-XXXX-poscake-confirmed-api-and-schema-lock-report.md`.

## Implementation Steps
1. ~~Obtain SHOP_ID + api_key + sample/dummy order~~ DONE — SHOP_ID 2798984; api_key held by user (→ PropertiesService at build time).
2. ~~Call list orders; dump JSON; identify pagination + read filter~~ DONE — `page_size`/`page_number` + `startDateTime`/`endDateTime` + `tag_ids` confirmed.
3. ~~Map line-item SKU/variant + customer/shipping/COD + note paths~~ DONE — see CONFIRMED API field map.
4. ~~Probe order-UPDATE writeback (tag/note/link)~~ DONE — `PUT …/orders/{id}` `{note_print,note,tags}` confirmed; tag 36; **status < 2 only**.
5. **Map `status` int → stage** on the recent-orders sample (derive from `status_name`) to fix the safe writeback window (< 2 cutoff). [OPEN — quick, no new call needed beyond the captured sample.]
6. Resolve split-order signal — carry to P1 (heuristic: group by `bill_phone` + close `created_at`; capture a parent field if one shows on a sample). [OPEN, minor.]
7. **Decide auth:** if all CS have Google accounts → `Session.getActiveUser().getEmail()` vs Users sheet (cs|admin); else → token-login fallback (`?token=` per user row). [OPEN — gated on the Google-accounts question.]
8. **Lock 5 sheet schemas** (below) incl. CS daily-ops Orders fields (`fulfill_status` 5-value enum, `internal_note`, `claimed_by`, `claimed_at`, `local_overrides_json`). Decide: fold PhotoMap into Orders or keep separate; reuse "form data" spreadsheet/GAS project vs new (recommend new project, shared spreadsheet). [OPEN — final sign-off.]
9. ~~Write confirmed-API report~~ DONE — `from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md`.

### Locked schema proposals (finalize in step 8)
- **Orders** (pulled mirror — Poscake is origin): `poscake_order_id` | `line_index` | `display_id` | `parent_order_id` (split hint) | `status` (Poscake) | `bill_phone` (raw) | `phone_norm` | `last4` | `sku` | `variant_id` | `product_name` | `price` | `qty` | `customer_json` ({name,address,cod} pulled) | `note_print` (writeback target) | `tags_json` | `note_size` (CS local) | `note_chain` (CS local) | `local_overrides_json` (CS local field corrections for the supplier spec) | `req_id` (links the upload) | `internal_note` (CS context bridge from link) | `claimed_by` (email\|null) | `claimed_at` (ts\|null) | `fulfill_status` (`synced`\|`reconciling`\|`ready`\|`batched`\|`cancelled`) | `writeback_state` ({tag,note,link} bools) | `synced_at` | `reconciled_at`. PK = `poscake_order_id`+`line_index`. **Lifecycle (canonical):** `synced` (pulled from Poscake, awaiting reconcile) → `reconciling` (CS claimed, matching photos + filling note/size/chain) → `ready` (mapped + writeback done) → `batched`; `cancelled` from any state. Plus the upload-side `awaiting_upload`/`order_synced` two-sided-waiting states are tracked on UploadGroups (see below) — an Orders row may exist before its photos (`order_synced` on the matching UploadGroup) or after. Soft-claim: `claimed_by`/`claimed_at` stamped when CS opens an order to reconcile (UX anti-duplicate; LockService stays the write guard).
- **UploadGroups** (photo staging by phone, from the labeled upload) — **shipped header (P2)**: `req_id` (PK) | `phone` | `last4` | `status` (`awaiting_upload` — link minted, no photos yet, chase-list source \| `uploaded` — photos in) | `labels_json` (`[{label,count}]`, seeded at link creation) | `photos_json` (`[{label,box_index,photo_file_id,photo_url,filename}]`, filled at upload) | `internal_note` (CS context bridge, free-text, set at link creation) | `created_by` | `created_at` | `updated_at` | `bound_order_id` (set by P3 reconcile). Bridges photos until an Orders row is reconciled to them. Photos may arrive BEFORE or AFTER the Poscake order. *(The earlier single `items_json` sketch was split into `labels_json`+`photos_json`: labels are seeded before any photo exists, so the two-column form is cleaner. `phone_norm`→`phone`, `uploaded_at`→`updated_at`.)*
- **PhotoMap** (may FOLD into Orders columns — decide step 8): `poscake_order_id` | `line_index` | `slot` | `photo_file_id` | `photo_url` | `req_id` (source upload) | `sku_clean` | `note_yy` | `size` | `chain` | `qty` | `last4` | `mapped_by` | `mapped_at`. PK = `(poscake_order_id, line_index, slot)`.
- **Batches**: `batch_id` | `order_ids_json` | `folder_url` | `pdf_url` | `created_at` | `created_by` | `tag_pushed` (bool).
- **Users**: `email` | `role` (cs\|admin) | `token` (optional) | `active`.
- **Products — REMOVED.** Line items come from the pulled order; no catalog cache, no `syncProducts`, no picker.

## Todo List
- [x] Collect SHOP_ID (2798984) + api_key from user
- [x] Spike call: list orders, dump JSON; confirm read filter (date window + page_size/page_number + tag_ids) — gate 2
- [x] Map line-item sku/variant + customer/shipping/COD + note field paths (gates 3-4)
- [x] Probe order-UPDATE writeback (gate 1): `PUT …/orders/{id}` `{note_print,note,tags}` confirmed; tag 36; status < 2 only
- [x] Confirm size/chain NOT structured in Poscake — live as free-text in `note` (gate 5)
- [x] Resolve pagination (page_size/page_number) — gate 6 (rate-limit ceiling deferred, low-risk)
- [ ] Map `status` int → stage on the sample → fix the safe writeback window (status < 2 cutoff)
- [ ] Resolve split-order signal — carry to P1 (heuristic default) — gate 7
- [ ] Decide auth approach (Google identity vs token) — gated on CS-Google-accounts question
- [ ] Lock 5 sheet schemas (Orders incl. ops fields: 5-value `fulfill_status` enum + `internal_note` + `claimed_by` + `claimed_at` + `local_overrides_json`; UploadGroups, PhotoMap, Batches, Users — NO Products) + fold-PhotoMap + reuse decisions
- [x] Write confirmed-API report (`from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md`)
- [x] Spike script disposed

## Success Criteria
- ✅ Verified report exists with real order JSON + exact field path for every read gap (sku/variant, customer, shipping, COD, note) — no remaining UNVERIFIED.
- ✅ **Order-UPDATE writeback confirmed:** `PUT …/orders/{id}` `{note_print,note,tags}`; tag `Đang sản xuất`=36; read-merge-PUT union; **status < 2 only**.
- ✅ **Orders read filter confirmed:** date window (`startDateTime`/`endDateTime`) + `page_size`/`page_number` + `tag_ids`; "without prod tag" = date pull + client-side exclude 36.
- [ ] (remaining for P0 close) 5 finalized sheet schemas (NO Products) + auth decision + fold-PhotoMap + reuse decisions + status-int→stage map, signed off by user.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Order at status >= 2 when writeback fires → PUT rejected | M×M | Guard: read live `status` before writeback; if >= 2 skip the write (best-effort) — package still ships from dashboard data; never block. Map status int→stage to set the cutoff. |
| Tag-add drops existing tags (overwrite) | M×H | Read current tag ids → append 36 → PUT the **union**, never bare `[36]`. Idempotent on an existing 36. |
| size/chain only free-text in `note` | L×L | Expected — CS manual-entry already planned in P3; the `note` free-text confirms it |
| Rate-limit ceiling not probed | L×M | Batch ≤20, 3×/week, small page_size + backoff; well within typical limits; revisit only if 429s appear |
| Split-order signal not yet probed | L×M | Default to `bill_phone`+close-`created_at` heuristic in P1; capture a parent field if one surfaces |
| api_key wrong/expired at build | M×H | Validate with one read call in `initialSetup` before anything else; fail fast |

## Security Considerations
- api_key in GAS `PropertiesService` (`PANCAKE_API_KEY`) only; never commit, never in repo/code, never sent to browser.
- Redact customer PII (phone middle digits) in any saved JSON sample.
- Writeback only when status < 2; read-merge-PUT union for tags (never overwrite).

## Next Steps
Unblocks P1 (orders sync uses the confirmed read paths + date filter + Orders schema), P3 (reconcile reads the confirmed line-item/customer/note paths; writeback uses `PUT …/orders/{id}` `{note_print,note,tags:[union(36)]}` under the status < 2 guard), and P4 (package gen needs PhotoMap/Batches schema + the tag-36 writeback; the pre-batch cancellation re-check reuses the confirmed orders-READ endpoint). **P0 is GREEN** — P1 can start once the remaining setup items below are answered.

## Remaining setup questions (no longer blockers — just config to start P1)
1. Reuse existing "form data" spreadsheet + existing GAS project, or a new GAS project (recommended) on the shared spreadsheet?
2. Do ALL CS staff have Google accounts? (auth: Google-identity allowlist vs token login)
3. Status-code legend — map which `status` int = which stage (derive from `status_name` across the sample) to fix the safe writeback window (status < 2).
4. api_key storage → GAS `PropertiesService` at build time (✅ assumed; confirm).
5. Fold PhotoMap into Orders columns, or keep a separate PhotoMap sheet?
