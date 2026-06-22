# Phase 3 — CS Reconcile + Writeback (Line-Items ↔ Photos · Annotate · Writeback Tag/Note/Link)

## Context Links
- Brainstorm: `plans/reports/brainstorm-260604-1249-cs-fulfillment-platform-matching-workflow-report.md` (photo-first matching workflow)
- `app.py` — PORT logic: `clean_sku` (26), `safe_note` (37), `expand_slots` (55), needs-photo + img-per-unit heuristics (140-161), filename `A. BBBB_XX_YY.ext`
- `assets/admin.js` — photo-by-phone fetch + `Items` JSON parse (`parseItems` 126, `fileUrl`/`fileId`)
- `google-apps-script-complete.js` — `searchByPhone` (266), `imageProxy` (88) thumbnail fallback
- **P0 verified report:** `plans/reports/from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md` — confirmed writeback `PUT /shops/2798984/orders/{id}?api_key=` body `{note_print, note, tags:[ids]}`; prod tag `Đang sản xuất`=**36**; line-item/customer/note paths.

## Confirmed writeback contract (from P0)
- **Endpoint:** `PUT /shops/{shop}/orders/{order_id}?api_key=` — body carries only the fields to change.
- **Print note:** `note_print` (usually empty in Poscake — primary writeback target for the print/photo info). `note` holds size/chain free-text today.
- **Tag-add (idempotent union):** read the order's current `tags[].id`, append **36**, PUT `{tags:[union]}` — never bare `[36]`, never drop existing tags.
- **⚠️ status < 2 guard:** Poscake rejects a PUT once order `status >= 2` (sent to carrier). Read live `status` before any writeback; if `>= 2`, skip (best-effort) + flag `writeback_state` — never fail reconcile, never block the package. Photo link goes in `note_print`/`note` (`note_image` PUT-writability unconfirmed; not needed).

## Overview
- **Priority**: P1 (CORE — the new heart; **reconcile photos to the PULLED order, then write back production data**). **Status**: pending. **Depends**: P2 (UploadGroups staged) — degrades to reconciling from phone-pool without it. **Hard dep CLEARED:** the writeback `PUT …/orders/{id}` `{note_print,note,tags}` is P0-confirmed. Only failure mode is the **status >= 2 window** (order already shipped → PUT rejected); that order's writeback degrades to best-effort/manual but the supplier package still ships.
- **Poscake is the order origin — the tool NEVER creates an order.** This screen joins a PULLED Orders row (line items + customer + shipping already present) to its staged photos, confirms photo↔line-item auto-match (override via phone-pool), fills note/size/chain (CS manual), optionally overrides some pulled fields LOCALLY (for the supplier spec), then **writes back** the print note + matched photo link + the production tag "Đang sản xuất" onto the EXISTING Poscake order. PhotoMap rows (or completed Orders columns) feed P4's package generator.
- **Shared pool + soft claim.** Any CS can open any unclaimed `synced` order; opening stamps `claimed_by`/`claimed_at` so others see "đang xử lý bởi X". Claim is UX anti-duplicate-work only; LockService remains the write-correctness guard. The header surfaces the order's `internal_note` (context bridge, copied from the matched UploadGroup) + phone (for Pancake lookup).

