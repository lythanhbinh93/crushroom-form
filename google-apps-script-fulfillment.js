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

// ---- Labeled-upload staging (Phase 2) ----
const UPLOAD_STATUS_AWAITING = 'awaiting_upload'; // link minted, no photos yet (= P4 "Chờ upload" chase list)
const UPLOAD_STATUS_UPLOADED = 'uploaded';        // customer submitted photos into the labeled boxes
// Extra Script Properties used by Phase 2 (set in Project Settings → Script Properties):
//   UPLOAD_FOLDER_ID    — Drive folder for customer photos (auto-seeded to the CouplePix folder)
//   FORM_DATA_SHEET_ID  — spreadsheet id of the customer-upload backend ("form data" sheet).
//                         OPTIONAL: when set, saveUpload mirrors each upload there so the existing
//                         phone-pool (searchByPhone) + admin view keep finding labeled photos.

// ---- Sheet schemas (headers locked now so P2/P3/P4 don't migrate) ----
const ORDERS_HEADER = ['poscake_order_id', 'line_index', 'fulfill_status', 'order_status',
  'order_status_name', 'phone', 'last4', 'customer_name', 'shipping_address', 'sku',
  'product_name', 'qty', 'cod', 'total_price', 'tags', 'tag_ids', 'note_print', 'note',
  'note_image', 'note_size', 'note_chain', 'claimed_by', 'claimed_at', 'local_overrides_json',
  'upload_group_id', 'synced_at', 'updated_at', 'writeback_state', 'reconciled_at']; // last 2 added in P3
// note_print = CS descriptive print note (yy source + Poscake writeback target). writeback_state =
// JSON {status,note,tag,skipped} from the last Poscake PUT. reconciled_at set at Mark-Ready.
const UPLOADGROUPS_HEADER = ['req_id', 'phone', 'last4', 'status', 'labels_json', 'photos_json',
  'internal_note', 'created_by', 'created_at', 'updated_at', 'bound_order_id']; // written by P2
// labels_json = [{label,count}] seeded at link creation (immutable). photos_json = [{label,box_index,
// photo_file_id,photo_url,filename}] filled at customer upload. bound_order_id set by P3 reconcile.
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
  // Drive folder for labeled-upload photos (same folder the CouplePix backend uses; change if desired).
  if (!scriptProp.getProperty('UPLOAD_FOLDER_ID')) scriptProp.setProperty('UPLOAD_FOLDER_ID', '1JB9vANvnKu52WQX4Mg1fYqF6i-Jthhs7');
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
  // Write/refresh the header whenever there are no DATA rows yet (row 1 is always the header).
  // Safe to overwrite then — nothing to misalign — and it upgrades a sheet created by an earlier
  // header version (e.g. UploadGroups gained created_by/updated_at in P2). Sheets WITH data (Orders
  // after a sync) have getLastRow()>1 → header preserved.
  if (sh.getLastRow() <= 1) sh.getRange(1, 1, 1, header.length).setValues([header]);
  return sh;
}

// Append any header columns missing from a sheet that ALREADY has data (so we can't rewrite the
// whole header). New columns land at the end → existing rows read '' for them, positions stay valid.
// Used to migrate the Orders sheet to the P3 columns (writeback_state, reconciled_at).
function ensureColumns_(sheet, header) {
  const lastCol = sheet.getLastColumn();
  const live = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = header.filter(function (h) { return live.indexOf(h) === -1; });
  if (!missing.length) return;
  missing.forEach(function (h, i) { sheet.getRange(1, lastCol + 1 + i).setValue(h); });
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
    if (action === 'createUploadLink') return jsonOut(createUploadLink_(e)); // CS/admin (token-gated)
    if (action === 'getUploadLabels') return jsonOut(getUploadLabels_(e));   // public (customer form)
    if (action === 'getReconcileData') return jsonOut(getReconcileData_(e)); // CS/admin
    if (action === 'claimDraft') return jsonOut(claimDraft_(e));             // CS/admin
    if (action === 'releaseDraft') return jsonOut(releaseDraft_(e));         // CS/admin
    if (action === 'markReady') return jsonOut(markReady_(e));               // CS/admin (triggers writeback)
    if (action === 'reopenOrder') return jsonOut(reopenOrder_(e));           // CS/admin (admin if batched)
    return jsonOut({ success: false, error: 'Invalid action' });
  } catch (err) {
    return jsonOut({ success: false, error: String(err.message || err) });
  }
}

