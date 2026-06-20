/**
 * Crush Room Fulfillment Platform — GAS backend (Phase 1)
 *
 * SEPARATE standalone/container-bound Apps Script project from the customer-upload
 * backend (google-apps-script-complete.js). Keeps CS-ops endpoints isolated so a
 * deploy here can never break customer photo ingestion.
 *
 * Direction: POSCAKE IS THE ORDER ORIGIN. This tool PULLS orders from Poscake
 * (read) and reconciles photos to them. It NEVER creates orders. Writeback
 * (tag/note) onto an existing order is added in Phase 3/4.
 *
 * Phase 1 scope: datastore bootstrap + auth/roles + syncOrders (read) + listOrders + whoami.
 *
 * CONFIG — set in Apps Script → Project Settings → Script Properties (NOT in code):
 *   PANCAKE_API_KEY   — Poscake api_key (secret)
 *   SHOP_ID           — 2798984 (auto-seeded by intialSetup)
 *   SYNC_STATUSES     — comma list of Poscake status codes to pull (default "0,11" = new, waitting)
 *   key               — this spreadsheet id (auto-set by intialSetup)
 */

const scriptProp = PropertiesService.getScriptProperties();
const PANCAKE_BASE = 'https://pos.pages.fm/api/v1';
const PRODUCTION_TAG_ID = 36; // "Đang sản xuất" — orders already tagged are skipped by sync
// Poscake status codes: 0=new · 1=submitted · 3=delivered · 6=canceled · 8=packing · 9=pending · 11=waitting.
// Sync pulls ONLY the statuses in SYNC_STATUSES (default new+waitting) — the orders that need photo prep.

// ---- Sheet schemas (headers locked now so P2/P3/P4 don't migrate) ----
const ORDERS_HEADER = ['poscake_order_id', 'line_index', 'fulfill_status', 'order_status',
  'order_status_name', 'phone', 'last4', 'customer_name', 'shipping_address', 'sku',
  'product_name', 'qty', 'cod', 'total_price', 'tags', 'tag_ids', 'note_print', 'note',
  'note_image', 'note_size', 'note_chain', 'claimed_by', 'claimed_at', 'local_overrides_json',
  'upload_group_id', 'synced_at', 'updated_at'];
const UPLOADGROUPS_HEADER = ['req_id', 'phone', 'last4', 'status', 'labels_json', 'photos_json',
  'internal_note', 'created_at', 'bound_order_id']; // written by P2
const PHOTOMAP_HEADER = ['poscake_order_id', 'line_index', 'slot', 'photo_file_id', 'photo_url',
  'sku', 'note_print', 'size', 'chain', 'qty', 'last4', 'updated_at']; // written by P3
const BATCHES_HEADER = ['batch_id', 'created_at', 'created_by', 'order_keys_json', 'folder_url',
  'pdf_url', 'status']; // written by P4
const USERS_HEADER = ['email', 'role', 'token', 'name', 'active']; // role = cs | admin

// ============================================================================
// SETUP — run ONCE from the editor (Extensions → Apps Script on the new Sheet)
// ============================================================================
function intialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  scriptProp.setProperty('key', ss.getId());
  if (!scriptProp.getProperty('SHOP_ID')) scriptProp.setProperty('SHOP_ID', '2798984');
  if (!scriptProp.getProperty('SYNC_STATUSES')) scriptProp.setProperty('SYNC_STATUSES', '0,11'); // new, waitting
  ensureSheet_(ss, 'Orders', ORDERS_HEADER);
  ensureSheet_(ss, 'UploadGroups', UPLOADGROUPS_HEADER);
  ensureSheet_(ss, 'PhotoMap', PHOTOMAP_HEADER);
  ensureSheet_(ss, 'Batches', BATCHES_HEADER);
  ensureSheet_(ss, 'Users', USERS_HEADER);
  Logger.log('Setup done. Now: add PANCAKE_API_KEY in Script Properties, seed the Users sheet, then run testSync().');
}

function ensureSheet_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, header.length).setValues([header]);
  return sh;
}