## Key Insights
- **Pull, don't create.** The order already exists in Poscake with its line items (sku/variant/price), customer, shipping, COD — all pulled by P1's `syncOrders`. CS does NOT pick products from a catalog (no catalog picker, no Products sheet — REMOVED). CS reconciles photos to those pulled lines and annotates them. Nothing creates a second order.
- **Join: pulled order ↔ staged photos by phone, then label.** `getReconcileData` loads the Orders row's line-items on one side and the matched UploadGroup photos (by `phone_norm`, via the `req_id` bind from P1, or by phone-pool `searchByPhone`) on the other.
- **Three photo-association sources, ranked** (unchanged intent): (1) labeled UploadGroup auto-match by label+count (P2 happy path); (2) CS manual pick from phone-pool (`searchByPhone` over "form data" + `Items` JSON) via "lấy ảnh từ kho SĐT" override; (3) flag-missing. No AI guessing (rejected, KISS).
- **Customer + shipping + COD come from the PULLED order** (read-only display from P0 paths). NOT collected on the upload form and NOT re-entered by CS. If a pulled field is wrong, CS may LOCALLY override it for the supplier spec (`local_overrides_json`) — local to the dashboard; not necessarily written back to Poscake (correcting Poscake itself stays a manual Poscake edit).
- **Size + chain = CS manual free-text** (locked; not in Poscake per P0). Required before Ready. No SKU derivation.
- PORT app.py filename logic verbatim into GAS: `clean_sku`, `safe_note` (full VN-diacritic regex + 35-char cap), slot expansion. Filename `A. BBBB_XX_YY.ext` (A=slot, BBBB=last4, XX=clean_sku, YY=safe_note). DRY: single naming source used by P4. SKU read from the pulled line-item (P0 path), or a CS local override.
- **Writeback is the write step — order-UPDATE, not order-create.** `writebackToPoscake(poscake_order_id, {note?, tag?})` does `PUT /shops/{shop}/orders/{id}` writing onto the EXISTING order: the print info into **`note_print`** (+ photo link in `note_print`/`note`) and the production **tag 36** via the read-merge-PUT union. **status < 2 guard first** — if the order is already `>= 2`, skip + flag (best-effort); the note + photo link always also live in the supplier package, so the package never depends on writeback. Tag is the canonical "in production" signal. Idempotency: a tag-union that already contains 36 must NOT duplicate it.
- **Writeback timing (decision):** write the **`note_print` + photo link at Mark-Ready** (so a single Ready order is self-describing in Poscake), and write the **production tag 36 at batch send** (P4) — the tag means "sent to xưởng", which only becomes true at batch. This keeps the tag honest and batches the heavier writes. Both pass the **status < 2 guard**; an order already `>= 2` at Mark-Ready gets a best-effort skip (its info still ships in the package).
- **Soft claim (anti-duplicate-work).** Opening a `synced` order stamps `claimed_by`=current CS + `claimed_at`=now (if unclaimed or claim is stale). Badge "đang xử lý bởi X" shows in the queue + reconcile header. Release: (a) manual "Nhả" button, (b) auto-release after **4h idle** (claim is stale if `now - claimed_at > 4h`), (c) on Mark-Ready (work done). A second CS opening a claimed-and-fresh order sees a warning but is not hard-blocked (LockService still serializes the actual write). Claim ≠ lock; it's a coordination hint.
- **Post-Ready edit rules (the supplier package reads DASHBOARD data, not Poscake).** Until an order is `batched`: a **photo/spec edit** (wrong photo, note, size, chain, local override — the fields P4 reads) is fixed by reopening the order, swapping, re-saving — **no Poscake edit needed** (package regenerates from the dashboard). A **price/customer/shipping/COD change** must be edited **manually in Poscake by CS** (those live on the Poscake order). After an order is `batched`, it is **locked (admin-only)** — the package already shipped to the supplier.
- **No-photo (khắc / engraving) orders are OUT of this platform** — they keep their current manual path. The reconcile screen handles photo orders only.

