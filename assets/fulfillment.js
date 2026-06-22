/* Crush Room Fulfillment — Phase 1 frontend (login + sync + order list).
 * Auth: per-user token (Users sheet) sent as ?token= on every call, because
 * Session.getActiveUser() is empty for cross-origin fetches from this static page. */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbOkkfdUO_A0OUIj4BQegmxEeWo1NxTiK4b1Zez0E_CkuvWuilQ6SyiizgAz6pVHEOWw/exec';
const TOKEN_KEY = 'cr_fulfillment_token';

let currentStatus = '';

// ---- token storage ----
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ?token= in the URL (admin can hand each CS a pre-filled bookmark) auto-logs in.
(function captureUrlToken() {
  const p = new URLSearchParams(location.search).get('token');
  if (p) { setToken(p); history.replaceState(null, '', location.pathname); }
})();

// ---- API (GET only → no CORS preflight, matches admin.js pattern) ----
async function api(action, params) {
  const qs = new URLSearchParams(Object.assign({ action: action, token: getToken() }, params || {}));
  const res = await fetch(SCRIPT_URL + '?' + qs.toString(), { method: 'GET' });
  return res.json();
}

// POST wrapper (FormData → no preflight) for actions that carry a large JSON payload (saveReconcile).
async function postApi(action, fields) {
  const fd = new FormData();
  fd.set('action', action); fd.set('token', getToken());
  Object.keys(fields || {}).forEach(k => fd.set(k, fields[k]));
  const res = await fetch(SCRIPT_URL, { method: 'POST', body: fd });
  return res.json();
}

// ---- toast ----
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

// ---- escaping ----
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- auth flow ----
async function boot() {
  if (!getToken()) return showLogin();
  const me = await api('whoami');
  if (!me || !me.success) return showLogin(me && me.error);
  showApp(me);
}

function showLogin(err) {
  document.getElementById('app').hidden = true;
  const login = document.getElementById('login');
  login.hidden = false;
  const e = document.getElementById('loginErr');
  if (err) { e.textContent = 'Không đăng nhập được: ' + err; e.hidden = false; } else { e.hidden = true; }
}

function showApp(me) {
  document.getElementById('login').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('whoBadge').textContent = (me.name || me.email || '') + ' · ' + (me.role || '');
  document.getElementById('syncBtn').hidden = (me.role !== 'admin'); // sync is admin-only
  document.getElementById('newLinkBtn').hidden = false; // both cs + admin create upload links
  loadOrders();
}

// ---- sync (admin) ----
async function doSync() {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true; btn.textContent = 'Đang đồng bộ…';
  try {
    const r = await api('syncOrders');
    const bar = document.getElementById('syncResult');
    if (r && r.success) {
      const s = r.stats || {};
      bar.textContent = `✓ Đồng bộ new + waitting: +${s.new} mới · ${s.updated} cập nhật · gỡ ${s.pruned || 0} đơn đã rời trạng thái · bỏ qua ${s.skippedTag36} "Đang sản xuất".`;
      bar.hidden = false;
      toast('Đồng bộ xong'); loadOrders();
    } else {
      toast('Lỗi đồng bộ: ' + (r && r.error));
    }
  } catch (e) { toast('Lỗi mạng khi đồng bộ'); }
  btn.disabled = false; btn.textContent = 'Đồng bộ đơn';
}

// ---- create upload link (CS/admin) ----
function openLinkModal() {
  document.getElementById('labelRows').innerHTML = '';
  addLabelRow('', 1);
  document.getElementById('internalNote').value = '';
  document.getElementById('linkPhone').value = '';
  document.getElementById('linkResult').hidden = true;
  document.getElementById('linkErr').hidden = true;
  document.getElementById('linkModal').hidden = false;
}
function closeLinkModal() { document.getElementById('linkModal').hidden = true; }