// Customer photo submit (public, like the CouplePix doPost). POST keeps base64 images out of the URL.
function doPost(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'saveUpload') return jsonOut(saveUpload_(e));
    if (action === 'saveReconcile') return jsonOut(saveReconcile_(e)); // CS/admin — carries a JSON payload
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
    ensureColumns_(sheet, ORDERS_HEADER); // lazily add P3 columns to a pre-P3 Orders sheet
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
  const preserve = { fulfill_status: 1, note_size: 1, note_chain: 1, claimed_by: 1, claimed_at: 1, local_overrides_json: 1, upload_group_id: 1, synced_at: 1, writeback_state: 1, reconciled_at: 1 };
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

// ============================================================================
// PHASE 2 — Labeled upload link + photo staging (UploadGroups)
// Flow: CS createUploadLink (labels + internal_note) → req_id + awaiting_upload row
//       → customer opens ?req= → getUploadLabels → labeled boxes → saveUpload
//       → photos to Drive + UploadGroup flips uploaded + best-effort form-data mirror.
// No order is created here; P3 reconciles the staged photos to the pulled Poscake order.
// ============================================================================

// Random, hard-to-guess staging key. Low-volume → 15 hex chars is ample.
function mintReqId_() { return 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 15); }

// Locate an UploadGroups row by req_id. Returns {sheet,rowNum,row,idx} or null.
function findUploadGroup_(reqId) {
  const sheet = ss_().getSheetByName('UploadGroups');
  const data = sheet.getDataRange().getValues();
  const idx = idxOf_(data[0]);
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx.req_id]) === String(reqId)) {
      return { sheet: sheet, rowNum: r + 1, row: data[r], idx: idx };
    }
  }
  return null;
}

// CS/admin: mint a labeled upload link. labels = JSON [{label,count}]; internal_note + phone optional.
// Seeds an UploadGroups row at status=awaiting_upload (the source of the P4 "Chờ upload" chase list).
function createUploadLink_(e, editorRole) {
  const u = requireRole_(e, ['admin', 'cs'], editorRole);
  let labels;
  try { labels = JSON.parse(e.parameter.labels || '[]'); } catch (err) { return { success: false, error: 'labels phải là JSON' }; }
  if (!Array.isArray(labels) || !labels.length) return { success: false, error: 'cần ít nhất 1 nhãn' };

  // Labels live inside a JSON-array cell (whole value starts with "[") so no per-item formula-injection
  // guard is needed; JSON.stringify escapes any control chars. Just trim + cap length.
  // internal_note is its own cell → csvSafe_ it.
  const clean = [];
  let totalBoxes = 0;
  labels.forEach(function (l) {
    const label = String((l && l.label) || '').trim().slice(0, 80);
    let count = parseInt((l && l.count) || 1, 10);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 10) count = 10;
    if (label) { clean.push({ label: label, count: count }); totalBoxes += count; }
  });
  if (!clean.length) return { success: false, error: 'nhãn không hợp lệ' };
  if (totalBoxes > 50) return { success: false, error: 'quá nhiều ô ảnh (tối đa 50)' };

  const phoneNorm = normalizeVNPhone_(e.parameter.phone || '');
  const internalNote = csvSafe_(String(e.parameter.internal_note || '').slice(0, 500));
  const reqId = mintReqId_();
  const now = new Date();

  const row = {
    req_id: reqId, phone: phoneNorm, last4: phoneNorm ? phoneNorm.slice(-4) : '',
    status: UPLOAD_STATUS_AWAITING, labels_json: JSON.stringify(clean), photos_json: '[]',
    internal_note: internalNote, created_by: u.email || u.name || '', created_at: now, updated_at: now,
    bound_order_id: ''
  };
  const rowArr = UPLOADGROUPS_HEADER.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
  ss_().getSheetByName('UploadGroups').appendRow(rowArr); // appendRow is atomic across concurrent callers

  const linkPath = 'couplepix.html?req=' + encodeURIComponent(reqId) + (phoneNorm ? '&phone=' + phoneNorm : '');
  return { success: true, req_id: reqId, phone: phoneNorm, labels: clean, link_path: linkPath };
}

// Public: customer form reads the CS-defined label set. NEVER leaks internal_note (CS-only context).
function getUploadLabels_(e) {
  const reqId = String(e.parameter.req_id || '').trim();
  if (!reqId) return { success: false, error: 'thiếu req_id' };
  const found = findUploadGroup_(reqId);
  if (!found) return { success: false, error: 'không tìm thấy link (req không hợp lệ)' };
  const r = found.row, idx = found.idx;
  let labels = [];
  try { labels = JSON.parse(r[idx.labels_json] || '[]'); } catch (err) { labels = []; }
  return { success: true, req_id: reqId, labels: labels, phone: r[idx.phone] || '', status: r[idx.status] || '' };
}

