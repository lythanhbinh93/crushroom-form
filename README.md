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

**Link**: https://crushroom-form.vercel.app/admin.html

**Tính năng**:
- **Tìm kiếm theo SĐT**: Nhập số điện thoại → xem grid ảnh
- **Duyệt theo ngày**: Chọn khoảng thời gian → xem bảng upload (nhóm theo ngày)

**Giao diện**: Gradient purple (#667eea → #764ba2)

### 3. Customer Upload Form (Couplepix)

Form upload ảnh + crop cho khách hàng (nhúng trong Shopify hoặc dùng standalone).

**Link**: https://crushroom-form.vercel.app/couplepix.html (standalone)  
**Shopify**: Nhúng file `templates/couplepix.liquid` vào theme

**Tính năng**:
- Nhập SĐT (VN format mặc định)
- Upload ảnh kép + crop real-time (Croppie)
- POST data → GAS backend → lưu Drive + Sheet

### 4. Check Delivery Date (Ngày Có Hàng)

Tính toán ngày sản xuất xong và ngày khách nhận hàng theo tỉnh thành.

**Link**: https://crushroom-form.vercel.app/check-date.html

**Quy tắc**:
- Cutoff: 17:00 (sau 17h = tính ngày hôm sau)
- Production schedule: Thứ 6, Thứ 2, Thứ 3
- Delivery offset by province:
  - HCM: +2 ngày
  - Hà Nội: +3 ngày
  - Phú Quốc: +5 ngày
  - Grab HCM: +1 ngày
  - Khác: +3 ngày (mặc định)

### 5. Staff Homepage

Trang điều khiển nội bộ — liên kết đến các công cụ.

**Link**: https://crushroom-form.vercel.app/

**Giao diện**: B&W minimalist (card grid)

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
- Link đến [Admin Panel](https://crushroom-form.vercel.app/admin.html) để xem ảnh

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
