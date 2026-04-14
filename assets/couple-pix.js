/**
 * CouplePix customer upload form (v2 — product-driven).
 *
 * Flow:
 *  1. Fetch product catalog from GAS (action=listProducts).
 *  2. Customer types phone + picks products (with qty).
 *  3. Per picked product, render `qty × imagesPerUnit` upload slots dynamically.
 *     Each slot reuses the existing Croppie crop modal via initCroppieSlot().
 *  4. Submit posts indexed params ImgData_i / Sku_i / ProductName_i / Slot_i / Filename_i
 *     plus SamePhoto flag to GAS doPost.
 */
document.addEventListener('DOMContentLoaded', function () {
  var SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec';

  // ------- Phone input -------
  var phoneInput = document.querySelector('#mobile_code');
  if (window.intlTelInput) {
    window.intlTelInput(phoneInput, {
      initialCountry: 'vn',
      showSelectedDialCode: true,
      countrySearch: false,
      utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@20.3.0/build/js/utils.js'
    });
  }

  // ------- State -------
  // allProducts: full catalog as returned by GAS (preserved for filter re-renders).
  // productsById: { [sku]: { sku, name, type, material, imagesPerUnit, hint, thumbnailUrl } }
  // selections: { [sku]: qty } (qty=0 means not selected). Persists across filter changes.
  var allProducts = [];
  var productsById = {};
  var selections = {};

  // ------- Helpers (shared) -------
  function cleanSku(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var up = s.toUpperCase();
    if (up.indexOf('COUPLEPIX-') !== -1) {
      var parts = up.split('COUPLEPIX-');
      if (parts[1]) return parts[1].split(/\s+/)[0];
    }
    return up.replace(/\s+/g, '');
  }

  function last4(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '0000';
    var slice = digits.slice(-4);
    while (slice.length < 4) slice = '0' + slice;
    return slice;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Google Drive share links (e.g. https://drive.google.com/file/d/{id}/view) can't be
  // used directly as <img src>. Convert to the public thumbnail endpoint.
  function normalizeThumbUrl(url, size) {
    if (!url) return '';
    var s = String(url).trim();
    if (!s) return '';
    var isGoogle = s.indexOf('drive.google.com') !== -1 || s.indexOf('docs.google.com') !== -1;
    if (!isGoogle) return s;
    var m = s.match(/[-\w]{25,}/);
    if (!m) return s;
    var px = size || 200;
    return 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w' + px;
  }

  // ------- Product picker -------
  var pickerLoading = document.getElementById('product-picker-loading');
  var pickerError = document.getElementById('product-picker-error');
  var pickerEl = document.getElementById('product-picker');
  var pickerEmpty = document.getElementById('product-picker-empty');
  var pickerCount = document.getElementById('product-picker-count');
  var pickerPrompt = document.getElementById('product-picker-prompt');
  var filterBar = document.getElementById('product-filter-bar');
  var filterSearch = document.getElementById('filter-search');
  var filterTypeSel = document.getElementById('filter-type');
  var filterMaterialSel = document.getElementById('filter-material');
  var skuQuickAddBox = document.getElementById('sku-quickadd');
  var skuQuickAddInput = document.getElementById('sku-quickadd-input');
  var skuQuickAddBtn = document.getElementById('sku-quickadd-btn');
  var skuQuickAddMsg = document.getElementById('sku-quickadd-msg');
  var samePhotoControl = document.getElementById('same-photo-control');
  var samePhotoCheckbox = document.getElementById('same-photo-for-all');
  var slotsContainer = document.getElementById('slots-container');

  var OTHER_LABEL = '(Khác)';
  var scrollToSlotsOnNextPick = true;

  function loadProducts() {
    fetch(SCRIPT_URL + '?action=listProducts')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        pickerLoading.style.display = 'none';
        if (!data || !data.success) {
          showPickerError((data && data.error) || 'Không tải được danh sách sản phẩm.');
          return;
        }
        var products = data.products || [];
        if (!products.length) {
          showPickerError('Shop chưa cấu hình sản phẩm. Vui lòng liên hệ CS.');
          return;
        }
        allProducts = products;
        productsById = {};
        products.forEach(function (p) {
          productsById[p.sku] = p;
          if (selections[p.sku] == null) selections[p.sku] = 0;
        });
        var anyFilter = populateFilters(products);
        filterBar.style.display = anyFilter ? 'flex' : 'none';
        skuQuickAddBox.style.display = 'block';
        reRender();
      })
      .catch(function (err) {
        pickerLoading.style.display = 'none';
        showPickerError('Lỗi kết nối: ' + err.message);
      });
  }

  function showPickerError(msg) {
    pickerError.textContent = msg;
    pickerError.style.display = 'block';
  }

  // Collect unique non-empty values of a product field (plus OTHER_LABEL if any blank exists).
  function uniqueValues(products, field) {
    var seen = {};
    var hasBlank = false;
    products.forEach(function (p) {
      var v = String(p[field] == null ? '' : p[field]).trim();
      if (!v) hasBlank = true;
      else seen[v] = true;
    });
    var list = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'vi'); });
    if (hasBlank) list.push(OTHER_LABEL);
    return list;
  }

  function populateFilters(products) {
    var typeValues = uniqueValues(products, 'type');
    var materialValues = uniqueValues(products, 'material');
    var hasTypeFilter = fillFilterOptions(filterTypeSel, typeValues);
    var hasMaterialFilter = fillFilterOptions(filterMaterialSel, materialValues);
    // If GAS hasn't been redeployed yet, `type`/`material` won't come through and
    // the only option would be "(Khác)" — hide the filter so the UI doesn't look broken.
    filterTypeSel.style.display = hasTypeFilter ? '' : 'none';
    filterMaterialSel.style.display = hasMaterialFilter ? '' : 'none';
    return hasTypeFilter || hasMaterialFilter;
  }

  function fillFilterOptions(selectEl, values) {
    // Preserve the first option ("Tất cả ...") already in HTML.
    while (selectEl.options.length > 1) selectEl.remove(1);
    // Drop a lone "(Khác)" — it means no real categorization is available.
    var meaningful = values.filter(function (v) { return v !== OTHER_LABEL; });
    if (!meaningful.length) return false;
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
    return true;
  }

  function matchesFilter(product, typeSel, materialSel) {
    var pType = String(product.type == null ? '' : product.type).trim();
    var pMat = String(product.material == null ? '' : product.material).trim();
    if (typeSel) {
      if (typeSel === OTHER_LABEL ? pType !== '' : pType !== typeSel) return false;
    }
    if (materialSel) {
      if (materialSel === OTHER_LABEL ? pMat !== '' : pMat !== materialSel) return false;
    }
    return true;
  }

  function filteredProducts() {
    var t = filterTypeSel.value;
    var m = filterMaterialSel.value;
    var q = (filterSearch.value || '').trim().toLowerCase();
    if (!t && !m && !q) return allProducts;
    return allProducts.filter(function (p) {
      if (!matchesFilter(p, t, m)) return false;
      if (q) {
        var hay = ((p.name || '') + ' ' + (p.sku || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // With 200+ SKUs, rendering every card up front is wasteful — the customer
  // almost always wants to paste a SKU or search by name. Only paint cards when
  // the customer has narrowed the catalog (search term / type / material).
  function hasActiveFilter() {
    return !!(filterTypeSel.value || filterMaterialSel.value
              || (filterSearch.value || '').trim());
  }
  function reRender() {
    if (!allProducts.length) return;
    if (!hasActiveFilter()) {
      pickerEl.style.display = 'none';
      pickerEmpty.style.display = 'none';
      pickerCount.style.display = 'none';
      pickerPrompt.style.display = 'flex';
      return;
    }
    pickerPrompt.style.display = 'none';
    renderPicker(filteredProducts());
  }
  filterTypeSel.addEventListener('change', reRender);
  filterMaterialSel.addEventListener('change', reRender);

  // Debounce search input so we don't re-render on every keystroke when the list is large.
  var searchDebounce = null;
  filterSearch.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(reRender, 120);
  });

  function updatePickerCount(shownCount) {
    var total = allProducts.length;
    if (!total) { pickerCount.style.display = 'none'; return; }
    pickerCount.style.display = 'block';
    pickerCount.textContent = shownCount === total
      ? 'Tổng ' + total + ' sản phẩm'
      : 'Đang hiển thị ' + shownCount + '/' + total + ' sản phẩm';
  }

  function renderPicker(products) {
    pickerEl.innerHTML = '';
    updatePickerCount(products.length);

    if (!products.length) {
      pickerEl.style.display = 'none';
      pickerEmpty.style.display = 'block';
      return;
    }
    pickerEmpty.style.display = 'none';

    // Build into a fragment so re-layout happens once, not N times (important at 200 SKUs).
    var frag = document.createDocumentFragment();

    products.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'product-card';
      card.setAttribute('data-sku', p.sku);
      if ((selections[p.sku] || 0) > 0) card.classList.add('is-selected');

      var thumbSrc = normalizeThumbUrl(p.thumbnailUrl, 600);
      var thumbHtml;
      if (thumbSrc) {
        thumbHtml =
          '<div class="product-card-thumb">' +
            '<img src="' + escapeHtml(thumbSrc) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ' +
                 'onerror="this.onerror=null;this.parentNode.classList.add(\'product-card-thumb--placeholder\');this.remove();">' +
          '</div>';
      } else {
        thumbHtml = '<div class="product-card-thumb product-card-thumb--placeholder">\uD83D\uDCF8</div>';
      }

      var metaBits = [];
      metaBits.push('<span class="product-card-sku">' + escapeHtml(p.sku) + '</span>');
      if (p.type) metaBits.push('<span class="product-card-tag">' + escapeHtml(p.type) + '</span>');
      if (p.material) metaBits.push('<span class="product-card-tag">' + escapeHtml(p.material) + '</span>');
      if (p.imagesPerUnit > 1) metaBits.push('<span class="product-card-badge">' + p.imagesPerUnit + ' ảnh/SP</span>');

      var currentQty = selections[p.sku] || 0;

      card.innerHTML =
        thumbHtml +
        '<div class="product-card-body">' +
          '<div class="product-card-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="product-card-meta">' + metaBits.join('') + '</div>' +
          (p.hint ? '<div class="product-card-hint">' + escapeHtml(p.hint) + '</div>' : '') +
          '<div class="product-card-qty">' +
            '<button type="button" class="qty-btn qty-minus" aria-label="Giảm">−</button>' +
            '<input type="text" class="qty-input" value="' + currentQty + '" inputmode="numeric" readonly>' +
            '<button type="button" class="qty-btn qty-plus qty-plus--primary" aria-label="Thêm số lượng">+ Thêm</button>' +
          '</div>' +
        '</div>';

      frag.appendChild(card);

      var qtyInput = card.querySelector('.qty-input');
      card.querySelector('.qty-minus').addEventListener('click', function () {
        setQty(p.sku, Math.max(0, (selections[p.sku] || 0) - 1), qtyInput, card);
      });
      card.querySelector('.qty-plus').addEventListener('click', function () {
        setQty(p.sku, (selections[p.sku] || 0) + 1, qtyInput, card);
      });
    });

    pickerEl.appendChild(frag);
    pickerEl.style.display = 'block';
  }

  function setQty(sku, qty, qtyInput, card) {
    var prev = selections[sku] || 0;
    selections[sku] = qty;
    qtyInput.value = qty;
    if (qty > 0) card.classList.add('is-selected');
    else card.classList.remove('is-selected');
    rebuildSlots();

    // First time a user picks any product, scroll to the freshly generated slots so
    // they can see where to upload the photo. Only auto-scroll once per session.
    if (scrollToSlotsOnNextPick && prev === 0 && qty > 0) {
      scrollToSlotsOnNextPick = false;
      setTimeout(scrollToFirstSlot, 50);
    }
  }

  function scrollToFirstSlot() {
    if (slotsContainer.firstElementChild && slotsContainer.firstElementChild.scrollIntoView) {
      slotsContainer.firstElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ------- Quick-add by SKU (v3c) -------
  // Customer pastes / types the SKU from their order email, hits Enter → product
  // is added to `selections` directly, bypassing the card grid entirely.
  var quickAddMsgTimer = null;
  function showQuickAddMsg(text, kind) {
    skuQuickAddMsg.textContent = text;
    skuQuickAddMsg.classList.remove('sku-quickadd-msg--error', 'sku-quickadd-msg--ok');
    skuQuickAddMsg.classList.add(kind === 'ok' ? 'sku-quickadd-msg--ok' : 'sku-quickadd-msg--error');
    skuQuickAddMsg.style.display = 'block';
    clearTimeout(quickAddMsgTimer);
    quickAddMsgTimer = setTimeout(function () {
      skuQuickAddMsg.style.display = 'none';
    }, 3000);
  }

  function quickAddSku() {
    var raw = (skuQuickAddInput.value || '').trim();
    if (!raw) return;
    var cleaned = cleanSku(raw);
    var hit = productsById[cleaned] || productsById[raw.toUpperCase()] || null;
    if (!hit) {
      for (var i = 0; i < allProducts.length; i++) {
        if (cleanSku(allProducts[i].sku) === cleaned) { hit = allProducts[i]; break; }
      }
    }
    if (!hit) {
      showQuickAddMsg('Không tìm thấy SKU "' + raw + '". Kiểm tra lại hoặc tìm bằng tên bên dưới.', 'error');
      return;
    }
    var curQty = selections[hit.sku] || 0;
    selections[hit.sku] = curQty + 1;
    rebuildSlots();
    if (scrollToSlotsOnNextPick && curQty === 0) {
      scrollToSlotsOnNextPick = false;
      setTimeout(scrollToFirstSlot, 50);
    }
    showQuickAddMsg('Đã thêm: ' + hit.name + ' (số lượng: ' + selections[hit.sku] + ')', 'ok');
    skuQuickAddInput.value = '';
    // If the matching card is currently on screen (filter/search active), repaint
    // so its qty input reflects the new value.
    if (hasActiveFilter()) reRender();
  }

  skuQuickAddBtn.addEventListener('click', quickAddSku);
  skuQuickAddInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      quickAddSku();
    }
  });
  // Right-click → paste is the dominant flow. Defer so the input value is populated.
  skuQuickAddInput.addEventListener('paste', function () {
    setTimeout(quickAddSku, 0);
  });

  // ------- Slot building -------
  // Each slot has a unique DOM node created from #slot-template. We attach a Croppie
  // factory via initCroppieSlot so each slot has independent crop state.
  function rebuildSlots() {
    slotsContainer.innerHTML = '';

    var pickedSkus = Object.keys(selections).filter(function (sku) { return selections[sku] > 0; });
    var totalSlots = 0;
    pickedSkus.forEach(function (sku) {
      var p = productsById[sku];
      if (!p) return;
      totalSlots += (selections[sku] || 0) * (p.imagesPerUnit || 1);
    });

    if (totalSlots === 0) {
      samePhotoControl.style.display = 'none';
      samePhotoCheckbox.checked = false;
      return;
    }

    // Show same-photo toggle only when there's more than 1 slot in total.
    samePhotoControl.style.display = totalSlots > 1 ? 'block' : 'none';
    if (totalSlots <= 1) samePhotoCheckbox.checked = false;

    var tpl = document.getElementById('slot-template');
    var globalIdx = 0;

    pickedSkus.forEach(function (sku) {
      var p = productsById[sku];
      if (!p) return;
      var qty = selections[sku] || 0;
      var perUnit = p.imagesPerUnit || 1;
      for (var unit = 0; unit < qty; unit++) {
        for (var subIdx = 0; subIdx < perUnit; subIdx++) {
          var slotEl = tpl.content.firstElementChild.cloneNode(true);
          slotEl.setAttribute('data-slot-index', String(globalIdx));
          slotEl.setAttribute('data-sku', sku);
          slotEl.setAttribute('data-name', p.name);
          slotEl.setAttribute('data-sub-index', String(subIdx));

          var titleParts = [p.name];
          if (qty > 1) titleParts.push('#' + (unit + 1));
          if (perUnit > 1) titleParts.push('Ảnh ' + (subIdx + 1) + '/' + perUnit);
          slotEl.querySelector('.slot-title').textContent = titleParts.join(' — ');

          var hintEl = slotEl.querySelector('.slot-hint');
          if (p.hint) hintEl.textContent = p.hint;
          else hintEl.style.display = 'none';

          initCroppieSlot(slotEl);
          slotsContainer.appendChild(slotEl);
          globalIdx++;
        }
      }
    });

    updateSamePhotoVisibility();
  }

  // When "same photo for all" is on, hide all slots except the first.
  function updateSamePhotoVisibility() {
    var isSame = samePhotoCheckbox.checked;
    var slots = slotsContainer.querySelectorAll('.slot-card');
    slots.forEach(function (s, i) {
      if (isSame && i > 0) s.classList.add('slot-hidden');
      else s.classList.remove('slot-hidden');
    });
  }

  samePhotoCheckbox.addEventListener('change', updateSamePhotoVisibility);

  // ------- Croppie per-slot init -------
  function initCroppieSlot(slotEl) {
    var fileInput = slotEl.querySelector('.slot-file-input');
    var fileTrigger = slotEl.querySelector('.slot-file-trigger');
    var imgPreview = slotEl.querySelector('.slot-img-preview');
    var removeBtn = slotEl.querySelector('.slot-remove-btn');
    var placeholder = slotEl.querySelector('.dropzone--placeholder');
    var previewArea = slotEl.querySelector('.dropzone--preview--area');
    var dropzone = slotEl.querySelector('.dropzone');

    // Explicit click dispatch — more reliable than <label for> on a display:none
    // file input across mobile browsers / iOS Safari / webviews.
    fileTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });

    // Clicking the placeholder area (anywhere in the empty dropzone) also
    // opens the picker — bigger tap target on phones.
    placeholder.addEventListener('click', function (e) {
      if (e.target === fileTrigger) return; // already handled above
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      handleFileSelected(fileInput.files[0]);
    });

    // Drag-and-drop (the UI says "kéo ảnh vào đây" so let's honor it).
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('is-dragover');
      });
    });
    dropzone.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) handleFileSelected(files[0]);
    });

    function handleFileSelected(file) {
      if (!file.type || file.type.indexOf('image/') !== 0) {
        alert('Chỉ hỗ trợ ảnh (JPG, PNG, HEIC...).');
        return;
      }
      openImageCropModal(file, imgPreview, placeholder, previewArea, fileInput);
    }

    removeBtn.addEventListener('click', function () {
      fileInput.value = '';
      imgPreview.innerHTML = '';
      slotEl.querySelector('.slot-img-data').value = '';
      placeholder.style.display = 'flex';
      previewArea.style.display = 'none';
      slotEl.classList.remove('has-image');
    });
  }

  // Reused Croppie + zoom modal (logic preserved from v1, refactored for any slot).
  function openImageCropModal(file, imgPreview, placeholder, previewArea, fileInput) {
    if (!file) return;
    if (typeof Croppie === 'undefined') {
      alert('Không tải được bộ cắt ảnh. Vui lòng refresh trang và thử lại.');
      console.error('[CouplePix] Croppie library not loaded.');
      return;
    }

    // Visible backdrop — user clearly sees the modal is open.
    var overlay = document.createElement('div');
    overlay.className = 'couplepix-backdrop';
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.classList.add('modal');

    var croppieContainer = document.createElement('div');
    // NOTE: do NOT use a class containing the substring "croppie-container".
    // Croppie's ctor guards against re-init with
    //   element.className.indexOf('croppie-container') > -1 → throw
    // so e.g. 'croppie-container-slot' would false-match and never mount.
    croppieContainer.className = 'couplepix-cropper';
    modal.appendChild(croppieContainer);

    // Action row: Cancel + OK. "OK" disables itself while cropping to
    // prevent double-clicks and gives visible feedback.
    var actionRow = document.createElement('div');
    actionRow.className = 'couplepix-modal-actions';

    var cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Huỷ';
    cancelButton.className = 'dropzone--placeholder--button';
    cancelButton.addEventListener('click', function () {
      if (fileInput) fileInput.value = '';
      closeModal();
    });

    var cropButton = document.createElement('button');
    cropButton.type = 'button';
    cropButton.textContent = 'OK';
    cropButton.className = 'dropzone--placeholder--button couplepix-modal-ok';
    cropButton.addEventListener('click', function () {
      if (cropButton.disabled) return;
      cropButton.disabled = true;
      cropButton.textContent = 'Đang xử lý…';
      cropImage()
        .then(function () { closeModal(); })
        .catch(function (err) {
          console.error('[CouplePix] Crop failed:', err);
          alert('Không xử lý được ảnh: ' + (err && err.message ? err.message : 'lỗi không rõ') + '. Vui lòng thử ảnh khác.');
          cropButton.disabled = false;
          cropButton.textContent = 'OK';
        });
    });

    actionRow.appendChild(cancelButton);
    actionRow.appendChild(cropButton);
    modal.appendChild(actionRow);

    document.body.appendChild(modal);

    var croppie;
    try {
      croppie = new Croppie(croppieContainer, {
        viewport: { width: 300, height: 300, type: 'circle' },
        boundary: { width: 300, height: 400, type: 'infinity' },
        enableZoom: true,
        enforceBoundary: false
      });
    } catch (e) {
      console.error('[CouplePix] Croppie init failed:', e);
      alert('Không khởi tạo được bộ cắt ảnh. Vui lòng thử lại.');
      closeModal();
      return;
    }

    // Zoom +/- buttons (lifted from v1).
    (function addZoomButtons() {
      var zoomControls = document.createElement('div');
      zoomControls.className = 'couplepix-zoom-controls';

      var minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.textContent = '−';
      minusBtn.className = 'dropzone--placeholder--button';

      var plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.textContent = '+';
      plusBtn.className = 'dropzone--placeholder--button';

      zoomControls.appendChild(minusBtn);
      zoomControls.appendChild(plusBtn);
      modal.insertBefore(zoomControls, actionRow);

      var STEP = 0.01;
      function triggerInput(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }
      function clamp(v, mn, mx) { return Math.min(mx, Math.max(mn, v)); }

      function wireWithSlider(slider) {
        minusBtn.addEventListener('click', function () {
          var cur = parseFloat(slider.value || '0');
          var mn = parseFloat(slider.min || '0');
          var mx = parseFloat(slider.max || '1');
          slider.value = String(clamp(cur - STEP, mn, mx));
          triggerInput(slider);
        });
        plusBtn.addEventListener('click', function () {
          var cur = parseFloat(slider.value || '0');
          var mn = parseFloat(slider.min || '0');
          var mx = parseFloat(slider.max || '1');
          slider.value = String(clamp(cur + STEP, mn, mx));
          triggerInput(slider);
        });
      }

      var sliderNow = croppieContainer.querySelector('.cr-slider');
      if (sliderNow) { wireWithSlider(sliderNow); return; }
      var ob = new MutationObserver(function () {
        var slider = croppieContainer.querySelector('.cr-slider');
        if (slider) { wireWithSlider(slider); ob.disconnect(); }
      });
      ob.observe(croppieContainer, { childList: true, subtree: true });

      // Fallback API if slider never appears.
      minusBtn.addEventListener('click', function () {
        var cur = (croppie.get() || {}).zoom || 0;
        croppie.setZoom(cur - STEP);
      });
      plusBtn.addEventListener('click', function () {
        var cur = (croppie.get() || {}).zoom || 0;
        croppie.setZoom(cur + STEP);
      });
    })();

    var reader = new FileReader();
    reader.onload = function (e) {
      croppie.bind({ url: e.target.result }).catch(function (err) {
        console.error('[CouplePix] Croppie bind failed:', err);
      });
    };
    reader.onerror = function () {
      console.error('[CouplePix] Failed to read selected file.');
      alert('Không đọc được file ảnh. Vui lòng thử ảnh khác.');
      closeModal();
    };
    reader.readAsDataURL(file);

    // Returns a Promise that resolves after the cropped image is painted into
    // the slot preview + hidden <input>. Must be awaited before closing the
    // modal, otherwise Croppie's internal canvas can be torn down mid-read.
    function cropImage() {
      return croppie.result({
        type: 'blob',
        size: { width: 700, height: 700 }
      }).then(function (blob) {
        return new Promise(function (resolve, reject) {
          var br = new FileReader();
          br.addEventListener('error', function () { reject(new Error('Không đọc được ảnh đã cắt')); });
          br.addEventListener('load', function (ev) {
            var oldImage = new Image();
            oldImage.onerror = function () { reject(new Error('Ảnh đã cắt bị lỗi')); };
            oldImage.onload = function () {
              try {
                var radius = Math.max(oldImage.width, oldImage.height) / 2;
                var borderWidth = 2;
                radius += borderWidth;

                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                canvas.width = radius * 2;
                canvas.height = radius * 2;

                ctx.beginPath();
                ctx.arc(radius, radius, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fillStyle = 'black';
                ctx.fill();

                ctx.save();
                ctx.beginPath();
                ctx.arc(radius, radius, radius - borderWidth, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(oldImage, radius - oldImage.width / 2, radius - oldImage.height / 2,
                  oldImage.width, oldImage.height);
                ctx.restore();

                var dataUrl = canvas.toDataURL();
                var newImage = new Image();
                newImage.src = dataUrl;

                imgPreview.innerHTML = '';
                imgPreview.appendChild(newImage);
                imgPreview.style.display = 'flex';
                placeholder.style.display = 'none';
                previewArea.style.display = 'block';

                var slotEl = imgPreview.closest('.slot-card');
                if (slotEl) {
                  slotEl.querySelector('.slot-img-data').value = dataUrl.split('base64,')[1] || '';
                  slotEl.classList.add('has-image');
                }
                resolve();
              } catch (err) { reject(err); }
            };
            oldImage.src = ev.target.result;
          });
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

  // ------- Validation -------
  function clearError() {
    document.getElementById('phone-error').style.display = 'none';
    document.querySelector('.form-phone #mobile_code').classList.remove('has-error');
    document.getElementById('product-error').style.display = 'none';
    document.getElementById('slots-error').style.display = 'none';
    slotsContainer.querySelectorAll('.slot-card').forEach(function (s) {
      s.classList.remove('has-error');
    });
  }

  function showErr(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
  }

  function validateForm() {
    clearError();
    var phoneEl = document.getElementById('mobile_code');
    var phoneVal = phoneEl.value.trim();
    var phoneError = document.getElementById('phone-error');
    var productError = document.getElementById('product-error');
    var slotsError = document.getElementById('slots-error');
    var hasError = false;

    // Phone
    if (!phoneVal) {
      showErr(phoneError, 'Vui lòng nhập số điện thoại');
      phoneEl.classList.add('has-error');
      hasError = true;
    } else {
      var digitsOnly = phoneVal.replace(/\D/g, '');
      if (digitsOnly.length < 8 || digitsOnly.length > 12) {
        showErr(phoneError, 'Số điện thoại không hợp lệ (cần 8-12 chữ số)');
        phoneEl.classList.add('has-error');
        hasError = true;
      } else if (phoneVal.length - digitsOnly.length > 5) {
        showErr(phoneError, 'Vui lòng chỉ nhập số điện thoại (không nhập ghi chú ở đây)');
        phoneEl.classList.add('has-error');
        hasError = true;
      }
    }

    // Products picked?
    var totalSlots = slotsContainer.querySelectorAll('.slot-card').length;
    if (totalSlots === 0) {
      showErr(productError, 'Vui lòng chọn ít nhất 1 sản phẩm.');
      hasError = true;
    } else {
      // Image per slot (or slot 0 only when same-photo is on)
      var samePhoto = samePhotoCheckbox.checked;
      var requiredSlots = samePhoto ? 1 : totalSlots;
      var missing = 0;
      slotsContainer.querySelectorAll('.slot-card').forEach(function (s, i) {
        if (samePhoto && i > 0) return;
        var imgData = s.querySelector('.slot-img-data').value;
        if (!imgData) {
          s.classList.add('has-error');
          missing++;
        }
      });
      if (missing > 0) {
        showErr(slotsError, 'Vui lòng tải ảnh cho ' + missing + '/' + requiredSlots + ' slot còn thiếu.');
        hasError = true;
      }
    }

    return !hasError;
  }

  // ------- Submit -------
  var form = document.forms['contact-form'];
  var loaderBtn = document.getElementById('loaderBtn');
  var submitBtn = document.getElementById('submitBtn');
  var submitButton = document.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateForm()) return;

    loaderBtn.style.display = 'inline-block';
    submitBtn.style.display = 'none';
    submitButton.disabled = true;

    var phoneDigits = (document.getElementById('mobile_code').value || '').replace(/\D/g, '');
    var phone4 = last4(phoneDigits);
    var samePhoto = samePhotoCheckbox.checked;

    var slotEls = Array.prototype.slice.call(slotsContainer.querySelectorAll('.slot-card'));

    var formData = new FormData();
    formData.set('Name', phoneDigits || document.getElementById('mobile_code').value);
    formData.set('message', ''); // kept for schema compat; structured mapping replaces the free-text note
    formData.set('SamePhoto', samePhoto ? 'true' : 'false');
    formData.set('radio', samePhoto || slotEls.length <= 1 ? 'one-image' : 'many-image');
    formData.set('ItemCount', String(slotEls.length));

    // If same-photo is on, duplicate slot 0's image into every slot's payload.
    var sharedImgData = samePhoto && slotEls[0] ? slotEls[0].querySelector('.slot-img-data').value : null;

    slotEls.forEach(function (slotEl, i) {
      var sku = slotEl.getAttribute('data-sku') || '';
      var name = slotEl.getAttribute('data-name') || '';
      var subIdx = slotEl.getAttribute('data-sub-index') || '0';
      var imgData = sharedImgData != null ? sharedImgData : slotEl.querySelector('.slot-img-data').value;
      var filename = (phoneDigits || 'image') + '_' + i + '_' + phone4 + '_' + cleanSku(sku);

      formData.set('ImgData_' + i, imgData);
      formData.set('Sku_' + i, sku);
      formData.set('ProductName_' + i, name);
      formData.set('Slot_' + i, subIdx);
      formData.set('Filename_' + i, filename);
    });

    // Legacy fallback so the existing sheet mirror columns still receive data even if someone
    // downgrades the Apps Script.
    if (slotEls[0]) {
      formData.set('ImgData1', sharedImgData != null ? sharedImgData : slotEls[0].querySelector('.slot-img-data').value);
      formData.set('Filename1', (phoneDigits || 'image') + '_0_' + phone4 + '_' + cleanSku(slotEls[0].getAttribute('data-sku') || ''));
    }
    if (slotEls[1] && !samePhoto) {
      formData.set('ImgData2', slotEls[1].querySelector('.slot-img-data').value);
      formData.set('Filename2', (phoneDigits || 'image') + '_1_' + phone4 + '_' + cleanSku(slotEls[1].getAttribute('data-sku') || ''));
    } else {
      formData.set('ImgData2', '');
    }

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
      .then(function () {
        alert('Bạn đã gửi ảnh thành công.');
      })
      .then(function () {
        window.location.href = 'https://crushroom.vn/pages/thank-you';
      })
      .catch(function (err) {
        alert('Chưa gửi được ảnh. Xin thử lại');
        console.error('Error!', err && err.message);
      })
      .finally(function () {
        submitButton.disabled = false;
        loaderBtn.style.display = 'none';
        submitBtn.style.display = 'inline-block';
      });
  });

  // Kick things off.
  loadProducts();
});
