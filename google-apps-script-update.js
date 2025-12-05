// ============================================================
// UPDATED GOOGLE APPS SCRIPT CODE
// Copy this code to replace your existing doGet and searchByPhone functions
// ============================================================

function doGet(e) {
  const action = e.parameter.action;
  const phone = e.parameter.phone;

  if (action === 'search' && phone) {
    return searchByPhone(phone);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: 'Invalid request'
  })).setMimeType(ContentService.MimeType.JSON);
}

function searchByPhone(phone) {
  try {
    // Chỉ giữ lại số
    const cleanSearchPhone = phone.replace(/\D/g, '');

    // Validate độ dài số điện thoại (8-12 số)
    if (cleanSearchPhone.length < 8 || cleanSearchPhone.length > 12) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Số điện thoại không hợp lệ'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Tìm index của cột Name (số điện thoại)
    const nameIndex = headers.indexOf('Name');
    if (nameIndex === -1) {
      throw new Error('Column "Name" not found');
    }

    const results = [];

    // Duyệt qua các dòng (bỏ qua header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const nameValue = String(row[nameIndex] || '');

      // Chỉ giữ lại số từ cột Name
      const cleanRowPhone = nameValue.replace(/\D/g, '');

      // VALIDATION NGHIÊM NGẶT:
      // 1. cleanRowPhone phải có độ dài hợp lệ (8-12 số)
      if (cleanRowPhone.length < 8 || cleanRowPhone.length > 12) {
        continue; // Bỏ qua dòng này - không phải số điện thoại hợp lệ
      }

      // 2. Kiểm tra xem có quá nhiều ký tự không phải số không (phát hiện ghi chú)
      // Ví dụ: "ghi chú vòng nam: ảnh nghiêng đầu" sẽ bị loại bỏ
      const nonDigitCount = nameValue.length - cleanRowPhone.length;
      if (nonDigitCount > 5) {
        continue; // Bỏ qua dòng này - có vẻ là ghi chú, không phải số điện thoại
      }

      // 3. Chỉ match chính xác hoặc match cuối cùng N số (cho trường hợp có/không có country code)
      // Ví dụ: search "0918260494" sẽ match với "0918260494" hoặc "840918260494"
      const isExactMatch = cleanRowPhone === cleanSearchPhone;
      const isEndMatch = cleanRowPhone.endsWith(cleanSearchPhone) &&
                         (cleanRowPhone.length - cleanSearchPhone.length) <= 3; // Chỉ cho phép thêm tối đa 3 số (country code)
      const isStartMatch = cleanSearchPhone.endsWith(cleanRowPhone) &&
                           (cleanSearchPhone.length - cleanRowPhone.length) <= 3;

      if (isExactMatch || isEndMatch || isStartMatch) {
        // Tạo object chứa thông tin khách hàng
        const customerData = {};
        headers.forEach((header, index) => {
          customerData[header] = row[index];
        });

        results.push(customerData);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      count: results.length,
      data: results
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// HƯỚNG DẪN CẬP NHẬT
// ============================================================
// 1. Mở Google Apps Script editor
// 2. Tìm functions doGet và searchByPhone
// 3. Replace bằng code trên
// 4. Deploy lại web app (Deploy > New deployment)
// 5. Test bằng cách search số điện thoại trong admin panel
//
// CÁC CẢI TIẾN:
// - Validate độ dài số điện thoại (8-12 số)
// - Loại bỏ các dòng có quá nhiều ký tự không phải số (ghi chú)
// - Chỉ match chính xác hoặc match với country code (tối đa 3 số khác biệt)
// - Giúp tránh trường hợp search trả về kết quả sai do khách nhập ghi chú vào trường số điện thoại
// ============================================================