function addLabelRow(label, count) {
  const row = document.createElement('div');
  row.className = 'label-row';
  row.innerHTML =
    '<input class="inp label-text" type="text" placeholder="VD: Mặt dây thú cưng">' +
    '<input class="inp label-count" type="number" min="1" max="10" value="' + (count || 1) + '" title="Số ảnh" aria-label="Số ảnh">' +
    '<button class="btn ghost sm label-remove" type="button" aria-label="Xoá">×</button>';
  row.querySelector('.label-text').value = label || '';
  row.querySelector('.label-remove').addEventListener('click', function () {
    row.remove();
    if (!document.querySelectorAll('#labelRows .label-row').length) addLabelRow('', 1); // never leave zero rows
  });
  document.getElementById('labelRows').appendChild(row);
}

function collectLabels() {
  const labels = [];
  document.querySelectorAll('#labelRows .label-row').forEach(function (r) {
    const label = (r.querySelector('.label-text').value || '').trim();
    let count = parseInt(r.querySelector('.label-count').value, 10);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 10) count = 10;
    if (label) labels.push({ label: label, count: count });
  });
  return labels;
}

async function createLink() {
  const errEl = document.getElementById('linkErr');
  errEl.hidden = true;
  const labels = collectLabels();
  if (!labels.length) { errEl.textContent = 'Cần ít nhất 1 nhãn có nội dung.'; errEl.hidden = false; return; }
  const btn = document.getElementById('createLinkBtn');
  btn.disabled = true; btn.textContent = 'Đang tạo…';
  try {
    const r = await api('createUploadLink', {
      labels: JSON.stringify(labels),
      internal_note: document.getElementById('internalNote').value || '',
      phone: document.getElementById('linkPhone').value || ''
    });
    if (r && r.success) {
      // Build the absolute customer link from the dashboard's own origin/path (handles subpaths).
      const base = location.origin + location.pathname.replace(/[^/]*$/, '');
      document.getElementById('linkOut').value = base + r.link_path;
      document.getElementById('linkReqId').textContent = 'Mã: ' + r.req_id;
      document.getElementById('linkResult').hidden = false;
      toast('Đã tạo link');
    } else {
      errEl.textContent = 'Lỗi: ' + ((r && r.error) || 'không rõ'); errEl.hidden = false;
    }
  } catch (e) {
    errEl.textContent = 'Lỗi mạng khi tạo link.'; errEl.hidden = false;
  }
  btn.disabled = false; btn.textContent = 'Tạo link';
}

function copyLink() {
  const out = document.getElementById('linkOut');
  out.select();
  const done = function () { toast('Đã sao chép link'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out.value).then(done, function () { try { document.execCommand('copy'); } catch (e) {} done(); });
  } else { try { document.execCommand('copy'); } catch (e) {} done(); }
}

// ---- list ----
async function loadOrders() {
  const body = document.getElementById('ordersBody');
  document.getElementById('loadingState').hidden = false;
  document.getElementById('emptyState').hidden = true;
  body.innerHTML = '';
  const r = await api('listOrders', currentStatus ? { status: currentStatus } : null);
  document.getElementById('loadingState').hidden = true;
  if (!r || !r.success) { toast('Lỗi tải đơn: ' + (r && r.error)); return; }
  document.getElementById('orderCount').textContent = r.count + ' dòng';
  if (!r.orders.length) { document.getElementById('emptyState').hidden = false; return; }
  body.innerHTML = r.orders.map(rowHtml).join('');
}

const STATUS_LABEL = { synced: 'Mới đồng bộ', reconciling: 'Đang xử lý', ready: 'Sẵn sàng', batched: 'Đã gửi xưởng', cancelled: 'Đã hủy' };

function rowHtml(o) {
  const fs = STATUS_LABEL[o.fulfill_status] || o.fulfill_status || '';
  const claim = o.claimed_by ? esc(o.claimed_by) : '<span class="muted">—</span>';
  return `<tr class="ledger-row" data-order="${esc(o.order_id)}" title="Mở để xử lý">
    <td class="psk">#${esc(o.order_id)}<span class="li">·${esc(o.line_index)}</span></td>
    <td class="mono">${esc(o.phone_masked)}</td>
    <td>${esc(o.customer_name)}</td>
    <td class="mono">${esc(o.sku)}</td>
    <td>${esc(o.product_name)}</td>
    <td class="mono center">${esc(o.qty)}</td>
    <td><span class="ostat">${esc(o.order_status_name || o.order_status)}</span></td>
    <td class="tags">${esc(o.tags)}</td>
    <td><span class="fstat s-${esc(o.fulfill_status)}">${esc(fs)}</span></td>
    <td>${claim}</td>
  </tr>`;
}

