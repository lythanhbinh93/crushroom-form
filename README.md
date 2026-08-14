# CouplePix — Internal Staff Toolkit

Bộ công cụ nội bộ cho một cửa hàng e-commerce chuyên chụp ảnh cá nhân hóa (couple portraits, in ấn tùy chỉnh). Bao gồm 4 công cụ chính, backend Google Apps Script, và frontend tĩnh trên Vercel.

## 📋 Các Công Cụ

### 1. Photo Naming Helper (Streamlit App)

Web app giúp đặt tên ảnh theo đơn hàng từ file Excel, giảm sai sót khi rename thủ công.

**Link**: https://crushroomapp.streamlit.app/

**Chức năng**:
- Upload file orders-check.xlsx
- Tự động fetch ảnh từ Google Drive theo số điện thoại
- Map ảnh vào slot theo UI (paginated)
- Export ZIP: ảnh đã rename + file Excel worklist

**Thời gian tiết kiệm**: <2 phút cho 50 ảnh (vs 15+ phút thủ công)

### 2. Admin Panel (Check Photo)

Tìm và xem ảnh khách hàng đã upload.

**Link**: https://admin.crushroom.vn/admin

**Tính năng**:
- **Tìm kiếm theo SĐT**: Nhập số điện thoại → xem grid ảnh
- **Duyệt theo ngày**: Chọn khoảng thời gian → xem bảng upload (nhóm theo ngày)

