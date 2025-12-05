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
  const customerDetails = document.getElementById('customer-details');
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
      .then(response => response.json())
      .then(data => {
        console.log('Response:', data);
        loading.style.display = 'none';

        if (data.success && data.results && data.results.length > 0) {
          displayResults(data.results, phone);
        } else {
          noResults.style.display = 'block';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        loading.style.display = 'none';
        showError('Có lỗi xảy ra khi tìm kiếm. Vui lòng thử lại.');
      });
  }

  function displayResults(data, phone) {
    results.style.display = 'block';

    // Display result info
    resultInfo.textContent = `Tìm thấy ${data.length} kết quả cho số điện thoại: ${phone}`;

    // Clear previous results
    customerDetails.innerHTML = '';
    imagesGrid.innerHTML = '';

    data.forEach((row, index) => {
      // Display customer info (only for first result)
      if (index === 0) {
        displayCustomerInfo(row);
      }

      // Display images
      displayImages(row, index + 1);
    });
  }

  function displayCustomerInfo(row) {
    const fields = [
      { label: 'Số điện thoại', value: row.Name || 'N/A' },
      { label: 'Loại ảnh', value: row.radio === 'one-image' ? 'Chỉ 1 ảnh' : 'Mỗi sản phẩm 1 ảnh' },
      { label: 'Ghi chú', value: row.message || 'Không có' },
      { label: 'Ngày upload', value: row.Date ? new Date(row.Date).toLocaleString('vi-VN') : 'N/A' }
    ];

    fields.forEach(field => {
      const infoItem = document.createElement('div');
      infoItem.className = 'info-item';
      infoItem.innerHTML = `
        <div class="info-label">${field.label}</div>
        <div class="info-value">${field.value}</div>
      `;
      customerDetails.appendChild(infoItem);
    });
  }

  function displayImages(row, rowNumber) {
    // Image 1
    if (row['image-1']) {
      createImageCard(row['image-1'], `Ảnh ${rowNumber}`, rowNumber);
    }

    // Image 2
    if (row['image-2']) {
      createImageCard(row['image-2'], `Ảnh ${rowNumber}-2`, rowNumber);
    }
  }

  function createImageCard(imageUrl, title, rowNumber) {
    const card = document.createElement('div');
    card.className = 'image-card';

    // Extract image ID from Google Drive URL
    const imageId = extractGoogleDriveId(imageUrl);

    // Use Google Drive thumbnail API (works better for previews)
    const thumbnailUrl = imageId
      ? `https://drive.google.com/thumbnail?id=${imageId}&sz=w400`
      : imageUrl;

    card.innerHTML = `
      <img src="${thumbnailUrl}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'padding:60px;text-align:center;background:#f5f5f5\\'><p style=\\'color:#999;margin-bottom:12px\\'>⚠️ Không tải được ảnh</p><a href=\\'${imageUrl}\\' target=\\'_blank\\' style=\\'color:#667eea;text-decoration:none\\'>Xem trên Drive →</a></div>'">
      <div class="image-info">
        <div class="image-title">${title}</div>
        <a href="${imageUrl}" target="_blank" class="image-link">
          Xem trên Drive →
        </a>
      </div>
    `;

    imagesGrid.appendChild(card);
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
});