// Quick editor smoke test (no web request) — verifies api_key + sync works.
function testSync() { Logger.log(JSON.stringify(syncOrders_(null, 'admin'))); }

// Wipe all Orders data rows (keep header). Run ONCE to clear a stale all-status sync,
// then run testSync() to repopulate with only new+waitting. (Sync also auto-prunes ongoing.)
function resetOrders() {
  const sheet = ss_().getSheetByName('Orders');
  const last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
  Logger.log('Orders cleared (header kept). Now run testSync().');
}

// ============================================================================
// HELPERS
// ============================================================================
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Formula-injection guard for any external text written into a cell.
function csvSafe_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

// Canonical VN phone (MUST match google-apps-script-complete.js so photos link by phone).
function normalizeVNPhone_(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 11 && digits.length <= 12 && digits.indexOf('84') === 0) digits = digits.slice(2);
  if (digits.length === 9 && /^[3-9]/.test(digits)) digits = '0' + digits;
  return digits;
}

function maskPhone_(p) {
  p = String(p || '');
  return p.length >= 4 ? p.slice(0, 4).replace(/./g, '0').slice(0, p.length - 4) + '••' + p.slice(-3) : p;
}

function ss_() { return SpreadsheetApp.openById(scriptProp.getProperty('key')); }
function idxOf_(header) { const m = {}; header.forEach((h, i) => m[h] = i); return m; }

// ---- Poscake API (read) ----
function pancakeGet_(path, params) {
  const key = scriptProp.getProperty('PANCAKE_API_KEY');
  const shop = scriptProp.getProperty('SHOP_ID');
  if (!key || !shop) throw new Error('Missing PANCAKE_API_KEY / SHOP_ID in Script Properties');
  let url = PANCAKE_BASE + '/shops/' + shop + path + '?api_key=' + encodeURIComponent(key);
  for (const k in params) url += '&' + k + '=' + encodeURIComponent(params[k]);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Poscake ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  return JSON.parse(resp.getContentText());
}

// ============================================================================
// AUTH — Google identity OR token, matched against the Users sheet.
// ============================================================================
function getIdentity_(e) {
  const users = ss_().getSheetByName('Users');
  const data = users.getDataRange().getValues();
  const idx = idxOf_(data[0]);
  const token = e && e.parameter && e.parameter.token;
  let email = '';
  try { email = (Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (err) { email = ''; }
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const active = String(row[idx.active]).toLowerCase();
    if (active === 'false' || active === '0' || active === 'no') continue;
    if (token && row[idx.token] && String(row[idx.token]) === String(token)) {
      return { email: row[idx.email], role: row[idx.role], name: row[idx.name] };
    }
    if (email && String(row[idx.email]).toLowerCase() === email) {
      return { email: row[idx.email], role: row[idx.role], name: row[idx.name] };
    }
  }
  return null;
}

// Throws '403' if caller is not allow-listed / lacks the role. Call FIRST in every endpoint.
// editorRole is passed ONLY as a JS arg by editor-run functions (testSync); doGet never forwards
// it, so an HTTP request (?_role=admin lands in e.parameter, never here) can't reach this bypass.
function requireRole_(e, roles, editorRole) {
  if (editorRole) return { email: 'editor', role: editorRole, name: 'editor' };
  const u = getIdentity_(e);
  if (!u) throw new Error('403: not authorized — add your email/token to the Users sheet');
  if (roles && roles.indexOf(u.role) === -1) throw new Error('403: forbidden for role ' + u.role);
  return u;
}

// ============================================================================
// ENDPOINTS
// ============================================================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'whoami') return whoami(e);
    if (action === 'syncOrders') return jsonOut(syncOrders_(e));
    if (action === 'listOrders') return jsonOut(listOrders_(e));
    return jsonOut({ success: false, error: 'Invalid action' });
  } catch (err) {
    return jsonOut({ success: false, error: String(err.message || err) });
  }
}

function whoami(e) {
  try {
    const u = requireRole_(e, null);
    return jsonOut({ success: true, email: u.email, role: u.role, name: u.name });
  } catch (err) {
    return jsonOut({ success: false, error: String(err.message || err) });
  }
}