**Giao diện**: Gradient purple (#667eea → #764ba2)

### 3. Customer Upload Form (Couplepix)

Form upload ảnh + crop cho khách hàng (nhúng trong Shopify hoặc dùng standalone).

**Link**: https://admin.crushroom.vn/couplepix (standalone)  
**Shopify**: Nhúng file `templates/couplepix.liquid` vào theme

**Tính năng**:
- Nhập SĐT (VN format mặc định)
- Upload ảnh kép + crop real-time (Croppie)
- POST data → GAS backend → lưu Drive + Sheet

### 4. Check Delivery Date (Ngày Có Hàng)

Tính toán ngày sản xuất xong và ngày khách nhận hàng theo tỉnh thành.

**Link**: https://admin.crushroom.vn/check-date

**Quy tắc**:
- Cutoff: 17:00 (sau 17h = tính ngày hôm sau)
- Production schedule: Thứ 6, Thứ 2, Thứ 3
- Delivery offset by province:
  - HCM: +2 ngày
  - Hà Nội: +3 ngày
  - Phú Quốc: +5 ngày
  - Grab HCM: +1 ngày
  - Khác: +3 ngày (mặc định)

### 5. Voice Gift QR

Hệ thống cho phép khách hàng gửi lời nhắn âm thanh + ảnh + text → staff duyệt và phát hành trang quà tặng có QR code.

**Links**:
- **Chooser (link duy nhất gửi khách):** `https://qr.crushroom.vn/gift-upload?phone=X&order=Y` — khách chọn loại quà; thêm `&types=voice` (hoặc `counter`, hoặc danh sách phẩy) để giới hạn; đúng 1 type hợp lệ thì chuyển thẳng vào form.
- Upload form (gửi cho khách): `https://qr.crushroom.vn/voice-upload?phone=X&order=Y`
- Admin Voice tab: `https://admin.crushroom.vn/admin#voice`
- Public gift page: `https://qr.crushroom.vn/voice?id=SLUG`

**GAS Backend** (riêng biệt với GAS chính):
```
https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec
```

**Luồng**:
1. **Khách** → nhận link từ shop (có `?phone=&order=`) → upload MP3/M4A + ảnh (crop 1:1) + lời nhắn
2. **Staff** → admin #voice tab → preview audio + ảnh → Publish → nhận QR code + URL
3. **Người nhận** → quét QR → `voice.html?id=SLUG` → WaveSurfer player + ảnh + text

**Giới hạn file**:
- Audio: tối đa 35MB (base64 ~47MB, trong ngưỡng GAS 50MB). File >20MB sẽ hiển thị cảnh báo.
- Ảnh: crop 400×400 JPEG, giới hạn thực tế ~5MB trước crop.
- Lời nhắn: tối đa 1000 ký tự.

**Audio proxy**: Drive trả về `CORP: same-site` blocking browser audio từ origins khác. GAS `audioProxy` endpoint đọc file bằng DriveApp (script-owner) và trả base64 → browser decode → Blob URL → WaveSurfer.

**Files**:
- `google-apps-script-voice.js` — GAS script riêng (6 endpoints: finishUpload, listVoice, publishVoice, getVoice, archiveVoice, audioProxy)
- `voice-upload.html` + `assets/voice-upload.{js,css}` — customer form
- `voice.html` + `assets/voice-page.{js,css}` — public gift page
- `assets/admin-voice-tab.js` — admin voice tab controller

### 6. Staff Homepage

Trang điều khiển nội bộ — liên kết đến các công cụ.

**Link**: https://admin.crushroom.vn/

**Giao diện**: B&W minimalist (card grid)

## 🌐 Domains & routing

Three hosts, one deployment. `vercel.json` splits them.

| Host | Serves |
|---|---|
| `qr.crushroom.vn` | **Only** the customer QR pages: `/gift-upload` (type chooser — the one link CS sends), the forms `/voice-upload`, `/love-counter-upload`, `/link-upload`, `/image-upload`, `/video-upload`, and the public pages `/voice`, `/counter`, `/gift` (plus `/assets/**`). Anything else redirects to `/qr-404`. |
| `admin.crushroom.vn` | The staff tools: `/admin`, `/index`, `/couplepix`, `/check-date`. The customer pages redirect from here to `qr.crushroom.vn`. |
| `crushroom-form.vercel.app` | Legacy host — nothing is served here anymore. The customer pages redirect to `qr.crushroom.vn` (old printed QRs keep working, query string preserved); everything else redirects to `admin.crushroom.vn`. **Never detach this domain** — QRs printed before the domain switch resolve through it. |

The customer pages redirect **off** both staff-reachable hosts, so each
customer page has exactly one canonical URL on `qr.crushroom.vn`.

The QR-host rule is an **allow-list**, so any new page is hidden there by default —
to expose one on the QR domain, add it to the `source` pattern in `vercel.json`.
This keeps staff tools off the domain printed on customer orders.

> This is host separation, not authentication. `admin.html` has no login, so
> anyone who knows the `vercel.app` URL can still open it. Add Vercel password
> protection (or a real auth gate) if the panel needs to be private.

## 🚀 Setup & Local Development

### Photo Naming Helper (Streamlit)

```bash
# Clone repo
git clone https://github.com/lythanhbinh93/crushroom-form.git
cd crushroom-form

# Cài dependencies
pip install -r requirements.txt

# Chạy local
streamlit run app.py
```

App sẽ mở tại `http://localhost:8501`

### Static Frontend (Local + Dev)

Các tệp HTML/CSS/JS có thể mở trực tiếp:
```bash
# Từ thư mục gốc
open index.html           # Homepage
open admin.html           # Admin panel
open couplepix.html       # Upload form
open check-date.html      # Date calculator
```

Hoặc dùng local server:
```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx http-server
```

Truy cập `http://localhost:8000`

## 📡 Backend (Google Apps Script)

### Setup GAS Endpoint

1. Tạo Google Sheet (hoặc dùng cái có sẵn)
2. Copy Spreadsheet ID
3. Tạo Google Apps Script project
4. Paste `google-apps-script-complete.js` vào editor
5. Chạy function `intialSetup()` (tự động lưu Spreadsheet ID)
6. Deploy → "New deployment" → "Web app"
7. Copy deployment URL
8. Update URL hardcoded trong:
   - `app.py` line 14
   - `assets/admin.js`
   - `assets/couple-pix.js`
   - `couplepix.html`

**Yêu cầu Google Setup**:
- Google Drive folder (lưu ảnh) — copy FOLDER_ID vào script
- Google Sheet "form data" — auto-created trên upload đầu tiên
- Gmail access (MailApp) — gửi thông báo tới crush@crushroom.vn

Chi tiết: Xem [docs/deployment-guide.md](docs/deployment-guide.md)

## 📖 Hướng dẫn sử dụng

### Input: File Excel

File `orders-check.xlsx` cần có các cột sau (tên phải đúng):

| Tên cột | Mô tả |
|---------|-------|
| **Mã mẫu mã** | SKU sản phẩm (cột N) |
| **Số điện thoại** | Số điện thoại khách hàng (cột P) |
| **Mã đơn hàng** | Order ID |
| **Mã đơn hàng đầy đủ** | Full order code (nếu trống dùng Mã đơn hàng) |
| **Sản phẩm** | Tên sản phẩm |
| **Ghi chú để in** | Note để in |
| **Ghi chú nội bộ** | Note nội bộ (fallback nếu "Ghi chú để in" trống) |
| **Số lượng** | Số lượng sản phẩm |
| **Loại** | Loại sản phẩm |

### Quy tắc đặt tên file

Format: `A. BBBB_XX_YY.ext`

- **A**: Số thứ tự slot trong order (1..N)
- **BBBB**: 4 số cuối của Số điện thoại (pad 0 nếu thiếu)
- **XX**: SKU đã clean:
  - Nếu SKU chứa `COUPLEPIX-DCW` → `DCW` (lấy phần sau dấu -)
  - Nếu không → uppercase + bỏ space
- **YY**: Note đã sanitize (từ "Ghi chú để in", fallback "Ghi chú nội bộ")
  - Bỏ ký tự đặc biệt
  - Thay `/`, `\`, `:` thành `-`
  - Bỏ spaces
  - Giới hạn 35 ký tự
- **ext**: Extension giữ nguyên từ file ảnh upload

### Logic tạo Slot

**Heuristic xác định "cần ảnh"** (`_need_photo`):
1. Nếu `Loại` chứa "khắc" → **False**
2. Nếu `Sản phẩm` chứa "chiếu ảnh" → **True**
3. Nếu SKU raw bắt đầu `COUPLEPIX` → **True**
4. Nếu SKU clean match `^CP\d+` → **True**
5. Ngược lại → **False**

**Số ảnh trên mỗi sản phẩm** (`_img_per_unit`):
- SKU bắt đầu `COUPLEPIX` → **2**
- Ngược lại → **1**

**Tổng số slot** = `Số lượng × Số ảnh/sản phẩm`

### Workflow 4 bước

#### Bước 1: Upload File Excel
- Upload file `orders-check.xlsx`
- App tự động validate các cột bắt buộc
- Hiển thị thông báo lỗi nếu thiếu cột
- Tự động xử lý và tạo các cột computed

#### Bước 2: Chọn Sản Phẩm Cần Ảnh
- Review dữ liệu đã xử lý trong bảng
- **Tick checkbox** các sản phẩm cần ảnh
- Chỉnh sửa các trường:
  - `_need_photo`: Checkbox bật/tắt cần ảnh
  - `_img_per_unit`: Số ảnh trên mỗi sản phẩm
  - `_yy`: Note cho filename
- Hiển thị summary: tổng sản phẩm cần ảnh, tổng số ảnh cần

#### Bước 3: Chọn Đơn Hàng & Lấy Ảnh
- **Dropdown chọn order** cần xử lý
- Hiển thị metrics: Tổng số dòng, Dòng cần ảnh, Tổng số ảnh cần
- App tự động tạo slots theo order
- **Fetch ảnh từ Google Drive**:
  - Tự động lấy số điện thoại từ order
  - Click "Tải ảnh từ Google Drive"
  - Hiển thị các upload session (mới nhất ở trên)
  - Preview ảnh với thumbnail
- **Map ảnh vào slot (dạng bảng)**:
  - Bảng hiển thị: Slot #, Tên Output, Last4, SKU, Note
  - Cột "Chọn Ảnh": Dropdown chọn URL từ Google Drive
  - Nút "Tự động map ảnh theo thứ tự" để map nhanh
- Link đến [Admin Panel](https://admin.crushroom.vn/admin) để xem ảnh

#### Bước 4: Tải Ảnh & Export
- Kiểm tra các slot chưa map
- Click "Tải Ảnh & Tạo ZIP":
  - Progress bar hiển thị tiến trình tải ảnh
  - Download từng ảnh từ Google Drive
  - Tạo ZIP với ảnh đã rename + Excel worklist
- Download file: `<order_key>_ready_for_factory.zip`

### Cấu trúc file ZIP

```
<order_key>_ready_for_factory.zip
├── <order_key>/
│   ├── 1. 1234_DCW_GhichuA.jpg
│   ├── 2. 1234_DCW_GhichuA.jpg
│   ├── 3. 5678_CP123_GhichuB.png
│   └── ...
└── order_worklist.xlsx
    ├── Sheet "raw_data": Các dòng của order + cột computed
    └── Sheet "order": Summary theo order
```

### File Excel worklist

**Sheet "raw_data":**
- Tất cả các row của order đã chọn
- Bao gồm các cột computed: `_sku`, `_yy`, `_need_photo`, `_qty`, `_img_per_unit`, `_last4`, `_order_key`

**Sheet "order":**
- Summary thông tin order:
  - `order_id`: Mã đơn hàng
  - `full_code`: Mã đơn hàng đầy đủ
  - `phone`: Số điện thoại
  - `last4`: 4 số cuối
  - `total_qty`: Tổng số lượng
  - `photo_rows`: Số dòng cần ảnh

## 🔧 Cấu trúc code

### Helper Functions

| Function | Mô tả |
|----------|-------|
| `normalize_phone(phone)` | Extract chỉ số từ phone number |
| `clean_sku(sku)` | Clean SKU theo rule COUPLEPIX-XXX hoặc uppercase |
| `safe_note(note)` | Sanitize note cho filename |
| `needs_photo(row)` | Heuristic xác định row có cần ảnh không |
| `get_img_per_unit(row)` | Xác định số ảnh/sản phẩm |
| `expand_slots(df, order_key)` | Expand rows thành individual slots |
| `build_export_excel(df, order_key)` | Tạo Excel worklist |
| `build_zip_for_order(...)` | Tạo ZIP file export |

### UI Flow (Streamlit)

1. Session state management
2. Excel upload & validation
3. Data preprocessing & editing
4. Order selection
5. Image upload
6. Slot mapping với preview
7. ZIP export

## ⚠️ Lưu ý

- **Không dùng database**: Mọi data lưu trong session state
- **Không cần Google API**: Version này chạy hoàn toàn local
- **Handle lỗi**: App sẽ show `st.error()` và stop nếu thiếu cột bắt buộc
- **Clean code**: Các function độc lập, dễ maintain và test

## 📚 Documentation

Xem thư mục `docs/` để hiểu rõ hơn:

| Document | Nội dung |
|----------|----------|
| [project-overview-pdr.md](docs/project-overview-pdr.md) | Mục tiêu dự án, user personas, constraints |
| [codebase-summary.md](docs/codebase-summary.md) | Cấu trúc code, file counts, entry points |
| [code-standards.md](docs/code-standards.md) | Convention, naming, style guide |
| [system-architecture.md](docs/system-architecture.md) | Component design, data flow, integrations |
| [project-roadmap.md](docs/project-roadmap.md) | Phases, progress, milestones |
| [deployment-guide.md](docs/deployment-guide.md) | Setup production (Streamlit, Vercel, GAS) |
| [design-guidelines.md](docs/design-guidelines.md) | Color palette, typography, components |

## ⚠️ Troubleshooting

### Streamlit App

**Lỗi: "Không kết nối được tới GAS endpoint"**
- Kiểm tra URL trong `app.py` line 14
- Curl URL để test: `curl https://script.google.com/macros/s/[ID]/exec?action=search&phone=0918260494`
- Nếu 404: GAS deployment không đúng

**Lỗi: "Thiếu các cột bắt buộc"**
- File Excel phải có các cột: Mã mẫu mã, Số điện thoại, Mã đơn hàng, Ghi chú để in, v.v
- Xem full list ở README cũ hoặc `docs/codebase-summary.md`

**Lỗi: "Ảnh không hiển thị"**
- Kiểm tra Drive folder ID có đúng không
- Verify GAS script có quyền access Drive

### Admin Panel

**Lỗi: "Tìm kiếm không ra kết quả"**
- Verify GAS endpoint URL có đúng không (xem Network tab)
- Check Sheet "form data" có row không
- Test phone validation: phải 8-12 chữ số

**Lỗi: "Ảnh blur hoặc không load"**
- Drive thumbnail có thể mất (URL expire)
- Chạy GAS upload lại từ couplepix.html

### Customer Upload (Couplepix)

**Lỗi: "Crop không hoạt động"**
- Croppie CDN có thể bị block (check Network tab)
- Fallback: Download ảnh, crop offline, upload lại

**Lỗi: "Upload không gửi được"**
- Verify GAS endpoint URL (trong couple-pix.js)
- Check FormData fields: Phone, ImgData1, Filename1, v.v

### GAS Backend

**Lỗi: "Không kết nối được Sheet"**
- Chạy `intialSetup()` function lại
- Verify Spreadsheet ID lưu trong PropertiesService

**Lỗi: "Upload timeout"**
- LockService timeout 10s có thể quá ngắn
- Increase timeout hoặc optimize upload flow

### Voice Gift

**Lỗi: "Link không hợp lệ" khi mở voice-upload.html**
- URL thiếu `?phone=X&order=Y` params — staff phải gửi link đúng format cho khách

**Upload âm thanh không gửi được / timeout**
- File > 35MB: yêu cầu khách nén lại (MP3 128kbps ~1MB/min)
- GAS có thể timeout với file > 25MB trên kết nối chậm — khuyên dùng WiFi
- Check Drive quota tại https://one.google.com/storage

**Audio không phát trên voice.html**
- Kiểm tra GAS `audioProxy` endpoint hoạt động: `curl "GAS_URL?action=audioProxy&id=DRIVE_FILE_ID"`
- Drive Advanced Service (`Drive API v2`) phải được bật trong GAS project

**QR không hiển thị trong admin**
- Kiểm tra CDN `qr-code-styling` đã load (Network tab)
- Chỉ hoạt động sau khi row được Publish (không phải Pending)

## 📖 Hướng Dẫn Chi Tiết (Photo Naming Helper)

### Input: File Excel

File `orders-check.xlsx` cần có các cột sau:

| Cột | Mô tả | Ví dụ |
|-----|-------|-------|
| Mã mẫu mã | SKU sản phẩm | COUPLEPIX-DCW |
| Số điện thoại | SĐT khách | 0918260494 |
| Mã đơn hàng | Order ID | ORD-001 |
| Mã đơn hàng đầy đủ | Full order code | ORD-001-FULL |
| Sản phẩm | Tên SP | Khung ảnh 20x30 |
| Ghi chú để in | Note trên ảnh | Yêu nhau mãi |
| Ghi chú nội bộ | Note staff | Note riêng |
| Số lượng | Qty | 2 |
| Loại | Khắc / Chiếu ảnh | Chiếu ảnh |

### Quy Tắc Đặt Tên

Format: `A. BBBB_XX_YY.ext`

- **A**: Slot number (1..N)
- **BBBB**: 4 số cuối SĐT (zero-padded)
- **XX**: SKU clean (COUPLEPIX-DCW → DCW, else uppercase)
- **YY**: Note sanitize (35 char, no special chars)
- **ext**: File extension

Ví dụ: `1. 0494_DCW_YeuNhauMai.jpg`

### Heuristic: Cần Ảnh?

Dòng cần ảnh nếu:
- Sản phẩm chứa "chiếu ảnh" HOẶC
- SKU bắt đầu "COUPLEPIX"

Nếu Loại chứa "khắc" → FALSE (không cần)

### Workflow 4 Bước

1. **Upload Excel** → Validate cột → Compute columns
2. **Chọn Đơn** → Review & edit _yy, _need_photo, _img_per_unit
3. **Lấy Ảnh** → Fetch Drive OR upload thủ công
4. **Export ZIP** → Map slot → Download

Output: `{order_key}_FULL.zip` (renamed images + checklist.xlsx)

## 📝 License

Internal tool - For authorized use only

## 👨‍💻 Team

**Owner**: CouplePix  
**Maintainer**: lythanhbinh93  
**Tech Stack**: Streamlit (Python) + Vercel (HTML/CSS/JS) + Google Apps Script
