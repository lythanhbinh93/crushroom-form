/**
 * love-counter-upload.js — Controller for the Love Counter QR customer form.
 *
 * Parameter contract: docs/love-counter-submit-contract.md — change that first.
 *
 * Shape: the REAL public counter page renders full-bleed behind a bottom-sheet
 * stepper (identity → photos → date/names → audio → review) and assembles live
 * as the customer types. The preview paints through window.CounterRender — the
 * same renderer counter-page.js uses — so it cannot lie. Approved design:
 * plans/visuals/260809-love-counter-preview-form-mockup.html.
 *
 * Returning customers: step 0 calls GET action=getSubmission; a found row
 * hydrates every step and the preview, and untouched media resubmits via
 * keep-flags (keepMale/keepFemale/keepBg/keepAudio) instead of re-uploading.
 *
 * Submit flow (unchanged from the stacked form):
 *  1. Per-step validation mirrors the server rules.
 *  2. If fresh audio was supplied: extract peaks and compress, best-effort.
 *  3. Single POST to GAS submitCounter with base64 payloads.
 *  4. Success panel inside the sheet.
 */

/* ── Pure step/payload logic ─────────────────────────────────────────────────
 * Top-level and DOM-free so tests/love-counter-form-steps.test.js can extract
 * and run them (same extract-real-functions convention as the GAS suites). */

function lcIsValidDateString(v, todayVN) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  // Reject a future date even if the browser ignored the max attribute —
  // string compare is safe because both sides are zero-padded YYYY-MM-DD.
  if (v > todayVN) return false;
  if (v < '1900-01-01') return false;
  return true;
}

/**
 * Can the flow advance past `step` with snapshot `s`?
 * s: { phoneValid, order, maleSet, femaleSet, startDate, todayVN,
 *      maleName, femaleName }
 * Media counts as set whether fresh (cropped this session) or kept (hydrated
 * from a prior submission). Background, audio and every text extra are
 * optional — same rules the server re-enforces.
 */
function lcValidateStep(step, s) {
  switch (step) {
    case 0: return !!s.phoneValid && String(s.order || '').trim().length > 0;
    case 1: return !!s.maleSet && !!s.femaleSet;
    case 2: return lcIsValidDateString(String(s.startDate || ''), s.todayVN) &&
                   String(s.maleName || '').trim().length > 0 &&
                   String(s.maleName || '').trim().length <= 40 &&
                   String(s.femaleName || '').trim().length > 0 &&
                   String(s.femaleName || '').trim().length <= 40;
    case 3: return true; // audio is optional for a counter
    case 4: return lcValidateStep(0, s) && lcValidateStep(1, s) && lcValidateStep(2, s);
    default: return false;
  }
}

/**
 * Build the submitCounter POST params (audio appended separately — it needs
 * the async compressor). For a slot with fresh crop data the keys match the
 * original stacked form byte-for-byte; a kept slot sends its keep-flag and NO
 * image keys; bg with neither stays the legacy empty-string pair so the
 * new-customer payload is identical to the old form's.
 *
 * s: { phone, orderId, startDate, maleName, femaleName, title, heartText,
 *      textMessage,
 *      male:   { dataB64, filename, kept },
 *      female: { dataB64, filename, kept },
 *      bg:     { dataB64, filename, kept } }
 */
function lcBuildSubmitPayload(s, defaultTitle) {
  var p = {
    action: 'submitCounter',
    type: 'counter',
    phone: s.phone,
    order_id: s.orderId,
    // Raw YYYY-MM-DD. Server must apostrophe-prefix this before writing,
    // or Sheets autocasts it and the page renders the previous day.
    start_date: s.startDate,
    male_name: String(s.maleName || '').trim(),
    female_name: String(s.femaleName || '').trim(),
    title: String(s.title || '').trim() || defaultTitle,
    heart_text: String(s.heartText || '').trim(),
    text_message: String(s.textMessage || '').trim()
  };

  if (s.male.dataB64) {
    p.maleData = s.male.dataB64;
    p.maleFilename = s.male.filename;
  } else if (s.male.kept) {
    p.keepMale = '1';
  }

  if (s.female.dataB64) {
    p.femaleData = s.female.dataB64;
    p.femaleFilename = s.female.filename;
  } else if (s.female.kept) {
    p.keepFemale = '1';
  }

  if (s.bg.dataB64) {
    p.bgData = s.bg.dataB64;
    p.bgFilename = s.bg.filename;
  } else if (s.bg.kept) {
    p.keepBg = '1';
  } else {
    // Legacy shape: the stacked form always sent the bg pair, empty when unset.
    p.bgData = '';
    p.bgFilename = '';
  }

  return p;
}

