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

  function createUploadSessionCard(row, isNewest) {
    const sessionCard = document.createElement('div');
    sessionCard.className = 'upload-session-card' + (isNewest ? ' newest' : '');

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
            <span class="info-value">${row.Name || 'N/A'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">LOẠI ẢNH</span>
            <span class="info-value">${row.radio === 'one-image' ? 'Chỉ 1 ảnh' : 'Nhiều ảnh'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">GHI CHÚ</span>
            <span class="info-value">${row.message || 'Không có'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">NGÀY UPLOAD</span>
            <span class="info-value">${row.Date ? new Date(row.Date).toLocaleString('vi-VN') : 'N/A'}</span>
          </div>
        </div>
      </div>
    `;

    // Images
    const images = [];
    if (row['image-1']) images.push(row['image-1']);
    if (row['image-2']) images.push(row['image-2']);

    const imagesHTML = images.map((imageUrl, idx) => {
      const imageId = extractGoogleDriveId(imageUrl);
      const thumbnailUrl = imageId
        ? `https://drive.google.com/thumbnail?id=${imageId}&sz=w2000`
        : imageUrl;
      const directUrl = imageId
        ? `https://drive.google.com/uc?export=view&id=${imageId}`
        : imageUrl;

      return `
        <div class="session-image-wrapper">
          <div class="session-image">
            <img src="${thumbnailUrl}" alt="Ảnh ${idx + 1}" loading="lazy"
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f5f5f5%22 width=%22200%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E⚠️ Lỗi%3C/text%3E%3C/svg%3E'">
          </div>
        </div>
      `;
    }).join('');

    sessionCard.innerHTML = `
      ${headerHTML}
      ${infoHTML}
      <div class="session-images-row">
        ${imagesHTML}
      </div>
    `;

    imagesGrid.appendChild(sessionCard);
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
    // Sort newest first
    rows.sort((a, b) => {
      const da = a.Date ? new Date(a.Date) : new Date(0);
      const db = b.Date ? new Date(b.Date) : new Date(0);
      return db - da;
    });

    // Group by YYYY-MM-DD (local time)
    const groups = new Map();
    for (const row of rows) {
      if (!row.Date) continue;
      const d = new Date(row.Date);
      if (isNaN(d.getTime())) continue;
      const key = ymdKey(d);
      if (!groups.has(key)) groups.set(key, { date: d, items: [] });
      groups.get(key).items.push(row);
    }

    // Render
    listDaySections.innerHTML = '';
    listResultInfo.textContent =
      `${rows.length} upload từ ${formatVnDate(from)} đến ${formatVnDate(to)} · ${groups.size} ngày`;

    // Newest day first (Map insertion order is sorted because rows are pre-sorted desc)
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
          <th class="col-type">Loại</th>
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

    const typeText = row.radio === 'one-image' ? '1 ảnh' : (row.radio === 'many-image' ? 'Nhiều ảnh' : '—');
    const note = row.message ? String(row.message) : '';

    const imgs = [];
    if (row['image-1']) imgs.push(row['image-1']);
    if (row['image-2']) imgs.push(row['image-2']);

    const imgsHTML = imgs.map(url => {
      const id = extractGoogleDriveId(url);
      const thumb = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w200` : url;
      const full = id ? `https://drive.google.com/file/d/${id}/view` : url;
      return `
        <a href="${full}" target="_blank" rel="noopener" class="table-thumb">
          <img src="${thumb}" alt="thumb" loading="lazy"
               onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Crect fill=%22%23f5f5f5%22 width=%2260%22 height=%2260%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2210%22%3E!%3C/text%3E%3C/svg%3E'">
        </a>
      `;
    }).join('') || '<span class="no-img">—</span>';

    tr.innerHTML = `
      <td class="col-time">${timeText}</td>
      <td class="col-phone">${escapeHtml(row.Name || '—')}</td>
      <td class="col-type">${typeText}</td>
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
    // ymd: "YYYY-MM-DD"
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
    return String(s)
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