// ============================================================================
// Reconcile view (open an order → match photos, fill note/size/chain, Mark Ready)
// ============================================================================
let rcState = null; // { orderId, last4, lines:[{line_index, sku, note, size, chain, selected:Set}], photos:[] }

// Filename-preview mirrors of the server port (display only; server is authoritative).
function cleanSkuJs(sku) {
  if (sku == null) return '';
  const up = String(sku).trim().toUpperCase();
  if (up.indexOf('COUPLEPIX-') !== -1) {
    const parts = up.split('COUPLEPIX-');
    if (parts.length > 1 && parts[1]) { const f = parts[1].trim().split(/\s+/)[0]; if (f) return f; }
  }
  return up.replace(/ /g, '');
}
function safeNoteJs(note, max) {
  if (note == null || note === '') return '';
  max = max || 35;
  let s = String(note).trim().replace(/\//g, '-').replace(/\\/g, '-').replace(/:/g, '-');
  s = s.replace(/[^\p{L}\p{N}_\s.,-]/gu, '');
  return s.replace(/ /g, '').slice(0, max);
}
function slotNameJs(i, last4, sku, yy) { const p = [i + '.', last4 || '0000', sku || '']; if (yy) p.push(yy); return p.join('_'); }

function photoKey(p) { return String(p.photo_file_id || p.photo_url || ''); }
function driveThumb(p, size) {
  const id = p.photo_file_id || (String(p.photo_url || '').match(/[-\w]{25,}/) || [])[0];
  return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (size || 150) : '';
}

async function openReconcile(orderId) {
  document.getElementById('reconcileView').hidden = false;
  document.getElementById('rcOrderId').textContent = '#' + orderId;
  document.getElementById('rcMeta').innerHTML = '<div class="muted">Đang tải…</div>';
  document.getElementById('rcLines').innerHTML = '';
  const r = await api('getReconcileData', { poscake_order_id: orderId });
  if (!r || !r.success) { toast('Lỗi: ' + (r && r.error)); closeReconcile(); return; }
  renderReconcile(r);
}
function closeReconcile() { document.getElementById('reconcileView').hidden = true; rcState = null; }

function renderReconcile(d) {
  const o = d.order;
  // Dedupe the available photo pool (matched UploadGroup ∪ phone-pool) by key.
  const seen = {}, photos = [];
  (d.matched_photos || []).concat(d.phone_pool_photos || []).forEach(p => {
    const k = photoKey(p); if (k && !seen[k]) { seen[k] = 1; photos.push(p); }
  });

  rcState = {
    orderId: o.poscake_order_id, last4: o.last4 || '', fulfill_status: o.fulfill_status, photos: photos,
    lines: (d.line_items || []).map(li => {
      const sel = new Set((li.saved_photos || []).map(photoKey).filter(Boolean));
      return { line_index: li.line_index, sku: li.sku || '', product_name: li.product_name || '', qty: li.qty || '',
        note: li.note_print || '', size: li.note_size || '', chain: li.note_chain || '', selected: sel };
    })
  };

  // Header meta
  const wb = o.can_writeback
    ? '<span class="rc-pill ok">Ghi được sang Poscake</span>'
    : '<span class="rc-pill warn">Đã gửi vận chuyển — writeback bỏ qua</span>';
  document.getElementById('rcMeta').innerHTML =
    (o.internal_note ? '<div class="rc-note"><b>Ghi chú nội bộ:</b> ' + esc(o.internal_note) + '</div>' : '') +
    '<div class="rc-facts">' +
      '<span>SĐT: <b class="mono">' + esc(o.phone || o.phone_masked) + '</b></span>' +
      '<span>Khách: <b>' + esc(o.customer_name) + '</b></span>' +
      '<span>COD: <b>' + esc(o.cod) + '</b></span>' +
      '<span>TT Poscake: <b>' + esc(o.order_status_name || o.order_status) + '</b></span>' +
      wb +
    '</div>' +
    (o.shipping_address ? '<div class="muted">Giao: ' + esc(o.shipping_address) + '</div>' : '');

  // Claim badge + buttons
  const claim = document.getElementById('rcClaim');
  claim.textContent = o.claim_msg || (o.claimed_by ? 'đang giữ: ' + o.claimed_by : '');
  claim.className = 'rc-claim' + (o.claim_msg ? ' warn' : '');
  document.getElementById('rcRelease').hidden = !o.claimed_by;
  const isReady = o.fulfill_status === 'ready' || o.fulfill_status === 'batched';
  document.getElementById('rcReopen').hidden = !isReady;
  document.getElementById('rcReady').hidden = isReady;
  document.getElementById('rcSave').hidden = isReady;

  document.getElementById('rcLines').innerHTML = rcState.lines.map((ln, i) => lineCardHtml(ln, i)).join('');
  bindLineCards();
  renderPreviews();
}

function lineCardHtml(ln, i) {
  const thumbs = rcState.photos.map(p => {
    const k = photoKey(p), on = ln.selected.has(k);
    const src = driveThumb(p, 150);
    return `<button type="button" class="rc-thumb${on ? ' on' : ''}" data-line="${i}" data-key="${esc(k)}" title="${esc(p.label || '')}">`
      + (src ? `<img src="${esc(src)}" loading="lazy" referrerpolicy="no-referrer" alt="">` : '📷')
      + (p.label ? `<span class="rc-thumb-lab">${esc(p.label)}</span>` : '')
      + `</button>`;
  }).join('');
  return `<div class="rc-line" data-line="${i}">
    <div class="rc-line-head"><b>Dòng ${esc(ln.line_index)}</b> · <span class="mono">${esc(ln.sku)}</span> · ${esc(ln.product_name)} · SL ${esc(ln.qty)}</div>
    <div class="rc-photos">${thumbs || '<span class="muted">Chưa có ảnh — dùng kho SĐT hoặc nhờ khách upload.</span>'}</div>
    <div class="rc-inputs">
      <label>Ghi chú<input class="inp sm rc-note-in" data-line="${i}" value="${esc(ln.note)}" placeholder="vd: mặt cười"></label>
      <label>Size *<input class="inp sm rc-size-in" data-line="${i}" value="${esc(ln.size)}" placeholder="bắt buộc"></label>
      <label>Dây/chain *<input class="inp sm rc-chain-in" data-line="${i}" value="${esc(ln.chain)}" placeholder="bắt buộc"></label>
    </div>
    <div class="rc-preview" data-line="${i}"></div>
  </div>`;
}

function bindLineCards() {
  document.querySelectorAll('.rc-thumb').forEach(btn => btn.addEventListener('click', () => {
    const ln = rcState.lines[+btn.dataset.line], k = btn.dataset.key;
    if (ln.selected.has(k)) ln.selected.delete(k); else ln.selected.add(k);
    btn.classList.toggle('on');
    renderPreviews();
  }));
  const wire = (cls, field) => document.querySelectorAll(cls).forEach(inp => inp.addEventListener('input', () => {
    rcState.lines[+inp.dataset.line][field] = inp.value; renderPreviews();
  }));
  wire('.rc-note-in', 'note'); wire('.rc-size-in', 'size'); wire('.rc-chain-in', 'chain');
}

// Walk lines in order assigning a GLOBAL slot index (matches the server's buildPrintNote_).
function renderPreviews() {
  let slot = 1;
  rcState.lines.forEach((ln, i) => {
    const el = document.querySelector('.rc-preview[data-line="' + i + '"]');
    if (!el) return;
    const sku = cleanSkuJs(ln.sku), yy = safeNoteJs(ln.note);
    const names = [];
    rcState.photos.forEach(p => { if (ln.selected.has(photoKey(p))) { names.push(slotNameJs(slot, rcState.last4, sku, yy)); slot++; } });
    el.innerHTML = names.length ? 'Tên file: <span class="mono">' + names.map(esc).join('</span>, <span class="mono">') + '</span>' : '<span class="muted">Chưa chọn ảnh</span>';
  });
}

function buildReconcilePayload() {
  return {
    lines: rcState.lines.map(ln => ({
      line_index: ln.line_index, sku: ln.sku, note: ln.note, size: ln.size, chain: ln.chain,
      photos: rcState.photos.filter(p => ln.selected.has(photoKey(p)))
        .map((p, si) => ({ slot: si, photo_file_id: p.photo_file_id || '', photo_url: p.photo_url || '' }))
    }))
  };
}

async function saveReconcileNow(silent) {
  if (!rcState) return false;
  const r = await postApi('saveReconcile', { poscake_order_id: rcState.orderId, payload: JSON.stringify(buildReconcilePayload()) });
  if (r && r.success) { if (!silent) toast('Đã lưu khớp'); return true; }
  toast('Lỗi lưu: ' + (r && r.error)); return false;
}

async function doMarkReady() {
  if (!rcState) return;
  // Client-side guard mirrors the server gate (size + chain + ≥1 photo per line).
  const bad = rcState.lines.find(ln => !ln.size.trim() || !ln.chain.trim() || ln.selected.size === 0);
  if (bad) { toast('Mỗi dòng cần: ảnh + size + dây.'); return; }
  if (!confirm('Đánh dấu Sẵn sàng? Thao tác này ghi note + link ảnh sang đơn Poscake.')) return;
  if (!(await saveReconcileNow(true))) return; // persist first
  const r = await api('markReady', { poscake_order_id: rcState.orderId });
  if (!r || !r.success) { toast('Lỗi: ' + (r && r.error)); return; }
  const wb = r.writeback || {};
  if (wb.skipped) toast('Sẵn sàng ✓ — đơn đã gửi vận chuyển nên KHÔNG ghi sang Poscake (vẫn vào gói xưởng).');
  else if (wb.error) toast('Sẵn sàng ✓ — nhưng writeback lỗi: ' + wb.error);
  else toast('Sẵn sàng ✓ — đã ghi note sang Poscake.');
  closeReconcile(); loadOrders();
}

// ---- wire up ----
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = document.getElementById('tokenInput').value.trim();
  if (!t) return;
  setToken(t);
  const me = await api('whoami');
  if (me && me.success) { showApp(me); } else { clearToken(); showLogin(me && me.error); }
});

