/**
 * Google Apps Script for CouplePix Image Upload + Admin Panel
 *
 * v2 (Product-driven):
 *  - New `products` sheet stores the shop catalog (SKU, Name, ImagesPerUnit, Hint, ThumbnailUrl, Active).
 *  - Customer form fetches the catalog (action=listProducts), picks products+qty, and uploads one photo per slot.
 *  - `form data` sheet gets an additive `Items` JSON column (+ `SchemaVersion`=2). `image-1`/`image-2` are kept
 *    populated for legacy admin fallback.
 */
const sheetName = 'form data';
const productsSheetName = 'products';
const driveFolderId = '1JB9vANvnKu52WQX4Mg1fYqF6i-Jthhs7';
const scriptProp = PropertiesService.getScriptProperties();
const recipientEmail = 'crush@crushroom.vn';

function intialSetup() {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    scriptProp.setProperty('key', activeSpreadsheet.getId());
}

// ===== XỬ LÝ GET REQUEST TỪ ADMIN PANEL =====
function doGet(e) {
    try {
        const action = e.parameter.action;
        const phone = e.parameter.phone;

        if (action === 'listProducts') {
            return listProducts();
        }

        if (action === 'search' && phone) {
            return searchByPhone(phone);
        }

        if (action === 'list') {
            return listByDateRange(e.parameter.from, e.parameter.to);
        }

        return jsonOut({ success: false, error: 'Invalid request' });
    } catch (error) {
        return jsonOut({ success: false, error: error.toString() });
    }
}

function jsonOut(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// ===== LIST PRODUCTS (catalog cho form khách) =====
function listProducts() {
    try {
        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(productsSheetName);

        if (!sheet) {
            return jsonOut({
                success: false,
                error: 'Chưa có sheet "' + productsSheetName + '". Vui lòng tạo sheet với cột: SKU, Name, Type, Material, ImagesPerUnit, Hint, ThumbnailUrl, Active.',
                products: []
            });
        }

        const range = sheet.getDataRange();
        const data = range.getValues();
        // Also read formulas so we can extract URLs from cells authored as =IMAGE("...")
        const formulas = range.getFormulas();
        if (!data || data.length < 2) {
            return jsonOut({ success: true, products: [] });
        }

        const headers = data[0].map(function (h) { return String(h || '').trim(); });
        const idx = {
            sku: headers.indexOf('SKU'),
            name: headers.indexOf('Name'),
            type: headers.indexOf('Type'),
            material: headers.indexOf('Material'),
            imagesPerUnit: headers.indexOf('ImagesPerUnit'),
            hint: headers.indexOf('Hint'),
            thumbnailUrl: headers.indexOf('ThumbnailUrl'),
            active: headers.indexOf('Active')
        };

        if (idx.sku === -1 || idx.name === -1) {
            throw new Error('Sheet products cần có cột SKU và Name');
        }

        const products = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const sku = String(row[idx.sku] || '').trim();
            const name = String(row[idx.name] || '').trim();
            if (!sku || !name) continue;

            // Active filter: only exclude when explicit FALSE
            if (idx.active !== -1) {
                const raw = row[idx.active];
                const activeStr = String(raw == null ? '' : raw).trim().toUpperCase();
                if (activeStr === 'FALSE' || activeStr === 'NO' || activeStr === '0') continue;
            }

            let imagesPerUnit = 1;
            if (idx.imagesPerUnit !== -1) {
                const parsed = parseInt(row[idx.imagesPerUnit], 10);
                if (!isNaN(parsed) && parsed > 0) imagesPerUnit = parsed;
            }

            let thumbnailUrl = '';
            if (idx.thumbnailUrl !== -1) {
                const formulaCell = formulas[i] ? String(formulas[i][idx.thumbnailUrl] || '') : '';
                thumbnailUrl = extractThumbnailUrl_(formulaCell, row[idx.thumbnailUrl]);
            }

            products.push({
                sku: sku,
                name: name,
                type: idx.type !== -1 ? String(row[idx.type] || '').trim() : '',
                material: idx.material !== -1 ? String(row[idx.material] || '').trim() : '',
                imagesPerUnit: imagesPerUnit,
                hint: idx.hint !== -1 ? String(row[idx.hint] || '') : '',
                thumbnailUrl: thumbnailUrl
            });
        }

        return jsonOut({ success: true, products: products, count: products.length });
    } catch (error) {
        return jsonOut({ success: false, error: error.toString(), products: [] });
    }
}