// Public: customer submit. Upload photos to Drive, fill the UploadGroup (status awaiting_upload→uploaded),
// and best-effort mirror into the customer-upload "form data" sheet so the phone-pool fallback still works.
// POST params: req_id, Name(phone), ItemCount, ImgData_i, Label_i, BoxIndex_i, Filename_i.
function saveUpload_(e) {
  const reqId = String(e.parameter.req_id || '').trim();
  const phoneNorm = normalizeVNPhone_(e.parameter.Name || e.parameter.phone || '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: 'busy, please retry' };
  try {
    const folderId = scriptProp.getProperty('UPLOAD_FOLDER_ID');
    if (!folderId) return { success: false, error: 'server chưa cấu hình UPLOAD_FOLDER_ID' };
    const folder = DriveApp.getFolderById(folderId);

    const itemCount = Math.min(parseInt(e.parameter.ItemCount, 10) || 0, 60); // cap public payload (DoS guard)
    const photos = [];
    for (let i = 0; i < itemCount; i++) {
      const imgData = e.parameter['ImgData_' + i];
      if (!imgData) continue;
      if (imgData.length > 12000000) continue; // ~9 MB decoded; cropped output is tiny — this only blocks abuse
      const label = String(e.parameter['Label_' + i] || '').slice(0, 80);
      const boxIndex = String(e.parameter['BoxIndex_' + i] || i);
      const filename = String(e.parameter['Filename_' + i] || ((phoneNorm || 'image') + '_' + i)).slice(0, 120);
      const blob = Utilities.newBlob(Utilities.base64Decode(imgData), 'image/jpeg', filename + '.jpg');
      const file = folder.createFile(blob);
      photos.push({
        label: label, box_index: boxIndex,
        photo_file_id: file.getId(), photo_url: file.getUrl(), filename: filename + '.jpg'
      });
    }
    if (!photos.length) return { success: false, error: 'không có ảnh nào được tải lên' };

    // Phone-pool mirror (best-effort): keep searchByPhone + the existing admin view working for labeled
    // uploads too. Never let the mirror block the customer — the UploadGroup is the primary record.
    let formDataWritten = false;
    try { formDataWritten = appendFormDataMirror_(photos, phoneNorm); } catch (err) { /* swallow — photo is safe in Drive + UploadGroup */ }

    // Fill the UploadGroup row: photos + phone, flip awaiting_upload → uploaded.
    let groupUpdated = false;
    const found = findUploadGroup_(reqId);
    if (found) {
      const idx = found.idx, out = found.row.slice();
      out[idx.phone] = phoneNorm || out[idx.phone];
      out[idx.last4] = phoneNorm ? phoneNorm.slice(-4) : out[idx.last4];
      out[idx.photos_json] = JSON.stringify(photos);
      out[idx.status] = UPLOAD_STATUS_UPLOADED;
      if (idx.updated_at !== undefined) out[idx.updated_at] = new Date();
      found.sheet.getRange(found.rowNum, 1, 1, out.length).setValues([out]);
      groupUpdated = true;
    }
    // groupUpdated=false means an unknown/expired req — photos are still in Drive + (if configured) the
    // phone-pool, so P3 can reconcile by phone. Surface it without failing the upload.
    if (!groupUpdated) Logger.log('saveUpload: no UploadGroup for req_id=' + reqId + ' — photo staged in Drive/pool only (orphan)');
    return { success: true, req_id: reqId, photos: photos.length, group_updated: groupUpdated, form_data_written: formDataWritten };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

// Mirror a labeled upload into the customer-upload "form data" sheet (separate spreadsheet).
// Mirrors the row shape google-apps-script-complete.js#doPost writes — keep the two in sync.
// Returns false (skips) when FORM_DATA_SHEET_ID is not configured.
function appendFormDataMirror_(photos, phoneNorm) {
  const sheetId = scriptProp.getProperty('FORM_DATA_SHEET_ID');
  if (!sheetId) return false;
  const doc = SpreadsheetApp.openById(sheetId);
  const sheet = doc.getSheetByName('form data');
  if (!sheet) return false;
  ensureFormDataColumns_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const items = photos.map(function (p) {
    return { sku: '', name: p.label || '', slot: p.box_index, fileUrl: p.photo_url, fileId: p.photo_file_id, filename: p.filename };
  });
  const derivedRadio = items.length <= 1 ? 'one-image' : 'many-image';
  const rowArr = headers.map(function (h) {
    switch (h) {
      case 'Date': return new Date();
      case 'Name': return phoneNorm;
      case 'radio': return derivedRadio;
      case 'message': return '';
      case 'image-1': return items[0] ? items[0].fileUrl : '';
      case 'image-2': return items[1] ? items[1].fileUrl : '';
      case 'Filename1': return items[0] ? csvSafe_(items[0].filename.replace(/\.jpg$/i, '')) : '';
      case 'Filename2': return items[1] ? csvSafe_(items[1].filename.replace(/\.jpg$/i, '')) : '';
      case 'ImgData1': return '';
      case 'ImgData2': return '';
      case 'Items': return JSON.stringify(items); // server-built JSON — not customer text, no csvSafe_
      case 'SchemaVersion': return 2;
      default: return '';
    }
  });
  sheet.appendRow(rowArr);
  return true;
}

// Append Items / SchemaVersion columns if the form-data sheet predates v2 (mirrors complete.js).
function ensureFormDataColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const needed = ['Items', 'SchemaVersion'];
  const missing = needed.filter(function (h) { return headers.indexOf(h) === -1; });
  if (!missing.length) return;
  missing.forEach(function (h, i) { sheet.getRange(1, lastCol + 1 + i).setValue(h); });
}

// ============================================================================
// PHASE 3 — CS reconcile + writeback (line-items ↔ photos · annotate · writeback)
// Join a PULLED Orders row to its staged photos, fill note/size/chain, Mark Ready →
// write note_print + photo link onto the EXISTING Poscake order (status<2 guard). The
// tool NEVER creates an order. PhotoMap rows feed the P4 supplier package.
// ============================================================================

// ---- app.py filename port (parity with clean_sku / safe_note / expand_slots naming) ----
// clean_sku: COUPLEPIX-XXX → XXX (first token); else uppercase + drop spaces.
function cleanSku_(sku) {
  if (sku == null) return '';
  const up = String(sku).trim().toUpperCase();
  if (up.indexOf('COUPLEPIX-') !== -1) {
    const parts = up.split('COUPLEPIX-');
    if (parts.length > 1 && parts[1]) {
      const first = parts[1].trim().split(/\s+/)[0];
      if (first) return first;
    }
  }
  return up.replace(/ /g, ''); // Python str.replace(" ","") removes every space
}

// safe_note: trim → / \ : become - → strip chars outside [\w \s -.,] (Python \w is UNICODE, so
// \p{L}\p{N}_ is the parity-correct allow-set for VN/ASCII) → drop spaces → cap (default 35).
function safeNote_(note, maxLength) {
  if (note == null || note === '') return '';
  if (maxLength == null) maxLength = 35;
  let s = String(note).trim().replace(/\//g, '-').replace(/\\/g, '-').replace(/:/g, '-');
  s = s.replace(/[^\p{L}\p{N}_\s.,-]/gu, '');
  return s.replace(/ /g, '').slice(0, maxLength);
}

// expand_slots name: "_".join([f"{idx}.", last4, sku] (+ yy)) → "1._1234_DCM_yy".
function buildSlotName_(slotIdx, last4, skuClean, noteYY) {
  const parts = [slotIdx + '.', last4 || '0000', skuClean || ''];
  if (noteYY) parts.push(noteYY);
  return parts.join('_');
}

// ---- small shared helpers ----
function parseJsonArr_(s) { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function setCell_(sheet, rowNum, idx, field, value) { if (idx[field] !== undefined) sheet.getRange(rowNum, idx[field] + 1).setValue(value); }

const CLAIM_TTL_MS = 4 * 60 * 60 * 1000; // soft-claim auto-release window (4h idle)
function isClaimStale_(claimedAt) {
  if (!claimedAt) return true;
  const t = (claimedAt instanceof Date) ? claimedAt.getTime() : new Date(claimedAt).getTime();
  return isNaN(t) || (Date.now() - t) > CLAIM_TTL_MS;
}

// Load every Orders line for an order_id (+ ensure P3 columns). Returns {sheet,idx,rows:[{rowNum,row}]}.
function loadOrder_(orderId) {
  const sheet = ss_().getSheetByName('Orders');
  ensureColumns_(sheet, ORDERS_HEADER);
  const data = sheet.getDataRange().getValues();
  const idx = idxOf_(data[0]);
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx.poscake_order_id]) === String(orderId)) rows.push({ rowNum: r + 1, row: data[r] });
  }
  return { sheet: sheet, idx: idx, rows: rows };
}

