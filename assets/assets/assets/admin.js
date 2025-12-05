(function () {
  const sheetIdInput = document.getElementById('sheetId');
  const sheetNameInput = document.getElementById('sheetName');
  const phoneFilterInput = document.getElementById('phoneFilter');
  const loadButton = document.getElementById('loadButton');
  const statusEl = document.getElementById('status');
  const tableBody = document.querySelector('#submissionTable tbody');

  // Prefill with the production sheet so admins can load without copying the ID each time.
  const DEFAULT_SHEET_ID = '1vkh0lphJEKJSmD3v4I6QVqEf_Pj5a0zAgS66I41__IU';
  const DEFAULT_SHEET_NAME = 'form data';
  const STORAGE_KEY = 'crushroom_admin_sheet';

  const params = new URLSearchParams(location.search);
  const stored = loadStoredSheet();
  sheetIdInput.value = params.get('sheetId') || stored.sheetId || DEFAULT_SHEET_ID;
  sheetNameInput.value = params.get('sheetName') || stored.sheetName || DEFAULT_SHEET_NAME;

  loadButton.addEventListener('click', () => loadData());
  phoneFilterInput.addEventListener('input', handleFilter);

  let cachedRows = [];

  async function loadData() {
    const sheetId = sheetIdInput.value.trim();
    const sheetName = sheetNameInput.value.trim();

    if (!sheetId || !sheetName) {
      setStatus('Vui lòng nhập đủ Sheet ID và tên sheet.', true);
      return;
    }

    setStatus('Đang tải dữ liệu...');
    try {
      const url = buildSheetUrl(sheetId, sheetName);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Không thể tải dữ liệu (HTTP ' + response.status + ')');
      const text = await response.text();
      const parsed = parseGvizResponse(text);
      const rows = normalizeRows(parsed.table);
      cachedRows = rows;
      storeSheet(sheetId, sheetName);
      renderRows(rows);
      setStatus(`Đã tải ${rows.length} dòng dữ liệu.`);
    } catch (error) {
      console.error(error);
      cachedRows = [];
      renderRows([]);
      setStatus(error.userMessage || 'Lỗi khi tải dữ liệu. Kiểm tra lại quyền truy cập sheet.', true);
    }
  }

  function buildSheetUrl(sheetId, sheetName) {
    const query = encodeURIComponent('select *');
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&tq=${query}`;
  }

  function parseGvizResponse(raw) {
    try {
      const trimmed = raw.replace(/^.*setResponse\(/, '').replace(/\);?$/, '');
      return JSON.parse(trimmed);
    } catch (error) {
      const parseError = new Error('Không đọc được dữ liệu từ Google Sheet.');
      parseError.userMessage = 'Không đọc được dữ liệu từ Google Sheet. Kiểm tra lại quyền share (Anyone with the link).';
      throw parseError;
    }
  }

  function normalizeRows(table) {
    if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) return [];
    const headers = table.cols.map(col => (col.label || col.id || '').trim());

    return table.rows.map(row => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = row.c[index] ? row.c[index].v : '';
      });

      return {
        timestamp: entry['Timestamp'] || entry['Time'] || entry['Created'] || '',
        phone: entry['Số điện thoại đặt hàng'] || entry['Phone'] || entry['Name'] || '',
        note: entry['Ghi chú'] || entry['Note'] || entry['message'] || '',
        image1: entry['ImgData1'] || entry['Image 1'] || entry['Ảnh cần làm'] || '',
        image2: entry['ImgData2'] || entry['Image 2'] || entry['Ảnh cần làm (Ảnh 2)'] || '',
      };
    });
  }

  function renderRows(rows) {
    tableBody.innerHTML = '';
    const filter = phoneFilterInput.value.trim().toLowerCase();
    const filtered = filter
      ? rows.filter(row => (row.phone || '').toLowerCase().includes(filter))
      : rows;

    if (!filtered.length) {
      const emptyRow = document.createElement('tr');
      emptyRow.className = 'empty-row';
      emptyRow.innerHTML = '<td colspan="5">Không tìm thấy dữ liệu.</td>';
      tableBody.appendChild(emptyRow);
      return;
    }

    filtered.forEach(row => {
      const tr = document.createElement('tr');

      tr.appendChild(renderTextCell(row.timestamp || '-'));

      const phoneCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = row.phone || '—';
      phoneCell.appendChild(badge);
      tr.appendChild(phoneCell);

      tr.appendChild(renderTextCell(row.note || ''));
      tr.appendChild(renderImageCell(row.image1));
      tr.appendChild(renderImageCell(row.image2));

      tableBody.appendChild(tr);
    });
  }

  function buildImageSrc(value) {
    if (!value) return '';
    if (value.startsWith('data:image')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return `data:image/png;base64,${value}`;
  }

  function renderTextCell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  function renderImageCell(value) {
    const td = document.createElement('td');
    td.className = 'image-cell';

    const src = buildImageSrc(value);
    if (!src) {
      const span = document.createElement('span');
      span.className = 'empty-row';
      span.textContent = '(trống)';
      td.appendChild(span);
      return td;
    }

    const link = document.createElement('a');
    link.href = src;
    link.target = '_blank';
    link.rel = 'noopener';

    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Ảnh khách';

    link.appendChild(img);
    td.appendChild(link);
    return td;
  }

  function storeSheet(sheetId, sheetName) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sheetId, sheetName }));
    } catch (error) {
      console.warn('Không thể lưu cấu hình sheet:', error);
    }
  }

  function loadStoredSheet() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Không thể đọc cấu hình sheet:', error);
      return {};
    }
  }

  function handleFilter() {
    if (!cachedRows.length) return;
    renderRows(cachedRows);
  }

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#b91c1c' : '#4b5563';
  }

  if (sheetIdInput.value && sheetNameInput.value) {
    loadData();
  }
})();
