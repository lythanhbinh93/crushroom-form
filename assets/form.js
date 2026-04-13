/**
 * Shared form logic for QR Ghi âm & Love Counter upload forms.
 *
 * Usage: each HTML page calls CrushForm.init(config) after DOM ready.
 *   config.action        — Apps Script action name (e.g. 'uploadQrAudio')
 *   config.fields        — array of { name, required, type, maxSize, ... }
 */
(function () {
  'use strict';

  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec';

  window.CrushForm = { init };

  function init(config) {
    const form = document.getElementById('upload-form');
    const formCard = document.querySelector('.form-card');
    const progressEl = document.querySelector('.upload-progress');
    const successEl = document.querySelector('.success-screen');
    const errorBanner = document.querySelector('.error-banner');

    setupFilePreviews();
    setupDragDrop();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError();
      if (!validateAll(config.fields)) return;
      submitForm(config, form, formCard, progressEl, successEl, errorBanner);
    });

    // "Upload another" button
    const btnNew = document.getElementById('btn-new');
    if (btnNew) {
      btnNew.addEventListener('click', function () {
        successEl.classList.remove('visible');
        formCard.style.display = '';
        form.reset();
        clearAllPreviews();
      });
    }
  }

  /* ─── Validation ─── */

  function validateAll(fields) {
    let valid = true;
    for (const f of fields) {
      const group = document.getElementById('group-' + f.name);
      if (!group) continue;
      clearFieldError(group);

      if (f.type === 'file-image' || f.type === 'file-audio') {
        const input = group.querySelector('input[type="file"]');
        const file = input && input.files[0];
        if (f.required && !file) {
          setFieldError(group, 'Vui lòng chọn file.');
          valid = false;
          continue;
        }
        if (file && f.maxSize && file.size > f.maxSize) {
          setFieldError(group, 'File quá lớn (tối đa ' + formatBytes(f.maxSize) + ').');
          valid = false;
        }
      } else {
        const input = group.querySelector('input, textarea');
        if (f.required && input && !input.value.trim()) {
          setFieldError(group, 'Trường này bắt buộc.');
          valid = false;
          continue;
        }
        if (f.name === 'phone' && input) {
          const digits = input.value.replace(/\D/g, '');
          if (digits.length < 8 || digits.length > 12) {
            setFieldError(group, 'Số điện thoại cần 8-12 chữ số.');
            valid = false;
          }
        }
      }
    }
    return valid;
  }

  function setFieldError(group, msg) {
    group.classList.add('has-error');
    const el = group.querySelector('.field-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function clearFieldError(group) {
    group.classList.remove('has-error');
    const el = group.querySelector('.field-error');
    if (el) el.style.display = 'none';
  }

  /* ─── Submit ─── */

  async function submitForm(config, form, formCard, progressEl, successEl, errorBanner) {
    const submitBtn = form.querySelector('.btn-submit');
    submitBtn.disabled = true;
    formCard.style.display = 'none';
    progressEl.classList.add('visible');

    try {
      const payload = new URLSearchParams();
      payload.append('action', config.action);

      const fields = config.fields;
      for (const f of fields) {
        const group = document.getElementById('group-' + f.name);
        if (!group) continue;

        if (f.type === 'file-image' || f.type === 'file-audio') {
          const input = group.querySelector('input[type="file"]');
          const file = input && input.files[0];
          if (file) {
            const b64 = await readFileAsBase64(file);
            payload.append(f.name, b64);
            payload.append(f.name + '_filename', file.name);
            payload.append(f.name + '_type', file.type);
          }
        } else {
          const input = group.querySelector('input, textarea');
          if (input) payload.append(f.name, input.value.trim());
        }
      }

      const resp = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      // Apps Script redirects POST to GET — handle opaque redirect
      let data;
      try {
        data = await resp.json();
      } catch (_) {
        // If redirect/opaque, try re-fetching with no-cors as fallback
        throw new Error('Không thể đọc phản hồi từ server. Vui lòng thử lại.');
      }

      progressEl.classList.remove('visible');

      if (data.success) {
        successEl.classList.add('visible');
      } else {
        throw new Error(data.error || 'Upload thất bại.');
      }
    } catch (err) {
      progressEl.classList.remove('visible');
      formCard.style.display = '';
      submitBtn.disabled = false;
      showError(errorBanner, err.message);
    }
  }

  /* ─── File previews ─── */

  function setupFilePreviews() {
    document.querySelectorAll('.file-drop').forEach(function (drop) {
      const input = drop.querySelector('input[type="file"]');
      if (!input) return;
      input.addEventListener('change', function () {
        showFilePreview(drop, input);
      });
    });
  }

  function showFilePreview(drop, input) {
    const file = input.files[0];
    const container = drop.parentElement.querySelector('.file-preview');
    if (!container) return;
    container.innerHTML = '';
    if (!file) return;

    const item = document.createElement('div');
    item.className = 'file-preview-item';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      item.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'preview-info';
    info.innerHTML = '<span class="preview-name">' + escapeHtml(file.name) + '</span>'
      + '<span class="preview-size">' + formatBytes(file.size) + '</span>';
    item.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'preview-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.addEventListener('click', function () {
      input.value = '';
      container.innerHTML = '';
    });
    item.appendChild(removeBtn);

    container.appendChild(item);

    // Audio preview
    if (file.type.startsWith('audio/')) {
      const audioWrap = document.createElement('div');
      audioWrap.className = 'audio-preview';
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = URL.createObjectURL(file);
      audioWrap.appendChild(audio);

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'preview-remove';
      rmBtn.textContent = '\u00d7';
      rmBtn.addEventListener('click', function () {
        input.value = '';
        container.innerHTML = '';
      });
      audioWrap.appendChild(rmBtn);

      container.innerHTML = '';
      container.appendChild(audioWrap);

      // Validate duration
      validateAudioDuration(audio, drop);
    }
  }

  function validateAudioDuration(audioEl, drop) {
    const group = drop.closest('.field-group');
    audioEl.addEventListener('loadedmetadata', function () {
      const dur = audioEl.duration;
      if (dur < 3) {
        setFieldError(group, 'File ghi âm quá ngắn (tối thiểu 3 giây).');
      } else if (dur > 90) {
        setFieldError(group, 'File ghi âm quá dài (tối đa 90 giây).');
      } else {
        clearFieldError(group);
      }
    });
  }

  function clearAllPreviews() {
    document.querySelectorAll('.file-preview').forEach(function (el) {
      el.innerHTML = '';
    });
  }

  /* ─── Drag & drop ─── */

  function setupDragDrop() {
    document.querySelectorAll('.file-drop').forEach(function (drop) {
      const input = drop.querySelector('input[type="file"]');
      if (!input) return;

      drop.addEventListener('dragover', function (e) {
        e.preventDefault();
        drop.classList.add('dragover');
      });
      drop.addEventListener('dragleave', function () {
        drop.classList.remove('dragover');
      });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  /* ─── Helpers ─── */

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        // Strip "data:...;base64," prefix
        const b64 = reader.result.split(',')[1];
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function showError(banner, msg) {
    if (!banner) return;
    banner.textContent = msg;
    banner.classList.add('visible');
  }

  function hideError() {
    var banner = document.querySelector('.error-banner');
    if (banner) banner.classList.remove('visible');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
