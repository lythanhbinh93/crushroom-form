/**
 * simple-gift-upload.js — ONE controller for both simple gift forms
 * (link-upload.html and image-upload.html), selected by the sheet's
 * data-gift-type attribute. The two forms differ only in which steps exist
 * and whether the photo is required, so each page declares its steps in
 * markup (data-require per step) and this controller adapts.
 *
 * Everything follows the voice/counter form conventions: shared UploadSheet
 * frame, getSubmission hydration + keep-flags, publish-locked panel,
 * submitGift payload (contract doc → "submitGift"), 280-square crop →
 * 400×400 JPEG q0.85.
 */

/**
 * Client mirror of the server's GIFT_LINK_HOSTS allowlist — the server is
 * authoritative (anything can POST); this copy only powers inline validation.
 */
var SG_LINK_HOSTS = [
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
  'music.youtube.com', 'open.spotify.com'
];

function sgIsAllowedLink(url) {
  var m = String(url || '').trim().match(/^https:\/\/([^\/\?#]+)(?:[\/\?#]|$)/i);
  if (!m) return false;
  return SG_LINK_HOSTS.indexOf(m[1].toLowerCase()) !== -1;
}

/**
 * Step gate. Each step section declares data-require; s is the snapshot.
 * Pure — extracted by the Node tests.
 */
function sgRequirementMet(requirement, s) {
  if (requirement === 'phone') return !!s.phoneValid && !!String(s.order || '').trim();
  if (requirement === 'link') return sgIsAllowedLink(s.link);
  if (requirement === 'photo') return !!s.photoSet;
  return true; // optional and review steps
}

/**
 * submitGift payload. Kept image → keepImage=1 and NO image key; the message
 * is optional for both simple types. Pure — extracted by the Node tests.
 */
function sgBuildPayload(s) {
  var p = {
    action: 'submitGift',
    type: s.type,
    phone: s.phone,
    order_id: s.orderId,
    text_message: String(s.message || '').trim()
  };
  if (s.type === 'link') p.media_link = String(s.link || '').trim();
  if (s.image.dataB64) {
    p.imgData = s.image.dataB64;
  } else if (s.image.kept) {
    p.keepImage = '1';
  }
  return p;
}

/** Published rows are frozen — same rule as the other forms. */
function sgIsLocked(sub) {
  return !!sub && String(sub.status || '').trim().toLowerCase() === 'published';
}

/* ── Controller ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

  var sheetEl = document.querySelector('.lc-sheet');
  var giftType = sheetEl.getAttribute('data-gift-type'); // 'link' | 'image'

  var grabBtn = document.getElementById('lc-grab');
  var stepdotsEl = document.getElementById('lc-stepdots');
  var stepEls = Array.prototype.slice.call(document.querySelectorAll('.lc-step'));
  var prefillBanner = document.getElementById('prefill-banner');
  var phoneInputEl = document.getElementById('phone-input');
  var orderInput = document.getElementById('order-input');
  var step0Next = document.getElementById('step0-next');
  var linkInput = document.getElementById('link-input');       // link form only
  var linkError = document.getElementById('link-error');
  var linkServiceEl = document.getElementById('link-service');
  var imageInput = document.getElementById('image-input');
  var imageTrigger = document.getElementById('image-trigger-btn');
  var imageDropzone = document.getElementById('image-dropzone');
  var imagePlaceholder = document.getElementById('image-placeholder');
  var imagePreviewArea = document.getElementById('image-preview-area');
  var imagePreview = document.getElementById('image-preview');
  var imageRemoveBtn = document.getElementById('image-remove-btn');
  var textMessage = document.getElementById('text-message');
  var charCount = document.getElementById('char-count');
  var submitBtn = document.getElementById('submit-btn');
  var submitSpinner = document.getElementById('submit-spinner');
  var submitLabel = document.getElementById('submit-label');
  var submitError = document.getElementById('submit-error');
  var successPanel = document.getElementById('success-panel');
  var lockedPanel = document.getElementById('locked-panel');
  var pvImage = document.getElementById('pv-image');
  var pvPhotoAdd = document.getElementById('pv-photo-add');
  var pvText = document.getElementById('pv-text');
  var pvLinkChip = document.getElementById('pv-link-chip');

  var state = {
    imageDataB64: '',
    keptImageId: '',
    checkedKey: '',
    isSubmitting: false
  };

  function showError(el, msg) { if (el) { el.textContent = msg; el.hidden = false; } }
  function clearError(el) { if (el) { el.hidden = true; el.textContent = ''; } }

  /* ── Identity (same recipe as voice-upload.js) ─────────────────────────── */

  function autoOrderCode() {
    var d = new Date();
    function p(n) { return String(n).length < 2 ? '0' + n : String(n); }
    var stamp = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate())
      + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return 'AUTO-' + stamp + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  var orderFromLink = false;
  (function initFromUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var phone = params.get('phone') || '';
    var order = params.get('order') || '';
    orderFromLink = !!order;
    orderInput.value = order || autoOrderCode();
    orderInput.setAttribute('readonly', 'readonly');
    if (phone) window._prefillPhone = phone;
  })();

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

  /* ── Live preview ──────────────────────────────────────────────────────── */

  function paintPreview() {
    if (state.imageDataB64) {
      pvImage.src = 'data:image/jpeg;base64,' + state.imageDataB64;
      pvImage.hidden = false;
      if (pvPhotoAdd) pvPhotoAdd.hidden = true;
    } else if (state.keptImageId) {
      pvImage.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(state.keptImageId) + '&sz=w800';
      pvImage.hidden = false;
      if (pvPhotoAdd) pvPhotoAdd.hidden = true;
    } else {
      pvImage.removeAttribute('src');
      pvImage.hidden = true;
      if (pvPhotoAdd) pvPhotoAdd.hidden = false;
    }

    var msg = textMessage.value.trim();
    pvText.textContent = msg || 'Lời nhắn của bạn sẽ hiện ở đây';
    pvText.classList.toggle('vc-dim', !msg);

    if (pvLinkChip) {
      var ok = linkInput && sgIsAllowedLink(linkInput.value);
      pvLinkChip.hidden = !ok;
      if (ok) {
        pvLinkChip.textContent = /spotify/i.test(linkInput.value) ? '🎧 Spotify' : '▶️ YouTube';
      }
    }
  }

  /* ── Step navigation ───────────────────────────────────────────────────── */

  function stepSnapshot() {
    return {
      phoneValid: iti ? iti.isValidNumber() : phoneInputEl.value.trim().length >= 8,
      order: orderInput.value,
      link: linkInput ? linkInput.value : '',
      photoSet: !!state.imageDataB64 || !!state.keptImageId,
      message: textMessage.value
    };
  }

  function stepRequirement(i) {
    return stepEls[i] ? (stepEls[i].getAttribute('data-require') || 'none') : 'none';
  }

  var sheet = window.UploadSheet.create({
    sheetEl: sheetEl,
    grabEl: grabBtn,
    dotsEl: stepdotsEl,
    stepEls: stepEls,
    onStep: function () { checkFormValid(); }
  });
  function goStep(i) { sheet.goStep(i); }

  Array.prototype.forEach.call(document.querySelectorAll('.lc-next, .lc-back'), function (btn) {
    btn.addEventListener('click', function () {
      var target = Number(btn.getAttribute('data-goto'));
      if (target > sheet.step && !sgRequirementMet(stepRequirement(sheet.step), stepSnapshot())) {
        flagStepErrors();
        return;
      }
      goStep(target);
    });
  });

  function flagStepErrors() {
    var req = stepRequirement(sheet.step);
    if (req === 'link') {
      showError(linkError, 'Cần link YouTube hoặc Spotify hợp lệ (bắt đầu bằng https://)');
    }
    if (req === 'photo') {
      showError(document.getElementById('image-error'), 'Vui lòng chọn ảnh — đây chính là món quà');
    }
  }

  function checkFormValid() {
    var s = stepSnapshot();
    var allOk = stepEls.every(function (el, i) { return sgRequirementMet(stepRequirement(i), s); });
    submitBtn.disabled = !allOk || state.isSubmitting;
  }

  /* ── Step 0: identity check + hydration + publish-lock ─────────────────── */

  step0Next.addEventListener('click', function () {
    clearError(document.getElementById('phone-error'));
    if (!sgRequirementMet('phone', stepSnapshot())) {
      showError(document.getElementById('phone-error'), 'Số điện thoại không hợp lệ');
      return;
    }
    if (!orderFromLink) { goStep(1); return; }

    var phone = iti ? iti.getNumber() : phoneInputEl.value.trim();
    var orderId = orderInput.value.trim();
    var identityKey = phone + '|' + orderId;
    if (identityKey === state.checkedKey) { goStep(1); return; }

    step0Next.disabled = true;
    step0Next.textContent = 'Đang kiểm tra…';

    fetch(GAS_URL + '?action=getSubmission&phone=' + encodeURIComponent(phone) +
          '&order_id=' + encodeURIComponent(orderId) + '&type=' + encodeURIComponent(giftType))
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        state.checkedKey = identityKey;
        if (resp && resp.ok && resp.found) {
          if (sgIsLocked(resp.submission)) giftLocked = true;
          else hydrateFromSubmission(resp.submission);
        }
      })
      .catch(function () {
        // A blank start is always safe — prefill is best-effort, never a wall.
        state.checkedKey = identityKey;
      })
      .then(function () {
        step0Next.disabled = false;
        step0Next.textContent = 'Bắt đầu tạo →';
        if (giftLocked) showLockedPanel();
        else goStep(1);
      });
  });

  var giftLocked = false;
  function showLockedPanel() {
    giftLocked = true;
    stepEls.forEach(function (el) { el.hidden = true; });
    stepdotsEl.hidden = true;
    sheetEl.classList.remove('lc-collapsed');
    lockedPanel.style.display = 'block';
  }

  function hydrateFromSubmission(sub) {
    textMessage.value = sub.text_message || '';
    if (charCount) charCount.textContent = String(textMessage.value.length);
    if (linkInput && sub.media_link) linkInput.value = sub.media_link;

    if (sub.image_file_id) {
      state.keptImageId = sub.image_file_id;
      state.imageDataB64 = '';
      var img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(sub.image_file_id) + '&sz=w400';
      imagePreview.innerHTML = '';
      imagePreview.appendChild(img);
      imagePlaceholder.style.display = 'none';
      imagePreviewArea.style.display = 'block';
    }

    prefillBanner.textContent = '✳️ Tìm thấy bản đã gửi — bạn đang sửa lại, mã QR giữ nguyên.';
    prefillBanner.hidden = false;

    paintPreview();
    checkFormValid();
  }

  /* ── Link input (link form only) ───────────────────────────────────────── */

  if (linkInput) {
    linkInput.addEventListener('input', function () {
      clearError(linkError);
      var v = linkInput.value.trim();
      if (linkServiceEl) {
        var ok = sgIsAllowedLink(v);
        linkServiceEl.textContent = !v ? '' : ok
          ? (/spotify/i.test(v) ? '✓ Spotify' : '✓ YouTube')
          : 'Chỉ nhận link YouTube / Spotify (https)';
        linkServiceEl.classList.toggle('lc-link-bad', !!v && !ok);
      }
      paintPreview();
      checkFormValid();
    });
  }

  /* ── Photo pick + crop (280-square → 400×400 q0.85, voice-form pattern) ── */

  function triggerPick() { imageInput.click(); }
  if (imageTrigger) imageTrigger.addEventListener('click', triggerPick);
  if (imageDropzone) imageDropzone.addEventListener('click', function (e) {
    if (e.target.closest('#image-remove-btn')) return;
    if (e.target.closest('button') && !e.target.closest('#image-trigger-btn')) return;
    triggerPick();
  });
  if (pvPhotoAdd) pvPhotoAdd.addEventListener('click', triggerPick);

  imageInput.addEventListener('change', function () {
    var file = imageInput.files && imageInput.files[0];
    if (file) openCropModal(file);
  });

  imageRemoveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    state.imageDataB64 = '';
    state.keptImageId = '';
    imageInput.value = '';
    imagePreview.innerHTML = '';
    imagePlaceholder.style.display = 'flex';
    imagePreviewArea.style.display = 'none';
    paintPreview();
    checkFormValid();
  });

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
      imageInput.value = '';
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

    var reader = new FileReader();
    reader.onload = function (e) {
      croppie.bind({ url: e.target.result }).catch(function () {});
    };
    reader.onerror = function () {
      alert('Không đọc được file ảnh. Vui lòng thử ảnh khác.');
      closeModal();
    };
    reader.readAsDataURL(file);

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
            var previewImg = new Image();
            previewImg.src = ev.target.result;
            imagePreview.innerHTML = '';
            imagePreview.appendChild(previewImg);
            imagePlaceholder.style.display = 'none';
            imagePreviewArea.style.display = 'block';

            state.imageDataB64 = (ev.target.result.split('base64,')[1] || '');
            state.keptImageId = '';
            paintPreview();
            checkFormValid();
            resolve();
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

  /* ── Message ───────────────────────────────────────────────────────────── */

  textMessage.addEventListener('input', function () {
    if (charCount) charCount.textContent = textMessage.value.length;
    paintPreview();
    checkFormValid();
  });

  /* ── Submit ────────────────────────────────────────────────────────────── */

  function setSubmitting(on) {
    state.isSubmitting = on;
    submitBtn.disabled = on;
    submitSpinner.style.display = on ? 'inline-block' : 'none';
    submitLabel.textContent = on ? 'Đang gửi…' : 'Gửi món quà 💌';
  }

  sheetEl.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.isSubmitting) return;
    clearError(submitError);
    setSubmitting(true);

    var payload = sgBuildPayload({
      type: giftType,
      phone: iti ? iti.getNumber() : phoneInputEl.value.trim(),
      orderId: orderInput.value.trim(),
      link: linkInput ? linkInput.value : '',
      message: textMessage.value,
      image: state.imageDataB64
        ? { dataB64: state.imageDataB64, kept: false }
        : { dataB64: '', kept: !!state.keptImageId }
    });

    var body = new URLSearchParams();
    Object.keys(payload).forEach(function (k) { body.append(k, payload[k]); });

    fetch(GAS_URL, { method: 'POST', body: body })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (resp) {
        if (!resp.ok) {
          // Raced a publish — the row is frozen; show the locked notice.
          if (resp.error === 'published_locked') {
            showLockedPanel();
            return;
          }
          throw new Error(resp.error || 'Gửi thất bại');
        }
        stepEls.forEach(function (el) { el.hidden = true; });
        stepdotsEl.hidden = true;
        sheetEl.classList.remove('lc-collapsed');
        successPanel.style.display = 'block';
      })
      .catch(function (err) {
        showError(submitError, 'Gửi thất bại: ' + (err && err.message ? err.message : err));
        setSubmitting(false);
      });
  });

  // Initial paint + state
  paintPreview();
  goStep(0);
});
