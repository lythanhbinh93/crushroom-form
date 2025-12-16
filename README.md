# 📸 Order → Photo Naming Helper

Web app giúp đặt tên ảnh theo đơn hàng từ file Excel, giảm sai sót khi rename thủ công.

## 🎯 Mục tiêu

Thay vì user tự rename ảnh, app sẽ:
1. Tạo "slot naming" theo order từ file Excel
2. Tự động fetch ảnh từ Google Drive theo số điện thoại
3. Cho phép user map ảnh vào slot bằng UI dạng bảng
4. Export ZIP gồm ảnh đã rename + file Excel worklist

## 📋 Yêu cầu hệ thống

- Python 3.8+
- Các thư viện trong `requirements.txt`

## 🚀 Cài đặt & Chạy

### Bước 1: Clone hoặc tải code

```bash
cd crushroom-form
```

### Bước 2: Cài đặt dependencies

```bash
pip install -r requirements.txt
```

### Bước 3: Chạy app

```bash
streamlit run app.py
```

App sẽ tự động mở trong browser tại `http://localhost:8501`

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

### Workflow 3 bước

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
- Hiển thị summary:
  - **Tổng đơn hàng** cần xử lý
  - **Tổng sản phẩm** cần ảnh
  - **Tổng số ảnh** cần
- App tự động tạo slots cho **TẤT CẢ đơn hàng**

#### Bước 3: Lấy Ảnh & Map Vào Slot (Toàn Bộ Đơn Hàng)
- **Fetch ảnh từ Google Drive cho TẤT CẢ số điện thoại**:
  - Click "Tải TẤT CẢ ảnh từ Google Drive"
  - Progress bar hiển thị tiến trình fetch
  - Hiển thị summary: số upload sessions từ số SĐT
  - Xem preview ảnh đã tải (expandable)
  - Link đến [Admin Panel](https://crushroom-form.vercel.app/admin.html)

- **Map ảnh vào slot (Bảng lớn cho tất cả orders)**:
  - Bảng hiển thị: **STT, Mã ĐH, Slot, SĐT, Tên File, SKU, Note, Chọn Ảnh**
  - Cột "Chọn Ảnh": Dropdown chọn URL từ Google Drive
  - Nút "Tự động map ảnh theo thứ tự (theo SĐT)": Map thông minh theo phone

#### Bước 4: Tải Ảnh & Export
- Kiểm tra các slot chưa map (hiển thị table)
- Click "Tải Ảnh & Tạo ZIP cho TẤT CẢ đơn hàng":
  - Progress bar hiển thị tiến trình download
  - Download từng ảnh từ Google Drive
  - Tạo ZIP với **tất cả orders** (mỗi order 1 folder)
  - Mỗi folder chứa: ảnh đã rename + `order_worklist.xlsx`
- Download file: `all_orders_ready_for_factory.zip`
- Hiển thị summary chi tiết theo từng đơn hàng (expandable)

### Cấu trúc file ZIP

```
all_orders_ready_for_factory.zip
├── S2798984O34181/
│   ├── 1. 1234_DCW_GhichuA.jpg
│   ├── 2. 1234_DCW_GhichuA.jpg
│   └── order_worklist.xlsx
├── S2798984O34182/
│   ├── 1. 5678_CP123_GhichuB.png
│   ├── 2. 5678_CP123_GhichuB.png
│   └── order_worklist.xlsx
└── S2798984O34183/
    ├── 1. 9012_DCW_GhichuC.jpg
    └── order_worklist.xlsx
```

Mỗi order có 1 folder riêng chứa ảnh đã rename + file Excel worklist.

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

## 🐛 Troubleshooting

### Lỗi "Thiếu các cột bắt buộc"
- Kiểm tra file Excel có đúng tên cột không (phân biệt hoa thường, dấu)
- Đảm bảo các cột theo đúng danh sách yêu cầu

### Ảnh không hiển thị
- Kiểm tra định dạng file (chỉ hỗ trợ JPG, PNG, WEBP, HEIC)
- File ảnh có thể bị corrupt

### ZIP không tải được
- Đảm bảo tất cả slot đã được map
- Kiểm tra dung lượng file không quá lớn

## 📝 License

Internal tool - For authorized use only

## 👨‍💻 Developer

Created by Senior Full-Stack Engineer