## Requirements
**Functional**
- Open a reconcile view for a `poscake_order_id` (from the synced-orders queue). Opening **soft-claims** the order (stamp `claimed_by`/`claimed_at` if unclaimed or claim stale) and copies the matched UploadGroup `internal_note` onto the order if not already set.
- `getReconcileData(poscake_order_id)`: returns { order (incl. pulled line-items[{sku, variant_id, product_name, price, qty}], `customer_json`, `fulfill_status`, `internal_note`, `claimed_by`, `claimed_at`, `local_overrides_json`), matchedPhotos[{label, photo}] (from the bound UploadGroup), phonePoolPhotos[] }. The header shows `internal_note` + phone prominently. Line-items + customer are READ-ONLY display (overridable locally, see below).
- **Soft-claim endpoints:** `claimDraft(poscake_order_id)` (stamp if unclaimed/stale), `releaseDraft(poscake_order_id)` (manual "Nhả"). A time-based check treats `now - claimed_at > 4h` as released (evaluated on read; no separate job).
- **Photo auto-match**: greedy map line-item↔staged-photo by label+count; present as editable. Override per item via "lấy ảnh từ kho SĐT" (phone-pool picker) or flag-missing.
- **Annotate** per line-item: note (→ safe_note filename preview), size, chain (CS manual, required). SKU defaults from the pulled line-item; CS may LOCALLY override sku/note for the supplier spec.
- **Local field override**: CS may correct a pulled field (sku, note, customer detail) into `local_overrides_json` for the supplier spec — clearly marked "local; sửa Poscake riêng nếu cần". Does NOT write to Poscake.
- `reconcile(poscake_order_id, photoMap[], annotations)` / `savePhotoMap`: persist matched photos + note/size/chain + local overrides → write PhotoMap rows (or finalize Orders columns) keyed `(poscake_order_id, line_index, slot)`. Idempotent upsert. Status stays `reconciling` until Mark-Ready.
- **`markReady(poscake_order_id)`**: validate every line-item has a confirmed photo (or explicit flag) + size + chain → set `fulfill_status=ready`. At Ready, **writeback `note_print` + photo link** to the existing Poscake order (status < 2 guard; skip + flag if `>= 2`). The tag-36 writeback happens at batch (P4).
- **`writebackToPoscake(poscake_order_id, {note?, tag?})`**: `PUT /shops/{shop}/orders/{id}` on the EXISTING order. **Read live `status` first — if `>= 2`, no-op + flag (best-effort), never fail reconcile.** For tag: read current `tags[].id` → append 36 → PUT the union (idempotent on an existing 36). For note: PUT `{note_print:"..."}`. Record `writeback_state` per piece. Used by Mark-Ready (note) and by P4 (tag).
- **Reopen / post-Ready edit:** a `ready` order (not yet `batched`) can be reopened to swap photo or fix note/size/chain/local-override — package-relevant fields only, **no Poscake write** (P4 regenerates from the dashboard). Price/customer/shipping/COD edits are NOT done here — the UI directs CS to edit the Poscake order manually. A `batched` order is locked: CS sees it read-only; only `admin` may reopen.
- Validation gate (before Ready): every line-item has a confirmed photo (or explicit flag) + size + chain.

**Non-functional**
- Vietnamese UI; paginate items/photos if many (mirror app.py >50).
- Live filename preview so CS sees exact `A. BBBB_XX_YY.ext` before Ready.
- Mark-Ready is a single explicit action with a confirm step (it triggers the note/link writeback).

## Architecture (data flow)
```
fulfillment.html (reconcile view, poscake_order_id selected)
  → getReconcileData(poscake_order_id)  [soft-claim: stamp claimed_by/claimed_at if unclaimed or claim older than 4h]
      → header: internal_note (context bridge) + phone (Pancake lookup) + claim badge
      → pulled line-items (sku/variant/price/qty — READ-ONLY, locally overridable)
      → matched UploadGroup photos (by req_id bind / phone) + auto-match by label+count
      → searchByPhone(phone) → phone-pool photos (override source)
  CS: confirm/override photo per line-item · note/size/chain (manual) · optional local field override
      (filename preview = A. BBBB_XX_YY.ext)
  → reconcile/savePhotoMap  [LOCK → upsert PhotoMap rows by (order_id,line_index,slot); status=reconciling]
  → markReady(poscake_order_id)
      → validate required fields (photo + size + chain per line)
      → LOCK → set fulfill_status=ready
      → writebackToPoscake(order_id, {note})  [PUT note_print + photo link; read status first, skip if >=2; record writeback_state]
      → on Ready: clear claim (work done)
  → (P4 batch send) writebackToPoscake(order_id, {tag:36}) [read tags → append 36 → PUT union; status<2 guard; idempotent on existing 36]

Post-Ready edit (order not yet batched):
  reopen → swap photo / fix note/size/chain/local-override (P4-read fields) → re-Ready (NO Poscake write)
  price/customer/shipping/COD change → UI directs CS to edit the Poscake order manually
  order batched → locked (admin-only reopen)
```