document.getElementById('syncBtn').addEventListener('click', doSync);
document.getElementById('logoutBtn').addEventListener('click', () => { clearToken(); location.reload(); });

// create-link modal
document.getElementById('newLinkBtn').addEventListener('click', openLinkModal);
document.getElementById('linkClose').addEventListener('click', closeLinkModal);
document.getElementById('addLabelBtn').addEventListener('click', () => addLabelRow('', 1));
document.getElementById('addCoupleBtn').addEventListener('click', () => addLabelRow('', 2));
document.getElementById('createLinkBtn').addEventListener('click', createLink);
document.getElementById('copyLinkBtn').addEventListener('click', copyLink);
document.getElementById('linkModal').addEventListener('click', (e) => { if (e.target.id === 'linkModal') closeLinkModal(); });

document.getElementById('statusFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip'); if (!btn) return;
  document.querySelectorAll('#statusFilters .chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  currentStatus = btn.dataset.status;
  loadOrders();
});

// open reconcile by clicking a ledger row
document.getElementById('ordersBody').addEventListener('click', (e) => {
  const row = e.target.closest('.ledger-row'); if (!row) return;
  openReconcile(row.dataset.order);
});

// reconcile view actions
document.getElementById('rcBack').addEventListener('click', closeReconcile);
document.getElementById('rcSave').addEventListener('click', () => saveReconcileNow(false));
document.getElementById('rcReady').addEventListener('click', doMarkReady);
document.getElementById('rcRelease').addEventListener('click', async () => {
  if (!rcState) return;
  const r = await api('releaseDraft', { poscake_order_id: rcState.orderId });
  if (r && r.success) { toast('Đã nhả đơn'); openReconcile(rcState.orderId); } else { toast('Lỗi: ' + (r && r.error)); }
});
document.getElementById('rcReopen').addEventListener('click', async () => {
  if (!rcState) return;
  const r = await api('reopenOrder', { poscake_order_id: rcState.orderId });
  if (r && r.success) { toast('Đã mở lại'); openReconcile(rcState.orderId); } else { toast('Lỗi: ' + (r && r.error)); }
});

boot();