function stampClaim_(sheet, rows, idx, who) {
  const now = new Date();
  rows.forEach(function (lr) {
    sheet.getRange(lr.rowNum, idx.claimed_by + 1).setValue(who);
    sheet.getRange(lr.rowNum, idx.claimed_at + 1).setValue(now);
  });
}

// Photos staged in the UploadGroup matched to this order (by req_id bind, else by phone).
// Returns {req_id, internal_note, labels, photos, status} or null.
function uploadGroupPhotos_(phoneNorm, reqId) {
  const sheet = ss_().getSheetByName('UploadGroups');
  const data = sheet.getDataRange().getValues();
  const idx = idxOf_(data[0]);
  let phoneHit = null;
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (reqId && String(row[idx.req_id]) === String(reqId)) {
      return pickUploadGroup_(row, idx);
    }
    if (phoneNorm && String(row[idx.phone]) === String(phoneNorm)) {
      // Prefer an uploaded group; remember the first match as a fallback.
      if (!phoneHit || row[idx.status] === UPLOAD_STATUS_UPLOADED) phoneHit = row;
    }
  }
  return phoneHit ? pickUploadGroup_(phoneHit, idx) : null;
}
function pickUploadGroup_(row, idx) {
  return {
    req_id: row[idx.req_id], internal_note: row[idx.internal_note] || '',
    labels: parseJsonArr_(row[idx.labels_json]), photos: parseJsonArr_(row[idx.photos_json]),
    status: row[idx.status]
  };
}

