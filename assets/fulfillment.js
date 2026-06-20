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
  return `<tr>
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

boot();