// Pull recent Poscake orders → upsert Orders mirror (idempotent, preserves CS fields). Admin/CS.
function syncOrders_(e, editorRole) {
  requireRole_(e, ['admin', 'cs'], editorRole);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'sync busy, retry' };
  try {
    const statuses = (scriptProp.getProperty('SYNC_STATUSES') || '0,11').split(',').map(function (s) { return s.trim(); }).filter(String);
    const sheet = ss_().getSheetByName('Orders');
    const data = sheet.getDataRange().getValues();
    const idx = idxOf_(data[0]);
    const rowByKey = {};
    for (let r = 1; r < data.length; r++) rowByKey[String(data[r][idx.poscake_order_id]) + '#' + String(data[r][idx.line_index])] = r + 1;

    const stats = { fetched: 0, new: 0, updated: 0, skippedTag36: 0 };
    const appends = [];
    const seenThisRun = {}; // key -> appends index; blocks within-run double-append on page overlap
    const seenKeys = {};    // every key seen this run → unseen + still-'synced' rows get pruned below
    let partial = false, truncated = false;

    function upsertLine_(o, item, li) {
      stats.fetched++;
      const row = buildOrderRow_(o, item, li);
      const key = String(o.id) + '#' + String(li);
      seenKeys[key] = true;
      const rowArr = ORDERS_HEADER.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
      if (rowByKey[key]) {
        updateOrderRow_(sheet, rowByKey[key], row, idx);
        stats.updated++;
      } else if (seenThisRun[key] !== undefined) {
        appends[seenThisRun[key]] = rowArr; // same line on two pages → keep latest, never duplicate
      } else {
        seenThisRun[key] = appends.length;
        appends.push(rowArr);
        stats.new++;
      }
    }

    function ingestOrder(o) {
      const tagIds = (o.tags || []).map(function (t) { return t.id; });
      if (tagIds.indexOf(PRODUCTION_TAG_ID) !== -1) { stats.skippedTag36++; return; }
      const items = o.items || [];
      if (items.length === 0) {
        upsertLine_(o, null, 0); // no products yet (e.g. 'new' draft) — still show the order as one placeholder line
      } else {
        items.forEach(function (item, li) { upsertLine_(o, item, li); });
      }
    }

    try {
      // One server-side status-filtered pass per status (default new=0, waitting=11). Small all-time sets.
      statuses.forEach(function (st) {
        let page = 1, totalPages = 1;
        do {
          const res = pancakeGet_('/orders', { page_size: 100, page_number: page, status: st });
          totalPages = res.total_pages || 1;
          (res.data || []).forEach(ingestOrder);
          page++;
        } while (page <= totalPages && page <= 30); // per-status page cap (exec-time backstop)
        if (page > 30 && page <= totalPages) truncated = true;
      });
    } catch (err) {
      partial = true; stats.error = String(err.message || err); // surface; still flush below for consistency
    }
    // Flush staged new rows even on partial failure (updates already wrote in-loop — keep them consistent).
    if (appends.length) sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, ORDERS_HEADER.length).setValues(appends);

    // Self-clean: drop rows that are no longer in the synced statuses AND untouched by CS
    // (fulfill_status still 'synced'). CS-in-progress rows (reconciling/ready/batched) are kept.
    // Skip on a partial sync so a failed page-fetch never deletes orders it just didn't see.
    stats.pruned = 0;
    if (!partial) {
      const toDelete = [];
      for (let r = 1; r < data.length; r++) {
        const k = String(data[r][idx.poscake_order_id]) + '#' + String(data[r][idx.line_index]);
        const fstat = data[r][idx.fulfill_status];
        if (!seenKeys[k] && (fstat === 'synced' || fstat === '')) toDelete.push(r + 1);
      }
      toDelete.sort(function (a, b) { return b - a; }).forEach(function (rowNum) { sheet.deleteRow(rowNum); }); // bottom-up keeps row numbers valid
      stats.pruned = toDelete.length;
    }
    return { success: !partial, partial: partial, truncated: truncated, statuses: statuses, stats: stats };
  } finally {
    lock.releaseLock();
  }
}

