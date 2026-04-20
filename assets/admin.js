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
            <span class="btn-spinner" aria-hidden="true"></span>
            <span class="btn-label">Copy ảnh + tin nhắn</span>
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
    // One click writes a multi-mime ClipboardItem (image + text). Each paste
    // target picks the MIME it supports: Messenger → image; Gmail → text.
    const copyBtn = sessionCard.querySelector('[data-copy-btn]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (copyBtn.classList.contains('is-loading')) return;
        setBtnLoading(copyBtn, true);

        const text = buildMessengerMessage(row.Name || '', items);

        // Hard cap: too many items → skip montage, copy text only.
        if (items.length > 12) {
          try { await copyToClipboard(text); showToast('Quá nhiều ảnh — chỉ copy tin nhắn'); }
          catch { showToast('Không copy được — vui lòng thử lại', true); }
          finally { setBtnLoading(copyBtn, false); }
          return;
        }

        // Lazy-load product catalog; on failure, continue with empty map
        // so customer cells still render (product cells become placeholders).
        let productMap = {};
        let catalogFailed = false;
        try {
          const cat = await loadProductCatalog();
          productMap = cat.productMap;
        } catch (err) {
          console.warn('listProducts failed:', err);
          catalogFailed = true;
        }

        try {
          const { blob, failedLoads } = await buildPairedMontage(items, productMap);
          await writeImageAndText(blob, text);
          let msg = catalogFailed
            ? 'Không tải được ảnh sản phẩm — đã copy ảnh khách + tin nhắn'
            : 'Đã copy ảnh + tin nhắn';
          if (failedLoads > 0) msg += ` (${failedLoads} ảnh lỗi)`;
          showToast(msg);
        } catch (err) {
          if (err && err.kind === 'no-image-support') {
            showToast('Trình duyệt không hỗ trợ ảnh — chỉ copy được tin nhắn', true);
          } else if (err && err.kind === 'taint') {
            showToast('Không lấy được ảnh từ Drive — vui lòng thử lại', true);
          } else {
            console.error('copy failed:', err);
            try { await copyToClipboard(text); showToast('Chỉ copy được tin nhắn — ảnh lỗi', true); }
            catch { showToast('Không copy được — vui lòng thử lại', true); }
          }
        } finally {
          setBtnLoading(copyBtn, false);
        }
      });
    }

    imagesGrid.appendChild(sessionCard);
  }

  function renderProductRow(item, idx) {
    const imageId = extractGoogleDriveId(item.fileUrl || '');
    const thumbnailUrl = imageId
      ? buildDriveThumbUrl(imageId, 600)
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

  // Build a Drive thumbnail URL that serves publicly-shared files without
  // requiring auth cookies. drive.google.com/thumbnail recently started
  // failing cross-origin <img> loads (cookie / SameSite policy changes);
  // lh3.googleusercontent.com/d/<id>=w<size> is the stable replacement.
  function buildDriveThumbUrl(id, size) {
    if (!id) return '';
    return `https://lh3.googleusercontent.com/d/${id}=w${size || 600}`;
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
  // COPY ẢNH + TIN NHẮN — product×customer paired montage → clipboard
  // ============================================================

  // Lazy-memoized catalog. 5-min TTL so SKUs added mid-session surface without
  // a hard refresh; stale after that a click refetches.
  let productCatalogPromise = null;
  let productCatalogExpiresAt = 0;
  const PRODUCT_CATALOG_TTL_MS = 5 * 60 * 1000;

  // Fetch product catalog from GAS, build a SKU→product map.
  // Matches the shape couple-pix.js:loadProducts already consumes.
  function loadProductCatalog() {
    if (productCatalogPromise && Date.now() < productCatalogExpiresAt) {
      return productCatalogPromise;
    }
    productCatalogPromise = fetch(`${SCRIPT_URL}?action=listProducts`)
      .then(r => r.json())
      .then(data => {
        if (!data || data.success === false) {
          throw new Error(data && data.error ? data.error : 'listProducts failed');
        }
        const products = data.products || data || [];
        const productMap = {};
        for (const p of products) {
          // Normalize SKU key (trim + uppercase) so sheet whitespace / case drift
          // doesn't drop product matches into placeholder fallback. Keep the
          // original-case `sku` on the value for display.
          const skuRaw = String(p.sku || '').trim();
          if (!skuRaw) continue;
          const skuKey = skuRaw.toUpperCase();
          const thumbUrl = normalizeThumbUrl(p.thumbnailUrl || '', 600);
          productMap[skuKey] = {
            sku: skuRaw,
            name: p.name || '',
            _thumbId: extractGoogleDriveId(thumbUrl)
          };
        }
        productCatalogExpiresAt = Date.now() + PRODUCT_CATALOG_TTL_MS;
        return { productMap, loadedAt: Date.now() };
      })
      .catch(err => {
        // Clear memo so a later click can retry after transient failures.
        productCatalogPromise = null;
        productCatalogExpiresAt = 0;
        throw err;
      });
    return productCatalogPromise;
  }

  // Normalize a Drive share / thumbnail URL to the public thumbnail endpoint
  // (same logic as couple-pix.js:normalizeThumbUrl — duplicated rather than
  // imported because these two tools don't share a module loader).
  function normalizeThumbUrl(url, size) {
    if (!url) return '';
    const s = String(url).trim();
    if (!s) return '';
    const isGoogle = s.indexOf('drive.google.com') !== -1 || s.indexOf('docs.google.com') !== -1;
    if (!isGoogle) return s;
    const m = s.match(/[-\w]{25,}/);
    if (!m) return s;
    return buildDriveThumbUrl(m[0], size || 200);
  }

  // Load a Drive thumbnail as a CORS-enabled <img>. Rejects on error so the
  // caller can try the proxy fallback.
  function loadThumbDirect(id, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => { img.src = ''; reject(new Error('direct load failed')); };
      img.src = buildDriveThumbUrl(id, size || 600);
    });
  }

  // Fallback: fetch image bytes via GAS imageProxy (same-origin JSON response),
  // decode base64 into a Blob, and load that via a blob: URL — clean canvas.
  async function loadThumbViaProxy(id, size) {
    const r = await fetch(`${SCRIPT_URL}?action=imageProxy&id=${encodeURIComponent(id)}&size=w${size || 600}`);
    if (!r.ok) throw new Error(`proxy HTTP ${r.status}`);
    const j = await r.json();
    if (!j || !j.success || !j.base64) throw new Error((j && j.error) || 'proxy returned no image');
    const bytes = Uint8Array.from(atob(j.base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: j.mime || 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('proxy img decode failed'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Render an N-row grid of [product thumb | customer thumb] cells onto a canvas,
  // return as PNG Blob. Missing product thumb → labeled placeholder cell.
  async function buildPairedMontage(items, productMap, opts) {
    const o = Object.assign({
      cellW: 400, cellH: 400, labelH: 40, gap: 12, pad: 20,
      bg: '#ffffff', thumbSize: 600, maxItems: 12
    }, opts || {});

    if (!items.length) {
      const e = new Error('no items'); e.kind = 'empty'; throw e;
    }
    if (items.length > o.maxItems) {
      const e = new Error('too many items'); e.kind = 'cap'; e.count = items.length; throw e;
    }

    // Build pairs. Lookup uses uppercase+trim key to match productMap;
    // display labels keep the customer-submitted casing intact.
    const pairs = items.map((it, idx) => {
      const skuRaw = (it.sku || '').trim();
      const skuKey = skuRaw.toUpperCase();
      const product = skuKey ? productMap[skuKey] : null;
      return {
        sku: skuRaw || '—',
        slot: idx + 1,
        customerId: extractGoogleDriveId(it.fileUrl || ''),
        productId: product ? product._thumbId : null,
        productLabel: product ? product.sku : (skuRaw || 'Không rõ SKU'),
        customerLabel: `#${idx + 1} • ${skuRaw || '—'}`
      };
    });

    // Load each image: try direct Drive thumbnail first; on error (typically a
    // CORS/ACL mismatch for product files not shared "Anyone with link"), fall
    // back to the GAS imageProxy action which returns the bytes as base64 JSON.
    // Missing / failed everywhere → null (placeholder cell).
    const loadOne = (id) => {
      if (!id) return Promise.resolve(null);
      return loadThumbDirect(id, o.thumbSize)
        .catch(() => loadThumbViaProxy(id, o.thumbSize))
        .catch(() => null);
    };
    const loaded = await Promise.all(
      pairs.flatMap(p => [loadOne(p.productId), loadOne(p.customerId)])
    );
    // Count product/customer slots that had a Drive id but failed to load —
    // distinct from "no id" (which is a valid placeholder for unknown SKU).
    let failedLoads = 0;
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].productId && !loaded[i * 2]) failedLoads++;
      if (pairs[i].customerId && !loaded[i * 2 + 1]) failedLoads++;
    }

    const rowH = o.cellH + o.labelH;
    const cvW = o.pad * 2 + o.cellW * 2 + o.gap;
    const cvH = o.pad * 2 + rowH * pairs.length + o.gap * Math.max(0, pairs.length - 1);
    const cv = document.createElement('canvas');
    cv.width = cvW; cv.height = cvH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, cvW, cvH);

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const y = o.pad + i * (rowH + o.gap);
      const prodImg = loaded[i * 2];
      const custImg = loaded[i * 2 + 1];
      drawMontageCell(ctx, prodImg, p.productLabel, o.pad, y, o);
      drawMontageCell(ctx, custImg, p.customerLabel, o.pad + o.cellW + o.gap, y, o);
    }

    // toBlob rejects with SecurityError if canvas was tainted — surface that
    // as kind:'taint' so the caller can switch to a proxy path (Phase 4).
    const blob = await new Promise((resolve, reject) => {
      try {
        cv.toBlob(b => {
          if (b) resolve(b);
          else { const e = new Error('toBlob returned null'); e.kind = 'load'; reject(e); }
        }, 'image/png');
      } catch (err) {
        const e = new Error('canvas tainted'); e.kind = 'taint'; e.cause = err; reject(e);
      }
    });
    return { blob, failedLoads };
  }

  function drawMontageCell(ctx, img, label, x, y, o) {
    // Image area — placeholder tone if no image.
    ctx.fillStyle = img ? '#fafafa' : '#f5f5f5';
    ctx.fillRect(x, y, o.cellW, o.cellH);

    if (img) {
      // object-fit: cover — scale then center.
      const r = Math.max(o.cellW / img.naturalWidth, o.cellH / img.naturalHeight);
      const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
      ctx.drawImage(img, x + (o.cellW - dw) / 2, y + (o.cellH - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(label, x + o.cellW / 2, y + o.cellH / 2 - 12);
      ctx.font = '400 13px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText('Không có ảnh sản phẩm', x + o.cellW / 2, y + o.cellH / 2 + 16);
    }

    // Label strip — dark band under the cell with the SKU/slot label.
    const ly = y + o.cellH;
    ctx.fillStyle = '#111';
    ctx.fillRect(x, ly, o.cellW, o.labelH);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(label, x + o.cellW / 2, ly + o.labelH / 2);
  }

  // Write a multi-mime ClipboardItem. Each paste target picks the MIME it
  // handles: Messenger web takes image/png; Gmail / plain textarea takes
  // text/plain. Same clipboard, different surfaces — explain this to CS.
  async function writeImageAndText(blob, text) {
    const canMultiMime = typeof ClipboardItem === 'function'
                      && !!(navigator.clipboard && navigator.clipboard.write);
    if (!canMultiMime) {
      // Fallback: write text only so the click isn't a no-op.
      await copyToClipboard(text);
      const e = new Error('no-image-support'); e.kind = 'no-image-support'; throw e;
    }
    const item = new ClipboardItem({
      'image/png': blob,
      'text/plain': new Blob([text], { type: 'text/plain' })
    });
    await navigator.clipboard.write([item]);
  }

  // Small helper for button loading/disabled state.
  function setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle('is-loading', !!on);
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
          const thumb = id ? buildDriveThumbUrl(id, 200) : (it.fileUrl || '');
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
