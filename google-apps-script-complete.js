/**
 * Google Apps Script for CouplePix Image Upload + Admin Panel
 * + QR Ghi âm Upload + Love Counter Upload
 */
const sheetName = 'form data'
const scriptProp = PropertiesService.getScriptProperties()
const recipientEmail = 'crush@crushroom.vn';

// ===== CẤU HÌNH THƯ MỤC DRIVE =====
// CẦN CẬP NHẬT: Tạo 2 folder trên Google Drive và paste ID vào đây
const QR_AUDIO_FOLDER_ID = 'REPLACE_WITH_YOUR_QR_AUDIO_FOLDER_ID';
const LOVE_COUNTER_FOLDER_ID = 'REPLACE_WITH_YOUR_LOVE_COUNTER_FOLDER_ID';

// Sheet tab names cho QR features
const QR_AUDIO_SHEET = 'qr_audio_uploads';
const LOVE_COUNTER_SHEET = 'love_counter_uploads';

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

        if (action === 'list') {
            return listByDateRange(e.parameter.from, e.parameter.to);
        }

        if (action === 'get') {
            return getById(e.parameter.type, e.parameter.id);
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

// ===== LIST UPLOADS BY DATE RANGE (cho preview table theo ngày) =====
function listByDateRange(fromStr, toStr) {
    try {
        if (!fromStr || !toStr) {
            return ContentService
                .createTextOutput(JSON.stringify({
                    'success': false,
                    'error': 'Thiếu tham số from / to (định dạng YYYY-MM-DD)',
                    'results': [],
                    'count': 0
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const from = parseDateStart(fromStr);
        const to = parseDateEnd(toStr);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return ContentService
                .createTextOutput(JSON.stringify({
                    'success': false,
                    'error': 'Định dạng ngày không hợp lệ (cần YYYY-MM-DD)',
                    'results': [],
                    'count': 0
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        if (from > to) {
            return ContentService
                .createTextOutput(JSON.stringify({
                    'success': false,
                    'error': 'Ngày bắt đầu phải <= ngày kết thúc',
                    'results': [],
                    'count': 0
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(sheetName);
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const dateIndex = headers.indexOf('Date');
        const nameIndex = headers.indexOf('Name');

        if (dateIndex === -1) {
            throw new Error('Column "Date" not found');
        }

        const results = [];

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const rowDate = row[dateIndex];

            // Bỏ qua dòng không có Date hợp lệ
            if (!(rowDate instanceof Date) || isNaN(rowDate.getTime())) {
                continue;
            }

            // Lọc theo khoảng ngày
            if (rowDate < from || rowDate > to) {
                continue;
            }

            // Áp dụng cùng validation số điện thoại với searchByPhone
            // để loại các dòng rác / ghi chú khỏi bảng preview
            if (nameIndex !== -1) {
                const nameValue = String(row[nameIndex] || '');
                const cleanRowPhone = nameValue.replace(/\D/g, '');
                if (cleanRowPhone.length < 8 || cleanRowPhone.length > 12) {
                    continue;
                }
                const nonDigitCount = nameValue.length - cleanRowPhone.length;
                if (nonDigitCount > 5) {
                    continue;
                }
            }

            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index];
            });
            results.push(rowData);
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

function parseDateStart(s) {
    // Expects YYYY-MM-DD; returns local Date at 00:00:00.000
    const parts = String(s).split('-');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
        0, 0, 0, 0
    );
}

function parseDateEnd(s) {
    // Expects YYYY-MM-DD; returns local Date at 23:59:59.999
    const parts = String(s).split('-');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
        23, 59, 59, 999
    );
}

// ===== XỬ LÝ POST REQUEST =====
function doPost(e) {
    const lock = LockService.getScriptLock()
    lock.tryLock(10000);
    try {
        // Route to new upload handlers if action parameter is present
        const action = e.parameter.action;
        if (action === 'uploadQrAudio') {
            const result = handleUploadQrAudio(e);
            lock.releaseLock();
            return result;
        }
        if (action === 'uploadLoveCounter') {
            const result = handleUploadLoveCounter(e);
            lock.releaseLock();
            return result;
        }

        // ===== LEGACY: CouplePix image upload (no action param) =====
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

// ===== GENERATE SHORT UNIQUE ID =====
function generateId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const num = Math.floor(1000 + Math.random() * 9000); // 4-digit
    let slug = '';
    for (let i = 0; i < 7; i++) {
        slug += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return num + '-' + slug;
}

// ===== HELPER: Extract Drive file ID from URL =====
function extractDriveFileId(url) {
    if (!url) return null;
    const match = String(url).match(/[-\w]{25,}/);
    return match ? match[0] : null;
}

// ===== HELPER: Make Drive file publicly viewable =====
function makePublic(file) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}

// ===== HELPER: Save base64 file to a Drive folder =====
function saveFileToDrive(folder, base64Data, mimeType, filename) {
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, filename);
    const file = folder.createFile(blob);
    makePublic(file);
    return file;
}

// ===== HELPER: Get direct / thumbnail URLs from a Drive file =====
function getDriveUrls(file) {
    const id = file.getId();
    return {
        url: file.getUrl(),
        directUrl: 'https://drive.google.com/uc?export=view&id=' + id,
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w2000'
    };
}

// ===== GET BY ID (for view pages) =====
function getById(type, id) {
    try {
        if (!type || !id) {
            return jsonResponse({ success: false, error: 'Thiếu tham số type hoặc id' });
        }

        let tabName;
        if (type === 'qr_audio') tabName = QR_AUDIO_SHEET;
        else if (type === 'love_counter') tabName = LOVE_COUNTER_SHEET;
        else return jsonResponse({ success: false, error: 'Type không hợp lệ' });

        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(tabName);
        if (!sheet) {
            return jsonResponse({ success: false, error: 'Sheet "' + tabName + '" không tồn tại' });
        }

        const data = sheet.getDataRange().getValues();
        if (data.length < 2) {
            return jsonResponse({ success: false, error: 'Không tìm thấy bản ghi' });
        }

        const headers = data[0];
        const idIndex = headers.indexOf('id');
        if (idIndex === -1) {
            return jsonResponse({ success: false, error: 'Cột "id" không tồn tại' });
        }

        for (let i = 1; i < data.length; i++) {
            if (String(data[i][idIndex]) === String(id)) {
                const row = {};
                headers.forEach(function (h, idx) {
                    row[h] = data[i][idx];
                });

                // Convert Drive URLs to direct/thumbnail URLs for the view page
                if (type === 'qr_audio') {
                    row.cover_url = driveUrlToThumbnail(row.cover_url);
                    row.voice_url = driveUrlToDirect(row.voice_url);
                } else if (type === 'love_counter') {
                    row.background_url = driveUrlToThumbnail(row.background_url);
                    row.male_avatar_url = driveUrlToThumbnail(row.male_avatar_url);
                    row.female_avatar_url = driveUrlToThumbnail(row.female_avatar_url);
                    row.voice_url = driveUrlToDirect(row.voice_url);
                }

                return jsonResponse({ success: true, result: row });
            }
        }

        return jsonResponse({ success: false, error: 'Không tìm thấy bản ghi với ID: ' + id });
    } catch (error) {
        return jsonResponse({ success: false, error: error.toString() });
    }
}

function driveUrlToThumbnail(url) {
    if (!url) return '';
    const fid = extractDriveFileId(url);
    return fid ? 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w2000' : url;
}

function driveUrlToDirect(url) {
    if (!url) return '';
    const fid = extractDriveFileId(url);
    return fid ? 'https://drive.google.com/uc?export=view&id=' + fid : url;
}

function jsonResponse(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// ===== UPLOAD QR AUDIO =====
function handleUploadQrAudio(e) {
    try {
        const id = generateId();
        const phone = e.parameter.phone || '';
        const audioTitle = e.parameter.audio_title || '';
        const note = e.parameter.note || '';

        // Create subfolder in QR Audio parent
        const parentFolder = DriveApp.getFolderById(QR_AUDIO_FOLDER_ID);
        const subFolder = parentFolder.createFolder(id + '_' + phone.replace(/\D/g, ''));

        // Save voice (required)
        let voiceUrl = '';
        if (e.parameter.voice) {
            const voiceType = e.parameter.voice_type || 'audio/mpeg';
            const voiceFilename = e.parameter.voice_filename || 'voice';
            const ext = guessExtension(voiceType, voiceFilename);
            const file = saveFileToDrive(subFolder, e.parameter.voice, voiceType, 'voice' + ext);
            voiceUrl = file.getUrl();
        }

        // Save cover image (optional)
        let coverUrl = '';
        if (e.parameter.cover_image) {
            const imgType = e.parameter.cover_image_type || 'image/jpeg';
            const file = saveFileToDrive(subFolder, e.parameter.cover_image, imgType, 'cover.jpg');
            coverUrl = file.getUrl();
        }

        // Write to sheet
        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(QR_AUDIO_SHEET);
        if (!sheet) throw new Error('Sheet "' + QR_AUDIO_SHEET + '" chưa được tạo. Hãy tạo tab này trong spreadsheet.');

        sheet.appendRow([
            id,
            phone,
            audioTitle,
            coverUrl,
            voiceUrl,
            note,
            new Date()
        ]);

        return jsonResponse({ success: true, id: id });
    } catch (error) {
        return jsonResponse({ success: false, error: error.toString() });
    }
}

// ===== UPLOAD LOVE COUNTER =====
function handleUploadLoveCounter(e) {
    try {
        const id = generateId();
        const phone = e.parameter.phone || '';
        const loveTitle = e.parameter.love_title || '';
        const heartText = e.parameter.heart_text || '';
        const maleName = e.parameter.male_name || '';
        const femaleName = e.parameter.female_name || '';
        const loveDay = e.parameter.love_day || '';
        const audioTitle = e.parameter.audio_title || '';
        const note = e.parameter.note || '';

        // Create subfolder
        const parentFolder = DriveApp.getFolderById(LOVE_COUNTER_FOLDER_ID);
        const subFolder = parentFolder.createFolder(id + '_' + phone.replace(/\D/g, ''));

        // Save background image (required)
        let backgroundUrl = '';
        if (e.parameter.background) {
            const imgType = e.parameter.background_type || 'image/jpeg';
            const file = saveFileToDrive(subFolder, e.parameter.background, imgType, 'background.jpg');
            backgroundUrl = file.getUrl();
        }

        // Save male avatar (required)
        let maleAvatarUrl = '';
        if (e.parameter.male_avatar) {
            const imgType = e.parameter.male_avatar_type || 'image/jpeg';
            const file = saveFileToDrive(subFolder, e.parameter.male_avatar, imgType, 'male.jpg');
            maleAvatarUrl = file.getUrl();
        }

        // Save female avatar (required)
        let femaleAvatarUrl = '';
        if (e.parameter.female_avatar) {
            const imgType = e.parameter.female_avatar_type || 'image/jpeg';
            const file = saveFileToDrive(subFolder, e.parameter.female_avatar, imgType, 'female.jpg');
            femaleAvatarUrl = file.getUrl();
        }

        // Save voice (optional)
        let voiceUrl = '';
        if (e.parameter.voice) {
            const voiceType = e.parameter.voice_type || 'audio/mpeg';
            const voiceFilename = e.parameter.voice_filename || 'voice';
            const ext = guessExtension(voiceType, voiceFilename);
            const file = saveFileToDrive(subFolder, e.parameter.voice, voiceType, 'voice' + ext);
            voiceUrl = file.getUrl();
        }

        // Write to sheet
        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(LOVE_COUNTER_SHEET);
        if (!sheet) throw new Error('Sheet "' + LOVE_COUNTER_SHEET + '" chưa được tạo. Hãy tạo tab này trong spreadsheet.');

        sheet.appendRow([
            id,
            phone,
            loveTitle,
            heartText,
            backgroundUrl,
            maleName,
            maleAvatarUrl,
            femaleName,
            femaleAvatarUrl,
            loveDay,
            audioTitle,
            voiceUrl,
            note,
            new Date()
        ]);

        return jsonResponse({ success: true, id: id });
    } catch (error) {
        return jsonResponse({ success: false, error: error.toString() });
    }
}

// ===== HELPER: Guess file extension from MIME type or filename =====
function guessExtension(mimeType, filename) {
    // Try from filename first
    if (filename) {
        const dotIdx = filename.lastIndexOf('.');
        if (dotIdx !== -1) return filename.substring(dotIdx);
    }
    // Fallback to MIME
    const map = {
        'audio/mpeg': '.mp3',
        'audio/mp4': '.m4a',
        'audio/x-m4a': '.m4a',
        'audio/wav': '.wav',
        'audio/x-wav': '.wav',
        'audio/ogg': '.ogg',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
    };
    return map[mimeType] || '.bin';
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
// ✅ action=list — danh sách upload theo khoảng ngày (Admin Panel)
// ✅ action=get — lấy 1 bản ghi theo type + id (cho view pages)
// ✅ action=uploadQrAudio — upload file ghi âm + ảnh bìa → Drive + sheet
// ✅ action=uploadLoveCounter — upload love counter data → Drive + sheet
//
// ===== SETUP CHO QR FEATURES =====
// 1. Tạo 2 tab mới trong spreadsheet:
//    - "qr_audio_uploads" với headers: id | phone | audio_title | cover_url | voice_url | note | created_at
//    - "love_counter_uploads" với headers: id | phone | love_title | heart_text | background_url | male_name | male_avatar_url | female_name | female_avatar_url | love_day | audio_title | voice_url | note | created_at
// 2. Tạo 2 folder trên Google Drive và cập nhật ID ở đầu file:
//    - QR_AUDIO_FOLDER_ID
//    - LOVE_COUNTER_FOLDER_ID