// Extract a usable thumbnail URL from either a plain-text cell value
// or a cell authored as `=IMAGE("https://...")` / `=HYPERLINK("https://...", "...")`.
// Also normalizes Google Drive / docs.google.com share URLs into a public
// thumbnail endpoint so the browser can render them as <img>.
function extractThumbnailUrl_(formulaCell, rawValue) {
    var url = '';
    var formula = String(formulaCell || '').trim();
    if (formula) {
        // Match IMAGE("...") or HYPERLINK("..."...) — the first quoted URL wins.
        var m = formula.match(/"(https?:\/\/[^"]+)"/);
        if (m) url = m[1];
    }
    if (!url) {
        var raw = String(rawValue == null ? '' : rawValue).trim();
        // If a user pasted the raw =IMAGE formula as plain text, still recognize it.
        var m2 = raw.match(/"(https?:\/\/[^"]+)"/);
        if (m2) url = m2[1];
        else if (/^https?:\/\//i.test(raw)) url = raw;
    }
    if (!url) return '';

    // Normalize Google file URLs to a publicly viewable thumbnail.
    if (url.indexOf('drive.google.com') !== -1 || url.indexOf('docs.google.com') !== -1) {
        var id = url.match(/[-\w]{25,}/);
        if (id) return 'https://drive.google.com/thumbnail?id=' + id[0] + '&sz=w400';
    }
    return url;
}

// Helper used inside doPost to re-validate customer-submitted SKUs against the catalog.
function loadProductMap_() {
    const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
    const sheet = doc.getSheetByName(productsSheetName);
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) return {};

    const headers = data[0].map(function (h) { return String(h || '').trim(); });
    const iSku = headers.indexOf('SKU');
    const iName = headers.indexOf('Name');
    const iActive = headers.indexOf('Active');
    if (iSku === -1) return {};

    const map = {};
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const sku = String(row[iSku] || '').trim();
        if (!sku) continue;
        if (iActive !== -1) {
            const activeStr = String(row[iActive] == null ? '' : row[iActive]).trim().toUpperCase();
            if (activeStr === 'FALSE' || activeStr === 'NO' || activeStr === '0') continue;
        }
        map[sku] = {
            sku: sku,
            name: iName !== -1 ? String(row[iName] || '') : sku
        };
    }
    return map;
}

function searchByPhone(phone) {
    try {
        const cleanSearchPhone = String(phone).replace(/\D/g, '');

        if (cleanSearchPhone.length < 8 || cleanSearchPhone.length > 12) {
            return jsonOut({
                success: false,
                error: 'Số điện thoại không hợp lệ (cần 8-12 chữ số)',
                results: [],
                count: 0
            });
        }

        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(sheetName);

        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const nameIndex = headers.indexOf('Name');

        if (nameIndex === -1) {
            throw new Error('Column "Name" not found');
        }

        const results = [];

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const nameValue = String(row[nameIndex] || '');
            const cleanRowPhone = nameValue.replace(/\D/g, '');

            if (cleanRowPhone.length < 8 || cleanRowPhone.length > 12) continue;
            const nonDigitCount = nameValue.length - cleanRowPhone.length;
            if (nonDigitCount > 5) continue;

            const isExactMatch = cleanRowPhone === cleanSearchPhone;
            const isEndMatch = cleanRowPhone.endsWith(cleanSearchPhone) &&
                               (cleanRowPhone.length - cleanSearchPhone.length) <= 3;
            const isStartMatch = cleanSearchPhone.endsWith(cleanRowPhone) &&
                                 (cleanSearchPhone.length - cleanRowPhone.length) <= 3;

            if (isExactMatch || isEndMatch || isStartMatch) {
                const rowData = {};
                headers.forEach(function (header, index) {
                    rowData[header] = row[index];
                });
                results.push(rowData);
            }
        }

        return jsonOut({ success: true, results: results, count: results.length });
    } catch (error) {
        return jsonOut({ success: false, error: error.toString(), results: [], count: 0 });
    }
}

