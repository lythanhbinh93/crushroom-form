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

  /**
   * localStorage prefix for the instant-paint list cache (one entry per
   * status filter). GAS listVoice takes 3s on a good day and 8-18s on
   * spikes, so the tab renders the last-seen list immediately and swaps in
   * the fresh response when it lands.
   */
  const LIST_CACHE_PREFIX = 'voiceListCache:';
  /** Ignore an instant-paint entry older than this — stale enough to mislead. */
  const LIST_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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
    voice: 'https://qr.crushroom.vn/voice?id=',
    counter: 'https://qr.crushroom.vn/counter?id=',
    // The simple gift types share one public page.
    link: 'https://qr.crushroom.vn/gift?id=',
    image: 'https://qr.crushroom.vn/gift?id=',
    video: 'https://qr.crushroom.vn/gift?id='
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
    },
    link: {
      media_link: 'voice-edit-media-link',
      text_message: 'voice-edit-text-message-link'
    },
    image: {
      text_message: 'voice-edit-text-message-image'
    },
    video: {
      media_link: 'voice-edit-media-link-video',
      text_message: 'voice-edit-text-message-video'
    }
  });

  /**
   * Client mirror of the server's MEDIA_SLOTS_BY_TYPE (replaceMedia action),
   * plus the crop geometry for each image slot — copied VERBATIM from the
   * customer forms (voice-upload.js / love-counter-upload.js): the admin must
   * never produce a file the public page renders differently than a customer
   * upload. tests/admin-media-slots.test.js asserts both the slot names
   * (against the GAS map) and the geometries (against the form sources).
   */
  const MEDIA_SLOTS_BY_TYPE = Object.assign(Object.create(null), {
    voice: {
      image: {
        label: 'Đổi ảnh', kind: 'image',
        viewport: { width: 280, height: 280, type: 'square' },
        boundary: { width: 300, height: 380 },
        output: { width: 400, height: 400 }, quality: 0.85
      },
      audio: { label: 'Đổi audio', kind: 'audio' }
    },
    counter: {
      male: {
        label: 'Đổi ảnh nam', kind: 'image',
        viewport: { width: 240, height: 240, type: 'circle' },
        boundary: { width: 280, height: 340 },
        output: { width: 400, height: 400 }, quality: 0.85
      },
      female: {
        label: 'Đổi ảnh nữ', kind: 'image',
        viewport: { width: 240, height: 240, type: 'circle' },
        boundary: { width: 280, height: 340 },
        output: { width: 400, height: 400 }, quality: 0.85
      },
      bg: {
        label: 'Đổi ảnh nền', kind: 'image',
        viewport: { width: 171, height: 304, type: 'square' },
        boundary: { width: 300, height: 340 },
        output: { width: 675, height: 1200 }, quality: 0.82
      },
      audio: { label: 'Đổi audio', kind: 'audio', removable: true }
    },
    // Same square geometry as voice.image — a staff replacement must render
    // exactly like a customer upload on gift.html.
    link: {
      image: {
        label: 'Đổi ảnh', kind: 'image', removable: true,
        viewport: { width: 280, height: 280, type: 'square' },
        boundary: { width: 300, height: 380 },
        output: { width: 400, height: 400 }, quality: 0.85
      }
    },
    image: {
      image: {
        label: 'Đổi ảnh', kind: 'image',
        viewport: { width: 280, height: 280, type: 'square' },
        boundary: { width: 300, height: 380 },
        output: { width: 400, height: 400 }, quality: 0.85
      }
    },
    video: {
      image: {
        label: 'Đổi ảnh', kind: 'image', removable: true,
        viewport: { width: 280, height: 280, type: 'square' },
        boundary: { width: 300, height: 380 },
        output: { width: 400, height: 400 }, quality: 0.85
      }
    }
  });

  /** Same cap as voice-upload.js — base64 inflates ~47MB vs the GAS 50MB doPost cap. */
  const MAX_AUDIO_MB = 35;

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------

  let currentFilter = localStorage.getItem(FILTER_KEY) || 'pending';
  // Session-only on purpose: a persisted search that silently hides rows on
  // the next visit is a support trap, unlike the sticky status filter.
  let searchQuery = '';
  let rows = [];           // raw rows from last GAS response
  let qrSlug = '';         // slug shown in open QR modal
  let qrUrl = '';          // URL shown in open QR modal
  let hasLoaded = false;   // whether tab has been loaded at least once
  // Monotonic id of the newest loadVoiceList call. A GAS spike can hold an
  // old request in flight across a filter switch; without this guard its late
  // callbacks would render the wrong filter's rows and persist them under the
  // new filter's cache key.
  let loadSeq = 0;

  // ----------------------------------------------------------------
  // DOM references (resolved once after DOMContentLoaded)
  // ----------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const filterBar     = $('voice-filter-bar');
  const searchInput   = $('voice-search');
  const searchClear   = $('voice-search-clear');
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
  // One field-group container per editable type: voice-edit-fields-<type>.
  const editGroupsByType = {};
  Object.keys(EDIT_FIELDS_BY_TYPE).forEach(function (t) {
    editGroupsByType[t] = $('voice-edit-fields-' + t);
  });
  const mediaButtonsEl   = $('voice-edit-media-buttons');
  const mediaImageInput  = $('voice-edit-image-input');
  const mediaAudioInput  = $('voice-edit-audio-input');

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

    // Live search — pure client-side over the loaded rows; every existing
    // renderVoiceList(rows) call re-applies it, so the query survives
    // refreshes and status switches for free.
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value;
      searchClear.hidden = !searchQuery.trim();
      renderVoiceList(rows);
    });
    searchClear.addEventListener('click', function () {
      searchQuery = '';
      searchInput.value = '';
      searchClear.hidden = true;
      renderVoiceList(rows);
      searchInput.focus();
    });

    // Refresh button — explicit refresh means "show me the truth", so it
    // bypasses the edge cache too.
    refreshBtn.addEventListener('click', function () { loadVoiceList({ fresh: true }); });

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

    // Media replacement file inputs (buttons are rendered per row type)
    mediaImageInput.addEventListener('change', function () {
      const file = mediaImageInput.files && mediaImageInput.files[0];
      mediaImageInput.value = '';
      if (file && pendingMedia) openAdminCropModal(file, pendingMedia);
    });
    mediaAudioInput.addEventListener('change', function () {
      const file = mediaAudioInput.files && mediaAudioInput.files[0];
      mediaAudioInput.value = '';
      if (file && pendingMedia) replaceAudio(file, pendingMedia);
    });
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

  /**
   * opts.fresh: bypass every cache layer (worker edge + instant paint) and
   * repopulate them — used by the Refresh button and after mutations, so an
   * operator never sees a stale list for a change they just made.
   */
  function loadVoiceList(opts) {
    const fresh = !!(opts && opts.fresh);
    // Capture the filter this request is FOR: the callbacks below may land
    // after the operator has switched filters, and must never mix state.
    const requested = currentFilter;
    const seq = ++loadSeq;
    hasLoaded = true;
    hideError();

    // Instant paint: render the last-seen list now, replace it when the
    // network answers. The big spinner only appears on a first-ever load.
    let painted = false;
    if (!fresh) {
      const cached = readListCache(requested);
      if (cached) {
        rows = cached;
        renderVoiceList(rows);
        painted = true;
      }
    }
    if (painted) {
      setRefreshing(true);
    } else {
      showLoading(true);
      listEl.innerHTML = '';
      emptyEl.style.display = 'none';
    }

    fetchList(requested, fresh)
      .then(function (data) {
        if (seq !== loadSeq) return; // superseded by a newer load
        showLoading(false);
        setRefreshing(false);
        if (!data.ok) {
          // A painted (cached) list beats an error screen — but say the data
          // on screen may be old, or the operator acts on a stale list.
          if (painted) showToast('Không làm mới được — đang hiển thị dữ liệu cũ', true);
          else showError(data.error || 'GAS trả về lỗi không xác định');
          return;
        }
        rows = Array.isArray(data.rows) ? data.rows : [];
        writeListCache(requested, rows);
        renderVoiceList(rows);
      })
      .catch(function (err) {
        if (seq !== loadSeq) return; // superseded by a newer load
        showLoading(false);
        setRefreshing(false);
        console.error('[voice] loadVoiceList error:', err);
        if (painted) showToast('Không làm mới được — đang hiển thị dữ liệu cũ', true);
        else showError('Không kết nối được — ' + err.message);
      });
  }

  /**
   * Worker-first list fetch with a direct-GAS fallback, so the tab keeps
   * working (at today's speed) until the worker with /admin/list is
   * deployed — and through any worker outage after.
   */
  function fetchList(statusFilter, fresh) {
    const workerUrl = VOICE_AUDIO_PROXY_URL + '/admin/list?status=' +
      encodeURIComponent(statusFilter) + (fresh ? '&fresh=1' : '');
    return fetch(workerUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('worker HTTP ' + r.status);
        return r.json();
      })
      .catch(function () {
        const url = VOICE_GAS_URL + '?action=listVoice&status=' + encodeURIComponent(statusFilter);
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
      });
  }

  function readListCache(statusFilter) {
    try {
      const raw = localStorage.getItem(LIST_CACHE_PREFIX + statusFilter);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !Array.isArray(entry.rows)) return null;
      if (Date.now() - (entry.ts || 0) > LIST_CACHE_MAX_AGE_MS) return null;
      return entry.rows;
    } catch (e) { return null; }
  }

  function writeListCache(statusFilter, rowList) {
    try {
      localStorage.setItem(LIST_CACHE_PREFIX + statusFilter,
        JSON.stringify({ ts: Date.now(), rows: rowList }));
    } catch (e) { /* quota/private mode — instant paint just won't happen */ }
  }

  /**
   * After a mutation that edits `rows` in place (publish, edit, replaceMedia):
   * persist the updated rows for the next instant paint and re-warm the
   * worker's edge cache in the background so other operators see the change.
   */
  function bustListCache() {
    writeListCache(currentFilter, rows);
    fetch(VOICE_AUDIO_PROXY_URL + '/admin/list?status=' +
      encodeURIComponent(currentFilter) + '&fresh=1').catch(function () { /* ignore */ });
  }

  function setRefreshing(on) {
    refreshBtn.disabled = on;
    refreshBtn.textContent = on ? '↺ Đang làm mới…' : '↺ Refresh';
  }

  // ----------------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------------

  function renderVoiceList(rowList) {
    listEl.innerHTML = '';

    const visible = filterVoiceRows(rowList, searchQuery);
    if (!visible.length) {
      // Distinguish "nothing in this filter" from "search matched nothing".
      // The query is user input — textContent only, never markup.
      emptyEl.querySelector('p').textContent =
        rowList.length && searchQuery.trim()
          ? 'Không có kết quả cho "' + searchQuery.trim() + '"'
          : 'Không có voice page nào trong mục này.';
      emptyEl.style.display = 'block';
      return;
    }
    // Re-renders triggered by typing never pass loadVoiceList, so the empty
    // state must be cleared here, not only by the load path.
    emptyEl.style.display = 'none';

    // Group by order_id
    const groupMap = new Map();
    visible.forEach(function (row) {
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
    const TYPE_LABELS = { voice: '🎙️ voice', counter: '❤️ counter', link: '🎵 link', image: '🖼️ image', video: '🎬 video' };
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

  /**
   * Overwrite the worker's per-slug metadata cache entry after a mutation.
   * fresh=1 makes the worker refetch GAS and re-put — a plain warm GET is a
   * cache HIT and leaves a re-published/edited row stale for the full edge
   * TTL (~60min). Counter rows are skipped: counter.html reads GAS directly.
   * Fire-and-forget: the sheet is already correct, other colos age out.
   */
  function refreshMetaCache(row) {
    if (!row || !row.slug) return;
    const t = rowTypeOf(row);
    if (t === 'counter') return;
    const base = t === 'voice' ? '/voice/' : '/gift/';
    fetch(VOICE_AUDIO_PROXY_URL + base + encodeURIComponent(row.slug) + '?fresh=1', {
      method: 'GET'
    }).catch(function () { /* ignore */ });
  }

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
        bustListCache();
        // Refresh the edge metadata cache so the recipient sees the
        // just-published data: on a re-publish the entry already exists, so
        // this must be the fresh=1 overwrite — a plain warm GET would HIT
        // and change nothing. Doubles as the first-publish warm for every
        // proxied type (audio bytes warm separately below).
        refreshMetaCache(row);
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
        loadVoiceList({ fresh: true });
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
    Object.keys(editGroupsByType).forEach(function (t) {
      if (editGroupsByType[t]) editGroupsByType[t].hidden = t !== type;
    });
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
    renderMediaButtons(row);
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
    pendingMedia = null;
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
        bustListCache();
        refreshMetaCache(row);
        editSaving = false;
        closeEditModal();
        // fresh=1 overwrote this colo's edge entry; a phone that loaded the
        // page in the last 10 minutes may still hold the browser copy.
        showToast(type !== 'counter' && row.status === 'published'
          ? 'Đã lưu — trang public cập nhật ngay (F5 nếu vừa mở trong ~10 phút)'
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

  // ----------------------------------------------------------------
  // Media replacement — crop/compress in the browser, POST replaceMedia
  // Contract: docs/love-counter-submit-contract.md → "replaceMedia"
  // ----------------------------------------------------------------

  // The slot a just-clicked media button refers to while the (async) file
  // picker is open: { row, slot, spec, btn }.
  let pendingMedia = null;

  function renderMediaButtons(row) {
    mediaButtonsEl.innerHTML = '';
    const slots = MEDIA_SLOTS_BY_TYPE[rowTypeOf(row)];
    if (!slots) return;
    Object.keys(slots).forEach(function (slot) {
      const spec = slots[slot];
      const btn = makeBtn(spec.label, 'btn-voice-action btn-voice-media');
      btn.addEventListener('click', function () {
        pendingMedia = { row: row, slot: slot, spec: spec, btn: btn };
        (spec.kind === 'audio' ? mediaAudioInput : mediaImageInput).click();
      });
      mediaButtonsEl.appendChild(btn);
      // Removable slots today are counter.audio and the link/video decoration
      // photo — the image ones all live in the row-thumbnail column pair, so
      // presence can be checked by kind without carrying field names here.
      const slotFilled = spec.kind === 'audio'
        ? (row.audio_file_id || row.audio_url)
        : (row.image_file_id || row.image_url);
      if (spec.removable && slotFilled) {
        const rmBtn = makeBtn(spec.kind === 'audio' ? 'Xoá audio' : 'Xoá ảnh',
          'btn-voice-action btn-voice-media-remove');
        rmBtn.addEventListener('click', function () { removeMedia(row, slot, rmBtn); });
        mediaButtonsEl.appendChild(rmBtn);
      }
    });
  }

  /**
   * Crop modal for a media slot, using the SAME Croppie build and geometry as
   * the customer forms. Kept separate from the forms' openCropModal — that one
   * is wired to form dropzones/previews; this one resolves to a base64 upload.
   */
  function openAdminCropModal(file, ctx) {
    const overlay = document.createElement('div');
    overlay.className = 'voice-media-crop-overlay';
    const box = document.createElement('div');
    box.className = 'voice-media-crop-box';
    const cropArea = document.createElement('div');
    box.appendChild(cropArea);
    const actions = document.createElement('div');
    actions.className = 'voice-modal-actions';
    const cancelBtn = makeBtn('Huỷ', 'btn-voice-action btn-voice-secondary');
    const cropBtn = makeBtn('Cắt & upload', 'btn-voice-action btn-voice-publish');
    actions.appendChild(cancelBtn);
    actions.appendChild(cropBtn);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let croppie = null;
    function closeCrop() {
      try { if (croppie && croppie.destroy) croppie.destroy(); } catch (e) { /* ignore */ }
      overlay.remove();
    }
    cancelBtn.addEventListener('click', closeCrop);

    if (typeof Croppie === 'undefined') {
      closeCrop();
      showEditError('Thư viện cắt ảnh chưa tải được — reload trang admin');
      return;
    }
    try {
      croppie = new Croppie(cropArea, {
        viewport: ctx.spec.viewport,
        boundary: ctx.spec.boundary,
        enableZoom: true,
        enforceBoundary: false
      });
    } catch (e) {
      closeCrop();
      showEditError('Không khởi tạo được bộ cắt ảnh: ' + e.message);
      return;
    }

    const reader = new FileReader();
    reader.onload = function (ev) { croppie.bind({ url: ev.target.result }).catch(function () {}); };
    reader.onerror = function () { closeCrop(); showEditError('Không đọc được file ảnh'); };
    reader.readAsDataURL(file);

    cropBtn.addEventListener('click', function () {
      cropBtn.disabled = true;
      cropBtn.textContent = '...';
      croppie.result({
        type: 'blob',
        size: ctx.spec.output,
        format: 'jpeg',
        quality: ctx.spec.quality
      }).then(function (blob) {
        return readBlobAsBase64(blob);
      }).then(function (b64) {
        closeCrop();
        uploadMedia(ctx, {
          data: b64,
          filename: (file.name || ctx.slot) + '.jpg'
        });
      }).catch(function (err) {
        cropBtn.disabled = false;
        cropBtn.textContent = 'Cắt & upload';
        console.error('[voice] crop failed:', err);
      });
    });
  }

  /**
   * Audio replacement: cap → best-effort MP3 compression (same shared
   * voice-compressor.js the forms use) → fresh peaks from the ORIGINAL file in
   * parallel — stale peaks from the previous audio must never survive, and the
   * server overwrites them regardless.
   */
  function replaceAudio(file, ctx) {
    if (file.size / (1024 * 1024) > MAX_AUDIO_MB) {
      showEditError('File quá lớn, tối đa ' + MAX_AUDIO_MB + 'MB');
      return;
    }
    const btn = ctx.btn;
    // Held from the START of compression, not just the upload: compressing a
    // 35MB file takes seconds, and if the modal could close and reopen on a
    // different row in that window, the completing upload would inject THIS
    // row's buttons into the other row's modal — a wrong-row replacement.
    editSaving = true;
    btn.disabled = true;
    btn.textContent = 'Đang nén…';

    const peaksPromise = window.extractPeaks
      ? window.extractPeaks(file, 200).catch(function () { return null; })
      : Promise.resolve(null);

    const compressPromise = window.compressAudio
      ? window.compressAudio(file, {}).catch(function () { return null; })
      : Promise.resolve(null);

    Promise.all([compressPromise, peaksPromise]).then(function (results) {
      const compressed = results[0];
      const peaksResult = results[1];
      const blob = compressed ? compressed.blob : file;
      const mime = (compressed && compressed.mime) || file.type || 'audio/mpeg';
      const duration = (compressed && compressed.durationSec) || (peaksResult ? peaksResult.duration : 0);
      btn.textContent = 'Đang upload…';
      return readBlobAsBase64(blob).then(function (b64) {
        uploadMedia(ctx, {
          data: b64,
          filename: file.name || (ctx.slot + '.mp3'),
          mime: mime,
          peaks: peaksResult ? JSON.stringify(peaksResult.peaks) : '',
          audio_duration: String(duration || 0)
        });
      });
    }).catch(function (err) {
      editSaving = false;
      btn.disabled = false;
      btn.textContent = ctx.spec.label;
      console.error('[voice] audio prep failed:', err);
      showEditError('Xử lý audio thất bại: ' + err.message);
    });
  }

  /** Read a Blob as base64 without the data: prefix. */
  function readBlobAsBase64(blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onerror = function () { reject(new Error('Không đọc được file')); };
      r.onload = function () {
        const s = String(r.result);
        resolve(s.slice(s.indexOf('base64,') + 7));
      };
      r.readAsDataURL(blob);
    });
  }

  function uploadMedia(ctx, extra) {
    const row = ctx.row;
    const btn = ctx.btn;
    const params = {
      action: 'replaceMedia',
      phone: row.phone || '',
      order_id: row.order_id || '',
      type: rowTypeOf(row),
      slot: ctx.slot
    };
    Object.keys(extra).forEach(function (k) { params[k] = extra[k]; });

    editSaving = true; // block modal close while the upload is in flight
    btn.disabled = true;
    btn.textContent = 'Đang upload…';
    fetch(VOICE_GAS_URL, { method: 'POST', body: new URLSearchParams(params) })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'replaceMedia failed');
        applyMediaResult(row, ctx.slot, ctx.spec, data, extra);
        refreshMetaCache(row);
        showToast('Đã thay ' + ctx.spec.label.toLowerCase().replace('đổi ', '') + ' — ' + (data.file_id ? 'file mới đã lưu' : 'đã xoá'));
      })
      .catch(function (err) {
        console.error('[voice] uploadMedia error:', err);
        showEditError('Upload thất bại: ' + err.message);
      })
      .then(function () {
        editSaving = false;
        btn.disabled = false;
        btn.textContent = ctx.spec.label;
      });
  }

  function removeMedia(row, slot, btn) {
    const spec = MEDIA_SLOTS_BY_TYPE[rowTypeOf(row)][slot];
    const noun = spec.kind === 'audio' ? 'audio' : 'ảnh';
    if (!confirm('Xoá ' + noun + ' của row này? File cũ vẫn còn trong Drive.')) return;
    editSaving = true;
    btn.disabled = true;
    fetch(VOICE_GAS_URL, {
      method: 'POST',
      body: new URLSearchParams({
        action: 'replaceMedia',
        phone: row.phone || '',
        order_id: row.order_id || '',
        type: rowTypeOf(row),
        slot: slot,
        remove: '1'
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'replaceMedia failed');
        applyMediaResult(row, slot, spec, data, null);
        refreshMetaCache(row);
        showToast('Đã xoá ' + noun);
      })
      .catch(function (err) {
        console.error('[voice] removeMedia error:', err);
        showEditError('Xoá thất bại: ' + err.message);
      })
      .then(function () {
        editSaving = false;
        btn.disabled = false;
      });
  }

  /**
   * Mirror the server's cell updates onto the local row, rebuild the card in
   * place (thumbnail and audio player come from row fields), and re-render the
   * media buttons so a removed audio's Xoá button disappears.
   */
  function applyMediaResult(row, slot, spec, data, sent) {
    const fileId = data.file_id || '';
    const url = data.url || '';
    const type = rowTypeOf(row);
    if (type === 'counter') {
      if (slot === 'male') { row.male_image_file_id = fileId; row.male_image_url = url; }
      if (slot === 'female') { row.female_image_file_id = fileId; row.female_image_url = url; }
      if (slot === 'bg') { row.bg_file_id = fileId; row.bg_url = url; }
    }
    if (spec.kind === 'audio') {
      row.audio_file_id = fileId;
      row.audio_url = url;
      // Mirror what the server wrote: the peaks THIS request sent, blank on a
      // removal. Blanking after a replace would diverge from the sheet and
      // wrongly re-qualify the row for the Backfill-peaks tool.
      row.peaks = (sent && sent.peaks) || '';
      row.audio_duration = parseFloat((sent && sent.audio_duration) || '0') || 0;
    }
    if (slot === 'image' || slot === 'male') {
      // The male avatar doubles as the row thumbnail — same mirror the server does.
      row.image_file_id = fileId;
      row.image_url = url;
    }
    const rowKey = makeRowKey(row);
    const cardEl = Array.prototype.find.call(
      listEl.querySelectorAll('[data-row-key]'),
      function (el) { return el.dataset.rowKey === rowKey; }
    );
    if (cardEl) cardEl.replaceWith(buildVoiceCard(row));
    // Only touch the modal when it is still showing THIS row.
    if (editingRow === row) renderMediaButtons(row);
    bustListCache();
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
        loadVoiceList({ fresh: true });
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
  /**
   * Toolbar search over the loaded rows. Digit queries match phone
   * substrings (partial digits work — CS often has only the last four);
   * an 84-prefixed query also tries the stored local 0-form, since the
   * sheet keeps phones server-normalized. Any query, digits included, also
   * matches order_id (many order ids are numeric). Pure — extracted by the
   * Node tests.
   */
  function filterVoiceRows(rowList, query) {
    var q = String(query || '').trim();
    if (!q) return rowList;
    // Only a phone-shaped query (digits with formatting) searches phones —
    // stray digits inside a text query like "p2-test" must not match every
    // phone containing that digit.
    var phoneLike = /^\+?[\d\s().-]+$/.test(q);
    var digits = phoneLike ? q.replace(/\D/g, '') : '';
    var qLower = q.toLowerCase();
    var altDigits = /^84\d{8,}$/.test(digits) ? '0' + digits.slice(2) : '';
    return rowList.filter(function (r) {
      var phone = String((r && r.phone) || '').replace(/\D/g, '');
      var order = String((r && r.order_id) || '').toLowerCase();
      if (digits && (phone.indexOf(digits) !== -1 ||
          (altDigits && phone.indexOf(altDigits) !== -1))) return true;
      return order.indexOf(qLower) !== -1;
    });
  }

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
