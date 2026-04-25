/**
 * admin-voice-tab.js
 * Voice pages tab controller for admin.html.
 * Handles: list, preview (audio + image + text), publish, QR render,
 * QR download, copy URL, archive, restore.
 *
 * Depends on: qr-code-styling CDN (window.QRCodeStyling) loaded before this file.
 * Exposes: window.voiceTabActivated (called by admin.js tab switcher on activate).
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------

  /** Separate GAS deployment for Voice features. */
  const VOICE_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

  /** CF Worker that re-streams Drive audio with CORS + edge cache. */
  const VOICE_AUDIO_PROXY_URL = 'https://voice-proxy.crushroom.workers.dev';

  /** localStorage key for filter persistence. */
  const FILTER_KEY = 'voicePagesFilter';

  /** Duration (ms) before inline error auto-dismisses. */
  const ERROR_DISMISS_MS = 4000;

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------

  let currentFilter = localStorage.getItem(FILTER_KEY) || 'pending';
  let rows = [];           // raw rows from last GAS response
  let qrSlug = '';         // slug shown in open QR modal
  let qrUrl = '';          // URL shown in open QR modal
  let hasLoaded = false;   // whether tab has been loaded at least once

  // ----------------------------------------------------------------
  // DOM references (resolved once after DOMContentLoaded)
  // ----------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const filterBar     = $('voice-filter-bar');
  const refreshBtn    = $('voice-refresh-btn');
  const listEl        = $('voice-list');
  const loadingEl     = $('voice-loading');
  const errorEl       = $('voice-error');
  const emptyEl       = $('voice-empty');
  const qrModal       = $('voice-qr-modal');
  const qrContainer   = $('voice-qr-container');
  const qrModalSlug   = $('voice-modal-slug');
  const qrModalUrl    = $('voice-modal-url');
  const copyQrBtn = $('voice-copy-qr-btn');
  const closeQrBtn    = $('voice-close-qr-btn');
  const toastEl       = $('toast');

  // ----------------------------------------------------------------
  // Boot — called from admin.js after DOMContentLoaded
  // ----------------------------------------------------------------

  /** Wire up events. Called once. */
  function boot() {
    // Filter buttons
    filterBar.addEventListener('click', function (e) {
      const btn = e.target.closest('.voice-filter-btn');
      if (!btn) return;
      const status = btn.dataset.status;
      if (status === currentFilter) return;
      currentFilter = status;
      localStorage.setItem(FILTER_KEY, status);
      // Update active button UI
      filterBar.querySelectorAll('.voice-filter-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.status === status);
      });
      loadVoiceList();
    });

    // Restore saved filter button visual
    filterBar.querySelectorAll('.voice-filter-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.status === currentFilter);
    });

    // Refresh button
    refreshBtn.addEventListener('click', loadVoiceList);

    // QR modal close
    closeQrBtn.addEventListener('click', closeQrModal);
    qrModal.addEventListener('click', function (e) {
      if (e.target === qrModal) closeQrModal();
    });

    // QR download
    copyQrBtn.addEventListener('click', copyQrToClipboard);
  }

  // ----------------------------------------------------------------
  // Exposed hook: tab switcher calls this when voice tab activates
  // ----------------------------------------------------------------

  window.voiceTabActivated = function () {
    if (!hasLoaded) {
      loadVoiceList();
    }
  };

  // ----------------------------------------------------------------
  // Data fetching
  // ----------------------------------------------------------------

  function loadVoiceList() {
    hasLoaded = true;
    showLoading(true);
    hideError();
    listEl.innerHTML = '';
    emptyEl.style.display = 'none';

    const url = VOICE_GAS_URL + '?action=listVoice&status=' + encodeURIComponent(currentFilter);
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        showLoading(false);
        if (!data.ok) {
          showError(data.error || 'GAS trả về lỗi không xác định');
          return;
        }
        rows = Array.isArray(data.rows) ? data.rows : [];
        renderVoiceList(rows);
      })
      .catch(function (err) {
        showLoading(false);
        console.error('[voice] loadVoiceList error:', err);
        showError('Không kết nối được — ' + err.message);
      });
  }

  // ----------------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------------

  function renderVoiceList(rowList) {
    listEl.innerHTML = '';

    if (!rowList.length) {
      emptyEl.style.display = 'block';
      return;
    }

    // Group by order_id
    const groupMap = new Map();
    rowList.forEach(function (row) {
      const key = row.order_id || '(no order)';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(row);
    });

    groupMap.forEach(function (groupRows, orderId) {
      listEl.appendChild(buildOrderGroup(orderId, groupRows));
    });
  }

  function buildOrderGroup(orderId, groupRows) {
    const group = document.createElement('div');
    group.className = 'voice-order-group';

    const header = document.createElement('div');
    header.className = 'voice-order-header';
    header.innerHTML =
      'Đơn: <strong>' + escHtml(orderId) + '</strong>' +
      '<span class="voice-order-badge">' + groupRows.length + ' voice</span>';
    group.appendChild(header);

    groupRows.forEach(function (row) {
      group.appendChild(buildVoiceCard(row));
    });

    return group;
  }

  function buildVoiceCard(row) {
    const card = document.createElement('div');
    card.className = 'voice-card';
    card.dataset.rowKey = makeRowKey(row);

    // --- Thumbnail ---
    const thumbId = extractDriveId(row.image_id || row.image_url || '');
    const thumbEl = buildThumbEl(thumbId);

    // --- Body ---
    const body = document.createElement('div');
    body.className = 'voice-card-body';

    const dateStr = row.uploaded_at
      ? new Date(row.uploaded_at).toLocaleString('vi-VN')
      : '—';

    const statusBadge = '<span class="voice-status-badge ' + escHtml(row.status || 'pending') + '">'
      + escHtml(row.status || 'pending') + '</span>';

    body.innerHTML =
      '<div class="voice-card-meta">'
        + escHtml(row.phone || '—')
        + ' · ' + escHtml(row.order_id || '—')
        + ' · ' + dateStr
        + ' · ' + statusBadge
      + '</div>'
      + '<div class="voice-card-text-preview">' + escHtml((row.message_text || '').slice(0, 120)) + '</div>';

    // Audio player — proxied via audioProxy to avoid CORS issues
    if (row.audio_id || row.audio_url) {
      const audioId = extractDriveId(row.audio_id || row.audio_url || '');
      if (audioId) {
        const audioWrap = document.createElement('div');
        audioWrap.className = 'voice-card-audio';
        // We load via audioProxy same as voice-page.js — returns blob for native player
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        // Lazy-load blob URL on first play to avoid hammering GAS on list render
        let audioLoaded = false;
        audio.addEventListener('play', function onFirstPlay() {
          if (audioLoaded) return;
          audioLoaded = true;
          audio.removeEventListener('play', onFirstPlay);
          fetchAudioBlob(audioId).then(function (blobUrl) {
            const currentTime = audio.currentTime;
            audio.src = blobUrl;
            audio.currentTime = currentTime;
            audio.play().catch(function () {});
          }).catch(function (err) {
            console.warn('[voice] audio proxy failed:', err);
            showToast('Không tải được audio', true);
          });
        }, { once: false });
        audioWrap.appendChild(audio);
        body.appendChild(audioWrap);
      }
    }

    // Published URL display — constructed from slug if list response didn't return url
    if (row.status === 'published') {
      const publishedUrl = getRowUrl(row);
      if (publishedUrl) {
        const urlDiv = document.createElement('div');
        urlDiv.className = 'voice-card-published-url';
        urlDiv.textContent = publishedUrl;
        body.appendChild(urlDiv);
      }
    }

    // --- Actions ---
    const actions = document.createElement('div');
    actions.className = 'voice-card-actions';
    buildActionButtons(actions, row);

    card.appendChild(thumbEl);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  function buildThumbEl(driveId) {
    if (driveId) {
      const img = document.createElement('img');
      img.className = 'voice-card-thumb';
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      img.alt = 'thumbnail';
      img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveId) + '&sz=w200';
      img.onerror = function () {
        img.style.display = 'none';
        const ph = buildThumbPlaceholder();
        img.parentNode.insertBefore(ph, img);
      };
      return img;
    }
    return buildThumbPlaceholder();
  }

  function buildThumbPlaceholder() {
    const div = document.createElement('div');
    div.className = 'voice-card-thumb-placeholder';
    div.textContent = '🎙️';
    return div;
  }

  function buildActionButtons(container, row) {
    container.innerHTML = '';
    const status = row.status || 'pending';

    if (status === 'pending' || status === 'published') {
      const publishBtn = makeBtn(
        status === 'published' ? 'Re-publish' : 'Publish',
        'btn-voice-action btn-voice-publish'
      );
      publishBtn.addEventListener('click', function () { publishRow(row, publishBtn); });
      container.appendChild(publishBtn);
    }

    if (status === 'published') {
      const copyBtn = makeBtn('Copy URL', 'btn-voice-action btn-voice-copy-url');
      copyBtn.addEventListener('click', function () { copyUrl(getRowUrl(row)); });
      container.appendChild(copyBtn);

      const qrBtn = makeBtn('Show QR', 'btn-voice-action btn-voice-show-qr');
      qrBtn.addEventListener('click', function () { openQrModal(row.slug, getRowUrl(row)); });
      container.appendChild(qrBtn);
    }

    if (status !== 'archived') {
      const archBtn = makeBtn('Archive', 'btn-voice-action btn-voice-archive');
      archBtn.addEventListener('click', function () { archiveRow(row, archBtn, 'archived'); });
      container.appendChild(archBtn);
    }

    if (status === 'archived') {
      const restoreBtn = makeBtn('Restore', 'btn-voice-action btn-voice-restore');
      restoreBtn.addEventListener('click', function () { archiveRow(row, restoreBtn, 'pending'); });
      container.appendChild(restoreBtn);
    }
  }

  // ----------------------------------------------------------------
  // GAS actions
  // ----------------------------------------------------------------

  function publishRow(row, btn) {
    btn.disabled = true;
    btn.textContent = '...';

    const body = new URLSearchParams({
      action: 'publishVoice',
      phone: row.phone || '',
      order_id: row.order_id || ''
    });

    fetch(VOICE_GAS_URL, { method: 'POST', body: body })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'publishVoice failed');
        // Update local row state
        row.status = 'published';
        row.slug = data.slug;
        row.url = data.url;
        // Pre-warm CF edge cache so the first recipient hits a hot cache.
        // Fire-and-forget: any failure is non-fatal (recipient just hits cold cache).
        if (row.audio_file_id) {
          fetch(VOICE_AUDIO_PROXY_URL + '/' + encodeURIComponent(row.audio_file_id), {
            method: 'GET',
            mode: 'no-cors'
          }).catch(function () { /* ignore */ });
        }
        // Re-render just this card's actions + published URL
        const cardEl = listEl.querySelector('[data-row-key="' + makeRowKey(row) + '"]');
        if (cardEl) {
          const actionsEl = cardEl.querySelector('.voice-card-actions');
          buildActionButtons(actionsEl, row);
          // Update / add published URL in body
          let urlDiv = cardEl.querySelector('.voice-card-published-url');
          if (!urlDiv) {
            urlDiv = document.createElement('div');
            urlDiv.className = 'voice-card-published-url';
            cardEl.querySelector('.voice-card-body').appendChild(urlDiv);
          }
          urlDiv.textContent = data.url;
          // Update status badge
          const badge = cardEl.querySelector('.voice-status-badge');
          if (badge) {
            badge.className = 'voice-status-badge published';
            badge.textContent = 'published';
          }
        }
        const wasRepublish = btn.dataset.repub === '1';
        showToast(wasRepublish ? 'Đã cập nhật (slug giữ nguyên)' : 'Đã publish thành công!');
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Publish';
        console.error('[voice] publishRow error:', err);
        showError('Publish thất bại: ' + err.message);
      });
  }

  function archiveRow(row, btn, targetStatus) {
    const actionLabel = targetStatus === 'pending' ? 'restore' : 'archive';
    if (!confirm('Xác nhận ' + actionLabel + ' row này?')) return;

    btn.disabled = true;

    const body = new URLSearchParams({
      action: 'archiveVoice',
      phone: row.phone || '',
      order_id: row.order_id || '',
      target_status: targetStatus
    });

    fetch(VOICE_GAS_URL, { method: 'POST', body: body })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'archiveVoice failed');
        showToast(targetStatus === 'pending' ? 'Đã restore về Pending' : 'Đã archive');
        // Reload list so the row disappears / reappears in correct filter
        loadVoiceList();
      })
      .catch(function (err) {
        btn.disabled = false;
        console.error('[voice] archiveRow error:', err);
        showError('Thao tác thất bại: ' + err.message);
      });
  }

  // ----------------------------------------------------------------
  // Audio proxy — lazy-load blob URL (same pattern as voice-page.js)
  // ----------------------------------------------------------------

  function fetchAudioBlob(fileId) {
    return fetch(VOICE_GAS_URL + '?action=audioProxy&id=' + encodeURIComponent(fileId))
      .then(function (r) {
        if (!r.ok) throw new Error('audioProxy HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.ok || !j.base64) throw new Error((j && j.error) || 'audioProxy: no data');
        const bytes = Uint8Array.from(atob(j.base64), function (c) { return c.charCodeAt(0); });
        const blob = new Blob([bytes], { type: j.mime || 'audio/mpeg' });
        return URL.createObjectURL(blob);
      });
  }

  // ----------------------------------------------------------------
  // QR modal
  // ----------------------------------------------------------------

  // qr-code-styling instance; ECC hardcoded 'H' (highest, 30% tolerance —
  // best for print where smudges/lighting vary).
  let qrInstance = null;

  function renderQr() {
    qrContainer.innerHTML = '';
    if (typeof QRCodeStyling === 'undefined') {
      qrContainer.textContent = 'Thư viện QR chưa tải được';
      console.error('[voice] QRCodeStyling global missing');
      return;
    }
    try {
      qrInstance = new QRCodeStyling({
        width: 240,
        height: 240,
        type: 'canvas',
        data: qrUrl,
        qrOptions: { errorCorrectionLevel: 'H' },
        // Classic black square QR — maximum scanner compatibility.
        dotsOptions: { type: 'square', color: '#000000' },
        cornersSquareOptions: { type: 'square', color: '#000000' },
        cornersDotOptions: { type: 'square', color: '#000000' },
        backgroundOptions: { color: '#ffffff' }
      });
      qrInstance.append(qrContainer);
    } catch (e) {
      qrContainer.textContent = 'QR render failed: ' + e.message;
      console.error('[voice] QRCodeStyling error:', e);
    }
  }

  // Public base URL for voice pages — used when listVoice rows don't carry `url`
  // (only publishVoice returns it; list response has slug only).
  const VOICE_PAGE_BASE = 'https://crushroom-form.vercel.app/voice.html?id=';

  // Resolve a row's public URL: prefer the one returned by publishVoice; fall
  // back to constructing it from slug (needed when row came from listVoice).
  function getRowUrl(row) {
    return row.url || (row.slug ? VOICE_PAGE_BASE + row.slug : '');
  }

  function openQrModal(slug, url) {
    qrSlug = slug || '';
    qrUrl = url || (slug ? VOICE_PAGE_BASE + slug : '');
    if (!qrUrl) {
      showToast('Không có URL để tạo QR', true);
      return;
    }
    qrModalSlug.textContent = 'slug: ' + qrSlug;
    qrModalUrl.textContent = qrUrl;
    // Modal must be visible before render — qr-code-styling measures the
    // container's layout dimensions synchronously on append().
    qrModal.style.display = 'flex';
    renderQr();
  }

  function closeQrModal() {
    qrModal.style.display = 'none';
    qrContainer.innerHTML = '';
    qrInstance = null;
    qrSlug = '';
    qrUrl = '';
  }

  /**
   * Copy QR canvas to clipboard as PNG image (paste into Messenger, chat apps, etc).
   * Requires HTTPS (or localhost) + secure context — browsers block clipboard.write
   * over plain http origins.
   */
  function copyQrToClipboard() {
    const canvas = qrContainer.querySelector('canvas');
    if (!canvas) { showToast('QR chưa render được', true); return; }

    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast('Trình duyệt không hỗ trợ Copy QR', true);
      return;
    }

    canvas.toBlob(function (blob) {
      if (!blob) { showToast('Không tạo được ảnh QR', true); return; }
      navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]).then(function () {
        showToast('Đã copy QR — paste vào chat/zalo');
      }).catch(function (err) {
        console.error('[voice] clipboard.write failed:', err);
        showToast('Copy thất bại: ' + err.message, true);
      });
    }, 'image/png');
  }

  // ----------------------------------------------------------------
  // Copy URL
  // ----------------------------------------------------------------

  function copyUrl(url) {
    if (!url) { showToast('Không có URL', true); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { showToast('URL đã copy'); })
        .catch(function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(ok ? 'URL đã copy' : 'Không copy được URL', !ok);
    } catch (e) {
      showToast('Không copy được URL', true);
    }
  }

  // ----------------------------------------------------------------
  // UI helpers
  // ----------------------------------------------------------------

  let errorTimer = null;

  function showError(msg) {
    if (errorTimer) clearTimeout(errorTimer);
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    errorEl.onclick = function () { hideError(); };
    errorTimer = setTimeout(hideError, ERROR_DISMISS_MS);
  }

  function hideError() {
    if (errorTimer) clearTimeout(errorTimer);
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  function showLoading(on) {
    loadingEl.style.display = on ? 'block' : 'none';
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
    }, isError ? 4000 : 2400);
  }

  function makeBtn(label, cls) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.textContent = label;
    return btn;
  }

  function makeRowKey(row) {
    return (row.phone || '') + '|' + (row.order_id || '');
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function extractDriveId(urlOrId) {
    if (!urlOrId) return null;
    // If it looks like a plain file ID (no slashes) return as-is
    if (!/[/.]/.test(String(urlOrId))) return String(urlOrId);
    const m = String(urlOrId).match(/[-\w]{25,}/);
    return m ? m[0] : null;
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------

  // Boot after DOM is ready (this script loads after admin.js, DOM is ready)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Auto-load if the page opened directly with #voice hash
  if ((location.hash || '').replace('#', '') === 'voice') {
    window.voiceTabActivated = function () {
      if (!hasLoaded) loadVoiceList();
    };
    // Trigger immediately since tab is already active via wireTabs()
    // wireTabs() calls window.voiceTabActivated() if set, but it may run
    // before this module boots — so also call directly:
    setTimeout(function () {
      if (!hasLoaded) loadVoiceList();
    }, 0);
  }

}());