// ===== LIST UPLOADS BY DATE RANGE =====
function listByDateRange(fromStr, toStr) {
    try {
        if (!fromStr || !toStr) {
            return jsonOut({
                success: false,
                error: 'Thiếu tham số from / to (định dạng YYYY-MM-DD)',
                results: [],
                count: 0
            });
        }

        const from = parseDateStart(fromStr);
        const to = parseDateEnd(toStr);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return jsonOut({
                success: false,
                error: 'Định dạng ngày không hợp lệ (cần YYYY-MM-DD)',
                results: [],
                count: 0
            });
        }

        if (from > to) {
            return jsonOut({
                success: false,
                error: 'Ngày bắt đầu phải <= ngày kết thúc',
                results: [],
                count: 0
            });
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
            if (!(rowDate instanceof Date) || isNaN(rowDate.getTime())) continue;
            if (rowDate < from || rowDate > to) continue;

            if (nameIndex !== -1) {
                const nameValue = String(row[nameIndex] || '');
                const cleanRowPhone = nameValue.replace(/\D/g, '');
                if (cleanRowPhone.length < 8 || cleanRowPhone.length > 12) continue;
                const nonDigitCount = nameValue.length - cleanRowPhone.length;
                if (nonDigitCount > 5) continue;
            }

            const rowData = {};
            headers.forEach(function (header, index) {
                rowData[header] = row[index];
            });
            results.push(rowData);
        }

        return jsonOut({ success: true, results: results, count: results.length });
    } catch (error) {
        return jsonOut({ success: false, error: error.toString(), results: [], count: 0 });
    }
}

function parseDateStart(s) {
    const parts = String(s).split('-');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
}

function parseDateEnd(s) {
    const parts = String(s).split('-');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59, 999);
}

// ===== XỬ LÝ POST REQUEST - UPLOAD ẢNH =====
// Expected POST params (v2):
//   Name               : phone number
//   ItemCount          : int N (number of slots)
//   ImgData_0..N-1     : base64 image data per slot (required)
//   Filename_0..N-1    : filename (without extension)
//   Sku_0..N-1         : product SKU
//   ProductName_0..N-1 : product display name
//   Slot_0..N-1        : per-slot index within the product (0,1,...)
//   SamePhoto          : "true" if customer enabled "same photo for all" toggle
//   message            : optional free-text note (kept for schema compat, can be empty)
function doPost(e) {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);
    try {
        const doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
        const sheet = doc.getSheetByName(sheetName);

        // Ensure schema columns (Items, SchemaVersion) exist before writing.
        ensureFormDataColumns_(sheet);

        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const nextRow = sheet.getLastRow() + 1;

        const folder = DriveApp.getFolderById(driveFolderId);
        const productMap = loadProductMap_();

        const itemCountRaw = parseInt(e.parameter['ItemCount'], 10);
        const itemCount = isNaN(itemCountRaw) ? 0 : itemCountRaw;
        const samePhoto = String(e.parameter['SamePhoto'] || '').toLowerCase() === 'true';
        const phone = String(e.parameter['Name'] || '').replace(/\D/g, '');

        const items = [];

        // --- V2 PATH: indexed per-product slots ---
        if (itemCount > 0) {
            for (let i = 0; i < itemCount; i++) {
                const imgData = e.parameter['ImgData_' + i];
                const sku = String(e.parameter['Sku_' + i] || '').trim();
                const productName = String(e.parameter['ProductName_' + i] || '').trim();
                const slotIdx = String(e.parameter['Slot_' + i] || '0');

                if (!imgData) continue;

                // Re-validate SKU against the catalog; if the customer tampers with the payload, fall back to "UNKNOWN".
                const catalogEntry = productMap[sku];
                const safeSku = catalogEntry ? catalogEntry.sku : (sku || 'UNKNOWN');
                const safeName = catalogEntry ? catalogEntry.name : (productName || 'Không xác định');

                let filename = e.parameter['Filename_' + i];
                if (!filename) {
                    filename = (phone || 'image') + '_' + i + '_' + safeSku;
                }

                const imgBlob = Utilities.newBlob(Utilities.base64Decode(imgData), 'image/jpeg', filename + '.jpg');
                const file = folder.createFile(imgBlob);

                items.push({
                    sku: safeSku,
                    name: safeName,
                    slot: slotIdx,
                    fileUrl: file.getUrl(),
                    fileId: file.getId(),
                    filename: filename + '.jpg'
                });
            }
        } else {
            // --- LEGACY PATH: two-image form (ImgData1/ImgData2) for backwards compatibility ---
            const imgData1 = e.parameter['ImgData1'];
            if (imgData1) {
                const fn1 = e.parameter['Filename1'] || 'image';
                const blob1 = Utilities.newBlob(Utilities.base64Decode(imgData1), 'image/jpeg', fn1 + '.jpg');
                const file1 = folder.createFile(blob1);
                items.push({
                    sku: 'LEGACY', name: 'Ảnh 1', slot: '0',
                    fileUrl: file1.getUrl(), fileId: file1.getId(), filename: fn1 + '.jpg'
                });
            }
            const imgData2 = e.parameter['ImgData2'];
            if (imgData2 && e.parameter['radio'] === 'many-image') {
                const fn2 = e.parameter['Filename2'] || 'image_2';
                const blob2 = Utilities.newBlob(Utilities.base64Decode(imgData2), 'image/jpeg', fn2 + '.jpg');
                const file2 = folder.createFile(blob2);
                items.push({
                    sku: 'LEGACY', name: 'Ảnh 2', slot: '1',
                    fileUrl: file2.getUrl(), fileId: file2.getId(), filename: fn2 + '.jpg'
                });
            }
        }

        // Build newRow by iterating headers so the write stays schema-agnostic.
        const derivedRadio = samePhoto || items.length <= 1 ? 'one-image' : 'many-image';

        const newRow = headers.map(function (header) {
            switch (header) {
                case 'Date': return new Date();
                case 'Name': return e.parameter['Name'] || '';
                case 'radio': return derivedRadio;
                case 'message': return e.parameter['message'] || '';
                case 'image-1': return items[0] ? items[0].fileUrl : '';
                case 'image-2': return items[1] ? items[1].fileUrl : '';
                case 'Filename1': return items[0] ? items[0].filename.replace(/\.jpg$/i, '') : (e.parameter['Filename1'] || '');
                case 'Filename2': return items[1] ? items[1].filename.replace(/\.jpg$/i, '') : (e.parameter['Filename2'] || '');
                case 'ImgData1': return '';
                case 'ImgData2': return '';
                case 'Items': return JSON.stringify(items);
                case 'SchemaVersion': return 2;
                default: return e.parameter[header] || '';
            }
        });

        sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow]);

        // Email notification: itemized per product
        const subject = 'Khách vừa tải ảnh lên' + (phone ? ' · ' + phone : '');
        let body = 'Khách tải ảnh với nội dung như sau:\n\n';
        body += 'SĐT: ' + (e.parameter['Name'] || '') + '\n';
        body += 'Số slot: ' + items.length + (samePhoto ? ' (dùng cùng 1 ảnh)' : '') + '\n\n';
        body += 'Chi tiết sản phẩm:\n';
        items.forEach(function (it, idx) {
            body += (idx + 1) + '. ' + it.sku + ' — ' + it.name + ': ' + it.fileUrl + '\n';
        });
        if (e.parameter['message']) {
            body += '\nGhi chú khách: ' + e.parameter['message'] + '\n';
        }
        MailApp.sendEmail(recipientEmail, subject, body);

        return ContentService.createTextOutput('Upload Done');
    } catch (err) {
        return jsonOut({ result: 'error', error: String(err) });
    } finally {
        lock.releaseLock();
    }
}

