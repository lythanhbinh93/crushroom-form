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

document.getElementById('statusFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip'); if (!btn) return;
  document.querySelectorAll('#statusFilters .chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  currentStatus = btn.dataset.status;
  loadOrders();
});

boot();
