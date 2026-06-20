# Phase 1 — Datastore + Orders-Mirror Sync (Read) + Auth/Roles

## Context Links
- **P0 verified report (confirmed endpoints + field map) — required input:** `plans/reports/from-api-spike-to-planner-260617-1634-poscake-p0-verified-report.md`
- `google-apps-script-complete.js` — extend: router (`doGet` line 27), `jsonOut` (54), `LockService` (`doPost` 432), `scriptProp`, `normalizeVNPhone_` (411)
- `assets/admin.js` — frontend fetch pattern (`fetch(SCRIPT_URL + '?action=...')`)

## Confirmed Poscake API (from P0 — use these exact paths)
- **List:** `GET /shops/2798984/orders?api_key=&page_size=&page_number=&startDateTime=&endDateTime=&updateStatus=&tag_ids=[..]`. "Without prod tag" sync = recent date window + client-side exclude tag **36**.
- **Field map (per line item):** sku/variant = `items[].variation_info.display_id`; product name = `items[].variation_info.name`; qty = `items[].quantity`; product base = `items[].variation_info.product_display_id`. Order: phone = `bill_phone_number`; name = `bill_full_name`; shipping = `shipping_address.{full_name,phone_number,address,full_address,province_name,district_name,commune_name}`; `cod`/`total_price`/`money_to_collect`; `status`(int)+`status_name`; `tags:[{id,name}]`; note fields `note_print`/`note`/`note_image`.

## Overview
- **Priority**: P1. **Status**: pending. **Depends**: P0.
- Build the datastore + `syncOrders` (Poscake→Orders **pulled-order mirror** upsert, READ API) + auth/roles gate. Ship a thin `fulfillment.html` shell that authenticates and lists synced orders. This is the spine; labeled upload + UploadGroup staging (P2), CS reconcile + writeback (P3) and package gen (P4) sit on it.
- NOTE: **Poscake is the order origin.** `syncOrders` PULLS orders that CS created in Poscake (read) — this IS the source that triggers reconciliation. The pulled order carries line items + customer + shipping; the dashboard never builds an order. There is no products sync — line items come WITH the order.

## Key Insights
- REUSE not rebuild: `jsonOut`, `LockService.getScriptLock().tryLock(10000)`, `scriptProp` for config, `normalizeVNPhone_` to key Poscake `bill_phone` → same normalized phone as customer photos. This makes photo-by-phone linking (P3 phone-pool override) free.
- Upsert keyed by `poscake_order_id` + `line_index` (from P0 schema) → re-sync is idempotent; never duplicates. On insert set `fulfill_status=synced`; preserve CS-set fields (`fulfill_status` if past `synced`, `claimed_by`, `note_size`/`note_chain`, `local_overrides_json`) on update.
- **No `syncProducts`, no Products cache, no catalog picker** — line items (sku, variant, price) come straight from the pulled order JSON (P0 paths). This was a P0 blocker in the old plan; now dropped entirely.
- Two-sided waiting: an Orders row may be pulled BEFORE its photos exist. On insert, try to bind a matching UploadGroup by phone (`order_synced` state on the group); if none yet, the order sits at `synced` awaiting photos. The P2 upload may also land before the order — reconcile (P3) fires when both present.
- Auth: per P0 decision. Google-identity path uses `Session.getActiveUser().getEmail()` (only works if web app deployed "Execute as user accessing" + same Google domain). Token path passes `?token=` from frontend, matched vs Users sheet. `whoami` returns `{email, role}`.
- DECISION: recommend a SEPARATE new GAS project for the platform (keeps customer-upload `doPost` isolated from CS-ops endpoints; avoids one deploy breaking photo ingestion). It reads the SAME spreadsheet (so `searchByPhone` over "form data" still works). Confirm in P0.

## Requirements
**Functional**
- `syncOrders`: page Poscake orders via `page_size`/`page_number` over a recent `startDateTime`/`endDateTime` window (client-side exclude tag 36 for "without prod tag"), upsert into Orders (pulled mirror) by `poscake_order_id`+`line_index`. New rows → `fulfill_status=synced`, map line items from `items[].variation_info.display_id`/`.name`/`.quantity` + customer `bill_full_name`/`bill_phone_number` + `shipping_address.{...}` + `cod`/`total_price` + `status`(int)/`status_name` + `tags`, `normalizeVNPhone_(bill_phone_number)` → last4, try-bind a matching UploadGroup by phone. Update rows → refresh Poscake-owned fields (status, tags), PRESERVE CS-set fields (`fulfill_status`≥reconciling, `claimed_by`/`claimed_at`, `note_size`/`note_chain`, `local_overrides_json`, `note_print` once CS-edited). Store `status` so P3/P4 can apply the **status < 2 writeback guard**.
- `listOrders`: filter by `fulfill_status` / date / tag for the dashboard; returns JSON. Role-gated.
- `whoami`: resolve caller → `{email|token, role}`; 403 if not in Users allowlist.
- Auth gate: CS sees CS views; admin sees admin actions. Enforced SERVER-side (every endpoint checks role), not just UI.
- `fulfillment.html`: login/identity → call `listOrders` → render order table (Vietnamese UI).

**Non-functional**
- Sync within GAS 6-min exec limit; bounded UrlFetchApp calls/day.
- Concurrency-safe upsert (LockService around sheet write).