// Phone-pool fallback: photos from the customer-upload "form data" sheet (other spreadsheet).
// Mirrors searchByPhone's suffix match. Returns [] when FORM_DATA_SHEET_ID is unset.
function phonePoolPhotos_(phoneNorm) {
  const sheetId = scriptProp.getProperty('FORM_DATA_SHEET_ID');
  if (!sheetId || !phoneNorm) return [];
  const clean = String(phoneNorm).replace(/\D/g, '');
  if (clean.length < 8 || clean.length > 12) return [];
  let sheet;
  try { sheet = SpreadsheetApp.openById(sheetId).getSheetByName('form data'); } catch (e) { return []; }
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const nameIdx = headers.indexOf('Name');
  const itemsIdx = headers.indexOf('Items');
  if (nameIdx === -1) return [];
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const nameVal = String(data[i][nameIdx] || '');
    const rowPhone = nameVal.replace(/\D/g, '');
    if (rowPhone.length < 8 || rowPhone.length > 12) continue;
    if ((nameVal.length - rowPhone.length) > 5) continue;
    const exact = rowPhone === clean;
    const endM = rowPhone.length >= clean.length && rowPhone.slice(-clean.length) === clean && (rowPhone.length - clean.length) <= 3;
    const startM = clean.length >= rowPhone.length && clean.slice(-rowPhone.length) === rowPhone && (clean.length - rowPhone.length) <= 3;
    if (!(exact || endM || startM)) continue;
    const items = itemsIdx !== -1 ? parseJsonArr_(data[i][itemsIdx]) : [];
    items.forEach(function (it) {
      if (it && (it.fileUrl || it.fileId)) {
        out.push({ label: it.name || '', photo_file_id: it.fileId || '', photo_url: it.fileUrl || '', filename: it.filename || '' });
      }
    });
  }
  return out;
}

function photoMapByLine_(orderId) {
  const pm = ss_().getSheetByName('PhotoMap');
  const data = pm.getDataRange().getValues();
  const idx = idxOf_(data[0]);
  const byLine = {};
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx.poscake_order_id]) !== String(orderId)) continue;
    const li = String(data[r][idx.line_index]);
    (byLine[li] = byLine[li] || []).push({
      slot: data[r][idx.slot], photo_file_id: data[r][idx.photo_file_id], photo_url: data[r][idx.photo_url],
      sku: data[r][idx.sku], size: data[r][idx.size], chain: data[r][idx.chain]
    });
  }
  return byLine;
}

