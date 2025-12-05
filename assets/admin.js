document.addEventListener('DOMContentLoaded', function() {
  // Google Apps Script URL - CẦN CẬP NHẬT URL NÀY
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec';

  const phoneInput = document.getElementById('phone-search');
  const searchBtn = document.getElementById('search-btn');
  const loading = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  const results = document.getElementById('results');
  const noResults = document.getElementById('no-results');
  const resultInfo = document.getElementById('result-info');
  const imagesGrid = document.getElementById('images-grid');

  // Enter key to search
  phoneInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      searchImages();
    }
  });

  // Click search button
  searchBtn.addEventListener('click', searchImages);

  function searchImages() {
    const phone = phoneInput.value.trim().replace(/\D/g, '');

    if (!phone) {
      showError('Vui lòng nhập số điện thoại');
      return;
    }

    console.log('Searching for phone:', phone);
    hideAll();
    loading.style.display = 'block';

    // Call Google Apps Script API
    fetch(SCRIPT_URL + '?action=search&phone=' + phone)
      .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Response data:', data);
        loading.style.display = 'none';

        if (data.success && data.results && data.results.length > 0) {
          displayResults(data.results, phone);
        } else if (data.success && data.results && data.results.length === 0) {
          noResults.style.display = 'block';
        } else {
          showError(data.error || 'Không tìm thấy kết quả');
        }
      })
      .catch(error => {
        console.error('Fetch error:', error);
        loading.style.display = 'none';
        showError(`Lỗi: ${error.message}. Vui lòng kiểm tra console để biết chi tiết.`);
      });
  }

  function displayResults(data, phone) {
    results.style.display = 'block';

    // Sort by date (newest first)
    data.sort((a, b) => {
      const dateA = a.Date ? new Date(a.Date) : new Date(0);
      const dateB = b.Date ? new Date(b.Date) : new Date(0);
      return dateB - dateA;
    });

    // Display result info
    resultInfo.textContent = `Tìm thấy ${data.length} kết quả cho số điện thoại: ${phone}`;

    // Clear previous results
    imagesGrid.innerHTML = '';

    // Create separate card for each upload session
    data.forEach((row, index) => {
      createUploadSessionCard(row, index === 0);
    });
  }

  function createUploadSessionCard(row, isNewest) {
    const sessionCard = document.createElement('div');
    sessionCard.className = 'upload-session-card' + (isNewest ? ' newest' : '');

    // Header with "Newest" badge
    const headerHTML = isNewest
      ? '<div class="session-badge">✨ Ảnh mới nhất</div>'
      : '';

    // Customer info
    const infoHTML = `
      <div class="session-info">
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">SỐ ĐIỆN THOẠI</span>
            <span class="info-value">${row.Name || 'N/A'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">LOẠI ẢNH</span>
            <span class="info-value">${row.radio === 'one-image' ? 'Chỉ 1 ảnh' : 'Nhiều ảnh'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">GHI CHÚ</span>
            <span class="info-value">${row.message || 'Không có'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">NGÀY UPLOAD</span>
            <span class="info-value">${row.Date ? new Date(row.Date).toLocaleString('vi-VN') : 'N/A'}</span>
          </div>
        </div>
      </div>
    `;

    // Images
    const images = [];
    if (row['image-1']) images.push(row['image-1']);
    if (row['image-2']) images.push(row['image-2']);

    const imagesHTML = images.map((imageUrl, idx) => {
      const imageId = extractGoogleDriveId(imageUrl);
      const thumbnailUrl = imageId
        ? `https://drive.google.com/thumbnail?id=${imageId}&sz=w400`
        : imageUrl;
      const directUrl = imageId
        ? `https://drive.google.com/uc?export=view&id=${imageId}`
        : imageUrl;

      return `
        <div class="session-image-wrapper">
          <div class="session-image">
            <img src="${thumbnailUrl}" alt="Ảnh ${idx + 1}" loading="lazy"
                 data-full-url="${imageUrl}"
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f5f5f5%22 width=%22200%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E⚠️ Lỗi%3C/text%3E%3C/svg%3E'">
            <div class="image-overlay">
              <a href="${imageUrl}" target="_blank" class="overlay-btn">Xem trên Drive →</a>
            </div>
          </div>
          <button class="btn-copy-single" onclick="copySingleImage(this, '${directUrl}')" data-image-url="${directUrl}">
            <span class="btn-icon">📋</span>
            Sao chép ảnh ${idx + 1}
          </button>
        </div>
      `;
    }).join('');

    sessionCard.innerHTML = `
      ${headerHTML}
      ${infoHTML}
      <div class="session-images-row">
        ${imagesHTML}
      </div>
    `;

    imagesGrid.appendChild(sessionCard);
  }

  function extractGoogleDriveId(url) {
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  }

  function showError(message) {
    hideAll();
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
  }

  function hideAll() {
    loading.style.display = 'none';
    errorMessage.style.display = 'none';
    results.style.display = 'none';
    noResults.style.display = 'none';
  }

  // Show image in modal for easy copying
  window.copySingleImage = function(button, imageUrl) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'copy-image-modal';
    modal.innerHTML = `
      <div class="copy-modal-overlay" onclick="this.parentElement.remove()"></div>
      <div class="copy-modal-content">
        <div class="copy-modal-header">
          <h3>📋 Sao chép ảnh</h3>
          <button class="copy-modal-close" onclick="this.closest('.copy-image-modal').remove()">✕</button>
        </div>
        <div class="copy-modal-body">
          <div class="copy-instruction">
            <div class="copy-instruction-text">
              <strong>🖱️ Cách 1:</strong> Click chuột phải vào ảnh → Chọn <strong>"Copy image"</strong> → Paste vào chat
            </div>
            <div class="copy-instruction-text">
              <strong>💾 Cách 2:</strong> Click nút "Tải về" bên dưới
            </div>
          </div>
          <div class="copy-image-container">
            <img src="${imageUrl}" alt="Image" crossorigin="anonymous" />
          </div>
          <div class="copy-modal-actions">
            <a href="${imageUrl}" target="_blank" class="copy-btn-secondary">Mở tab mới</a>
            <a href="${imageUrl}" download class="copy-btn-primary">Tải về</a>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on Escape
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);

    // Remove handler when modal is removed
    modal.addEventListener('DOMNodeRemoved', function() {
      document.removeEventListener('keydown', closeHandler);
    });
  };
});