## Architecture (data flow)
```
[Manual button or trigger] → syncOrders
  → UrlFetchApp GET /shops/2798984/orders?api_key&page_size=N&page_number=&startDateTime=&endDateTime= (paginate; exclude tag 36 client-side)
  → for each order/line: build row from confirmed paths (items[].variation_info.display_id/.name/.quantity, bill_*, shipping_address.*, cod, status, tags)
                         → normalizeVNPhone_(bill_phone) → last4 → try-bind matching UploadGroup by phone
  → LOCK → upsert Orders by (order_id,line_index):
             new → append(fulfill_status=synced, Poscake fields + customer/line items)
             exists → refresh Poscake-owned fields, PRESERVE CS-set fields (fulfill_status, claim, note_size/chain, overrides, note_print)
           → UNLOCK

fulfillment.html → whoami (auth) → listOrders(filter) → table
```
Trigger: start MANUAL ("Đồng bộ"); add a time-driven trigger only after manual proven.

## Related Code Files
**Create**: new GAS file `google-apps-script-fulfillment.js` (separate project) — `doGet`/`doPost` router, `syncOrders`, `listOrders`, `whoami`, helpers. `fulfillment.html` + `assets/fulfillment.{js,css}` (Vercel static, mirrors admin.html pattern).
**Read/reuse (copy helpers)**: `normalizeVNPhone_`, `jsonOut`, `scriptProp` pattern, `searchByPhone` (for later), LockService usage from `google-apps-script-complete.js`.
**Modify**: `index.html` — add "Fulfillment" card (later, P4). `vercel.json` if routing needed.

## Implementation Steps
1. Create new GAS project; `intialSetup`-style fn stores spreadsheet id + `PANCAKE_API_KEY` + `SHOP_ID` in `scriptProp`.
2. Create Orders + UploadGroups + PhotoMap + Batches + Users sheets (headers from P0). Seed Users with real staff emails→roles. (UploadGroups written by P2; PhotoMap + CS fields written by P3 — create the tabs now so schemas are locked.) **No Products sheet.**
3. Implement `requireRole_(e, roles[])` helper: resolve identity (Google or token per P0), lookup Users, return role or throw 403. Call at top of every endpoint.
4. Implement `syncOrders`: paginate, map fields (P0 paths), `normalizeVNPhone_`, try-bind UploadGroup, LOCK→upsert (preserve CS fields)→UNLOCK. Return `{synced, new, updated}`.
5. Implement `listOrders(filter)`: read Orders, filter, return JSON (cap rows; paginate if large). Role-gated; never leak COD to non-gated callers.
6. Implement `whoami`.
7. Build `fulfillment.html` shell: identity check → "Đồng bộ" button (admin) → order table from `listOrders`. Vietnamese.
8. Deploy GAS web app; wire `SCRIPT_URL` into `assets/fulfillment.js`. Manual end-to-end sync test.

## Todo List
- [ ] New GAS project + config props (spreadsheet id, api_key, shop_id)
- [ ] Orders + UploadGroups + PhotoMap + Batches + Users sheets created + seeded (NO Products)
- [ ] `requireRole_` auth helper (server-side gate)
- [ ] `syncOrders` upsert (LockService, idempotent, preserve CS fields, try-bind UploadGroup by phone)
- [ ] `listOrders` filter endpoint (role-gated)
- [ ] `whoami`
- [ ] `fulfillment.html` + assets shell (auth + order table + sync button)
- [ ] Deploy + manual sync test (idempotency verified by double-sync)

## Success Criteria
- Run `syncOrders` twice → second run adds 0 duplicate rows, preserves `fulfill_status` + any CS-set fields.
- Pulled orders show real line items (sku/variant/price) + customer/shipping/COD from the order JSON — no catalog lookup needed.
- Non-allowlisted user → 403 from every endpoint.
- CS user loads `fulfillment.html` → sees real synced orders in Vietnamese table.
- Poscake `bill_phone` normalized matches the phone used in "form data" (spot-check 1 order has its photos findable via `searchByPhone`).

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Sync exceeds 6-min exec | M×H | Paginate via `page_size`/`page_number`; cap orders/run; checkpoint last page in `scriptProp`; resume next trigger; sync recent/open only via the date window |
| Re-sync clobbers CS-set fields (note_size/chain, overrides, claim) | M×H | Upsert preserves CS fields on update; only Poscake-owned fields (status, tags) refresh |
| UrlFetchApp daily quota | L×H | Manual sync first; conservative trigger interval; sync only the recent date window (`startDateTime`/`endDateTime`), not all 33k orders |
| Google-identity auth fails (cross-domain / "execute as me") | M×H | P0 picks token fallback if staff lack Google domain accounts |
| Upsert race (two syncs) | L×M | LockService; also guard with a "sync running" flag in scriptProp |
| Phone normalize mismatch vs photos | M×M | Reuse exact `normalizeVNPhone_`; spot-check in success criteria |

## Security Considerations
- EVERY endpoint calls `requireRole_` first — never trust frontend role.
- api_key only in `scriptProp`; never sent to browser, never in `listOrders` output.
- Token (if used) is per-user secret; transmit over HTTPS only; treat Users sheet as sensitive.
- COD/customer data is sensitive — keep out of any non-role-gated output.
- Separate GAS project isolates CS-ops from customer `doPost` (one bad deploy ≠ broken photo ingestion).

## Next Steps
P2 (labeled upload) stages photos into UploadGroups by phone. P3 (CS reconcile) joins a pulled Orders row to its UploadGroup photos, binds PhotoMap + note/size/chain, then writes back tag+note+link to the existing Poscake order. P4 reads PhotoMap for ready orders + writes Batches. Add a time-driven sync trigger only after manual sync stable.