// ---- reconcile read ----
function getReconcileData_(e) {
  const u = requireRole_(e, ['admin', 'cs']);
  const orderId = String(e.parameter.poscake_order_id || e.parameter.order_id || '').trim();
  if (!orderId) return { success: false, error: 'thiếu poscake_order_id' };
  const o = loadOrder_(orderId);
  if (!o.rows.length) return { success: false, error: 'không tìm thấy đơn ' + orderId };
  const idx = o.idx, first = o.rows[0].row;

  // Soft-claim on open: stamp if unclaimed or stale; warn (don't block) if a fresh claim is someone else's.
  let claimedBy = first[idx.claimed_by], claimedAt = first[idx.claimed_at], claimMsg = '';
  if (!claimedBy || isClaimStale_(claimedAt)) {
    const who = u.email || u.name || 'cs';
    stampClaim_(o.sheet, o.rows, idx, who);
    claimedBy = who; claimedAt = new Date();
  } else if (String(claimedBy).toLowerCase() !== String(u.email).toLowerCase()) {
    claimMsg = 'đang xử lý bởi ' + claimedBy;
  }

  const phoneNorm = first[idx.phone];
  const ug = uploadGroupPhotos_(phoneNorm, first[idx.upload_group_id]);
  const pmByLine = photoMapByLine_(orderId);

  const lineItems = o.rows.map(function (lr) {
    const row = lr.row, li = String(row[idx.line_index]);
    return {
      line_index: row[idx.line_index], sku: row[idx.sku], product_name: row[idx.product_name], qty: row[idx.qty],
      note_print: row[idx.note_print] || '', note_size: row[idx.note_size] || '', note_chain: row[idx.note_chain] || '',
      local_overrides_json: row[idx.local_overrides_json] || '', saved_photos: pmByLine[li] || []
    };
  });

  return {
    success: true,
    order: {
      poscake_order_id: orderId,
      order_status: first[idx.order_status], order_status_name: first[idx.order_status_name],
      fulfill_status: first[idx.fulfill_status],
      phone_masked: maskPhone_(phoneNorm), phone: phoneNorm, last4: first[idx.last4],
      customer_name: first[idx.customer_name], shipping_address: first[idx.shipping_address],
      cod: first[idx.cod], total_price: first[idx.total_price], tags: first[idx.tags], tag_ids: first[idx.tag_ids],
      internal_note: ug ? ug.internal_note : '',
      claimed_by: claimedBy, claimed_at: claimedAt, claim_msg: claimMsg,
      writeback_state: first[idx.writeback_state] || '', can_writeback: canWriteback_(first[idx.order_status])
    },
    line_items: lineItems,
    matched_photos: ug ? ug.photos : [], upload_status: ug ? ug.status : '',
    phone_pool_photos: phonePoolPhotos_(phoneNorm)
  };
}

// ---- soft claim ----
function claimDraft_(e) {
  const u = requireRole_(e, ['admin', 'cs']);
  const o = loadOrder_(String(e.parameter.poscake_order_id || '').trim());
  if (!o.rows.length) return { success: false, error: 'không tìm thấy đơn' };
  const cur = o.rows[0].row[o.idx.claimed_by], curAt = o.rows[0].row[o.idx.claimed_at];
  if (cur && !isClaimStale_(curAt) && String(cur).toLowerCase() !== String(u.email).toLowerCase() && u.role !== 'admin') {
    return { success: false, error: 'đơn đang được xử lý bởi ' + cur, claimed_by: cur };
  }
  stampClaim_(o.sheet, o.rows, o.idx, u.email || u.name || 'cs');
  return { success: true, claimed_by: u.email || u.name };
}
function releaseDraft_(e) {
  const u = requireRole_(e, ['admin', 'cs']);
  const o = loadOrder_(String(e.parameter.poscake_order_id || '').trim());
  if (!o.rows.length) return { success: false, error: 'không tìm thấy đơn' };
  const cur = o.rows[0].row[o.idx.claimed_by];
  if (cur && String(cur).toLowerCase() !== String(u.email).toLowerCase() && u.role !== 'admin') {
    return { success: false, error: 'chỉ người đang giữ hoặc admin mới nhả được' };
  }
  o.rows.forEach(function (lr) { setCell_(o.sheet, lr.rowNum, o.idx, 'claimed_by', ''); setCell_(o.sheet, lr.rowNum, o.idx, 'claimed_at', ''); });
  return { success: true };
}

// ---- save reconcile (POST: note/size/chain + local overrides + photo map) ----
function saveReconcile_(e) {
  requireRole_(e, ['admin', 'cs']);
  const orderId = String(e.parameter.poscake_order_id || '').trim();
  let payload;
  try { payload = JSON.parse(e.parameter.payload || '{}'); } catch (err) { return { success: false, error: 'payload không hợp lệ' }; }
  const lines = payload.lines || [];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: 'busy, retry' };
  try {
    const o = loadOrder_(orderId);
    if (!o.rows.length) return { success: false, error: 'không tìm thấy đơn' };
    const rowByLine = {};
    o.rows.forEach(function (lr) { rowByLine[String(lr.row[o.idx.line_index])] = lr; });
    lines.forEach(function (ln) {
      const lr = rowByLine[String(ln.line_index)];
      if (!lr) return;
      if (ln.note != null) setCell_(o.sheet, lr.rowNum, o.idx, 'note_print', csvSafe_(String(ln.note).slice(0, 200)));
      if (ln.size != null) setCell_(o.sheet, lr.rowNum, o.idx, 'note_size', csvSafe_(String(ln.size).slice(0, 60)));
      if (ln.chain != null) setCell_(o.sheet, lr.rowNum, o.idx, 'note_chain', csvSafe_(String(ln.chain).slice(0, 60)));
      if (ln.local_overrides != null) setCell_(o.sheet, lr.rowNum, o.idx, 'local_overrides_json', JSON.stringify(ln.local_overrides));
      const fs = lr.row[o.idx.fulfill_status];
      if (fs !== 'ready' && fs !== 'batched') setCell_(o.sheet, lr.rowNum, o.idx, 'fulfill_status', 'reconciling');
    });
    writePhotoMap_(orderId, lines, o);
    return { success: true, order_id: orderId, lines: lines.length };
  } finally { lock.releaseLock(); }
}