function buildOrderRow_(o, item, li) {
  const vi = (item && item.variation_info) || {};
  const sa = o.shipping_address || {};
  const phone = normalizeVNPhone_(o.bill_phone_number || sa.phone_number || '');
  const tags = o.tags || [];
  const now = new Date();
  return {
    poscake_order_id: o.id,
    line_index: li,
    fulfill_status: 'synced',
    order_status: o.status,
    order_status_name: o.status_name || '',
    phone: phone,
    last4: phone ? phone.slice(-4) : '',
    customer_name: csvSafe_(o.bill_full_name || sa.full_name || ''),
    shipping_address: csvSafe_(sa.full_address || sa.address || ''),
    sku: csvSafe_(vi.display_id || ''),
    product_name: csvSafe_(vi.name || ''),
    qty: (item && item.quantity) || '', // item is null for product-less orders (placeholder line)
    cod: o.cod || 0,
    total_price: o.total_price || 0,
    tags: tags.map(function (t) { return t.name; }).join(', '),
    tag_ids: tags.map(function (t) { return t.id; }).join(','),
    note_print: csvSafe_(o.note_print || ''),
    note: csvSafe_(o.note || ''),
    note_image: o.note_image || '',
    note_size: '',
    note_chain: '',
    claimed_by: '',
    claimed_at: '',
    local_overrides_json: '',
    upload_group_id: '',
    synced_at: now,
    updated_at: now
  };
}

// Refresh Poscake-owned fields; PRESERVE CS-set fields once CS has started (fulfill_status != 'synced').
function updateOrderRow_(sheet, rowNum, newRow, idx) {
  const existing = sheet.getRange(rowNum, 1, 1, ORDERS_HEADER.length).getValues()[0];
  const csStarted = existing[idx.fulfill_status] && existing[idx.fulfill_status] !== 'synced';
  const preserve = { fulfill_status: 1, note_size: 1, note_chain: 1, claimed_by: 1, claimed_at: 1, local_overrides_json: 1, upload_group_id: 1, synced_at: 1 };
  if (csStarted) preserve.note_print = 1; // CS may have edited the print note
  const out = existing.slice();
  ORDERS_HEADER.forEach(function (h) {
    if (preserve[h]) return;            // keep existing (CS-owned or original synced_at)
    out[idx[h]] = newRow[h];            // refresh Poscake-owned + updated_at
  });
  sheet.getRange(rowNum, 1, 1, out.length).setValues([out]);
}

// Role-gated order list for the dashboard. COD/shipping excluded (sensitive — detail view in P3).
function listOrders_(e) {
  requireRole_(e, ['admin', 'cs']);
  const sheet = ss_().getSheetByName('Orders');
  const data = sheet.getDataRange().getValues();
  const idx = idxOf_(data[0]);
  const statusFilter = e.parameter.status;   // fulfill_status
  const limit = Math.min(parseInt(e.parameter.limit || '500', 10) || 500, 2000);
  const offset = parseInt(e.parameter.offset || '0', 10) || 0;
  const all = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (statusFilter && row[idx.fulfill_status] !== statusFilter) continue;
    all.push({
      order_id: row[idx.poscake_order_id],
      line_index: row[idx.line_index],
      fulfill_status: row[idx.fulfill_status],
      order_status: row[idx.order_status],
      order_status_name: row[idx.order_status_name],
      phone_masked: maskPhone_(row[idx.phone]),
      last4: row[idx.last4],
      customer_name: row[idx.customer_name],
      sku: row[idx.sku],
      product_name: row[idx.product_name],
      qty: row[idx.qty],
      tags: row[idx.tags],
      claimed_by: row[idx.claimed_by],
      note_size: row[idx.note_size],
      note_chain: row[idx.note_chain]
    });
  }
  const pageRows = all.slice(offset, offset + limit); // cap payload (spec: paginate large lists)
  return { success: true, count: all.length, returned: pageRows.length, offset: offset, orders: pageRows };
}
