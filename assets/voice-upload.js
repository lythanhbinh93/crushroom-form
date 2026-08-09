/**
 * voice-upload.js — Controller for the Voice Gift QR customer upload form.
 *
 * Parameter contract: docs/love-counter-submit-contract.md — change that first.
 *
 * Shape: a static skeleton of the REAL gift page (voice.html markup wearing
 * voice-page.css) renders behind the shared bottom-sheet stepper
 * (identity → photo → message → audio → review) and assembles live as the
 * customer fills it. Frame comes from window.UploadSheet — the same module
 * the Love Counter form uses. Deliberate build choice: no renderer extraction
 * here — the gift page's preview surface is only photo + message + player
 * chip, so the skeleton mirrors the markup 1:1 instead.
 *
 * Returning customers: step 0 calls GET action=getSubmission; a found row
 * hydrates message/photo/audio-presence, and untouched media resubmits via
 * keep-flags (keepImage/keepAudio). Audio stays REQUIRED — it IS the
 * product — a kept file is a third way to satisfy that, never a way around.
 *
 * Submit flow (unchanged wire format):
 *  1. Per-step validation mirrors the server rules.
 *  2. Fresh audio: compress via window.compressAudio + extract peaks via
 *     window.extractPeaks — both best-effort.
 *  3. Single POST to GAS finishUpload.
 *  4. Success panel inside the sheet.
 */

/* ── Pure step/payload logic ─────────────────────────────────────────────────
 * Top-level and DOM-free so tests/voice-upload-form-steps.test.js can extract
 * and run them (same extract-real-functions convention as the GAS suites). */

/**
 * Can the flow advance past `step` with snapshot `s`?
 * s: { phoneValid, order, message, audioSet }
 * Photo is optional; audio counts as set whether fresh or kept.
 */
function vcValidateStep(step, s) {
  switch (step) {
    case 0: return !!s.phoneValid && String(s.order || '').trim().length > 0;
    case 1: return true; // photo is optional for a voice gift
    case 2: return String(s.message || '').trim().length > 0 &&
                   String(s.message || '').trim().length <= 1000;
    case 3: return !!s.audioSet; // audio IS the product
    case 4: return vcValidateStep(0, s) && vcValidateStep(2, s) && vcValidateStep(3, s);
    default: return false;
  }
}

/**
 * Build the finishUpload POST params (audio appended separately — it needs
 * the async compressor). Fresh image keys match the original form byte-for-
 * byte; a kept image sends its keep-flag and NO image keys; neither sends the
 * legacy empty-string pair so an image-less payload keeps the old shape.
 *
 * s: { phone, orderId, message, image: { dataB64, filename, kept } }
 */
function vcBuildFinishPayload(s) {
  var p = {
    action: 'finishUpload',
    phone: s.phone,
    order_id: s.orderId,
    text_message: String(s.message || '').trim()
  };

  if (s.image.dataB64) {
    p.imgData = s.image.dataB64;
    p.imgFilename = s.image.filename;
  } else if (s.image.kept) {
    p.keepImage = '1';
  } else {
    p.imgData = '';
    p.imgFilename = '';
  }

  return p;
}