/* ── Controller ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {

  /* ── Constants ─────────────────────────────────────────────────────────── */
  // Same deployment as the voice gift form — one GAS project serves both row
  // types, discriminated by the `type` parameter.
  var COUNTER_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

  // 35MB hard limit — base64 encoding inflates ~47MB, within GAS 50MB doPost cap.
  var MAX_FILE_MB = 35;
  var WARN_FILE_MB = 20;

  var CR = window.CounterRender;
  var DEFAULT_TITLE = CR.DEFAULT_TITLE;

  /* ── State ─────────────────────────────────────────────────────────────── */
  var state = {
    step: 0,
    audioFile: null,          // fresh audio File chosen this session
    keptAudio: false,         // hydrated audio kept from the prior submission
    isSubmitting: false,
    hydrated: false           // a prior submission was loaded
  };

  /* ── DOM refs — sheet controls ─────────────────────────────────────────── */
  var form            = document.getElementById('counter-form');
  var sheetEl         = form;
  var grabBtn         = document.getElementById('lc-grab');
  var stepdotsEl      = document.getElementById('lc-stepdots');
  var stepEls         = Array.prototype.slice.call(document.querySelectorAll('.lc-step'));
  var prefillBanner   = document.getElementById('prefill-banner');
  var phoneInputEl    = document.getElementById('phone-input');
  var orderInput      = document.getElementById('order-input');
  var step0Next       = document.getElementById('step0-next');
  var startDateInput  = document.getElementById('start-date');
  var maleNameEl      = document.getElementById('male-name-input');
  var femaleNameEl    = document.getElementById('female-name-input');
  var pageTitle       = document.getElementById('page-title');
  var heartText       = document.getElementById('heart-text');
  var textMessage     = document.getElementById('text-message');
  var charCount       = document.getElementById('char-count');
  var audioInput      = document.getElementById('audio-input');
  var audioDropzone   = document.getElementById('audio-dropzone');
  var audioPlaceholder = document.getElementById('audio-placeholder');
  var audioPreview    = document.getElementById('audio-preview');
  var audioFilenameEl = document.getElementById('audio-filename');
  var audioRemoveBtn  = document.getElementById('audio-remove-btn');
  var audioTriggerBtn = document.getElementById('audio-trigger-btn');
  var audioSkipBtn    = document.getElementById('audio-skip-btn');
  var audioSizeWarn   = document.getElementById('audio-size-warning');
  var audioTitleCtrl  = document.getElementById('audio-title-control');
  var audioTitle      = document.getElementById('audio-title-input');
  var submitBtn       = document.getElementById('submit-btn');
  var submitSpinner   = document.getElementById('submit-spinner');
  var submitLabel     = document.getElementById('submit-label');
  var submitError     = document.getElementById('submit-error');
  var progressPanel   = document.getElementById('progress-panel');
  var progressTitle   = document.getElementById('progress-title');
  var progressFill    = document.getElementById('progress-bar-fill');
  var progressLabel   = document.getElementById('progress-label');
  var successPanel    = document.getElementById('success-panel');

  /* ── DOM refs — live preview (mirrors counter.html's element map) ──────── */
  var pv = {
    bg: document.getElementById('pv-bg'),
    title: document.getElementById('pv-title'),
    heartText: document.getElementById('pv-heart-text'),
    maleName: document.getElementById('pv-male-name'),
    femaleName: document.getElementById('pv-female-name'),
    maleImg: document.getElementById('pv-male-avatar'),
    femaleImg: document.getElementById('pv-female-avatar'),
    message: document.getElementById('pv-message')
  };
  var pvDays       = document.getElementById('pv-days');
  var pvAudioBlock = document.getElementById('pv-audio-block');
  var pvAudioTitle = document.getElementById('pv-audio-title');
  var pvAudioName  = document.getElementById('pv-audio-name');
  var pvWaveform   = document.getElementById('pv-waveform');
  var pvMaleAdd    = document.getElementById('pv-male-add');
  var pvFemaleAdd  = document.getElementById('pv-female-add');

  // Decorative bars for the audio chip — same look as the page's fallback.
  (function buildPvBars() {
    for (var i = 0; i < 40; i++) {
      var bar = document.createElement('span');
      bar.className = 'voice-bar';
      pvWaveform.appendChild(bar);
    }
  })();

  /* ── Error helpers ─────────────────────────────────────────────────────── */
  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.style.display = 'block';
  }
  function clearError(el) {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
    el.style.display = 'none';
  }

  function updateProgress(value, total, label) {
    var pct = total ? Math.round((value / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label || (pct + '%');
  }

  // A future start date would render a negative day count, so cap the picker.
  startDateInput.setAttribute('max', CR.todayInVN());

  /* ── URL param parse (staff prefill links keep working) ────────────────── */
  (function initFromUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var phone  = params.get('phone') || '';
    var order  = params.get('order') || '';

    if (order) {
      orderInput.value = order;
      orderInput.setAttribute('readonly', 'readonly');
    }
    if (phone) window._prefillPhone = phone;
  })();

  /* ── intl-tel-input (VN default, same config as voice-upload.js) ───────── */
  var iti = null;
  if (window.intlTelInput) {
    iti = window.intlTelInput(phoneInputEl, {
      initialCountry: 'vn',
      showSelectedDialCode: true,
      countrySearch: false,
      utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@20.3.0/build/js/utils.js'
    });
    if (window._prefillPhone) phoneInputEl.value = window._prefillPhone;
  } else if (window._prefillPhone) {
    phoneInputEl.value = window._prefillPhone;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  LIVE PREVIEW PAINTER
   *  Thin calls into CounterRender — the exact functions the public page runs.
   * ═══════════════════════════════════════════════════════════════════════ */

  function paintPreview() {
    // Shared static paint. Kept media enters as Drive thumbnail URLs (what the
    // published page receives); fresh crops paint below as data URLs, which
    // the renderer's Drive-only guard correctly ignores.
    CR.renderCounterInto(pv, {
      title: pageTitle.value,
      heart_text: heartText.value,
      male_name: maleNameEl.value,
      female_name: femaleNameEl.value,
      text_message: textMessage.value,
      male_image_url: maleAvatar.keptFileId ? 'https://drive.google.com/thumbnail?id=' + maleAvatar.keptFileId : '',
      female_image_url: femaleAvatar.keptFileId ? 'https://drive.google.com/thumbnail?id=' + femaleAvatar.keptFileId : '',
      bg_url: background.keptFileId ? 'https://drive.google.com/thumbnail?id=' + background.keptFileId : ''
    });

    // Fresh crops override: data URLs are session-local, never Drive-shaped.
    if (maleAvatar.dataB64) pv.maleImg.src = 'data:image/jpeg;base64,' + maleAvatar.dataB64;
    if (femaleAvatar.dataB64) pv.femaleImg.src = 'data:image/jpeg;base64,' + femaleAvatar.dataB64;
    if (background.dataB64) {
      pv.bg.style.backgroundImage = 'url("data:image/jpeg;base64,' + background.dataB64 + '")';
    } else if (!background.keptFileId) {
      pv.bg.style.backgroundImage = '';
    }

    // Empty-avatar affordances + dim name placeholders (form-only chrome —
    // the published page never renders an empty state).
    var maleSet = maleAvatar.isSet;
    var femaleSet = femaleAvatar.isSet;
    if (!maleSet) pv.maleImg.removeAttribute('src');
    if (!femaleSet) pv.femaleImg.removeAttribute('src');
    pvMaleAdd.hidden = maleSet;
    pv.maleImg.style.visibility = maleSet ? '' : 'hidden';
    pvFemaleAdd.hidden = femaleSet;
    pv.femaleImg.style.visibility = femaleSet ? '' : 'hidden';
    if (!maleNameEl.value.trim()) { pv.maleName.textContent = 'Tên nam'; pv.maleName.classList.add('lc-dim'); }
    else pv.maleName.classList.remove('lc-dim');
    if (!femaleNameEl.value.trim()) { pv.femaleName.textContent = 'Tên nữ'; pv.femaleName.classList.add('lc-dim'); }
    else pv.femaleName.classList.remove('lc-dim');

    // Day count — same functions the page's refreshDays uses.
    var d = startDateInput.value;
    if (lcIsValidDateString(d, CR.todayInVN())) {
      var n = CR.loveDays(d, CR.todayInVN());
      pvDays.textContent = n > 0 ? String(n) : '—';
    } else {
      pvDays.textContent = '—';
    }

    // Audio chip: presence only (fresh file or kept) — the form never streams.
    var hasAudio = !!state.audioFile || state.keptAudio;
    pvAudioBlock.hidden = !hasAudio;
    if (hasAudio) {
      var t = audioTitle.value.trim();
      pvAudioTitle.textContent = t;
      pvAudioTitle.hidden = !t;
      pvAudioName.textContent = state.audioFile
        ? (state.audioFile.name || '')
        : 'Giọng nói đã gửi trước đó';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  STEP NAVIGATION
   * ═══════════════════════════════════════════════════════════════════════ */

  function stepSnapshot() {
    return {
      phoneValid: iti ? iti.isValidNumber() : phoneInputEl.value.trim().length >= 8,
      order: orderInput.value,
      maleSet: maleAvatar.isSet,
      femaleSet: femaleAvatar.isSet,
      startDate: startDateInput.value,
      todayVN: CR.todayInVN(),
      maleName: maleNameEl.value,
      femaleName: femaleNameEl.value
    };
  }

  function renderDots() {
    stepdotsEl.innerHTML = '';
    for (var i = 0; i < stepEls.length; i++) {
      var dot = document.createElement('i');
      if (i <= state.step) dot.className = 'on';
      stepdotsEl.appendChild(dot);
    }
  }

  function goStep(i) {
    state.step = i;
    stepEls.forEach(function (el) {
      el.hidden = Number(el.getAttribute('data-step')) !== i;
    });
    renderDots();
    // Review: collapse so the full page is visible — the page IS the review.
    sheetEl.classList.toggle('lc-collapsed', i === 4);
    sheetEl.scrollTop = 0;
    checkFormValid();
  }

  // Tap the grab zone (or the collapsed sheet) to toggle at the review step.
  grabBtn.addEventListener('click', function () {
    if (state.step === 4) sheetEl.classList.toggle('lc-collapsed');
  });
  sheetEl.addEventListener('click', function (e) {
    if (sheetEl.classList.contains('lc-collapsed') && !e.target.closest('button')) {
      sheetEl.classList.remove('lc-collapsed');
    }
  });

  // Generic next/back buttons validate the CURRENT step before moving forward.
  Array.prototype.forEach.call(document.querySelectorAll('.lc-next, .lc-back'), function (btn) {
    btn.addEventListener('click', function () {
      var target = Number(btn.getAttribute('data-goto'));
      if (target > state.step && !lcValidateStep(state.step, stepSnapshot())) {
        flagStepErrors();
        return;
      }
      goStep(target);
    });
  });

  function flagStepErrors() {
    if (state.step === 1) {
      if (!maleAvatar.isSet) showError(maleAvatar.errorEl, 'Vui lòng chọn ảnh bạn nam');
      if (!femaleAvatar.isSet) showError(femaleAvatar.errorEl, 'Vui lòng chọn ảnh bạn nữ');
    }
    if (state.step === 2) {
      if (!lcIsValidDateString(startDateInput.value, CR.todayInVN())) {
        showError(document.getElementById('start-date-error'),
          startDateInput.value > CR.todayInVN()
            ? 'Ngày bắt đầu không thể ở tương lai'
            : 'Vui lòng chọn ngày hợp lệ');
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  STEP 0 — IDENTITY + getSubmission HYDRATION
   * ═══════════════════════════════════════════════════════════════════════ */

  step0Next.addEventListener('click', function () {
    clearError(document.getElementById('phone-error'));
    clearError(document.getElementById('order-error'));
    if (iti && !iti.isValidNumber()) {
      showError(document.getElementById('phone-error'), 'Số điện thoại không hợp lệ');
      return;
    }
    if (!lcValidateStep(0, stepSnapshot())) {
      if (!orderInput.value.trim()) showError(document.getElementById('order-error'), 'Vui lòng nhập mã đơn hàng');
      return;
    }

    var phone = iti ? iti.getNumber() : phoneInputEl.value.trim();
    var orderId = orderInput.value.trim();

    step0Next.disabled = true;
    step0Next.textContent = 'Đang kiểm tra…';

    fetch(COUNTER_GAS_URL + '?action=getSubmission&phone=' + encodeURIComponent(phone) +
          '&order_id=' + encodeURIComponent(orderId) + '&type=counter')
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (resp && resp.ok && resp.found) hydrateFromSubmission(resp.submission);
      })
      .catch(function () {
        // A blank start is always safe — prefill is best-effort, never a wall.
      })
      .then(function () {
        step0Next.disabled = false;
        step0Next.textContent = 'Bắt đầu tạo →';
        goStep(1);
      });
  });

  /**
   * Fill every step + the preview from a prior submission (whitelisted fields
   * only — see the contract doc). Kept media is referenced by Drive file id;
   * re-cropping a slot replaces it, and an untouched slot resubmits by
   * keep-flag so the customer never re-uploads bytes they already sent.
   */
  function hydrateFromSubmission(sub) {
    state.hydrated = true;

    if (sub.start_date) startDateInput.value = sub.start_date;
    maleNameEl.value = sub.male_name || '';
    femaleNameEl.value = sub.female_name || '';
    // The stacked form stored the default title verbatim; showing it back as a
    // literal input value would read as user-entered — keep the placeholder.
    pageTitle.value = (sub.title && sub.title !== DEFAULT_TITLE) ? sub.title : '';
    heartText.value = sub.heart_text || '';
    textMessage.value = sub.text_message || '';
    charCount.textContent = String(textMessage.value.length);
    audioTitle.value = sub.audio_title || '';

    if (sub.male_image_file_id) setKeptImage(maleAvatar, sub.male_image_file_id);
    if (sub.female_image_file_id) setKeptImage(femaleAvatar, sub.female_image_file_id);
    if (sub.bg_file_id) setKeptImage(background, sub.bg_file_id);

    if (sub.audio_file_id) {
      state.keptAudio = true;
      audioFilenameEl.textContent = 'Giọng nói đã gửi trước đó';
      audioPlaceholder.style.display = 'none';
      audioPreview.style.display = 'flex';
      audioTitleCtrl.style.display = 'block';
    }

    prefillBanner.textContent = sub.has_slug
      ? '✳️ Tìm thấy bản đã gửi — bạn đang sửa lại, mã QR giữ nguyên.'
      : '✳️ Tìm thấy bản đã gửi — bạn đang sửa lại bản chờ duyệt.';
    prefillBanner.hidden = false;

    paintPreview();
    checkFormValid();
  }

  /** Mark a picker slot as kept: Drive thumbnail in the tile, no local bytes. */
  function setKeptImage(picker, fileId) {
    picker.keptFileId = fileId;
    picker.dataB64 = '';
    picker.filename = '';
    picker.isSet = true;
    var img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w400';
    picker.previewEl.innerHTML = '';
    picker.previewEl.appendChild(img);
    picker.placeholderEl.style.display = 'none';
    picker.previewAreaEl.style.display = 'block';
  }

  /* ── Text inputs repaint the preview live ──────────────────────────────── */
  textMessage.addEventListener('input', function () {
    charCount.textContent = textMessage.value.length;
  });
  [startDateInput, maleNameEl, femaleNameEl, pageTitle, heartText, textMessage, audioTitle]
    .forEach(function (el) {
      el.addEventListener('input', paintPreview);
    });

  /* ══════════════════════════════════════════════════════════════════════════
   *  IMAGE PICKERS
   *  One factory, three instances. The voice form hard-wired a single cropper
   *  to module-scope variables; with three images that would be three copies of
   *  ~170 lines drifting apart, so the DOM refs and crop geometry are passed in.
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Opens the Croppie modal — pattern copied from voice-upload.js openCropModal,
   * with viewport/output geometry and the destination refs parameterised.
   *
   * @param {File} file            source image chosen by the user
   * @param {Object} picker        the picker instance requesting the crop
   */
  function openCropModal(file, picker) {
    clearError(picker.errorEl);
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showError(picker.errorEl, 'Chỉ hỗ trợ ảnh (JPG, PNG, HEIC…).');
      return;
    }
    if (typeof Croppie === 'undefined') {
      showError(picker.errorEl, 'Không tải được bộ cắt ảnh. Vui lòng refresh trang.');
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'couplepix-backdrop';
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.className = 'modal';

    // Must NOT include substring "croppie-container" — Croppie guards against re-init
    var croppieContainer = document.createElement('div');
    croppieContainer.className = 'couplepix-cropper';
    modal.appendChild(croppieContainer);

    var actionRow = document.createElement('div');
    actionRow.className = 'couplepix-modal-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Huỷ';
    cancelBtn.className = 'dropzone--placeholder--button couplepix-modal-cancel';
    cancelBtn.addEventListener('click', function () { closeModal(); });

    var cropBtn = document.createElement('button');
    cropBtn.type = 'button';
    cropBtn.textContent = 'OK';
    cropBtn.className = 'dropzone--placeholder--button couplepix-modal-ok';
    cropBtn.addEventListener('click', function () {
      if (cropBtn.disabled) return;
      cropBtn.disabled = true;
      cropBtn.textContent = 'Đang xử lý…';
      doCrop()
        .then(function () { closeModal(); })
        .catch(function () {
          cropBtn.disabled = false;
          cropBtn.textContent = 'OK';
          showError(picker.errorEl, 'Không xử lý được ảnh. Vui lòng thử ảnh khác.');
        });
    });

    actionRow.appendChild(cancelBtn);
    actionRow.appendChild(cropBtn);
    modal.appendChild(actionRow);
    document.body.appendChild(modal);

    var croppie;
    try {
      croppie = new Croppie(croppieContainer, {
        viewport: picker.viewport,
        boundary: picker.boundary,
        enableZoom: true,
        enforceBoundary: false
      });
    } catch (e) {
      alert('Không khởi tạo được bộ cắt ảnh. Vui lòng thử lại.');
      closeModal();
      return;
    }

    // Zoom ± controls (same pattern as voice-upload.js). Croppie builds its
    // slider asynchronously, so watch for it when it is not present yet.
    (function addZoomButtons() {
      var zoomControls = document.createElement('div');
      zoomControls.className = 'couplepix-zoom-controls';
      var minusBtn = document.createElement('button');
      minusBtn.type = 'button'; minusBtn.textContent = '−';
      minusBtn.className = 'dropzone--placeholder--button';
      var plusBtn = document.createElement('button');
      plusBtn.type = 'button'; plusBtn.textContent = '+';
      plusBtn.className = 'dropzone--placeholder--button';
      zoomControls.appendChild(minusBtn);
      zoomControls.appendChild(plusBtn);
      modal.insertBefore(zoomControls, actionRow);

      var STEP = 0.01;
      function triggerInput(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }
      function clamp(v, mn, mx) { return Math.min(mx, Math.max(mn, v)); }
      function wireSlider(slider) {
        minusBtn.addEventListener('click', function () {
          var cur = parseFloat(slider.value || '0');
          slider.value = String(clamp(cur - STEP, parseFloat(slider.min || '0'), parseFloat(slider.max || '1')));
          triggerInput(slider);
        });
        plusBtn.addEventListener('click', function () {
          var cur = parseFloat(slider.value || '0');
          slider.value = String(clamp(cur + STEP, parseFloat(slider.min || '0'), parseFloat(slider.max || '1')));
          triggerInput(slider);
        });
      }
      var sliderNow = croppieContainer.querySelector('.cr-slider');
      if (sliderNow) { wireSlider(sliderNow); return; }
      var ob = new MutationObserver(function () {
        var s = croppieContainer.querySelector('.cr-slider');
        if (s) { wireSlider(s); ob.disconnect(); }
      });
      ob.observe(croppieContainer, { childList: true, subtree: true });
    })();

    // Bind image file to Croppie
    var reader = new FileReader();
    reader.onload = function (e) {
      croppie.bind({ url: e.target.result }).catch(function () {});
    };
    reader.onerror = function () {
      alert('Không đọc được file ảnh. Vui lòng thử ảnh khác.');
      closeModal();
    };
    reader.readAsDataURL(file);

    /** Crop to the picker's output size, store base64, render preview. */
    function doCrop() {
      return croppie.result({
        type: 'blob',
        size: picker.output,
        format: 'jpeg',
        quality: picker.quality
      }).then(function (blob) {
        return new Promise(function (resolve, reject) {
          var br = new FileReader();
          br.onerror = function () { reject(new Error('Không đọc được ảnh đã cắt')); };
          br.onload = function (ev) {
            var img = new Image();
            img.onerror = function () { reject(new Error('Ảnh đã cắt bị lỗi')); };
            img.onload = function () {
              try {
                var previewImg = new Image();
                previewImg.src = ev.target.result;
                picker.previewEl.innerHTML = '';
                picker.previewEl.appendChild(previewImg);
                picker.placeholderEl.style.display = 'none';
                picker.previewAreaEl.style.display = 'block';

                // Store base64 without the data: prefix for the GAS POST.
                // A fresh crop replaces a kept file — fresh data wins.
                picker.dataB64 = (ev.target.result.split('base64,')[1]) || '';
                picker.filename = file.name || (picker.key + '.jpg');
                picker.isSet = true;
                picker.keptFileId = '';
                paintPreview();
                checkFormValid();
                resolve();
              } catch (err) { reject(err); }
            };
            img.src = ev.target.result;
          };
          br.readAsDataURL(blob);
        });
      });
    }

    function closeModal() {
      try { if (croppie && croppie.destroy) croppie.destroy(); } catch (e) { /* ignore */ }
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
  }

  /**
   * Wires one dropzone + hidden file input + crop modal + preview into a picker.
   * @param {Object} cfg  { key, prefix, viewport, boundary, output, quality }
   */
  function createImagePicker(cfg) {
    var picker = {
      key: cfg.key,
      viewport: cfg.viewport,
      boundary: cfg.boundary,
      output: cfg.output,
      quality: cfg.quality || 0.85,
      dataB64: '',
      filename: '',
      keptFileId: '',
      isSet: false
    };

    var p = cfg.prefix;
    picker.dropzoneEl     = document.getElementById(p + '-dropzone');
    picker.placeholderEl  = document.getElementById(p + '-placeholder');
    picker.previewAreaEl  = document.getElementById(p + '-preview-area');
    picker.previewEl      = document.getElementById(p + '-preview');
    picker.inputEl        = document.getElementById(p + '-input');
    picker.triggerEl      = document.getElementById(p + '-trigger-btn');
    picker.removeEl       = document.getElementById(p + '-remove-btn');
    picker.errorEl        = document.getElementById(p + '-error');

    // Explicit click dispatch — more reliable on iOS Safari / Android WebViews
    picker.triggerEl.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      picker.inputEl.click();
    });
    picker.placeholderEl.addEventListener('click', function (e) {
      if (e.target === picker.triggerEl) return;
      picker.inputEl.click();
    });
    // "Đổi ảnh": tapping a filled tile re-opens the picker (fresh crop wins).
    picker.previewAreaEl.addEventListener('click', function (e) {
      if (e.target === picker.removeEl) return;
      picker.inputEl.click();
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      picker.dropzoneEl.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        picker.dropzoneEl.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      picker.dropzoneEl.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        picker.dropzoneEl.classList.remove('is-dragover');
      });
    });
    picker.dropzoneEl.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) openCropModal(files[0], picker);
    });

    picker.inputEl.addEventListener('change', function () {
      if (picker.inputEl.files && picker.inputEl.files[0]) {
        openCropModal(picker.inputEl.files[0], picker);
      }
    });

    picker.removeEl.addEventListener('click', function (e) {
      e.stopPropagation();
      picker.dataB64 = '';
      picker.filename = '';
      picker.keptFileId = '';
      picker.isSet = false;
      picker.inputEl.value = '';
      picker.previewEl.innerHTML = '';
      picker.previewAreaEl.style.display = 'none';
      picker.placeholderEl.style.display = 'flex';
      paintPreview();
      checkFormValid();
    });

    return picker;
  }

  // Avatars crop circular at 400×400 because the page renders them in a circle.
  // The background is wide and larger — a 400×400 crop stretched full-bleed
  // would look obviously soft on a phone.
  var maleAvatar = createImagePicker({
    key: 'maleAvatar', prefix: 'male-avatar',
    viewport: { width: 240, height: 240, type: 'circle' },
    boundary: { width: 280, height: 340 },
    output: { width: 400, height: 400 }, quality: 0.85
  });
  var femaleAvatar = createImagePicker({
    key: 'femaleAvatar', prefix: 'female-avatar',
    viewport: { width: 240, height: 240, type: 'circle' },
    boundary: { width: 280, height: 340 },
    output: { width: 400, height: 400 }, quality: 0.85
  });
  var background = createImagePicker({
    key: 'background', prefix: 'bg',
    // 9:16 PORTRAIT (171 = 9x19, 304 = 16x19). The page is opened by scanning
    // a QR on a bracelet — a portrait phone — and counter-page.css paints this
    // full-viewport with background-size: cover, so a landscape crop loses
    // ~70% of its width to the viewport fit. Crop for how it is actually seen.
    viewport: { width: 171, height: 304, type: 'square' },
    boundary: { width: 300, height: 340 },
    output: { width: 675, height: 1200 }, quality: 0.82
  });

  // The preview's empty-avatar affordances jump straight into the pickers.
  pvMaleAdd.addEventListener('click', function () { maleAvatar.inputEl.click(); });
  pvFemaleAdd.addEventListener('click', function () { femaleAvatar.inputEl.click(); });

  /* ══════════════════════════════════════════════════════════════════════════
   *  AUDIO (optional)
   * ═══════════════════════════════════════════════════════════════════════ */
  audioTriggerBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    audioInput.click();
  });
  audioDropzone.addEventListener('click', function (e) {
    if (e.target === audioTriggerBtn || e.target === audioRemoveBtn) return;
    if (!state.audioFile && !state.keptAudio) audioInput.click();
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    audioDropzone.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation();
      audioDropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    audioDropzone.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation();
      audioDropzone.classList.remove('is-dragover');
    });
  });
  audioDropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) handleAudioSelected(files[0]);
  });

  audioInput.addEventListener('change', function () {
    if (audioInput.files && audioInput.files[0]) handleAudioSelected(audioInput.files[0]);
  });

  audioRemoveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    clearAudioFile();
  });

  audioSkipBtn.addEventListener('click', function () {
    goStep(4);
  });

  function handleAudioSelected(file) {
    clearError(document.getElementById('audio-error'));
    var sizeMB = file.size / (1024 * 1024);

    if (sizeMB > MAX_FILE_MB) {
      // Rejection message reads from the constant so HTML and JS stay in sync.
      showError(document.getElementById('audio-error'), 'File quá lớn, tối đa ' + MAX_FILE_MB + 'MB');
      clearAudioFile();
      return;
    }

    // A fresh file replaces kept audio — fresh data wins, same as images.
    state.audioFile = file;
    state.keptAudio = false;
    audioFilenameEl.textContent = file.name + ' (' + sizeMB.toFixed(1) + ' MB)';
    audioPlaceholder.style.display = 'none';
    audioPreview.style.display = 'flex';
    audioSizeWarn.style.display = sizeMB > WARN_FILE_MB ? 'block' : 'none';
    // The audio title only means anything once there is audio to title.
    audioTitleCtrl.style.display = 'block';
    paintPreview();
    checkFormValid();
  }

  function clearAudioFile() {
    state.audioFile = null;
    state.keptAudio = false;
    audioInput.value = '';
    audioFilenameEl.textContent = '';
    audioPlaceholder.style.display = 'flex';
    audioPreview.style.display = 'none';
    audioSizeWarn.style.display = 'none';
    audioTitleCtrl.style.display = 'none';
    audioTitle.value = '';
    paintPreview();
    checkFormValid();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  VALIDATION
   * ═══════════════════════════════════════════════════════════════════════ */
  function checkFormValid() {
    if (state.isSubmitting) return;
    submitBtn.disabled = !lcValidateStep(4, stepSnapshot());
  }

  phoneInputEl.addEventListener('input', checkFormValid);
  phoneInputEl.addEventListener('countrychange', checkFormValid);
  orderInput.addEventListener('input', checkFormValid);
  maleNameEl.addEventListener('input', checkFormValid);
  femaleNameEl.addEventListener('input', checkFormValid);

  startDateInput.addEventListener('input', function () {
    clearError(document.getElementById('start-date-error'));
    if (startDateInput.value && !lcIsValidDateString(startDateInput.value, CR.todayInVN())) {
      showError(document.getElementById('start-date-error'),
        startDateInput.value > CR.todayInVN()
          ? 'Ngày bắt đầu không thể ở tương lai'
          : 'Ngày không hợp lệ');
    }
    checkFormValid();
  });

  /* ══════════════════════════════════════════════════════════════════════════
   *  KEYBOARD — keep the sheet above the iOS keyboard
   * ═══════════════════════════════════════════════════════════════════════ */
  if (window.visualViewport) {
    var vv = window.visualViewport;
    var onVV = function () {
      // Height the keyboard steals from the layout viewport, if any.
      var stolen = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheetEl.style.bottom = stolen ? stolen + 'px' : '';
    };
    vv.addEventListener('resize', onVV);
    vv.addEventListener('scroll', onVV);
  }
  // Belt-and-braces: make sure the focused control is inside the sheet's view.
  form.addEventListener('focusin', function (e) {
    if (e.target && e.target.scrollIntoView) {
      setTimeout(function () {
        e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 250);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
   *  SUBMIT
   * ═══════════════════════════════════════════════════════════════════════ */
  function setSubmitting(active) {
    state.isSubmitting = active;
    submitBtn.disabled = active;
    submitSpinner.style.display = active ? 'inline-block' : 'none';
    submitLabel.textContent = active ? 'Đang gửi…' : 'Gửi cho Crush Room 💌';
    var inputs = form.querySelectorAll('input, textarea, button');
    inputs.forEach(function (el) { el.disabled = active; });
    // Re-enabling every control above also re-enables submit, which would let a
    // failed submit leave the button clickable on an invalid form. Recompute.
    if (!active) checkFormValid();
  }

  function readFileAsBase64(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Không đọc được file')); };
      if (onProgress) {
        reader.onprogress = function (e) {
          if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
        };
      }
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf('base64,');
        resolve(comma === -1 ? '' : result.slice(comma + 7));
      };
      reader.readAsDataURL(file);
    });
  }

  /** Posts URL-encoded form data. GAS doPost reads e.parameter.*. */
  function gasPost(params) {
    var body = new URLSearchParams();
    Object.keys(params).forEach(function (k) { body.append(k, params[k]); });
    return fetch(COUNTER_GAS_URL, { method: 'POST', body: body })
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      });
  }

  async function submitCounter() {
    clearError(submitError);
    setSubmitting(true);

    try {
      var phoneNormalized = iti ? iti.getNumber() : phoneInputEl.value.trim();
      if (iti && !iti.isValidNumber()) {
        showError(submitError, 'Số điện thoại không hợp lệ');
        setSubmitting(false);
        return;
      }

      var startDate = startDateInput.value;
      if (!lcIsValidDateString(startDate, CR.todayInVN())) {
        showError(submitError, 'Ngày bắt đầu không hợp lệ');
        setSubmitting(false);
        return;
      }

      var payload = lcBuildSubmitPayload({
        phone: phoneNormalized,
        orderId: orderInput.value.trim(),
        startDate: startDate,
        maleName: maleNameEl.value,
        femaleName: femaleNameEl.value,
        title: pageTitle.value,
        heartText: heartText.value,
        textMessage: textMessage.value,
        male: maleAvatar.dataB64
          ? { dataB64: maleAvatar.dataB64, filename: maleAvatar.filename, kept: false }
          : { dataB64: '', filename: '', kept: !!maleAvatar.keptFileId },
        female: femaleAvatar.dataB64
          ? { dataB64: femaleAvatar.dataB64, filename: femaleAvatar.filename, kept: false }
          : { dataB64: '', filename: '', kept: !!femaleAvatar.keptFileId },
        bg: background.dataB64
          ? { dataB64: background.dataB64, filename: background.filename, kept: false }
          : { dataB64: '', filename: '', kept: !!background.keptFileId }
      }, DEFAULT_TITLE);

      // ── Audio: fresh file → compress + peaks; kept → keep-flag ────────────
      if (state.audioFile) {
        progressPanel.style.display = 'block';
        progressTitle.textContent = 'Đang xử lý âm thanh…';
        updateProgress(0, 1, '0%');

        // Peaks let the recipient page draw the waveform without re-decoding.
        // Failure is non-fatal — the page falls back to decorative bars.
        var peaksPromise = window.extractPeaks
          ? window.extractPeaks(state.audioFile, 200)
          : Promise.resolve(null);

        var audioBlob = state.audioFile;
        var audioMime = state.audioFile.type || 'audio/mpeg';
        var compressDuration = 0;

        if (window.compressAudio) {
          try {
            progressTitle.textContent = 'Đang nén âm thanh…';
            var compressResult = await window.compressAudio(state.audioFile, {
              onProgress: function (pct) { updateProgress(pct, 100, Math.round(pct) + '%'); }
            });
            audioBlob = compressResult.blob;
            audioMime = compressResult.mime || audioMime;
            compressDuration = compressResult.durationSec || 0;
          } catch (compressErr) {
            // Compression is best-effort; fall back to the raw file so behaviour
            // never regresses on browsers without Worker/AudioContext support.
            audioBlob = state.audioFile;
            audioMime = state.audioFile.type || 'audio/mpeg';
            compressDuration = 0;
          }
        }

        progressTitle.textContent = 'Đang đọc file âm thanh…';
        updateProgress(0, 1, '0%');
        payload.audioData = await readFileAsBase64(audioBlob, function (pct) {
          updateProgress(pct, 100, Math.round(pct) + '%');
        });

        var peaksResult = await peaksPromise;
        payload.audioFilename = state.audioFile.name || (phoneNormalized + '_' + payload.order_id);
        payload.audioMime = audioMime;
        payload.audio_title = audioTitle.value.trim();
        payload.peaks = peaksResult ? JSON.stringify(peaksResult.peaks) : '';
        payload.audio_duration = compressDuration || (peaksResult ? peaksResult.duration : 0);

        progressTitle.textContent = 'Đang gửi lên shop…';
        updateProgress(100, 100, '100%');
      } else if (state.keptAudio) {
        // The server reuses the row's file + peaks; only the title is editable.
        payload.keepAudio = '1';
        payload.audio_title = audioTitle.value.trim();
      }
      // With no audio the payload is three small JPEGs — roughly a second on 4G.
      // The submit button's own spinner covers that; a progress bar that appears
      // already full would be theatre, so the panel stays hidden.

      var resp = await gasPost(payload);
      if (!resp.ok) throw new Error(resp.error || 'Gửi thất bại');

      // Success: swap the sheet's contents; the finished preview stays behind.
      stepEls.forEach(function (el) { el.hidden = true; });
      stepdotsEl.hidden = true;
      progressPanel.style.display = 'none';
      sheetEl.classList.remove('lc-collapsed');
      successPanel.style.display = 'block';

    } catch (err) {
      progressPanel.style.display = 'none';
      showError(submitError, 'Gửi thất bại: ' + (err && err.message ? err.message : err));
      setSubmitting(false);
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.isSubmitting) return;
    submitCounter();
  });

  // Initial paint + state
  paintPreview();
  goStep(0);
});
