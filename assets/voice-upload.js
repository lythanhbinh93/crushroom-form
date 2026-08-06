/**
 * voice-upload.js — Controller for the Voice Gift QR customer upload form.
 *
 * Submit flow:
 *  1. Client-side validation (phone, audio, image, text).
 *  2. POST GAS initUpload → receive { uploadUrl, sessionId }.
 *  3. Chunked PUT audio bytes directly to Drive resumable uploadUrl.
 *     - 256 KB chunks: small enough for snappy progress on slow 4G,
 *       large enough to keep HTTP overhead low.
 *     - On 308 Resume Incomplete → send next chunk.
 *     - On 5xx → exponential-backoff retry (1s, 2s, 4s); on persistent failure
 *       query Drive for resume cursor and offer Resume button.
 *  4. POST GAS finishUpload with fileId, text, image base64, image filename.
 *  5. Show success panel.
 */
document.addEventListener('DOMContentLoaded', function () {

  /* ── Constants ─────────────────────────────────────────────────────────── */
  var VOICE_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

  // 35MB hard limit — base64 encoding inflates ~47MB, within GAS 50MB doPost cap.
  // Warn at 20MB: large uploads over slow connections may hit GAS timeouts.
  var MAX_FILE_MB = 35;
  var WARN_FILE_MB = 20;

  /* ── State ──────────────────────────────────────────────────────────────── */
  var state = {
    audioFile: null,       // File object selected by user
    imageCropped: false,   // true after Croppie OK
    imageDataB64: '',      // base64 string (no data: prefix)
    imageFilename: '',     // original filename for sheet reference
    isSubmitting: false
  };

  /* ── DOM refs ───────────────────────────────────────────────────────────── */
  var form           = document.getElementById('voice-form');
  var phoneInputEl   = document.getElementById('phone-input');
  var orderInput     = document.getElementById('order-input');
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
  var paramErrorPanel = document.getElementById('param-error-panel');
  var paramErrorMsg  = document.getElementById('param-error-message');

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showError(el, msg) {
    el.textContent = escapeHtml(msg);
    el.style.display = 'block';
  }
  function clearError(el) {
    el.textContent = '';
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

  /* ── URL param parse (optional prefill) ────────────────────────────────── */
  // If staff shares link with ?phone=X&order=Y those fields get prefilled.
  // If customer opens bare /voice-upload.html, form still works — they enter
  // the phone manually.
  //
  // The order field is hidden from customers this phase, but order_id is still
  // required by the backend and is half the (phone, order_id) row key, so it is
  // always filled: the real code when the link carries one, else an auto code.
  (function initFromUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var phone  = params.get('phone') || '';
    var order  = params.get('order') || '';

    orderInput.value = order || autoOrderCode();
    orderInput.setAttribute('readonly', 'readonly');

    // Phone is prefilled after intl-tel-input init (below)
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
    // Prefill after plugin init (plugin sets placeholder, then we overwrite)
    if (window._prefillPhone) {
      phoneInputEl.value = window._prefillPhone;
    }
  } else if (window._prefillPhone) {
    phoneInputEl.value = window._prefillPhone;
  }

  /* ── Text counter ───────────────────────────────────────────────────────── */
  textMessage.addEventListener('input', function () {
    var len = textMessage.value.length;
    charCount.textContent = len;
    checkFormValid();
  });

  /* ── Audio file handling ────────────────────────────────────────────────── */
  // Explicit click dispatch — more reliable on iOS Safari / Android WebViews
  audioTriggerBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    audioInput.click();
  });
  audioDropzone.addEventListener('click', function (e) {
    if (e.target === audioTriggerBtn || e.target === audioRemoveBtn) return;
    if (!state.audioFile) audioInput.click();
  });

  // Drag-and-drop support
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
      showError(document.getElementById('audio-error'), 'File quá lớn, tối đa 50MB');
      clearAudioFile();
      return;
    }

    state.audioFile = file;
    var displayMB = sizeMB.toFixed(1);
    audioFilename.textContent = file.name + ' (' + displayMB + ' MB)';
    audioPlaceholder.style.display = 'none';
    audioPreview.style.display = 'flex';

    // Yellow warning for large files that are still within limit
    if (sizeMB > WARN_FILE_MB) {
      audioSizeWarn.style.display = 'block';
    } else {
      audioSizeWarn.style.display = 'none';
    }
    checkFormValid();
  }

  function clearAudioFile() {
    state.audioFile = null;
    audioInput.value = '';
    audioFilename.textContent = '';
    audioPlaceholder.style.display = 'flex';
    audioPreview.style.display = 'none';
    audioSizeWarn.style.display = 'none';
    checkFormValid();
  }

  /* ── Image / Croppie handling ───────────────────────────────────────────── */
  imageTriggerBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    imageInput.click();
  });
  imagePlaceholder.addEventListener('click', function (e) {
    if (e.target === imageTriggerBtn) return;
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
    imageInput.value = '';
    imageDataInput.value = '';
    imagePreview.innerHTML = '';
    imagePlaceholder.style.display = 'flex';
    imagePreviewArea.style.display = 'none';
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
    cancelBtn.className = 'dropzone--placeholder--button';
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
     * Uses canvas to composite result, stores base64 in hidden input + shows preview.
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
                // Render cropped image into preview element
                var previewImg = new Image();
                previewImg.src = ev.target.result;
                imagePreview.innerHTML = '';
                imagePreview.appendChild(previewImg);
                imagePlaceholder.style.display = 'none';
                imagePreviewArea.style.display = 'block';

                // Store base64 without data: prefix for GAS POST
                var dataUrl = ev.target.result;
                state.imageDataB64 = dataUrl.split('base64,')[1] || '';
                state.imageFilename = file.name || 'photo.jpg';
                imageDataInput.value = state.imageDataB64;
                state.imageCropped = true;
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

  /* ── Form validation ────────────────────────────────────────────────────── */
  // Enable submit only when all 4 required fields are present and phone is valid.
  function checkFormValid() {
    if (state.isSubmitting) return;
    var phoneOk   = iti ? iti.isValidNumber() : phoneInputEl.value.trim().length >= 8;
    var orderOk   = orderInput.value.trim().length > 0;
    var audioOk   = !!state.audioFile;
    var imageOk   = state.imageCropped;
    var textOk    = textMessage.value.trim().length > 0;
    var allOk = phoneOk && orderOk && audioOk && imageOk && textOk;
    submitBtn.disabled = !allOk;
  }

  // Wire validation re-check to input events
  phoneInputEl.addEventListener('input', checkFormValid);
  phoneInputEl.addEventListener('countrychange', checkFormValid);
  orderInput.addEventListener('input', checkFormValid);

  /* ── Submit handler ─────────────────────────────────────────────────────── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.isSubmitting) return;
    submitVoice();
  });

  function setSubmitting(active) {
    state.isSubmitting = active;
    submitBtn.disabled = active;
    submitSpinner.style.display = active ? 'inline-block' : 'none';
    submitLabel.textContent = active ? 'Đang gửi…' : 'Gửi lời nhắn';
    // Disable all inputs during submit
    var inputs = form.querySelectorAll('input, textarea, button');
    inputs.forEach(function (el) { el.disabled = active; });
  }

  /**
   * Submit flow (pivoted — Drive resumable PUT blocked by CORS from browser):
   *  1. Read audio File as base64 in browser (FileReader).
   *  2. Single POST to GAS finishUpload with audioData + imgData + text.
   *  3. GAS saves both files to Drive, writes sheet row, emails staff.
   *
   * Progress UI during base64 read = real-time; upload itself = indeterminate spinner.
   */
  async function submitVoice() {
    clearError(submitError);
    state.isSubmitting = true;
    setSubmitting(true);

    try {
      var phoneNormalized = iti ? iti.getNumber() : phoneInputEl.value.trim();
      if (iti && !iti.isValidNumber()) {
        showError(document.getElementById('phone-error'), 'Số điện thoại không hợp lệ');
        setSubmitting(false);
        state.isSubmitting = false;
        return;
      }
      var orderId = orderInput.value.trim();
      var textVal = textMessage.value.trim();

      progressPanel.style.display = 'block';
      progressTitle.textContent = 'Đang đọc file âm thanh…';
      updateProgress(0, 1, '0%');

      // Kick off peaks extraction in parallel with base64 read so the recipient
      // page can render the waveform instantly without re-decoding. Failure is
      // non-fatal — recipient just falls back to decorative bars.
      var peaksPromise = window.extractPeaks
        ? window.extractPeaks(state.audioFile, 200)
        : Promise.resolve(null);

      var audioB64 = await readFileAsBase64(state.audioFile, function (pct) {
        updateProgress(pct, 100, Math.round(pct) + '%');
      });

      progressTitle.textContent = 'Đang xử lý âm thanh…';
      var peaksResult = await peaksPromise;

      progressTitle.textContent = 'Đang gửi lên shop…';
      updateProgress(100, 100, '100%');

      var finishResp = await gasPost({
        action: 'finishUpload',
        phone: phoneNormalized,
        order_id: orderId,
        text_message: textVal,
        audioData: audioB64,
        audioFilename: state.audioFile.name || (phoneNormalized + '_' + orderId),
        audioMime: state.audioFile.type || 'audio/mpeg',
        imgData: state.imageDataB64,
        imgFilename: state.imageFilename,
        peaks: peaksResult ? JSON.stringify(peaksResult.peaks) : '',
        audio_duration: peaksResult ? peaksResult.duration : 0
      });

      if (!finishResp.ok) throw new Error(finishResp.error || 'Gửi thất bại');

      form.style.display = 'none';
      progressPanel.style.display = 'none';
      successPanel.style.display = 'block';

    } catch (err) {
      progressPanel.style.display = 'none';
      showError(submitError, 'Lỗi: ' + (err && err.message ? err.message : 'Không xác định'));
      setSubmitting(false);
      state.isSubmitting = false;
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

  /* ── GAS POST helper ────────────────────────────────────────────────────── */
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

  // Initial submit button state
  checkFormValid();

});
