/**
 * admin-voice-tab.js
 * Voice pages tab controller for admin.html.
 * Handles: list, preview (audio + image + text), publish, QR render,
 * QR download, copy URL, archive, restore, field edit.
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

  /**
   * Public page per row type, used when a listVoice row carries no `url`
   * (only publishVoice returns one; the list response has slug only).
   * Must stay in step with VOICE_PAGE_BASE_URL / COUNTER_PAGE_BASE_URL in
   * google-apps-script-voice.js.
   *
   * Null prototype: `type` is a hand-editable sheet cell, and a plain object
   * literal would resolve `constructor` or `__proto__` to a truthy inherited
   * value — producing a non-empty nonsense URL that slips past the empty-check
   * and into a printed QR.
   */
  const PAGE_BASE_BY_TYPE = Object.assign(Object.create(null), {
    voice: 'https://crushroom-form.vercel.app/voice.html?id=',
    counter: 'https://crushroom-form.vercel.app/counter.html?id='
  });

  /**
   * Types whose public page is not built yet. Publish and QR stay disabled for
   * these: the URL would be well-formed, the QR would scan, and the page would
   * 404 — and by then it is printed on a bracelet. Remove an entry the moment
   * its page ships; the row-type test asserts this list against whether the
   * page file actually exists. Empty since counter.html shipped.
   */
  const TYPES_WITHOUT_PAGE = [];

  /**
   * Client mirror of the server's EDITABLE_FIELDS_BY_TYPE whitelist
   * (google-apps-script-voice.js). The server one is authoritative — a field
   * listed here but not there is silently ignored, which shows up as a stale
   * value after Refresh. Contract: docs/love-counter-submit-contract.md.
   *
   * Maps editable field → the modal input's element id. Null prototype for the
   * same reason as PAGE_BASE_BY_TYPE: `type` is a hand-editable sheet cell.
   */
  const EDIT_FIELDS_BY_TYPE = Object.assign(Object.create(null), {
    voice: {
      text_message: 'voice-edit-text-message-voice'
    },
    counter: {
      start_date: 'voice-edit-start-date',
      male_name: 'voice-edit-male-name',
      female_name: 'voice-edit-female-name',
      title: 'voice-edit-title-field',
      heart_text: 'voice-edit-heart-text',
      audio_title: 'voice-edit-audio-title',
      text_message: 'voice-edit-text-message-counter'
    }
  });

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
  const backfillBtn   = $('voice-backfill-btn');
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
  const editModal     = $('voice-edit-modal');
  const editIdentity  = $('voice-edit-identity');
  const editErrorEl   = $('voice-edit-error');
  const editSaveBtn   = $('voice-edit-save-btn');
  const editCancelBtn = $('voice-edit-cancel-btn');
  const editGroupVoice   = $('voice-edit-fields-voice');
  const editGroupCounter = $('voice-edit-fields-counter');

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

    // Backfill peaks for legacy rows
    if (backfillBtn) backfillBtn.addEventListener('click', backfillPeaks);

    // QR modal close
    closeQrBtn.addEventListener('click', closeQrModal);
    qrModal.addEventListener('click', function (e) {
      if (e.target === qrModal) closeQrModal();
    });

    // QR download
    copyQrBtn.addEventListener('click', copyQrToClipboard);

    // Edit modal
    editCancelBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', function (e) {
      if (e.target === editModal) closeEditModal();
    });
    editSaveBtn.addEventListener('click', saveEdit);
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

    // One order can hold both products, so the count is broken down by type
    // rather than labelling everything "voice".
    const counts = { voice: 0, counter: 0 };
    groupRows.forEach(function (r) { counts[rowTypeOf(r)] = (counts[rowTypeOf(r)] || 0) + 1; });
    const parts = [];
    if (counts.voice) parts.push(counts.voice + ' voice');
    if (counts.counter) parts.push(counts.counter + ' counter');

    const header = document.createElement('div');
    header.className = 'voice-order-header';
    header.innerHTML =
      'Đơn: <strong>' + escHtml(orderId) + '</strong>' +
      '<span class="voice-order-badge">' + escHtml(parts.join(' · ') || groupRows.length + ' mục') + '</span>';
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
    // image_file_id is the sheet column; the URL fallback stays for older rows.
    const thumbId = extractDriveId(row.image_file_id || row.image_url || '');
    const thumbEl = buildThumbEl(thumbId);

    // --- Body ---
    const body = document.createElement('div');
    body.className = 'voice-card-body';

    // The sheet column is `timestamp`; listVoice returns it under that name.
    const dateStr = row.timestamp
      ? new Date(row.timestamp).toLocaleString('vi-VN')
      : '—';

    const statusBadge = '<span class="voice-status-badge ' + escHtml(row.status || 'pending') + '">'
      + escHtml(row.status || 'pending') + '</span>';

    // Two products share this list and a card carries no other visual cue as to
    // which one it is — which matters, because the QR each publishes differs.
    const type = rowTypeOf(row);
    // Show the raw value for anything unrecognised rather than defaulting the
    // label to "voice". A typo'd sheet cell would otherwise render a card that
    // claims to be a voice gift while its Copy URL silently returns nothing.
    const TYPE_LABELS = { voice: '🎙️ voice', counter: '❤️ counter' };
    const typeLabel = Object.prototype.hasOwnProperty.call(TYPE_LABELS, type)
      ? TYPE_LABELS[type]
      : '⚠️ ' + type;
    const typeBadge = '<span class="voice-type-badge voice-type-badge--' + escHtml(type) + '">'
      + escHtml(typeLabel) + '</span>';

    body.innerHTML =
      '<div class="voice-card-meta">'
        + escHtml(row.phone || '—')
        + ' · ' + escHtml(row.order_id || '—')
        + ' · ' + dateStr
        + ' · ' + statusBadge
        + ' · ' + typeBadge
      + '</div>'
      + '<div class="voice-card-text-preview">' + escHtml((row.text_message || '').slice(0, 120)) + '</div>';

    // Audio player — proxied via audioProxy to avoid CORS issues
    if (row.audio_file_id || row.audio_url) {
      const audioId = extractDriveId(row.audio_file_id || row.audio_url || '');
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
    // A row whose public page does not exist yet must not reach a QR. The URL
    // would be well-formed and the QR would scan — to a 404, after it has been
    // printed onto the product. Blocked at the button rather than trusted to
    // staff memory.
    const pageMissing = pageMissingFor_(row);

    if (pageMissing) {
      const note = document.createElement('span');
      note.className = 'voice-card-blocked-note';
      note.textContent = 'Trang ' + rowTypeOf(row) + ' chưa sẵn sàng — chưa thể publish';
      container.appendChild(note);
    }

    if (!pageMissing && (status === 'pending' || status === 'published')) {
      const publishBtn = makeBtn(
        status === 'published' ? 'Re-publish' : 'Publish',
        'btn-voice-action btn-voice-publish'
      );
      publishBtn.addEventListener('click', function () { publishRow(row, publishBtn); });
      container.appendChild(publishBtn);
    }

    if (!pageMissing && status === 'published') {
      const copyBtn = makeBtn('Copy URL', 'btn-voice-action btn-voice-copy-url');
      copyBtn.addEventListener('click', function () { copyUrl(getRowUrl(row)); });
      container.appendChild(copyBtn);

      const qrBtn = makeBtn('Show QR', 'btn-voice-action btn-voice-show-qr');
      qrBtn.addEventListener('click', function () { openQrModal(row.slug, getRowUrl(row)); });
      container.appendChild(qrBtn);
    }

    // Edit only for types whose field set is known — a typo'd sheet cell must
    // not open a modal that would then post fields for the wrong product.
    if (status !== 'archived' && Object.prototype.hasOwnProperty.call(EDIT_FIELDS_BY_TYPE, rowTypeOf(row))) {
      const editBtn = makeBtn('Edit', 'btn-voice-action btn-voice-edit');
      editBtn.addEventListener('click', function () { openEditModal(row); });
      container.appendChild(editBtn);
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

    // type is required: the server keys on (phone, order_id, type) and treats an
    // absent type as voice, so omitting it makes a counter row unreachable.
    const body = new URLSearchParams({
      action: 'publishVoice',
      phone: row.phone || '',
      order_id: row.order_id || '',
      type: rowTypeOf(row)
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
        // Pre-warm CF edge caches so the first recipient hits hot caches for both
        // metadata JSON and audio bytes. Fire-and-forget: failure is non-fatal.
        // The /voice/ route is the voice page's metadata cache; a counter slug
        // does not belong in it, and counter.html reads GAS directly.
        if (data.slug && rowTypeOf(row) === 'voice') {
          fetch(VOICE_AUDIO_PROXY_URL + '/voice/' + encodeURIComponent(data.slug), {
            method: 'GET'
          }).catch(function () { /* ignore */ });
        }
        if (row.audio_file_id) {
          fetch(VOICE_AUDIO_PROXY_URL + '/' + encodeURIComponent(row.audio_file_id), {
            method: 'GET',
            mode: 'no-cors'
          }).catch(function () { /* ignore */ });
        }
        // Re-render just this card's actions + published URL
        // Matched by string equality rather than interpolated into a selector.
        // An order_id containing a quote or backslash used to throw a
        // SyntaxError here, inside the .then — which lands in the .catch and
        // tells staff the publish FAILED when it actually succeeded, prompting
        // a pointless retry.
        const rowKey = makeRowKey(row);
        const cardEl = Array.prototype.find.call(
          listEl.querySelectorAll('[data-row-key]'),
          function (el) { return el.dataset.rowKey === rowKey; }
        );
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
      target_status: targetStatus,
      type: rowTypeOf(row)
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
  // Edit modal — field-level fixes without a customer re-submission
  // Contract: docs/love-counter-submit-contract.md → "editVoice"
  // ----------------------------------------------------------------

  let editingRow = null;
  // True while an editVoice POST is in flight. Blocks user-initiated closes:
  // GAS cold starts take seconds, and a failure landing in an already-hidden
  // modal would be invisible — staff would walk away believing the edit saved.
  let editSaving = false;

  /**
   * Normalise whatever listVoice returned for start_date into a value an
   * <input type="date"> accepts. Apostrophe-prefixed writes come back as a
   * clean 'YYYY-MM-DD', but a cell hand-edited in the Sheets UI serialises as
   * an ISO datetime (VN midnight = previous day 17:00 UTC) — resolve those in
   * VN time. Garbage prefills as empty rather than "Invalid Date".
   */
  function toDateInputValue(v) {
    const s = String(v == null ? '' : v).trim();
    // Date-ONLY strings pass through. An ISO datetime must NOT take this path:
    // slicing '2020-03-13T17:00:00.000Z' yields the previous VN day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
  }

  /**
   * Build the editVoice POST body: identity plus only the fields whose value
   * actually changed. Pure (row + form values in, plain object out) so the
   * test harness can extract it. Returns null when nothing changed — the modal
   * closes without a request.
   *
   * `type` is always included: editVoice rejects requests without it, because
   * the other actions' absent-type-means-voice default would resolve a counter
   * edit onto the wrong row.
   */
  function buildEditPayload(row, formValues) {
    const type = rowTypeOf(row);
    if (!Object.prototype.hasOwnProperty.call(EDIT_FIELDS_BY_TYPE, type)) return null;
    const payload = {
      action: 'editVoice',
      phone: row.phone || '',
      order_id: row.order_id || '',
      type: type
    };
    let changed = 0;
    Object.keys(EDIT_FIELDS_BY_TYPE[type]).forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(formValues, field)) return;
      const next = String(formValues[field] == null ? '' : formValues[field]).trim();
      const current = field === 'start_date'
        ? toDateInputValue(row.start_date)
        : String(row[field] == null ? '' : row[field]).trim();
      if (next === current) return;
      payload[field] = next;
      changed++;
    });
    return changed ? payload : null;
  }

  function openEditModal(row) {
    const type = rowTypeOf(row);
    const fieldMap = EDIT_FIELDS_BY_TYPE[type];
    if (!fieldMap) return; // gated at the button; double-checked here
    editingRow = row;
    editIdentity.textContent = (row.phone || '—') + ' · ' + (row.order_id || '—') + ' · ' + type;
    editGroupVoice.hidden = type !== 'voice';
    editGroupCounter.hidden = type !== 'counter';
    Object.keys(fieldMap).forEach(function (field) {
      const input = $(fieldMap[field]);
      if (!input) return;
      input.value = field === 'start_date'
        ? toDateInputValue(row.start_date)
        : String(row[field] == null ? '' : row[field]);
    });
    // The server rejects future dates in VN time; mirror that in the picker.
    const dateInput = $(EDIT_FIELDS_BY_TYPE.counter.start_date);
    if (dateInput) {
      dateInput.max = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    }
    hideEditError();
    editModal.style.display = 'flex';
  }

  function gatherEditValues(type) {
    const out = {};
    const fieldMap = EDIT_FIELDS_BY_TYPE[type] || {};
    Object.keys(fieldMap).forEach(function (field) {
      const input = $(fieldMap[field]);
      if (input) out[field] = input.value;
    });
    return out;
  }

  function closeEditModal() {
    if (editSaving) return;
    editModal.style.display = 'none';
    editingRow = null;
    hideEditError();
  }

  function showEditError(msg) {
    editErrorEl.textContent = msg;
    editErrorEl.hidden = false;
  }

  function hideEditError() {
    editErrorEl.hidden = true;
    editErrorEl.textContent = '';
  }

  function saveEdit() {
    if (!editingRow) return;
    const row = editingRow;
    const type = rowTypeOf(row);
    const payload = buildEditPayload(row, gatherEditValues(type));
    if (!payload) {
      closeEditModal();
      showToast('Không có thay đổi');
      return;
    }
    // Mirror of the server's required-non-empty rules, for a message clearer
    // than a round-trip error. The server enforces them regardless.
    if (payload.male_name === '' || payload.female_name === '') {
      showEditError('Tên không được để trống');
      return;
    }
    if (payload.start_date === '') {
      showEditError('Ngày bắt đầu không được để trống');
      return;
    }
    editSaving = true;
    editSaveBtn.disabled = true;
    editSaveBtn.textContent = '...';
    fetch(VOICE_GAS_URL, { method: 'POST', body: new URLSearchParams(payload) })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'editVoice failed');
        // Merge the clean form values — NOT the server's cell values, which
        // carry the apostrophe prefix — into the local row, then redraw.
        (data.updated || []).forEach(function (field) {
          if (Object.prototype.hasOwnProperty.call(payload, field)) row[field] = payload[field];
        });
        rerenderCardPreview(row);
        editSaving = false;
        closeEditModal();
        showToast(type === 'voice' && row.status === 'published'
          ? 'Đã lưu — trang public cập nhật sau tối đa ~60 phút (cache)'
          : 'Đã lưu');
      })
      .catch(function (err) {
        console.error('[voice] saveEdit error:', err);
        editSaving = false;
        showEditError('Lưu thất bại: ' + err.message);
      })
      .then(function () {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = 'Lưu';
      });
  }

  /**
   * Redraw the one card element a local row mutation affects. Matched by
   * string equality on the row key, never selector interpolation — an order_id
   * containing a quote would throw mid-then and misreport the save as failed.
   */
  function rerenderCardPreview(row) {
    const rowKey = makeRowKey(row);
    const cardEl = Array.prototype.find.call(
      listEl.querySelectorAll('[data-row-key]'),
      function (el) { return el.dataset.rowKey === rowKey; }
    );
    if (!cardEl) return;
    const preview = cardEl.querySelector('.voice-card-text-preview');
    if (preview) preview.textContent = String(row.text_message || '').slice(0, 120);
  }

  // ----------------------------------------------------------------
  // Backfill peaks — decode legacy audio in browser, post peaks back to GAS
  // ----------------------------------------------------------------

  /**
   * Process every row in the current list that:
   *   - is published (has slug)
   *   - has an audio_file_id
   *   - has no peaks yet
   * For each: stream audio via Worker proxy, decode via extractPeaks, POST updatePeaks.
   * Sequential to avoid hammering GAS / Worker. Cache stays stale up to 60 min;
   * recipients catch up on next CF cache miss.
   */
  function backfillPeaks() {
    if (typeof window.extractPeaks !== 'function') {
      showError('voice-peaks-extractor.js không load được');
      return;
    }
    var todo = rows.filter(function (r) {
      return r && r.slug && r.audio_file_id && !(r.peaks && String(r.peaks).length > 2);
    });
    if (!todo.length) {
      showToast('Không có row nào cần backfill (filter hiện tại)');
      return;
    }
    if (!confirm('Backfill ' + todo.length + ' row? Browser sẽ tải + decode từng file (có thể tốn vài MB / row).')) return;

    backfillBtn.disabled = true;
    var origLabel = backfillBtn.textContent;
    var done = 0, failed = 0;

    function next(i) {
      if (i >= todo.length) {
        backfillBtn.disabled = false;
        backfillBtn.textContent = origLabel;
        showToast('Backfill xong: ' + done + ' OK, ' + failed + ' lỗi');
        loadVoiceList();
        return;
      }
      backfillBtn.textContent = 'Backfill ' + (i + 1) + '/' + todo.length;
      processOne(todo[i])
        .then(function () { done++; })
        .catch(function (err) {
          failed++;
          console.warn('[backfill]', todo[i].slug, err);
        })
        .then(function () { next(i + 1); });
    }
    next(0);
  }

  function processOne(row) {
    var streamUrl = VOICE_AUDIO_PROXY_URL + '/' + encodeURIComponent(row.audio_file_id);
    return fetch(streamUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('audio fetch HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) { return window.extractPeaks(blob, 200); })
      .then(function (result) {
        if (!result || !result.peaks || !result.duration) throw new Error('decode returned null');
        var body = new URLSearchParams({
          action: 'updatePeaks',
          slug: row.slug,
          peaks: JSON.stringify(result.peaks),
          audio_duration: String(result.duration)
        });
        return fetch(VOICE_GAS_URL, { method: 'POST', body: body }).then(function (r) {
          if (!r.ok) throw new Error('updatePeaks HTTP ' + r.status);
          return r.json();
        });
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'updatePeaks failed');
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
        // The voice GAS audioProxy returns { ok, mime, data } — not `base64`.
        // (The photo GAS imageProxy in admin.js does use `base64`; different endpoint.)
        if (!j || !j.ok || !j.data) throw new Error((j && j.error) || 'audioProxy: no data');
        const bytes = Uint8Array.from(atob(j.data), function (c) { return c.charCodeAt(0); });
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

  /**
   * Resolve a row's public URL: prefer the one publishVoice returned, otherwise
   * rebuild it from slug + type.
   *
   * The type matters because this URL gets printed onto a physical product. A
   * single hardcoded base looked correct right after publishing — publishRow
   * stores the server's url — and then silently reverted to the voice page on
   * the next reload, when rows come back from listVoice without a url.
   */
  function getRowUrl(row) {
    if (row.url) return row.url;
    if (!row.slug) return '';
    const base = PAGE_BASE_BY_TYPE[rowTypeOf(row)];
    // Anything not explicitly mapped resolves to no URL rather than a guessed
    // one. Failing closed is the only safe direction when the output is printed.
    return typeof base === 'string' && base ? base + row.slug : '';
  }

  /** True when this row's public page has not shipped yet. */
  function pageMissingFor_(row) {
    return TYPES_WITHOUT_PAGE.indexOf(rowTypeOf(row)) !== -1;
  }

  function openQrModal(slug, url) {
    qrSlug = slug || '';
    // Deliberately no fallback reconstruction here: callers already resolve the
    // URL through getRowUrl, and guessing a base at this point is how a QR ends
    // up pointing at the wrong page. No URL means no QR.
    qrUrl = url || '';
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

  /**
   * Row type, mirroring the server's blank-means-voice rule so rows written
   * before the `type` column existed keep resolving correctly.
   */
  function rowTypeOf(row) {
    const t = String(row && row.type ? row.type : '').trim().toLowerCase();
    return t || 'voice';
  }

  /**
   * DOM identity for a card. Type is part of it for the same reason it is part
   * of the server-side key: one customer can buy a voice gift and a love
   * counter on ONE order, and without type both cards share a key — so
   * publishing the counter would rewrite the voice card's badge and URL.
   */
  function makeRowKey(row) {
    return (row.phone || '') + '|' + (row.order_id || '') + '|' + rowTypeOf(row);
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
