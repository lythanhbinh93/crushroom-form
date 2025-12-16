# 📸 Order → Photo Naming Helper

Web app giúp đặt tên ảnh theo đơn hàng từ file Excel, giảm sai sót khi rename thủ công.

## 🎯 Mục tiêu

Thay vì user tự rename ảnh, app sẽ:
1. Tạo "slot naming" theo order từ file Excel
2. Cho phép user map từng ảnh vào từng slot bằng UI có preview
3. Export ZIP gồm ảnh đã rename + file Excel worklist

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

### Workflow 6 bước

#### Bước 1: Upload File Excel
- Upload file `orders-check.xlsx`
- App tự động validate các cột bắt buộc
- Hiển thị thông báo lỗi nếu thiếu cột

#### Bước 2: Xem & Chỉnh sửa dữ liệu
- Review dữ liệu đã xử lý
- Chỉnh sửa các trường:
  - `_need_photo`: Checkbox bật/tắt cần ảnh
  - `_img_per_unit`: Số ảnh trên mỗi sản phẩm
  - `_yy`: Note đã sanitize

#### Bước 3: Chọn đơn hàng
- Dropdown chọn order cần xử lý
- Hiển thị metrics:
  - Tổng số dòng
  - Dòng cần ảnh
  - Tổng số ảnh cần
- App tự động tạo slots

#### Bước 4: Upload ảnh
- Upload nhiều file ảnh (JPG, PNG, WEBP, HEIC)
- Nút "Tự động map ảnh theo thứ tự" để map nhanh

#### Bước 5: Map ảnh vào Slot
- Mỗi slot hiển thị:
  - Số thứ tự slot
  - Tên output (suggested name)
  - Dropdown chọn file ảnh
  - Preview ảnh đã chọn
- User có thể thay đổi mapping để tránh nhầm

#### Bước 6: Export
- Kiểm tra các slot chưa map
- Nút "Tạo file ZIP" (disable nếu còn slot chưa map)
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
