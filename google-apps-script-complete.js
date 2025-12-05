/**
 * Google Apps Script for CouplePix Image Upload + Admin Panel
 * CẬP NHẬT: Thêm validation nghiêm ngặt cho tìm kiếm số điện thoại
 */
const sheetName = 'form data'
const scriptProp = PropertiesService.getScriptProperties()
const recipientEmail = 'crush@crushroom.vn';

function intialSetup() {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet()
    scriptProp.setProperty('key', activeSpreadsheet.getId())
}

// ===== XỬ LÝ GET REQUEST TỪ ADMIN PANEL (CẬP NHẬT MỚI) =====
function doGet(e) {
    try {
        const action = e.parameter.action;
        const phone = e.parameter.phone;

        if (action === 'search' && phone) {
            return searchByPhone(phone);
        }

        return ContentService
            .createTextOutput(JSON.stringify({ 'success': false, 'error': 'Invalid request' }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ 'success': false, 'error': error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function searchByPhone(phone) {
    try {
        // Chỉ giữ lại số từ search query
        const cleanSearchPhone = phone.replace(/\D/g, '');

        // Validate độ dài số điện thoại tìm kiếm (8-12 số)
        if (cleanSearchPhone.length < 8 || cleanSearchPhone.length > 12) {
            return ContentService
                .createTextOutput(JSON.stringify({
                    'success': false,
                    'error': 'Số điện thoại không hợp lệ (cần 8-12 chữ số)',
                    'results': [],
                    'count': 0
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(sheetName);

        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const nameIndex = headers.indexOf('Name');

        if (nameIndex === -1) {
            throw new Error('Column "Name" not found');
        }

        // Find all rows matching the phone number
        const results = [];

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const nameValue = String(row[nameIndex] || '');

            // Chỉ giữ lại số từ cột Name
            const cleanRowPhone = nameValue.replace(/\D/g, '');

            // ===== VALIDATION NGHIÊM NGẶT =====

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

            // 3. Chỉ match chính xác hoặc match với country code
            // Ví dụ: search "0918260494" sẽ match với "0918260494" hoặc "840918260494"
            const isExactMatch = cleanRowPhone === cleanSearchPhone;
            const isEndMatch = cleanRowPhone.endsWith(cleanSearchPhone) &&
                               (cleanRowPhone.length - cleanSearchPhone.length) <= 3; // Chỉ cho phép thêm tối đa 3 số (country code)
            const isStartMatch = cleanSearchPhone.endsWith(cleanRowPhone) &&
                                 (cleanSearchPhone.length - cleanRowPhone.length) <= 3;

            // ===== END VALIDATION =====

            if (isExactMatch || isEndMatch || isStartMatch) {
                const rowData = {};
                headers.forEach((header, index) => {
                    rowData[header] = row[index];
                });
                results.push(rowData);
            }
        }

        return ContentService
            .createTextOutput(JSON.stringify({
                'success': true,
                'results': results,
                'count': results.length
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({
                'success': false,
                'error': error.toString(),
                'results': [],
                'count': 0
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// ===== XỬ LÝ POST REQUEST - UPLOAD ẢNH =====
function doPost(e) {
    const lock = LockService.getScriptLock()
    lock.tryLock(10000);
    try {
        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(sheetName);

        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        const nextRow = sheet.getLastRow() + 1

        const newRow = headers.map(function(header) {
          if(header === 'Date') return new Date();
          if(header === 'image-1') return;
          if(header === 'image-2') return;
          return e.parameter[header]
        })

        const folder = DriveApp.getFolderById('1JB9vANvnKu52WQX4Mg1fYqF6i-Jthhs7');

        // === XỬ LÝ ẢNH 1 ===
        const imageBlob1 = e.parameter['ImgData1'];
        const Img64D1 = Utilities.base64Decode(imageBlob1);

        // Lấy tên file từ Filename1, nếu không có thì dùng tên mặc định
        var filename1 = 'image';
        if (e.parameter['Filename1']) {
          filename1 = e.parameter['Filename1'];
        }

        const ImgBlob1 = Utilities.newBlob(Img64D1, 'image/jpeg', filename1 + '.jpg');
        const file1 = folder.createFile(ImgBlob1);
        newRow[2] = file1.getUrl();

        // === XỬ LÝ ẢNH 2 (nếu có) ===
        if(e.parameter['ImgData2'] !== "" && e.parameter['radio'] === "many-image"){
          const imageBlob2 = e.parameter['ImgData2'];
          const Img64D2 = Utilities.base64Decode(imageBlob2);

          // Lấy tên file từ Filename2, nếu không có thì dùng tên mặc định
          var filename2 = 'image_2';
          if (e.parameter['Filename2']) {
            filename2 = e.parameter['Filename2'];
          }

          const ImgBlob2 = Utilities.newBlob(Img64D2, 'image/jpeg', filename2 + '.jpg');
          const file2 = folder.createFile(ImgBlob2);
          newRow[3] = file2.getUrl();
        }

        sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow]);

        // Send email
        const subject = 'Khách vừa tải ảnh lên';
        let body = "Khách tải ảnh với nội dung như sau:\n\n";
        for (let i = 0; i < headers.length; i++) {
            body += headers[i] + ': ' + newRow[i] + '\n';
        }
        MailApp.sendEmail(recipientEmail, subject, body);

        return ContentService.createTextOutput("Upload Done");
    } catch (e) {
        return ContentService
            .createTextOutput(JSON.stringify({ 'result': 'error', 'error': e }))
            .setMimeType(ContentService.MimeType.JSON)
    } finally {
        lock.releaseLock()
    }
}

// ===== HƯỚNG DẪN CẬP NHẬT =====
// 1. Copy toàn bộ code này
// 2. Mở Google Apps Script editor (Extensions > Apps Script)
// 3. Paste code vào, thay thế toàn bộ code cũ
// 4. Click "Deploy" > "New deployment"
//    - Select type: Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Click "Deploy" và copy URL mới
// 6. Nếu đã deploy trước đó, chọn "Deploy" > "Manage deployments" > Edit > Version: New version
//
// ===== CÁC CẢI TIẾN =====
// ✅ Validate độ dài số điện thoại (8-12 số)
// ✅ Loại bỏ các dòng có quá nhiều ký tự không phải số (ghi chú)
// ✅ Chỉ match chính xác hoặc match với country code (tối đa 3 số khác biệt)
// ✅ Giúp tránh trường hợp search trả về kết quả sai do khách nhập ghi chú vào trường số điện thoại