## Related Code Files
**Create (GAS, fulfillment project)**: `getReconcileData`, `reconcile`/`savePhotoMap`, `claimDraft`, `releaseDraft`, `reopenOrder` (admin-gate when `batched`), `markReady`, `writebackToPoscake` (`PUT …/orders/{id}`; helpers `mergeTagIds_(current, 36)` for the union + `canWriteback_(status)` for the status < 2 guard), ported helpers `cleanSku_`, `safeNote_`, `expandSlots_`, `buildSlotName_`, `autoMatchPhotos_(lineItems, stagedPhotos)`, claim helper `isClaimStale_(claimed_at)` (4h). Reuse `searchByPhone`, `imageProxy`.
**Create (frontend)**: reconcile view in `fulfillment.html` + `assets/fulfillment.js` — **header strip (internal_note + phone + claim badge "đang xử lý bởi X" + "Nhả" release button)**, line-item rows (READ-ONLY pulled sku/variant/price + local-override affordance, photo cell w/ auto-match + phone-pool override + flag-missing, note/size/chain inputs, filename preview), pulled customer/ship/COD panel (read-only, local-overridable), "Lưu khớp" + "Sẵn sàng (ghi note + ảnh sang Poscake)" actions (confirm dialog), **reopen affordance for ready orders (read-only + admin-only reopen when batched)**. Reuse `extractGoogleDriveId` + thumbnail + `imageProxy` fallback from `assets/admin.js`.
**Read**: `app.py` (logic source of truth), `assets/admin.js` (photo render patterns).

## Implementation Steps
1. Port `clean_sku`→`cleanSku_`, `safe_note`→`safeNote_` (full diacritic regex + replacements + 35 cap), `expand_slots`→`expandSlots_`, `buildSlotName_(slot,last4,skuClean,noteYY)`.
2. `getReconcileData`: load the Orders row (pulled line-items + customer) + matched UploadGroup photos (req_id bind / phone) + phone-pool photos + soft-claim (stamp via `claimDraft` if unclaimed or `isClaimStale_`) + copy UploadGroup `internal_note` onto the order. `autoMatchPhotos_` (greedy by label+count). `claimDraft`/`releaseDraft` endpoints.
3. Reconcile UI: header strip (internal_note + phone + claim badge + "Nhả"); per-line-item READ-ONLY pulled sku/variant/price (+ local-override), photo cell (auto-matched + swap + phone-pool override + flag-missing), note/size/chain + filename preview; pulled customer/ship/COD panel (read-only, local-overridable).
4. Size/chain ALWAYS manual required fields (per P0 lock).
5. `reconcile`/`savePhotoMap` (LOCK, upsert PhotoMap by (order_id,line_index,slot) + local overrides, status=`reconciling`).
6. `writebackToPoscake`: `PUT /shops/2798984/orders/{id}?api_key=`. Guard `canWriteback_(status)` (skip + flag if `>= 2`). Tag = `mergeTagIds_(current,36)` → PUT `{tags:[union]}` (idempotent on existing 36). Note = PUT `{note_print:"..."}`. Record `writeback_state`. api_key from `scriptProp` only.
7. `markReady`: validate → status=`ready` → `writebackToPoscake({note})` (best-effort, status < 2) → clear claim. (Tag-36 deferred to P4 batch send.)
8. Validation gate: block Ready until every line has photo (or flag) + size + chain.
9. `reopenOrder`: `ready` (not `batched`) → reopen for photo/note/size/chain/local-override swap (no Poscake write); `batched` → admin-only reopen; UI directs price/customer/shipping/COD edits to manual Poscake.
10. E2E: pull a 2-line couple order (status < 2) → open reconcile → soft-claim stamps → auto-match confirms photos → fill note/size/chain → Mark Ready → `note_print`+photo link PUT onto the existing Poscake order + PhotoMap rows + claim cleared + filename strings exact. Then a phone-pool reconcile (no UploadGroup), a **status >= 2 best-effort skip** (writeback flagged, package still ships), a soft-claim/release cycle, and a post-Ready photo-swap reopen.

