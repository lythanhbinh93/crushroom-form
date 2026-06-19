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
 *   SYNC_WINDOW_DAYS  — 14 (auto-seeded)
 *   key               — this spreadsheet id (auto-set by intialSetup)
 */

const scriptProp = PropertiesService.getScriptProperties();
const PANCAKE_BASE = 'https://pos.pages.fm/api/v1';
const PRODUCTION_TAG_ID = 36; // "Đang sản xuất" — orders already tagged are skipped by sync

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
  if (!scriptProp.getProperty('SYNC_WINDOW_DAYS')) scriptProp.setProperty('SYNC_WINDOW_DAYS', '14');
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
    const days = parseInt(scriptProp.getProperty('SYNC_WINDOW_DAYS') || '14', 10);
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    const sheet = ss_().getSheetByName('Orders');
    const data = sheet.getDataRange().getValues();
    const idx = idxOf_(data[0]);
    const rowByKey = {};
    for (let r = 1; r < data.length; r++) rowByKey[String(data[r][idx.poscake_order_id]) + '#' + String(data[r][idx.line_index])] = r + 1;

    const stats = { fetched: 0, new: 0, updated: 0, skippedTag36: 0 };
    const appends = [];
    const seenThisRun = {}; // key -> appends index; blocks within-run double-append on page overlap
    let page = 1, totalPages = 1, partial = false, truncated = false;
    try {
      do {
        const res = pancakeGet_('/orders', { page_size: 100, page_number: page, startDateTime: start, endDateTime: end });
        totalPages = res.total_pages || 1;
        (res.data || []).forEach(function (o) {
          const tagIds = (o.tags || []).map(function (t) { return t.id; });
          if (tagIds.indexOf(PRODUCTION_TAG_ID) !== -1) { stats.skippedTag36++; return; }
          (o.items || []).forEach(function (item, li) {
            stats.fetched++;
            const row = buildOrderRow_(o, item, li);
            const key = String(o.id) + '#' + String(li);
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
          });
        });
        page++;
      } while (page <= totalPages && page <= 60); // page cap = exec-time backstop
      if (page > 60 && page <= totalPages) truncated = true; // window exceeded the cap — tail not pulled
    } catch (err) {
      partial = true; stats.error = String(err.message || err); // surface; still flush below for consistency
    }
    // Flush staged new rows even on partial failure (updates already wrote in-loop — keep them consistent).
    if (appends.length) sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, ORDERS_HEADER.length).setValues(appends);
    return { success: !partial, partial: partial, truncated: truncated, window_days: days, stats: stats };
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
    qty: item.quantity || '',
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