// Idempotent PhotoMap upsert: drop this order's rows, re-append from the payload.
function writePhotoMap_(orderId, lines, o) {
  const pm = ss_().getSheetByName('PhotoMap');
  const data = pm.getDataRange().getValues();
  const pmIdx = idxOf_(data[0]);
  const del = [];
  for (let r = 1; r < data.length; r++) if (String(data[r][pmIdx.poscake_order_id]) === String(orderId)) del.push(r + 1);
  del.sort(function (a, b) { return b - a; }).forEach(function (rn) { pm.deleteRow(rn); });

  const rowByLine = {};
  o.rows.forEach(function (lr) { rowByLine[String(lr.row[o.idx.line_index])] = lr.row; });
  const appends = [];
  lines.forEach(function (ln) {
    const orow = rowByLine[String(ln.line_index)] || [];
    const last4 = orow[o.idx.last4] || '';
    const skuClean = cleanSku_(ln.sku || orow[o.idx.sku] || '');
    const yy = safeNote_(ln.note || '');
    const qty = orow[o.idx.qty] || '';
    (ln.photos || []).forEach(function (ph, si) {
      const rowObj = {
        poscake_order_id: orderId, line_index: ln.line_index, slot: (ph.slot != null ? ph.slot : si),
        photo_file_id: ph.photo_file_id || '', photo_url: ph.photo_url || '',
        sku: skuClean, note_print: yy, size: csvSafe_(String(ln.size || '')), chain: csvSafe_(String(ln.chain || '')),
        qty: qty, last4: last4, updated_at: new Date()
      };
      appends.push(PHOTOMAP_HEADER.map(function (h) { return rowObj[h] !== undefined ? rowObj[h] : ''; }));
    });
  });
  if (appends.length) pm.getRange(pm.getLastRow() + 1, 1, appends.length, PHOTOMAP_HEADER.length).setValues(appends);
}

// ---- writeback to the EXISTING Poscake order (order-UPDATE, never create) ----
function canWriteback_(status) { const s = parseInt(status, 10); return !isNaN(s) && s < 2; } // status>=2 = sent to carrier
function mergeTagIds_(currentIds, addId) {
  const seen = {}, out = [];
  (currentIds || []).forEach(function (id) { const k = String(id); if (!seen[k]) { seen[k] = 1; out.push(parseInt(id, 10)); } });
  if (!seen[String(addId)]) out.push(addId);
  return out;
}
function pancakePut_(path, bodyObj) {
  const key = scriptProp.getProperty('PANCAKE_API_KEY');
  const shop = scriptProp.getProperty('SHOP_ID');
  if (!key || !shop) throw new Error('Missing PANCAKE_API_KEY / SHOP_ID in Script Properties');
  const url = PANCAKE_BASE + '/shops/' + shop + path + '?api_key=' + encodeURIComponent(key);
  const resp = UrlFetchApp.fetch(url, { method: 'put', contentType: 'application/json', payload: JSON.stringify(bodyObj), muteHttpExceptions: true });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Poscake PUT ' + code + ': ' + resp.getContentText().slice(0, 200));
  return JSON.parse(resp.getContentText() || '{}');
}
// Read live status (status<2 guard) + tags (union), then PUT note_print and/or tag 36. Never throws
// on a status>=2 order — returns {skipped:true}. Used by markReady (note) and P4 (tag).
function writebackToPoscake_(orderId, opts) {
  const live = pancakeGet_('/orders/' + encodeURIComponent(orderId));
  // Single-order GET shape isn't live-verified; tolerate {data:{}}, {data:[{}]}, or a bare order.
  let order = live && (live.data !== undefined ? live.data : live);
  if (Array.isArray(order)) order = order[0] || {};
  if (!order || typeof order !== 'object') order = {};
  const status = order.status;
  const result = { status: status, note: false, tag: false, skipped: false };
  // Distinguish a real shipped order (status>=2) from a misread response, so writeback_state is debuggable.
  if (status == null) { result.skipped = true; result.reason = 'unexpected order shape (status missing)'; return result; }
  if (!canWriteback_(status)) { result.skipped = true; result.reason = 'status>=2 (đã gửi vận chuyển)'; return result; }
  const body = {};
  if (opts.note) { body.note_print = String(opts.note_print || '').slice(0, 1500); result.note = true; }
  if (opts.tag) { body.tags = mergeTagIds_((order.tags || []).map(function (t) { return t.id; }), PRODUCTION_TAG_ID); result.tag = true; }
  if (Object.keys(body).length) pancakePut_('/orders/' + encodeURIComponent(orderId), body);
  return result;
}