/* ── Controller ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {

  /* ── Constants ─────────────────────────────────────────────────────────── */
  var VOICE_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

  // 35MB hard limit — base64 encoding inflates ~47MB, within GAS 50MB doPost cap.
  // Warn at 20MB: large uploads over slow connections may hit GAS timeouts.
  var MAX_FILE_MB = 35;
  var WARN_FILE_MB = 20;

  /* ── State ─────────────────────────────────────────────────────────────── */
  // Step index lives in the shared sheet frame (see UploadSheet.create below).
  var state = {
    audioFile: null,       // fresh audio File chosen this session
    keptAudio: false,      // hydrated audio kept from the prior submission
    imageCropped: false,   // true after Croppie OK
    imageDataB64: '',      // base64 string (no data: prefix)
    imageFilename: '',     // original filename for sheet reference
    keptImageId: '',       // Drive file id kept from the prior submission
    isSubmitting: false
  };

  /* ── DOM refs — sheet controls ─────────────────────────────────────────── */
  var form           = document.getElementById('voice-form');
  var sheetEl        = form;
  var grabBtn        = document.getElementById('lc-grab');
  var stepdotsEl     = document.getElementById('lc-stepdots');
  var stepEls        = Array.prototype.slice.call(document.querySelectorAll('.lc-step'));
  var prefillBanner  = document.getElementById('prefill-banner');
  var phoneInputEl   = document.getElementById('phone-input');
  var orderInput     = document.getElementById('order-input');
  var step0Next      = document.getElementById('step0-next');
  var audioInput     = document.getElementById('audio-input');
  var audioDropzone  = document.getElementById('audio-dropzone');
  var audioPlaceholder = document.getElementById('audio-placeholder');
  var audioPreview   = document.getElementById('audio-preview');
  var audioFilename  = document.getElementById('audio-filename');
  var audioRemoveBtn = document.getElementById('audio-remove-btn');
  var audioTriggerBtn = document.getElementById('audio-trigger-btn');
  var audioSizeWarn  = document.getElementById('audio-size-warning');
  var imageInput     = document.getElementById('image-input');
  var imageDropzone  = document.getElementById('image-dropzone');
  var imagePlaceholder = document.getElementById('image-placeholder');
  var imagePreviewArea = document.getElementById('image-preview-area');
  var imagePreview   = document.getElementById('image-preview');
  var imageRemoveBtn = document.getElementById('image-remove-btn');
  var imageTriggerBtn = document.getElementById('image-trigger-btn');
  var imageDataInput = document.getElementById('image-data');
  var textMessage    = document.getElementById('text-message');
  var charCount      = document.getElementById('char-count');
  var submitBtn      = document.getElementById('submit-btn');
  var submitSpinner  = document.getElementById('submit-spinner');
  var submitLabel    = document.getElementById('submit-label');
  var submitError    = document.getElementById('submit-error');
  var progressPanel  = document.getElementById('progress-panel');
  var progressTitle  = document.getElementById('progress-title');
  var progressFill   = document.getElementById('progress-bar-fill');
  var progressLabel  = document.getElementById('progress-label');
  var successPanel   = document.getElementById('success-panel');

  /* ── DOM refs — live preview (mirrors voice.html's gift card) ──────────── */
  var pvImage     = document.getElementById('pv-gift-image');
  var pvPhotoAdd  = document.getElementById('pv-photo-add');
  var pvText      = document.getElementById('pv-gift-text');
  var pvPlayer    = document.getElementById('pv-player');
  var pvWaveform  = document.getElementById('pv-waveform');
  var pvAudioName = document.getElementById('pv-audio-name');

  // Decorative bars for the player chip — same look as the page's fallback.
  (function buildPvBars() {
    for (var i = 0; i < 48; i++) {
      var bar = document.createElement('span');
      bar.className = 'voice-bar';
      pvWaveform.appendChild(bar);
    }
  })();

  /* ── Helpers ───────────────────────────────────────────────────────────── */
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

  // Throttled progress update — avoids reflow storm on fast connections
  var lastProgressUpdate = 0;
  function updateProgress(bytes, total, label) {
    var now = Date.now();
    if (now - lastProgressUpdate < 100 && bytes < total) return; // throttle to 100ms
    lastProgressUpdate = now;
    var pct = total > 0 ? Math.round((bytes / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label || (pct + '%');
  }

  /**
   * Fallback order code for uploads that arrive without one.
   * Format: AUTO-YYMMDDHHMMSS-XXXX. The random suffix matters — two uploads
   * from the same phone in the same second would otherwise share a row key,
   * and finishUpload overwrites a matching row rather than adding one.
   */
  function autoOrderCode() {
    var d = new Date();
    function p(n) { return String(n).length < 2 ? '0' + n : String(n); }
    var stamp = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate())
      + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return 'AUTO-' + stamp + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  /* ── URL param parse (staff prefill links keep working) ────────────────── */
  // The order field is hidden from customers, but order_id is still required
  // by the backend and is half the (phone, order_id) row key, so it is always
  // filled: the real code when the link carries one, else an auto code.
  var orderFromLink = false;
  (function initFromUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var phone  = params.get('phone') || '';
    var order  = params.get('order') || '';

    orderFromLink = !!order;
    orderInput.value = order || autoOrderCode();
    orderInput.setAttribute('readonly', 'readonly');

    if (phone) window._prefillPhone = phone;
  })();

  /* ── intl-tel-input (VN default, same config as couple-pix.js) ─────────── */
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
   *  LIVE PREVIEW PAINTER — the skeleton assembles as the customer types
   * ═══════════════════════════════════════════════════════════════════════ */

  function paintPreview() {
    // Photo: fresh crop as a data URL, kept file as its Drive thumbnail,
    // neither → the add-affordance shows (the real page hides an absent img).
    if (state.imageDataB64) {
      pvImage.src = 'data:image/jpeg;base64,' + state.imageDataB64;
      pvImage.hidden = false;
      pvPhotoAdd.hidden = true;
    } else if (state.keptImageId) {
      pvImage.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(state.keptImageId) + '&sz=w800';
      pvImage.hidden = false;
      pvPhotoAdd.hidden = true;
    } else {
      pvImage.removeAttribute('src');
      pvImage.hidden = true;
      pvPhotoAdd.hidden = false;
    }

    // Message — textContent only, dim placeholder when empty.
    var msg = textMessage.value.trim();
    pvText.textContent = msg || 'Lời nhắn của bạn sẽ hiện ở đây';
    pvText.classList.toggle('vc-dim', !msg);

    // Player chip: presence only — the form never streams.
    var hasAudio = !!state.audioFile || state.keptAudio;
    pvPlayer.hidden = !hasAudio;
    if (hasAudio) {
      pvAudioName.textContent = state.audioFile
        ? (state.audioFile.name || '')
        : 'Giọng nói đã gửi trước đó';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  STEP NAVIGATION (shared frame)
   * ═══════════════════════════════════════════════════════════════════════ */

  function stepSnapshot() {
    return {
      phoneValid: iti ? iti.isValidNumber() : phoneInputEl.value.trim().length >= 8,
      order: orderInput.value,
      message: textMessage.value,
      audioSet: !!state.audioFile || state.keptAudio
    };
  }

  var sheet = window.UploadSheet.create({
    sheetEl: sheetEl,
    grabEl: grabBtn,
    dotsEl: stepdotsEl,
    stepEls: stepEls,
    onStep: function () { checkFormValid(); }
  });
  function goStep(i) { sheet.goStep(i); }

  // Generic next/back buttons validate the CURRENT step before moving forward.
  Array.prototype.forEach.call(document.querySelectorAll('.lc-next, .lc-back'), function (btn) {
    btn.addEventListener('click', function () {
      var target = Number(btn.getAttribute('data-goto'));
      if (target > sheet.step && !vcValidateStep(sheet.step, stepSnapshot())) {
        flagStepErrors();
        return;
      }
      goStep(target);
    });
  });

  function flagStepErrors() {
    if (sheet.step === 2 && !textMessage.value.trim()) {
      showError(document.getElementById('text-error'), 'Vui lòng nhập lời nhắn');
    }
    if (sheet.step === 3 && !state.audioFile && !state.keptAudio) {
      showError(document.getElementById('audio-error'), 'Vui lòng chọn file âm thanh — đây chính là món quà');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  STEP 0 — IDENTITY + getSubmission HYDRATION
   * ═══════════════════════════════════════════════════════════════════════ */

  step0Next.addEventListener('click', function () {
    clearError(document.getElementById('phone-error'));
    if (iti && !iti.isValidNumber()) {
      showError(document.getElementById('phone-error'), 'Số điện thoại không hợp lệ');
      return;
    }
    if (!vcValidateStep(0, stepSnapshot())) return;

    // An auto-generated order code can never match a stored row, so the
    // lookup only runs when the link carried the real code.
    if (!orderFromLink) { goStep(1); return; }

    var phone = iti ? iti.getNumber() : phoneInputEl.value.trim();
    var orderId = orderInput.value.trim();

    step0Next.disabled = true;
    step0Next.textContent = 'Đang kiểm tra…';

    fetch(VOICE_GAS_URL + '?action=getSubmission&phone=' + encodeURIComponent(phone) +
          '&order_id=' + encodeURIComponent(orderId) + '&type=voice')
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
   * Fill the steps + preview from a prior submission (voice whitelist:
   * text_message, image_file_id, audio_file_id, status, has_slug).
   */
  function hydrateFromSubmission(sub) {
    textMessage.value = sub.text_message || '';
    charCount.textContent = String(textMessage.value.length);

    if (sub.image_file_id) {
      state.keptImageId = sub.image_file_id;
      state.imageCropped = false;
      state.imageDataB64 = '';
      var img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(sub.image_file_id) + '&sz=w400';
      imagePreview.innerHTML = '';
      imagePreview.appendChild(img);
      imagePlaceholder.style.display = 'none';
      imagePreviewArea.style.display = 'block';
    }

    if (sub.audio_file_id) {
      state.keptAudio = true;
      audioFilename.textContent = 'Giọng nói đã gửi trước đó';
      audioPlaceholder.style.display = 'none';
      audioPreview.style.display = 'flex';
    }

    prefillBanner.textContent = sub.has_slug
      ? '✳️ Tìm thấy bản đã gửi — bạn đang sửa lại, mã QR giữ nguyên.'
      : '✳️ Tìm thấy bản đã gửi — bạn đang sửa lại bản chờ duyệt.';
    prefillBanner.hidden = false;

    paintPreview();
    checkFormValid();
  }

  /* ── Text counter + live preview ───────────────────────────────────────── */
  textMessage.addEventListener('input', function () {
    charCount.textContent = textMessage.value.length;
    paintPreview();
    checkFormValid();
  });

  // The preview's empty-photo affordance jumps straight into the picker.
  pvPhotoAdd.addEventListener('click', function () { imageInput.click(); });

  /* ── Audio file handling ───────────────────────────────────────────────── */
  // Explicit click dispatch — more reliable on iOS Safari / Android WebViews
  audioTriggerBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
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
    if (audioInput.files && audioInput.files[0]) {
      handleAudioSelected(audioInput.files[0]);
    }
  });

  audioRemoveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    clearAudioFile();
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
    audioFilename.textContent = file.name + ' (' + sizeMB.toFixed(1) + ' MB)';
    audioPlaceholder.style.display = 'none';
    audioPreview.style.display = 'flex';
    audioSizeWarn.style.display = sizeMB > WARN_FILE_MB ? 'block' : 'none';
    paintPreview();
    checkFormValid();
  }

  function clearAudioFile() {
    state.audioFile = null;
    state.keptAudio = false;
    audioInput.value = '';
    audioFilename.textContent = '';
    audioPlaceholder.style.display = 'flex';
    audioPreview.style.display = 'none';
    audioSizeWarn.style.display = 'none';
    paintPreview();
    checkFormValid();
  }

  /* ── Image / Croppie handling ──────────────────────────────────────────── */
  imageTriggerBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    imageInput.click();
  });
  imagePlaceholder.addEventListener('click', function (e) {
    if (e.target === imageTriggerBtn) return;
    imageInput.click();
  });
  // "Đổi ảnh": tapping a filled tile re-opens the picker (fresh crop wins).
  imagePreviewArea.addEventListener('click', function (e) {
    if (e.target === imageRemoveBtn) return;
    imageInput.click();
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    imageDropzone.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation();
      imageDropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    imageDropzone.addEventListener(ev, function (e) {
      e.preventDefault(); e.stopPropagation();
      imageDropzone.classList.remove('is-dragover');
    });
  });
  imageDropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) openCropModal(files[0]);
  });

  imageInput.addEventListener('change', function () {
    if (imageInput.files && imageInput.files[0]) {
      openCropModal(imageInput.files[0]);
    }
  });

  imageRemoveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    clearImage();
  });

  function clearImage() {
    state.imageCropped = false;
    state.imageDataB64 = '';
    state.imageFilename = '';
    state.keptImageId = '';
    imageInput.value = '';
    imageDataInput.value = '';
    imagePreview.innerHTML = '';
    imagePlaceholder.style.display = 'flex';
    imagePreviewArea.style.display = 'none';
    paintPreview();
    checkFormValid();
  }

  /**
   * Opens the Croppie modal — pattern copied from couple-pix.js openImageCropModal.
   * Square (1:1) viewport, 400×400 JPEG output as spec requires.
   */
  function openCropModal(file) {
    clearError(document.getElementById('image-error'));
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showError(document.getElementById('image-error'), 'Chỉ hỗ trợ ảnh (JPG, PNG, HEIC…).');
      return;
    }
    if (typeof Croppie === 'undefined') {
      showError(document.getElementById('image-error'), 'Không tải được bộ cắt ảnh. Vui lòng refresh trang.');
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
    cancelBtn.addEventListener('click', function () {
      if (imageInput) imageInput.value = '';
      closeModal();
    });

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
        .catch(function (err) {
          alert('Không xử lý được ảnh: ' + (err && err.message ? err.message : 'lỗi không rõ'));
          cropBtn.disabled = false;
          cropBtn.textContent = 'OK';
        });
    });

    actionRow.appendChild(cancelBtn);
    actionRow.appendChild(cropBtn);
    modal.appendChild(actionRow);
    document.body.appendChild(modal);

    var croppie;
    try {
      // Square viewport for 1:1 gift photo
      croppie = new Croppie(croppieContainer, {
        viewport: { width: 280, height: 280, type: 'square' },
        boundary: { width: 300, height: 380 },
        enableZoom: true,
        enforceBoundary: false
      });
    } catch (e) {
      alert('Không khởi tạo được bộ cắt ảnh. Vui lòng thử lại.');
      closeModal();
      return;
    }

    // Zoom ± controls (same pattern as couple-pix.js)
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

    /**
     * Crop to 400×400 JPEG (square, per spec).
     * Stores base64 in hidden input + shows preview; a fresh crop replaces a
     * kept file — fresh data wins.
     */
    function doCrop() {
      return croppie.result({
        type: 'blob',
        size: { width: 400, height: 400 },
        format: 'jpeg',
        quality: 0.85
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
                imagePreview.innerHTML = '';
                imagePreview.appendChild(previewImg);
                imagePlaceholder.style.display = 'none';
                imagePreviewArea.style.display = 'block';

                var dataUrl = ev.target.result;
                state.imageDataB64 = dataUrl.split('base64,')[1] || '';
                state.imageFilename = file.name || 'photo.jpg';
                imageDataInput.value = state.imageDataB64;
                state.imageCropped = true;
                state.keptImageId = '';
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

  /* ── Form validation ───────────────────────────────────────────────────── */
  function checkFormValid() {
    if (state.isSubmitting) return;
    submitBtn.disabled = !vcValidateStep(4, stepSnapshot());
  }

  phoneInputEl.addEventListener('input', checkFormValid);
  phoneInputEl.addEventListener('countrychange', checkFormValid);
  orderInput.addEventListener('input', checkFormValid);

  /* ── Submit handler ────────────────────────────────────────────────────── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.isSubmitting) return;
    submitVoice();
  });

  function setSubmitting(active) {
    state.isSubmitting = active;
    submitBtn.disabled = active;
    submitSpinner.style.display = active ? 'inline-block' : 'none';
    submitLabel.textContent = active ? 'Đang gửi…' : 'Gửi lời nhắn 💌';
    var inputs = form.querySelectorAll('input, textarea, button');
    inputs.forEach(function (el) { el.disabled = active; });
    // Re-enabling every control above also re-enables submit, which would let a
    // failed submit leave the button clickable on an invalid form. Recompute.
    if (!active) checkFormValid();
  }

  /**
   * Submit flow (pivoted — Drive resumable PUT blocked by CORS from browser):
   *  1. Fresh audio: read as base64 (FileReader) after best-effort compression.
   *     Kept audio: keepAudio=1 — the server reuses the row's file + peaks.
   *  2. Single POST to GAS finishUpload.
   *  3. GAS saves to Drive, writes the sheet row, notifies staff via Lark.
   */
  async function submitVoice() {
    clearError(submitError);
    setSubmitting(true);

    try {
      var phoneNormalized = iti ? iti.getNumber() : phoneInputEl.value.trim();
      if (iti && !iti.isValidNumber()) {
        showError(submitError, 'Số điện thoại không hợp lệ');
        setSubmitting(false);
        return;
      }

      var payload = vcBuildFinishPayload({
        phone: phoneNormalized,
        orderId: orderInput.value.trim(),
        message: textMessage.value,
        image: state.imageDataB64
          ? { dataB64: state.imageDataB64, filename: state.imageFilename, kept: false }
          : { dataB64: '', filename: '', kept: !!state.keptImageId }
      });

      // ── Audio: fresh file → compress + peaks; kept → keep-flag ────────────
      if (state.audioFile) {
        progressPanel.style.display = 'block';
        progressTitle.textContent = 'Đang đọc file âm thanh…';
        updateProgress(0, 1, '0%');

        // Kick off peaks extraction in parallel with compression so the
        // recipient page can render the waveform instantly without
        // re-decoding. Failure is non-fatal — decorative-bars fallback.
        var peaksPromise = window.extractPeaks
          ? window.extractPeaks(state.audioFile, 200)
          : Promise.resolve(null);

        var audioBlob = state.audioFile;
        var audioMime = state.audioFile.type || 'audio/mpeg';
        var compressDuration = 0; // seconds; 0 means unset — GAS uses it if non-zero

        if (window.compressAudio) {
          try {
            progressTitle.textContent = 'Đang nén âm thanh…';
            var compressResult = await window.compressAudio(state.audioFile, {
              onProgress: function (pct) {
                updateProgress(pct, 100, Math.round(pct) + '%');
              }
            });
            audioBlob = compressResult.blob;
            audioMime = compressResult.mime || audioMime;
            compressDuration = compressResult.durationSec || 0;
          } catch (compressErr) {
            // Fall back to raw file — compression is best-effort only.
            audioBlob = state.audioFile;
            audioMime = state.audioFile.type || 'audio/mpeg';
            compressDuration = 0;
          }
        }

        progressTitle.textContent = 'Đang đọc file âm thanh…';
        updateProgress(0, 1, '0%');
        var audioB64 = await readFileAsBase64(audioBlob, function (pct) {
          updateProgress(pct, 100, Math.round(pct) + '%');
        });

        progressTitle.textContent = 'Đang xử lý âm thanh…';
        var peaksResult = await peaksPromise;

        payload.audioData = audioB64;
        payload.audioFilename = state.audioFile.name || (phoneNormalized + '_' + payload.order_id);
        payload.audioMime = audioMime;
        payload.peaks = peaksResult ? JSON.stringify(peaksResult.peaks) : '';
        // Prefer duration from compressor (decoded accurately); fall back to peaks.
        payload.audio_duration = compressDuration || (peaksResult ? peaksResult.duration : 0);

        progressTitle.textContent = 'Đang gửi lên shop…';
        updateProgress(100, 100, '100%');
      } else {
        // Validation guarantees kept audio here — the server reuses the row's
        // file and its peaks/duration.
        payload.keepAudio = '1';
      }

      var finishResp = await gasPost(payload);
      if (!finishResp.ok) throw new Error(finishResp.error || 'Gửi thất bại');

      // Success: swap the sheet's contents; the finished preview stays behind.
      stepEls.forEach(function (el) { el.hidden = true; });
      stepdotsEl.hidden = true;
      progressPanel.style.display = 'none';
      sheetEl.classList.remove('lc-collapsed');
      successPanel.style.display = 'block';

    } catch (err) {
      progressPanel.style.display = 'none';
      showError(submitError, 'Lỗi: ' + (err && err.message ? err.message : 'Không xác định'));
      setSubmitting(false);
    }
  }

  /**
   * Read a File/Blob as base64 (no data: prefix) with progress callback.
   * FileReader.onprogress fires during the read — use it for the progress bar.
   */
  function readFileAsBase64(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Không đọc được file âm thanh')); };
      reader.onprogress = function (ev) {
        if (onProgress && ev.lengthComputable) onProgress((ev.loaded / ev.total) * 100);
      };
      reader.onload = function () {
        var result = reader.result || '';
        var comma = result.indexOf('base64,');
        resolve(comma === -1 ? '' : result.slice(comma + 7));
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── GAS POST helper ───────────────────────────────────────────────────── */
  // Posts URL-encoded form data. GAS doPost reads e.parameter.*; safe for base64
  // payloads up to ~50MB (beyond that, GAS returns 413).
  function gasPost(params) {
    var body = new URLSearchParams();
    Object.keys(params).forEach(function (k) { body.append(k, params[k]); });
    return fetch(VOICE_GAS_URL, {
      method: 'POST',
      body: body
    }).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    });
  }

  // Initial paint + state
  paintPreview();
  goStep(0);
});
