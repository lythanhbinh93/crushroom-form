/**
 * love-counter-upload.js — Controller for the Love Counter QR customer form.
 *
 * Parameter contract: docs/love-counter-submit-contract.md — change that first.
 *
 * Submit flow:
 *  1. Client-side validation (phone, order, start date, both names, both avatars).
 *  2. If audio was supplied: extract waveform peaks and compress, both best-effort.
 *  3. Single POST to GAS submitCounter with all base64 payloads.
 *  4. Show success panel.
 *
 * Differences from voice-upload.js, deliberately:
 *  - Three croppers (two avatars + one background) instead of one, so the modal
 *    is a factory rather than a single hard-wired instance.
 *  - Audio is OPTIONAL. The day count is the product; the voice is a bonus.
 *  - start_date is posted as the raw YYYY-MM-DD string and must be stored
 *    apostrophe-prefixed server-side, or Sheets autocasts it to a Date and the
 *    page renders the previous day. See the contract doc.
 */
document.addEventListener('DOMContentLoaded', function () {

  /* ── Constants ─────────────────────────────────────────────────────────── */
  // Same deployment as the voice gift form — one GAS project serves both row
  // types, discriminated by the `type` parameter.
  var COUNTER_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

  // 35MB hard limit — base64 encoding inflates ~47MB, within GAS 50MB doPost cap.
  // The three images add ~0.5MB on top, which stays comfortably inside the cap.
  var MAX_FILE_MB = 35;
  var WARN_FILE_MB = 20;

  var DEFAULT_TITLE = '❤️ Been Love Memory ❤️';

  /* ── State ──────────────────────────────────────────────────────────────── */
  var state = {
    audioFile: null,
    isSubmitting: false
  };

  /* ── DOM refs ───────────────────────────────────────────────────────────── */
  var form            = document.getElementById('counter-form');
  var phoneInputEl    = document.getElementById('phone-input');
  var orderInput      = document.getElementById('order-input');
  var startDateInput  = document.getElementById('start-date');
  var maleNameEl    = document.getElementById('male-name');
  var femaleNameEl    = document.getElementById('female-name');
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
  var audioSizeWarn   = document.getElementById('audio-size-warning');
  var audioTitleCtrl  = document.getElementById('audio-title-control');
  var audioTitle      = document.getElementById('audio-title');
  var submitBtn       = document.getElementById('submit-btn');
  var submitSpinner   = document.getElementById('submit-spinner');
  var submitLabel     = document.getElementById('submit-label');
  var submitError     = document.getElementById('submit-error');
  var progressPanel   = document.getElementById('progress-panel');
  var progressTitle   = document.getElementById('progress-title');
  var progressFill    = document.getElementById('progress-bar-fill');
  var progressLabel   = document.getElementById('progress-label');
  var successPanel    = document.getElementById('success-panel');

  /* ── Error helpers ──────────────────────────────────────────────────────── */
  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function clearError(el) {
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  function updateProgress(value, total, label) {
    var pct = total ? Math.round((value / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label || (pct + '%');
  }

  /* ── Vietnam-time "today" ───────────────────────────────────────────────── */
  // The counter belongs to the couple, not to whoever is scanning it, so every
  // date boundary in this form resolves in Asia/Ho_Chi_Minh regardless of the
  // device clock. en-CA formats as YYYY-MM-DD, which is the exact wire format.
  function todayInVN() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  // A future start date would render a negative day count, so cap the picker.
  startDateInput.setAttribute('max', todayInVN());

  /* ── URL param parse (optional prefill) ────────────────────────────────── */
  // If staff shares link with ?phone=X&order=Y those fields get prefilled.
  // If customer opens the bare page, the form still works — they enter both.
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

  /* ── Text counter ───────────────────────────────────────────────────────── */
  textMessage.addEventListener('input', function () {
    charCount.textContent = textMessage.value.length;
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

                // Store base64 without the data: prefix for the GAS POST
                picker.dataB64 = (ev.target.result.split('base64,')[1]) || '';
                picker.filename = file.name || (picker.key + '.jpg');
                picker.isSet = true;
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
      picker.isSet = false;
      picker.inputEl.value = '';
      picker.previewEl.innerHTML = '';
      picker.previewAreaEl.style.display = 'none';
      picker.placeholderEl.style.display = 'flex';
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
    viewport: { width: 288, height: 162, type: 'square' },
    boundary: { width: 300, height: 320 },
    output: { width: 1200, height: 675 }, quality: 0.82
  });

  /* ══════════════════════════════════════════════════════════════════════════
   *  AUDIO (optional)
   * ═══════════════════════════════════════════════════════════════════════ */
  audioTriggerBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    audioInput.click();
  });
  audioDropzone.addEventListener('click', function (e) {
    if (e.target === audioTriggerBtn || e.target === audioRemoveBtn) return;
    if (!state.audioFile) audioInput.click();
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

  function handleAudioSelected(file) {
    clearError(document.getElementById('audio-error'));
    var sizeMB = file.size / (1024 * 1024);

    if (sizeMB > MAX_FILE_MB) {
      // Rejection message reads from the constant so HTML and JS stay in sync.
      showError(document.getElementById('audio-error'), 'File quá lớn, tối đa ' + MAX_FILE_MB + 'MB');
      clearAudioFile();
      return;
    }

    state.audioFile = file;
    audioFilenameEl.textContent = file.name + ' (' + sizeMB.toFixed(1) + ' MB)';
    audioPlaceholder.style.display = 'none';
    audioPreview.style.display = 'flex';
    audioSizeWarn.style.display = sizeMB > WARN_FILE_MB ? 'block' : 'none';
    // The audio title only means anything once there is audio to title.
    audioTitleCtrl.style.display = 'block';
    checkFormValid();
  }

  function clearAudioFile() {
    state.audioFile = null;
    audioInput.value = '';
    audioFilenameEl.textContent = '';
    audioPlaceholder.style.display = 'flex';
    audioPreview.style.display = 'none';
    audioSizeWarn.style.display = 'none';
    audioTitleCtrl.style.display = 'none';
    audioTitle.value = '';
    checkFormValid();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  VALIDATION
   * ═══════════════════════════════════════════════════════════════════════ */
  function isValidDateString(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    // Reject a future date even if the browser ignored the max attribute —
    // string compare is safe because both sides are zero-padded YYYY-MM-DD.
    if (v > todayInVN()) return false;
    if (v < '1900-01-01') return false;
    return true;
  }

  function checkFormValid() {
    if (state.isSubmitting) return;
    var phoneOk  = iti ? iti.isValidNumber() : phoneInputEl.value.trim().length >= 8;
    var orderOk  = orderInput.value.trim().length > 0;
    var dateOk   = isValidDateString(startDateInput.value);
    var namesOk  = maleNameEl.value.trim().length > 0 && femaleNameEl.value.trim().length > 0;
    var avatarsOk = maleAvatar.isSet && femaleAvatar.isSet;
    // Audio, background, title, heart text and message are all optional.
    submitBtn.disabled = !(phoneOk && orderOk && dateOk && namesOk && avatarsOk);
  }

  phoneInputEl.addEventListener('input', checkFormValid);
  phoneInputEl.addEventListener('countrychange', checkFormValid);
  orderInput.addEventListener('input', checkFormValid);
  maleNameEl.addEventListener('input', checkFormValid);
  femaleNameEl.addEventListener('input', checkFormValid);

  startDateInput.addEventListener('input', function () {
    clearError(document.getElementById('start-date-error'));
    if (startDateInput.value && !isValidDateString(startDateInput.value)) {
      showError(document.getElementById('start-date-error'),
        startDateInput.value > todayInVN()
          ? 'Ngày bắt đầu không thể ở tương lai'
          : 'Ngày không hợp lệ');
    }
    checkFormValid();
  });

  /* ══════════════════════════════════════════════════════════════════════════
   *  SUBMIT
   * ═══════════════════════════════════════════════════════════════════════ */
  function setSubmitting(active) {
    state.isSubmitting = active;
    submitBtn.disabled = active;
    submitSpinner.style.display = active ? 'inline-block' : 'none';
    submitLabel.textContent = active ? 'Đang gửi…' : 'Tạo trang đếm ngày';
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
        showError(document.getElementById('phone-error'), 'Số điện thoại không hợp lệ');
        setSubmitting(false);
        return;
      }

      var startDate = startDateInput.value;
      if (!isValidDateString(startDate)) {
        showError(document.getElementById('start-date-error'), 'Ngày bắt đầu không hợp lệ');
        setSubmitting(false);
        return;
      }

      var orderId = orderInput.value.trim();

      var payload = {
        action: 'submitCounter',
        type: 'counter',
        phone: phoneNormalized,
        order_id: orderId,
        // Raw YYYY-MM-DD. Server must apostrophe-prefix this before writing,
        // or Sheets autocasts it and the page renders the previous day.
        start_date: startDate,
        male_name: maleNameEl.value.trim(),
        female_name: femaleNameEl.value.trim(),
        title: pageTitle.value.trim() || DEFAULT_TITLE,
        heart_text: heartText.value.trim(),
        text_message: textMessage.value.trim(),
        maleData: maleAvatar.dataB64,
        maleFilename: maleAvatar.filename,
        femaleData: femaleAvatar.dataB64,
        femaleFilename: femaleAvatar.filename,
        bgData: background.dataB64,
        bgFilename: background.filename
      };

      // ── Optional audio ────────────────────────────────────────────────────
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
        payload.audioFilename = state.audioFile.name || (phoneNormalized + '_' + orderId);
        payload.audioMime = audioMime;
        payload.audio_title = audioTitle.value.trim();
        payload.peaks = peaksResult ? JSON.stringify(peaksResult.peaks) : '';
        payload.audio_duration = compressDuration || (peaksResult ? peaksResult.duration : 0);

        progressTitle.textContent = 'Đang gửi lên shop…';
        updateProgress(100, 100, '100%');
      }
      // With no audio the payload is three small JPEGs — roughly a second on 4G.
      // The submit button's own spinner covers that; a progress bar that appears
      // already full would be theatre, so the panel stays hidden.

      var resp = await gasPost(payload);
      if (!resp.ok) throw new Error(resp.error || 'Gửi thất bại');

      form.style.display = 'none';
      progressPanel.style.display = 'none';
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

  // Initial submit button state
  checkFormValid();

});