// Compose the Poscake print note: one line per photo slot — slotName | size | chain | photo url.
function buildPrintNote_(o, pmByLine) {
  const idx = o.idx, lines = [];
  let slotIdx = 1;
  o.rows.forEach(function (lr) {
    const row = lr.row, li = String(row[idx.line_index]);
    const last4 = row[idx.last4] || '', size = row[idx.note_size] || '', chain = row[idx.note_chain] || '';
    const skuClean = cleanSku_(row[idx.sku] || ''), yy = safeNote_(row[idx.note_print] || '');
    (pmByLine[li] || []).forEach(function (p) {
      lines.push(buildSlotName_(slotIdx, last4, skuClean, yy) + ' | size:' + size + ' | dây:' + chain + ' | ' + (p.photo_url || ''));
      slotIdx++;
    });
  });
  return lines.join('\n').slice(0, 1500);
}

// ---- mark ready (validate → ready → writeback note → clear claim) ----
function markReady_(e) {
  requireRole_(e, ['admin', 'cs']);
  const orderId = String(e.parameter.poscake_order_id || '').trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { success: false, error: 'busy, retry' };
  try {
    const o = loadOrder_(orderId);
    if (!o.rows.length) return { success: false, error: 'không tìm thấy đơn' };
    const pmByLine = photoMapByLine_(orderId);
    const missing = [];
    o.rows.forEach(function (lr) {
      const li = String(lr.row[o.idx.line_index]);
      if (!String(lr.row[o.idx.note_size] || '').trim()) missing.push('dòng ' + li + ': thiếu size');
      if (!String(lr.row[o.idx.note_chain] || '').trim()) missing.push('dòng ' + li + ': thiếu dây/chain');
      const hasPhoto = (pmByLine[li] || []).some(function (p) { return p.photo_file_id || p.photo_url; });
      if (!hasPhoto) missing.push('dòng ' + li + ': thiếu ảnh');
    });
    if (missing.length) return { success: false, error: 'Chưa đủ điều kiện Sẵn sàng: ' + missing.join('; ') };

    const now = new Date();
    o.rows.forEach(function (lr) { setCell_(o.sheet, lr.rowNum, o.idx, 'fulfill_status', 'ready'); setCell_(o.sheet, lr.rowNum, o.idx, 'reconciled_at', now); });

    // Writeback the print note + photo links (best-effort; status<2 guard inside).
    const notePrint = buildPrintNote_(o, pmByLine);
    let wb;
    try { wb = writebackToPoscake_(orderId, { note: true, note_print: notePrint }); }
    catch (err) { wb = { error: String(err.message || err) }; }
    setCell_(o.sheet, o.rows[0].rowNum, o.idx, 'writeback_state', JSON.stringify(wb));

    // Work done → clear the soft claim.
    o.rows.forEach(function (lr) { setCell_(o.sheet, lr.rowNum, o.idx, 'claimed_by', ''); setCell_(o.sheet, lr.rowNum, o.idx, 'claimed_at', ''); });

    return { success: true, order_id: orderId, writeback: wb, note_print: notePrint };
  } finally { lock.releaseLock(); }
}

// ---- reopen a ready (not batched) order for a photo/spec swap; batched ⇒ admin only ----
function reopenOrder_(e) {
  const u = requireRole_(e, ['admin', 'cs']);
  const o = loadOrder_(String(e.parameter.poscake_order_id || '').trim());
  if (!o.rows.length) return { success: false, error: 'không tìm thấy đơn' };
  const fstat = o.rows[0].row[o.idx.fulfill_status];
  if (fstat === 'batched' && u.role !== 'admin') return { success: false, error: 'đơn đã gửi xưởng — chỉ admin mở lại được' };
  o.rows.forEach(function (lr) { setCell_(o.sheet, lr.rowNum, o.idx, 'fulfill_status', 'reconciling'); });
  return { success: true, order_id: o.rows[0].row[o.idx.poscake_order_id], fulfill_status: 'reconciling' };
}