// Append Items / SchemaVersion columns if the sheet was created before v2.
function ensureFormDataColumns_(sheet) {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const needed = ['Items', 'SchemaVersion'];
    const missing = needed.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length === 0) return;

    missing.forEach(function (h, i) {
        sheet.getRange(1, lastCol + 1 + i).setValue(h);
    });
}

// ===== HƯỚNG DẪN CẬP NHẬT =====
// 1. Copy toàn bộ code này vào Apps Script editor và Deploy > New deployment (Web app, Anyone access).
// 2. Tạo sheet "products" với header: SKU | Name | Type | Material | ImagesPerUnit | Hint | ThumbnailUrl | Active.
// 3. Thêm/sửa sản phẩm trong sheet "products"; set Active=FALSE để ẩn SKU.
// 4. Sheet "form data" sẽ tự được thêm cột Items và SchemaVersion khi có upload đầu tiên.
//
// ===== CHANGELOG v2 =====
// ✅ action=listProducts trả về catalog cho form khách
// ✅ doPost hỗ trợ N slot (ImgData_0..N-1) kèm SKU/ProductName/Slot
// ✅ Items JSON ghi kèm mỗi row (có fallback image-1/image-2 cho admin cũ)
// ✅ Email thông báo liệt kê từng sản phẩm + link Drive
//
// ===== CHANGELOG v3 =====
// ✅ listProducts trả thêm type + material để form lọc dropdown
// ✅ Thêm cột Type và Material vào sheet products (optional — để trống sẽ vào nhóm "Khác")
