document.addEventListener('DOMContentLoaded', function() {
  // Google Apps Script URL - CẦN CẬP NHẬT URL NÀY
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec';

  const phoneInput = document.getElementById('phone-search');
  const searchBtn = document.getElementById('search-btn');
  const loading = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  const results = document.getElementById('results');
  const noResults = document.getElementById('no-results');
  const resultInfo = document.getElementById('result-info');
  const imagesGrid = document.getElementById('images-grid');
  const toastEl = document.getElementById('toast');

  // Enter key to search
  phoneInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      searchImages();
    }
  });

  // Click search button
  searchBtn.addEventListener('click', searchImages);

  function searchImages() {
    const phone = phoneInput.value.trim().replace(/\D/g, '');

    if (!phone) {
      showError('Vui lòng nhập số điện thoại');
      return;
    }

    console.log('Searching for phone:', phone);
    hideAll();
    loading.style.display = 'block';

    // Call Google Apps Script API
    fetch(SCRIPT_URL + '?action=search&phone=' + phone)
      .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Response data:', data);
        loading.style.display = 'none';

        if (data.success && data.results && data.results.length > 0) {
          displayResults(data.results, phone);
        } else if (data.success && data.results && data.results.length === 0) {
          noResults.style.display = 'block';
        } else {
          showError(data.error || 'Không tìm thấy kết quả');
        }
      })
      .catch(error => {
        console.error('Fetch error:', error);
        loading.style.display = 'none';
        showError(`Lỗi: ${error.message}. Vui lòng kiểm tra console để biết chi tiết.`);
      });
  }

  function displayResults(data, phone) {
    results.style.display = 'block';

    // Sort by date (newest first)
    data.sort((a, b) => {
      const dateA = a.Date ? new Date(a.Date) : new Date(0);
      const dateB = b.Date ? new Date(b.Date) : new Date(0);
      return dateB - dateA;
    });

    // Display result info
    resultInfo.textContent = `Tìm thấy ${data.length} kết quả cho số điện thoại: ${phone}`;

    // Clear previous results
    imagesGrid.innerHTML = '';

    // Create separate card for each upload session
    data.forEach((row, index) => {
      createUploadSessionCard(row, index === 0);
    });
  }

  // Parse the `Items` JSON column (v2). Falls back to [] when missing/malformed.
  // Legacy rows (v1) only have image-1/image-2 — we synthesize pseudo-items for those
  // so the Copy Messenger button still works.
  function parseItems(row) {
    const raw = row.Items;
    if (raw && typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (e) {
        console.warn('Items JSON parse failed:', e);
      }
    }
    // Legacy fallback
    const legacy = [];
    if (row['image-1']) legacy.push({ sku: '—', name: 'Ảnh 1', fileUrl: row['image-1'], slot: '0' });
    if (row['image-2']) legacy.push({ sku: '—', name: 'Ảnh 2', fileUrl: row['image-2'], slot: '1' });
    return legacy;
  }

  function createUploadSessionCard(row, isNewest) {
    const sessionCard = document.createElement('div');
    sessionCard.className = 'upload-session-card' + (isNewest ? ' newest' : '');

    const items = parseItems(row);
    const isLegacy = !row.Items;

    // Header with "Newest" badge
    const headerHTML = isNewest
      ? '<div class="session-badge">✨ Ảnh mới nhất</div>'
      : '';

    // Customer info
    const infoHTML = `
      <div class="session-info">
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">SỐ ĐIỆN THOẠI</span>
            <span class="info-value">${escapeHtml(row.Name || 'N/A')}</span>
          </div>
          <div class="info-item">
            <span class="info-label">SỐ SẢN PHẨM</span>
            <span class="info-value">${items.length}${row.radio === 'one-image' && items.length > 1 ? ' (dùng cùng 1 ảnh)' : ''}</span>
          </div>
          <div class="info-item">
            <span class="info-label">GHI CHÚ</span>
            <span class="info-value">${escapeHtml(row.message || 'Không có')}</span>
          </div>
          <div class="info-item">
            <span class="info-label">NGÀY UPLOAD</span>
            <span class="info-value">${row.Date ? new Date(row.Date).toLocaleString('vi-VN') : 'N/A'}</span>
          </div>
        </div>
      </div>
    `;

    // Per-product rows (v2) or plain image grid (legacy)
    const productRowsHTML = items.length
      ? `<div class="product-rows">${items.map((it, idx) => renderProductRow(it, idx)).join('')}</div>`
      : '<div class="no-img">Không có ảnh</div>';

    // Copy Messenger button
    const copyBarHTML = items.length
      ? `
        <div class="copy-bar">
          <button type="button" class="btn-copy-messenger" data-copy-btn>
            <span class="btn-icon">📋</span>
            Copy Messenger
          </button>
          ${isLegacy ? '<span class="copy-legacy-tag">Dữ liệu cũ — sản phẩm không rõ</span>' : ''}
        </div>
      `
      : '';

    sessionCard.innerHTML = `
      ${headerHTML}
      ${infoHTML}
      ${productRowsHTML}
      ${copyBarHTML}
    `;

    // Wire up the Copy button with the session's own data (closure).
    const copyBtn = sessionCard.querySelector('[data-copy-btn]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const text = buildMessengerMessage(row.Name || '', items);
        copyToClipboard(text)
          .then(() => showToast('Đã copy tin nhắn Messenger'))
          .catch(() => showToast('Không copy được — vui lòng thử lại', true));
      });
    }

    imagesGrid.appendChild(sessionCard);
  }

  function renderProductRow(item, idx) {
    const imageId = extractGoogleDriveId(item.fileUrl || '');
    const thumbnailUrl = imageId
      ? `https://drive.google.com/thumbnail?id=${imageId}&sz=w600`
      : (item.fileUrl || '');
    const viewUrl = imageId
      ? `https://drive.google.com/file/d/${imageId}/view`
      : (item.fileUrl || '#');

    return `
      <div class="product-row-card">
        <div class="product-row-thumb">
          <a href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(item.name || '')}" loading="lazy"
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f5f5f5%22 width=%22200%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E⚠️ Lỗi%3C/text%3E%3C/svg%3E'">
          </a>
        </div>
        <div class="product-row-meta">
          <div class="product-row-index">#${idx + 1}</div>
          <div class="product-row-sku">${escapeHtml(item.sku || '—')}</div>
          <div class="product-row-name">${escapeHtml(item.name || '')}</div>
          <a class="product-row-link" href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener">Mở ảnh gốc ↗</a>
        </div>
      </div>
    `;
  }

  // Messenger template — line-per-product with Drive view links.
  function buildMessengerMessage(phoneRaw, items) {
    const phoneDigits = String(phoneRaw || '').replace(/\D/g, '') || phoneRaw;
    const lines = [];
    lines.push(`Shop đã nhận ảnh cho đơn SĐT ${phoneDigits} (${items.length} sản phẩm). Anh/chị xác nhận giúp shop:`);
    items.forEach(function (it) {
      const id = extractGoogleDriveId(it.fileUrl || '');
      const link = id ? `https://drive.google.com/file/d/${id}/view` : (it.fileUrl || '');
      lines.push(`- ${it.sku || '—'} — ${it.name || ''}: ${link}`);
    });
    lines.push('');
    lines.push('Nếu có sai sót ảnh nào, anh/chị báo lại trong 2h nhé. Cảm ơn ạ!');
    return lines.join('\n');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / non-secure contexts.
    return new Promise(function (resolve, reject) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) { reject(e); }
    });
  }

  let toastTimer = null;
  function showToast(msg, isError) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove('toast--error');
    if (isError) toastEl.classList.add('toast--error');
    toastEl.classList.add('toast--visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('toast--visible');
    }, 2400);
  }

  function extractGoogleDriveId(url) {
    if (!url) return null;
    const match = String(url).match(/[-\w]{25,}/);
    return match ? match[0] : null;
  }

  function showError(message) {
    hideAll();
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
  }

  function hideAll() {
    loading.style.display = 'none';
    errorMessage.style.display = 'none';
    results.style.display = 'none';
    noResults.style.display = 'none';
  }

  // ============================================================
  // BROWSE BY DATE (Preview Table)
  // ============================================================
  const dateFromInput = document.getElementById('date-from');
  const dateToInput = document.getElementById('date-to');
  const loadListBtn = document.getElementById('load-list-btn');
  const listLoading = document.getElementById('list-loading');
  const listError = document.getElementById('list-error');
  const listEmpty = document.getElementById('list-empty');
  const listNoResults = document.getElementById('list-no-results');
  const listResults = document.getElementById('list-results');
  const listResultInfo = document.getElementById('list-result-info');
  const listDaySections = document.getElementById('list-day-sections');

  loadListBtn.addEventListener('click', loadList);

  function loadList() {
    const from = dateFromInput.value;
    const to = dateToInput.value;

    if (!from || !to) {
      showListError('Vui lòng chọn cả ngày bắt đầu và ngày kết thúc.');
      return;
    }
    if (from > to) {
      showListError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }

    hideAllList();
    listLoading.style.display = 'block';

    const url = `${SCRIPT_URL}?action=list&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        listLoading.style.display = 'none';
        if (!data.success) {
          showListError(data.error || 'Lỗi không xác định');
          return;
        }
        if (!data.results || data.results.length === 0) {
          listNoResults.style.display = 'block';
          return;
        }
        renderList(data.results, from, to);
      })
      .catch(err => {
        console.error('list fetch error:', err);
        listLoading.style.display = 'none';
        showListError(`Lỗi: ${err.message}`);
      });
  }

  function renderList(rows, from, to) {
    rows.sort((a, b) => {
      const da = a.Date ? new Date(a.Date) : new Date(0);
      const db = b.Date ? new Date(b.Date) : new Date(0);
      return db - da;
    });

    const groups = new Map();
    for (const row of rows) {
      if (!row.Date) continue;
      const d = new Date(row.Date);
      if (isNaN(d.getTime())) continue;
      const key = ymdKey(d);
      if (!groups.has(key)) groups.set(key, { date: d, items: [] });
      groups.get(key).items.push(row);
    }

    listDaySections.innerHTML = '';
    listResultInfo.textContent =
      `${rows.length} upload từ ${formatVnDate(from)} đến ${formatVnDate(to)} · ${groups.size} ngày`;

    for (const [, group] of groups) {
      listDaySections.appendChild(buildDaySection(group.date, group.items));
    }

    listResults.style.display = 'block';
  }

  function buildDaySection(date, items) {
    const section = document.createElement('div');
    section.className = 'day-section';

    const header = document.createElement('div');
    header.className = 'day-section-header';
    header.innerHTML = `
      <h3>${dayLabel(date)}</h3>
      <span class="day-count">${items.length} upload</span>
    `;
    section.appendChild(header);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'upload-table-wrap';
    const table = document.createElement('table');
    table.className = 'upload-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-time">Giờ</th>
          <th class="col-phone">SĐT</th>
          <th class="col-type">SP</th>
          <th class="col-note">Ghi chú</th>
          <th class="col-images">Ảnh</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    for (const row of items) {
      tbody.appendChild(buildRow(row));
    }

    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
    return section;
  }

  function buildRow(row) {
    const tr = document.createElement('tr');

    const d = row.Date ? new Date(row.Date) : null;
    const timeText = d && !isNaN(d.getTime())
      ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
      : '—';

    const items = parseItems(row);
    const typeText = items.length
      ? (items.length + (row.radio === 'one-image' && items.length > 1 ? ' (1 ảnh chung)' : ''))
      : '—';
    const note = row.message ? String(row.message) : '';

    // Render per-item thumbnails (v2) — fallback was already produced by parseItems.
    const imgsHTML = items.length
      ? items.map(it => {
          const id = extractGoogleDriveId(it.fileUrl || '');
          const thumb = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w200` : (it.fileUrl || '');
          const full = id ? `https://drive.google.com/file/d/${id}/view` : (it.fileUrl || '');
          const title = (it.sku || '—') + ' — ' + (it.name || '');
          return `
            <a href="${escapeHtml(full)}" target="_blank" rel="noopener" class="table-thumb" title="${escapeHtml(title)}">
              <img src="${escapeHtml(thumb)}" alt="thumb" loading="lazy"
                   onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Crect fill=%22%23f5f5f5%22 width=%2260%22 height=%2260%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2210%22%3E!%3C/text%3E%3C/svg%3E'">
            </a>
          `;
        }).join('')
      : '<span class="no-img">—</span>';

    tr.innerHTML = `
      <td class="col-time">${timeText}</td>
      <td class="col-phone">${escapeHtml(row.Name || '—')}</td>
      <td class="col-type">${escapeHtml(typeText)}</td>
      <td class="col-note" title="${escapeHtml(note)}">${escapeHtml(note) || '<span class="muted">—</span>'}</td>
      <td class="col-images"><div class="thumb-row">${imgsHTML}</div></td>
    `;
    return tr;
  }

  // ---------- helpers ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function ymdKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatVnDate(ymd) {
    const parts = String(ymd).split('-');
    if (parts.length !== 3) return ymd;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function dayLabel(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
    const dmy = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    if (diffDays === 0) return `Hôm nay · ${dmy}`;
    if (diffDays === 1) return `Hôm qua · ${dmy}`;
    const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    if (diffDays > 1 && diffDays < 7) return `${weekdays[d.getDay()]} · ${dmy}`;
    return dmy;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showListError(msg) {
    hideAllList();
    listError.textContent = msg;
    listError.style.display = 'block';
  }

  function hideAllList() {
    listLoading.style.display = 'none';
    listError.style.display = 'none';
    listEmpty.style.display = 'none';
    listNoResults.style.display = 'none';
    listResults.style.display = 'none';
  }
});