## Todo List
- [x] Port `cleanSku_`/`safeNote_`/`buildSlotName_` (JS) with parity to app.py — **node test `tests/app-py-port-parity.test.js` PASSES 15/15** (eval's the real shipped helpers, not a copy)
- [x] `getReconcileData` (pulled line-items + UploadGroup/phone-pool photos) + soft-claim on open + internal_note surfaced live from the matched UploadGroup
- [x] `claimDraft`/`releaseDraft` + `isClaimStale_` (4h auto-release on read)
- [x] Reconcile UI (full-screen view: header internal_note + phone + claim badge + Nhả; per-line read-only sku/qty, photo toggle-grid from matched∪phone-pool, size/chain inputs, live filename preview)
- [x] `saveReconcile`/`writePhotoMap_` upsert (PhotoMap delete+re-append by order + local overrides, status=`reconciling`)
- [x] `writebackToPoscake` (`PUT …/orders/{id}`; `canWriteback_` status<2 guard reads LIVE status; `mergeTagIds_` union; whitelist body = note_print/tags only; writeback_state)
- [x] `markReady` (validate → ready → writeback note → clear claim; best-effort/try-caught)
- [x] `reopenOrder` (ready→reconciling; admin-only when batched)
- [x] Ready validation gate (server-side: photo + size + chain per line; client guard advisory)
- [ ] E2E: labeled reconcile + writeback, phone-pool reconcile, status>=2 skip, soft-claim/release, post-Ready reopen *(manual — after deploy)*

## Code-complete notes (2026-06-22)
- All P3 endpoints in `google-apps-script-fulfillment.js`; reconcile UI in `fulfillment.html`/`assets/fulfillment.{js,css}`.
- **Writeback safety (code-reviewer verified):** never creates an order (only GET/GET-one/PUT); PUT body is whitelist-built (`note_print`/`tags` only — structurally can't touch items/price/qty); `status<2` guard reads LIVE status before every PUT; tag union idempotent (never bare `[36]`, never drops/dupes); api_key only from `scriptProp`, never returned/logged. Tag-36 write is wired but **deferred to P4** (markReady writes only `note_print`).
- **Schema:** Orders gained `writeback_state` + `reconciled_at` via append-only `ensureColumns_` (safe on a sheet with data; called in `syncOrders_` + `loadOrder_`); `updateOrderRow_` preserves them on re-sync.
- **Soft-claim** is a UX hint (stamped on GET, no lock); LockService guards the real writes (`saveReconcile`/`markReady`). Plan-intended.
- **Review fix applied:** `writebackToPoscake_` now tolerates `{data:{}}` / `{data:[{}]}` / bare order shapes and flags a missing-status misread distinctly from a real status>=2 skip.
- **⚠️ Deploy-time verify (unresolved Q below):** confirm the live `GET /shops/2798984/orders/{id}` response shape so the status-read isn't a silent misread. The hardening makes any misread a safe-fail (writeback skipped + `writeback_state.reason='unexpected order shape'`), but the note-writeback only works once the real shape is confirmed.

## Success Criteria
- A pulled 2-line couple order is reconciled and marked Ready in a clean flow: photos auto-matched correct, size/chain entered, one "Sẵn sàng" click; the print note + photo link are written back onto the EXISTING Poscake order (or the unsupported piece flagged for manual, package unaffected).
- Phone-pool case (CS skipped labeled link): CS reconciles a pulled order from the phone-pool and marks Ready — without leaving the screen.
- status >= 2 order: the writeback is skipped + flagged (best-effort); note/photo still appear in the supplier package (P4); no order corruption.
- The tool NEVER creates a Poscake order; reconcile only reads + updates the existing one (verify by order count unchanged after a full reconcile).
- Generated slot filenames byte-identical to app.py output for same inputs (test vs a known old-Streamlit order).
- An order with a missing photo or empty size/chain CANNOT be marked Ready.
- Re-writing the production tag onto an order that already has it does NOT duplicate it (idempotency guard).
- Opening an unclaimed order stamps `claimed_by`/`claimed_at` and shows "đang xử lý bởi X"; "Nhả" clears it; a claim older than 4h reads as released.
- The header shows the order's `internal_note` + phone so a non-original CS has the chat context (shared-pool bridge).
- A `ready` (not batched) order can be reopened to swap a photo / fix note/size/chain with NO Poscake write; the UI directs price/customer/shipping/COD changes to manual Poscake editing.
- A `batched` order is read-only to CS and reopenable only by `admin`.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Writeback request wrong → corrupts the live order | M×H | Exact P0 contract `PUT …/orders/{id}` `{note_print, tags:[union]}`; only `note_print`/`note`/`tags` ever sent (never items); first writeback on a test order; CS confirm dialog; idempotent tag union |
| Tag-add overwrites existing tags | M×H | `mergeTagIds_(current, 36)` PUTs the **union**, never bare `[36]` |
| Order at status >= 2 → PUT rejected | M×M | `canWriteback_(status)` reads live status first; skip + flag (best-effort); note + photo always in the supplier package; never block Ready or the package |
| Photo auto-match mis-maps (label typo / count off) | M×M | Suggestion editable, never auto-commits; CS confirms each line; phone-pool override |
| No UploadGroup (CS sent generic link) | M×M | Phone-pool reconcile is the documented fallback; flow still completes |
| Pulled line-item SKU path wrong (P0 mis-mapped) | M×M | SKU read from the P0-verified path; CS local override available; filename preview surfaces a bad value before Ready |
| JS port diverges from Python (diacritics/edge) | M×H | Unit-test `safeNote_`/`cleanSku_` vs app.py on real notes (VN diacritics, COUPLEPIX-DCW) |
| Photo not found at all | M×M | "No photos" + manual SDT re-search (like app.py); flag-missing |
| Thumbnail taint blocks render | L×M | Reuse `imageProxy` base64 fallback |
| Two CS open same order (claim race) | M×M | Soft-claim badge warns on open; LockService serializes the actual write — claim is coordination, not a lock |
| Stale claim blocks an order after CS leaves | M×M | 4h auto-release (evaluated on read) + manual "Nhả"; no separate cron needed |
| Local override diverges from Poscake silently | L×M | Overrides clearly labeled "local; sửa Poscake riêng"; UI nudges manual Poscake edit when a sale-affecting field is wrong |

## Security Considerations
- `getReconcileData`/`reconcile`/`markReady`/`writebackToPoscake`/`claimDraft`/`releaseDraft`/`reopenOrder` behind `requireRole_` (cs or admin). `reopenOrder` on a `batched` order requires `admin`.
- Photo reads reuse `imageProxy` allow-list (no arbitrary Drive enumeration).
- Sanitize note server-side via `safeNote_` before persisting (no raw note into filenames) and before any writeback to Poscake.
- Size/chain + local-override free-text sanitized before reaching the writeback note + supplier PDF (P4).
- api_key for the `PUT …/orders/{id}` writeback only from `scriptProp`; never sent to browser.
- COD/customer data is sensitive — pulled order data stays in role-gated payloads only; never in non-gated output.

## Next Steps
P4 reads PhotoMap rows (or finalized Orders columns) for ready orders to build the renamed Drive folder + PDF, then writes back the production tag "Đang sản xuất" at batch send (call `writebackToPoscake_(orderId, {tag:true})` — already implemented + idempotent). The pre-batch cancellation re-check reuses the verified orders-READ endpoint to confirm each Ready order's live status before generating a package. Add time-driven tag-retry only if manual proves stable.

## Unresolved questions
1. **Live single-order GET shape** — confirm `GET /shops/2798984/orders/{id}` returns `{data:{…}}` (object) vs `{data:[{…}]}` (array). Drives whether the note writeback fires or safe-skips. Hardened either way (skip + distinct `writeback_state.reason`), but the feature only works once the real shape is confirmed in `writebackToPoscake_`.
