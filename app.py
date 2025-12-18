import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import requests
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Google Apps Script URL - same as admin.html
GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def normalize_phone(phone: str) -> str:
    """Extract digits only from phone number."""
    if pd.isna(phone):
        return ""
    # Convert to int first to remove decimal point from float (e.g., 971878941.0 -> 971878941)
    try:
        # Try to convert to float then int to handle Excel numeric format
        phone_int = int(float(phone))
        return str(phone_int)
    except (ValueError, TypeError):
        # Fallback to regex for string format
        return re.sub(r'\D', '', str(phone))

def clean_sku(sku: str) -> str:
    """
    Clean SKU according to rules:
    - If contains COUPLEPIX-XXX, extract XXX
    - Otherwise, uppercase and remove spaces
    """
    if pd.isna(sku):
        return ""

    sku_str = str(sku).strip()

    # Check for COUPLEPIX-XXX pattern
    if "COUPLEPIX-" in sku_str.upper():
        parts = sku_str.upper().split("COUPLEPIX-")
        if len(parts) > 1 and parts[1]:
            return parts[1].split()[0]  # Get first part after hyphen

    # Default: uppercase and remove spaces
    return sku_str.upper().replace(" ", "")

def safe_note(note: str, max_length: int = 35) -> str:
    """
    Sanitize note for filename:
    - Remove special chars
    - Replace / \ : with -
    - Remove spaces
    - Limit length
    """
    if pd.isna(note) or not note:
        return ""

    note_str = str(note).strip()

    # Replace problematic chars
    note_str = note_str.replace("/", "-").replace("\\", "-").replace(":", "-")

    # Remove special chars, keep alphanumeric, Vietnamese, and basic punctuation
    note_str = re.sub(r'[^\w\s\-.,áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]', '', note_str)

    # Remove spaces
    note_str = note_str.replace(" ", "")

    # Limit length
    if len(note_str) > max_length:
        note_str = note_str[:max_length]

    return note_str

def needs_photo(row: pd.Series) -> bool:
    """
    Heuristic to determine if row needs photo:
    - If Loại contains "khắc" → False
    - If Sản phẩm contains "chiếu ảnh" → True
    - If SKU starts with COUPLEPIX → True
    - If cleaned SKU matches ^CP\\d+ → True
    - Else False
    """
    loai = str(row.get('Loại', '')).lower() if not pd.isna(row.get('Loại')) else ''
    san_pham = str(row.get('Sản phẩm', '')).lower() if not pd.isna(row.get('Sản phẩm')) else ''
    sku_raw = str(row.get('Mã mẫu mã', '')) if not pd.isna(row.get('Mã mẫu mã')) else ''

    # Rule 1: Loại contains "khắc"
    if 'khắc' in loai:
        return False

    # Rule 2: Sản phẩm contains "chiếu ảnh"
    if 'chiếu ảnh' in san_pham or 'chieu anh' in san_pham:
        return True

    # Rule 3: SKU starts with COUPLEPIX
    if sku_raw.upper().startswith('COUPLEPIX'):
        return True

    # Rule 4: Cleaned SKU matches ^CP\d+
    sku_clean = clean_sku(sku_raw)
    if re.match(r'^CP\d+', sku_clean):
        return True

    return False

def get_img_per_unit(row: pd.Series) -> int:
    """
    Get default images per unit: always 1
    """
    return 1

def expand_all_slots(df: pd.DataFrame) -> List[Dict]:
    """
    Expand ALL orders into individual photo slots.
    Returns list of slot dicts with: global_idx, order_key, slot_in_order, last4, sku, yy, suggested_name
    """
    all_slots = []
    global_idx = 1

    # Get unique orders
    order_keys = df['_order_key'].unique()

    for order_key in order_keys:
        # Filter rows for this order
        order_rows = df[df['_order_key'] == order_key]
        slot_in_order = 1

        for _, row in order_rows.iterrows():
            if not row.get('_need_photo', False):
                continue

            qty = row.get('_qty', 1)
            img_per_unit = row.get('_img_per_unit', 1)
            total_slots = qty * img_per_unit

            last4 = row.get('_last4', '0000')
            sku = row.get('_sku', '')
            yy = row.get('_yy', '')
            phone = row.get('_phone_digits', '')

            for _ in range(total_slots):
                # Build suggested name: "STT. last4_SKU_note_"
                name_parts = [last4, sku]
                if yy:
                    name_parts.append(yy)

                suggested_name = f"{global_idx}. " + "_".join(name_parts) + "_"

                all_slots.append({
                    'global_idx': global_idx,
                    'order_key': order_key,
                    'slot_in_order': slot_in_order,
                    'phone': phone,
                    'last4': last4,
                    'sku': sku,
                    'yy': yy,
                    'suggested_name': suggested_name,
                    'image_url': None,
                    'image_data': None
                })

                slot_in_order += 1
                global_idx += 1

    return all_slots

def fetch_images_from_gdrive(phone: str) -> List[Dict]:
    """
    Fetch images from Google Drive using the Google Apps Script API.
    Returns list of image data.
    """
    try:
        response = requests.get(
            f"{GOOGLE_SCRIPT_URL}?action=search&phone={phone}",
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        if data.get('success') and data.get('results'):
            return data['results']
        return []
    except Exception as e:
        st.error(f"Lỗi khi fetch ảnh từ Google Drive cho SĐT {phone}: {str(e)}")
        return []

def fetch_all_images(df: pd.DataFrame) -> Dict[str, List[Dict]]:
    """
    Fetch images for all unique phone numbers in the dataframe (CONCURRENT).
    Returns dict mapping phone -> list of image sessions
    """
    all_images = {}

    # Get unique phone numbers from rows that need photos
    photo_rows = df[df['_need_photo'] == True]
    unique_phones = photo_rows['_phone_digits'].unique()

    progress_bar = st.progress(0)
    status_text = st.empty()

    total = len(unique_phones)
    completed = 0

    # Concurrent downloads with ThreadPoolExecutor (max 10 workers)
    with ThreadPoolExecutor(max_workers=10) as executor:
        # Submit all tasks
        future_to_phone = {
            executor.submit(fetch_images_from_gdrive, phone): phone
            for phone in unique_phones if phone
        }

        # Process completed tasks
        for future in as_completed(future_to_phone):
            phone = future_to_phone[future]
            try:
                images = future.result()
                if images:
                    all_images[phone] = images

                completed += 1
                progress_bar.progress(completed / total)
                status_text.text(f"Đã tải {completed}/{total} SĐT...")
            except Exception as e:
                st.warning(f"⚠️ Lỗi tải ảnh cho {phone}: {str(e)}")
                completed += 1

    progress_bar.empty()
    status_text.empty()

    return all_images

def extract_gdrive_id(url: str) -> Optional[str]:
    """Extract Google Drive file ID from URL."""
    if not url:
        return None
    match = re.search(r'[-\w]{25,}', url)
    return match.group(0) if match else None

def get_gdrive_direct_url(url: str) -> str:
    """Convert Google Drive URL to direct download URL."""
    file_id = extract_gdrive_id(url)
    if file_id:
        return f"https://drive.google.com/uc?export=download&id={file_id}"
    return url

def download_image_from_url(url: str) -> Optional[io.BytesIO]:
    """Download image from URL and return as BytesIO."""
    try:
        direct_url = get_gdrive_direct_url(url)
        response = requests.get(direct_url, timeout=30)
        response.raise_for_status()
        return io.BytesIO(response.content)
    except Exception as e:
        st.error(f"Lỗi khi tải ảnh: {str(e)}")
        return None

def build_export_excel(df: pd.DataFrame, order_key: str) -> io.BytesIO:
    """
    Build Excel worklist with 2 sheets:
    - raw_data: all rows with computed columns
    - order: summary for the order
    """
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Sheet 1: raw_data (filtered for this order)
        order_df = df[df['_order_key'] == order_key].copy()
        order_df.to_excel(writer, sheet_name='raw_data', index=False)

        # Sheet 2: order summary
        summary_data = {
            'order_id': [order_df['Mã đơn hàng'].iloc[0] if len(order_df) > 0 else ''],
            'full_code': [order_key],
            'phone': [order_df['Số điện thoại'].iloc[0] if len(order_df) > 0 else ''],
            'last4': [order_df['_last4'].iloc[0] if len(order_df) > 0 else ''],
            'total_qty': [order_df['_qty'].sum()],
            'photo_rows': [len(order_df[order_df['_need_photo'] == True])]
        }
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, sheet_name='order', index=False)

    output.seek(0)
    return output

def build_export_excel_all(df: pd.DataFrame, slots: List[Dict]) -> io.BytesIO:
    """
    Build Excel worklist for ALL orders with slots information
    """
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Sheet 1: raw_data (all orders)
        df.to_excel(writer, sheet_name='raw_data', index=False)

        # Sheet 2: slots mapping
        slots_data = []
        for slot in slots:
            slots_data.append({
                'STT': slot['global_idx'],
                'Order': slot['order_key'],
                'Slot': slot['slot_in_order'],
                'Phone': slot['phone'],
                'SKU': slot['sku'],
                'Note': slot['yy'],
                'Filename': slot['suggested_name'],
                'Image_URL': slot.get('image_url', '')
            })

        slots_df = pd.DataFrame(slots_data)
        slots_df.to_excel(writer, sheet_name='slots_mapping', index=False)

    output.seek(0)
    return output

def build_zip_for_all_orders(df: pd.DataFrame, slots: List[Dict]) -> io.BytesIO:
    """
    Build ZIP file containing:
    - All renamed photos in a single folder
    - order_worklist.xlsx for all orders
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add all photos to single folder
        for slot in slots:
            if slot.get('image_data') is not None:
                # Determine extension from URL or default to .jpg
                image_url = slot.get('image_url', '')
                ext = '.jpg'
                if image_url:
                    # Try to get extension from URL
                    url_path = image_url.split('?')[0]
                    url_ext = Path(url_path).suffix
                    if url_ext.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                        ext = url_ext.lower()

                # Build new filename
                new_filename = f"{slot['suggested_name']}{ext}"

                # Add to zip (all photos in root)
                slot['image_data'].seek(0)
                zip_file.writestr(new_filename, slot['image_data'].read())

        # Add Excel worklist for all orders (combined)
        excel_data = build_export_excel_all(df, slots)
        excel_data.seek(0)
        zip_file.writestr("order_worklist.xlsx", excel_data.read())

    zip_buffer.seek(0)
    return zip_buffer

# ============================================================================
# STREAMLIT UI
# ============================================================================

def main():
    st.set_page_config(
        page_title="Order → Photo Naming Helper",
        page_icon="📸",
        layout="wide"
    )

    # Custom CSS Theme
    st.markdown("""
    <style>
        /* Color Palette */
        :root {
            --primary-color: #4F46E5;
            --primary-hover: #4338CA;
            --success-color: #10B981;
            --warning-color: #F59E0B;
            --error-color: #EF4444;
            --bg-light: #F9FAFB;
            --bg-card: #FFFFFF;
            --text-primary: #111827;
            --text-secondary: #6B7280;
            --border-color: #E5E7EB;
        }

        /* Main Container */
        .main {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 2rem;
        }

        .main > div {
            background: white;
            border-radius: 20px;
            padding: 2.5rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }

        /* Headers */
        h1 {
            color: var(--primary-color) !important;
            font-weight: 700 !important;
            font-size: 2.5rem !important;
            margin-bottom: 0.5rem !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        h2 {
            color: var(--text-primary) !important;
            font-weight: 600 !important;
            font-size: 1.75rem !important;
            margin-top: 2rem !important;
            margin-bottom: 1rem !important;
            padding-bottom: 0.75rem !important;
            border-bottom: 3px solid var(--primary-color) !important;
        }

        /* Subtitle */
        .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
            margin-bottom: 2rem;
        }

        /* Buttons */
        .stButton > button {
            border-radius: 10px !important;
            font-weight: 600 !important;
            padding: 0.6rem 1.5rem !important;
            transition: all 0.3s ease !important;
            border: none !important;
        }

        .stButton > button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.15) !important;
        }

        /* Download Button */
        .stDownloadButton > button {
            background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;
            color: white !important;
            border-radius: 12px !important;
            font-weight: 700 !important;
            padding: 1rem 2rem !important;
            font-size: 1.1rem !important;
            box-shadow: 0 10px 30px rgba(16,185,129,0.3) !important;
        }

        .stDownloadButton > button:hover {
            transform: scale(1.05);
            box-shadow: 0 15px 40px rgba(16,185,129,0.4) !important;
        }

        /* Input Fields */
        .stTextInput > div > div > input {
            border-radius: 8px !important;
            border: 2px solid var(--border-color) !important;
            padding: 0.75rem !important;
            font-size: 1rem !important;
        }

        .stTextInput > div > div > input:focus {
            border-color: var(--primary-color) !important;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1) !important;
        }

        /* File Uploader */
        .stFileUploader {
            background: var(--bg-light);
            border-radius: 12px;
            padding: 1.5rem;
            border: 2px dashed var(--border-color);
            transition: all 0.3s ease;
        }

        .stFileUploader:hover {
            border-color: var(--primary-color);
            background: white;
        }

        /* Data Editor */
        .stDataFrame {
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        }

        /* Messages */
        .stSuccess {
            background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%) !important;
            border-left: 4px solid var(--success-color) !important;
            border-radius: 10px !important;
            padding: 1rem 1.5rem !important;
        }

        .stError {
            background: linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%) !important;
            border-left: 4px solid var(--error-color) !important;
            border-radius: 10px !important;
            padding: 1rem 1.5rem !important;
        }

        .stWarning {
            background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%) !important;
            border-left: 4px solid var(--warning-color) !important;
            border-radius: 10px !important;
            padding: 1rem 1.5rem !important;
        }

        .stInfo {
            background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%) !important;
            border-left: 4px solid var(--primary-color) !important;
            border-radius: 10px !important;
            padding: 1rem 1.5rem !important;
        }

        /* Metrics */
        .stMetric {
            background: var(--bg-light);
            padding: 1.5rem;
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }

        .stMetric:hover {
            box-shadow: 0 8px 20px rgba(0,0,0,0.08);
            transform: translateY(-2px);
            transition: all 0.3s ease;
        }

        /* Progress Bar */
        .stProgress > div > div > div {
            background: linear-gradient(90deg, var(--primary-color), var(--success-color)) !important;
            border-radius: 10px !important;
        }

        /* Expander */
        .streamlit-expanderHeader {
            background: var(--bg-light);
            border-radius: 10px !important;
            font-weight: 600;
        }

        .streamlit-expanderHeader:hover {
            background: var(--border-color);
        }

        /* Image Thumbnails */
        img {
            border-radius: 8px;
            transition: transform 0.2s ease;
        }

        img:hover {
            transform: scale(1.05);
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-light);
            border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
        }
    </style>
    """, unsafe_allow_html=True)

    st.title("📸 Order → Photo Naming Helper")
    st.markdown('<p class="subtitle">Giúp đặt tên ảnh theo đơn hàng từ file Excel + Google Drive</p>', unsafe_allow_html=True)

    # Initialize session state
    if 'df' not in st.session_state:
        st.session_state.df = None
    if 'slots' not in st.session_state:
        st.session_state.slots = []
    if 'all_gdrive_images' not in st.session_state:
        st.session_state.all_gdrive_images = {}

    # ========================================================================
    # STEP 1: Upload Excel
    # ========================================================================
    st.header("📁 Bước 1: Upload File Excel")

    uploaded_excel = st.file_uploader(
        "Chọn file orders-check.xlsx",
        type=['xlsx', 'xls'],
        key='excel_uploader'
    )

    if uploaded_excel is not None:
        try:
            # Read Excel
            df = pd.read_excel(uploaded_excel)

            # Validate required columns
            required_cols = [
                'Mã mẫu mã',
                'Số điện thoại',
                'Mã đơn hàng',
                'Sản phẩm',
                'Ghi chú để in',
                'Ghi chú nội bộ',
                'Số lượng',
                'Loại'
            ]

            missing_cols = [col for col in required_cols if col not in df.columns]

            if missing_cols:
                st.error(f"❌ Thiếu các cột bắt buộc: {', '.join(missing_cols)}")
                st.stop()

            # Process data
            df['_phone_digits'] = df['Số điện thoại'].apply(normalize_phone)
            df['_last4'] = df['_phone_digits'].apply(lambda x: x[-4:].zfill(4) if x else '0000')
            df['_sku'] = df['Mã mẫu mã'].apply(clean_sku)

            # Note: Default to empty (user can edit in Step 3)
            df['_yy'] = ''

            df['_need_photo'] = df.apply(needs_photo, axis=1)
            df['_qty'] = df['Số lượng'].fillna(1).astype(int)
            df['_img_per_unit'] = df.apply(get_img_per_unit, axis=1)

            # Order key: prefer "Mã đơn hàng đầy đủ", fallback to "Mã đơn hàng"
            if 'Mã đơn hàng đầy đủ' in df.columns:
                df['_order_key'] = df.apply(
                    lambda row: row['Mã đơn hàng đầy đủ'] if not pd.isna(row['Mã đơn hàng đầy đủ']) and str(row['Mã đơn hàng đầy đủ']).strip()
                    else row['Mã đơn hàng'],
                    axis=1
                )
            else:
                df['_order_key'] = df['Mã đơn hàng']

            st.session_state.df = df

            st.success(f"✅ Đã load {len(df)} dòng từ Excel")

        except Exception as e:
            st.error(f"❌ Lỗi khi đọc file Excel: {str(e)}")
            st.stop()

    if st.session_state.df is None:
        st.info("👆 Vui lòng upload file Excel để bắt đầu")
        st.stop()

    df = st.session_state.df

    # ========================================================================
    # STEP 2: Review & Select Products Needing Photos
    # ========================================================================
    st.header("✏️ Bước 2: Chọn Sản Phẩm Cần Ảnh")

    st.markdown("**Tick các sản phẩm cần ảnh và chỉnh sửa thông tin:**")

    # Create editable dataframe with checkbox for need_photo
    edited_df = st.data_editor(
        df[[
            'Mã đơn hàng',
            '_order_key',
            'Số điện thoại',
            '_last4',
            'Mã mẫu mã',
            '_sku',
            'Sản phẩm',
            '_yy',
            '_qty',
            '_need_photo',
            '_img_per_unit'
        ]],
        column_config={
            '_need_photo': st.column_config.CheckboxColumn(
                'Cần ảnh?',
                help='Tick nếu sản phẩm này cần ảnh',
                default=False
            ),
            '_img_per_unit': st.column_config.NumberColumn(
                'Ảnh/sản phẩm',
                help='Số ảnh cho mỗi sản phẩm',
                min_value=1,
                max_value=10
            ),
            '_yy': st.column_config.TextColumn(
                'Note',
                help='Ghi chú cho filename'
            ),
        },
        disabled=['Mã đơn hàng', '_order_key', 'Số điện thoại', '_last4', 'Mã mẫu mã', 'Sản phẩm', '_qty'],
        hide_index=True,
        use_container_width=True,
        key='product_editor'
    )

    # Update session state with edited values
    st.session_state.df['_need_photo'] = edited_df['_need_photo']
    st.session_state.df['_img_per_unit'] = edited_df['_img_per_unit']
    st.session_state.df['_yy'] = edited_df['_yy']
    st.session_state.df['_sku'] = edited_df['_sku']

    df = st.session_state.df

    # Show summary
    total_need_photo = df['_need_photo'].sum()
    total_photos_needed = (df[df['_need_photo'] == True]['_qty'] * df[df['_need_photo'] == True]['_img_per_unit']).sum()
    total_orders = df[df['_need_photo'] == True]['_order_key'].nunique()

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Đơn hàng cần xử lý", int(total_orders))
    with col2:
        st.metric("Sản phẩm cần ảnh", int(total_need_photo))
    with col3:
        st.metric("Tổng số ảnh cần", int(total_photos_needed))

    if total_need_photo == 0:
        st.warning("⚠️ Chưa có sản phẩm nào được chọn cần ảnh")
        st.stop()

    # Generate slots for ALL orders
    slots = expand_all_slots(df)
    st.session_state.slots = slots

    st.info(f"📋 Đã tạo {len(slots)} slot cho {total_orders} đơn hàng")

    # ========================================================================
    # STEP 3: Fetch Images & Map to Slots
    # ========================================================================
    st.header("🔗 Bước 3: Lấy Ảnh & Map Vào Slot")

    # Fetch all images button
    col1, col2 = st.columns([3, 1])

    with col1:
        unique_phones = df[df['_need_photo'] == True]['_phone_digits'].unique()
        st.markdown(f"**Số điện thoại cần tải ảnh:** {len(unique_phones)} SĐT")
        st.markdown(f"Hoặc xem ảnh tại: [Admin Panel](https://crushroom-form.vercel.app/admin.html)")

    with col2:
        if st.button("🔄 Tải TẤT CẢ ảnh từ Google Drive", type="primary"):
            with st.spinner("Đang tải ảnh từ Google Drive..."):
                all_images = fetch_all_images(df)
                st.session_state.all_gdrive_images = all_images

                total_sessions = sum(len(sessions) for sessions in all_images.values())
                if total_sessions > 0:
                    st.success(f"✅ Đã tải {total_sessions} upload sessions từ {len(all_images)} SĐT")
                else:
                    st.warning("⚠️ Không tìm thấy ảnh nào")

    # Show fetched images summary
    if st.session_state.all_gdrive_images:
        st.markdown("---")
        with st.expander("🖼️ Xem Ảnh Đã Tải", expanded=False):
            for phone, sessions in st.session_state.all_gdrive_images.items():
                st.markdown(f"**SĐT: {phone}** - {len(sessions)} upload sessions")

                # Show newest session
                if sessions:
                    newest = sorted(sessions, key=lambda x: x.get('Date', ''), reverse=True)[0]
                    col1, col2 = st.columns([1, 3])
                    with col1:
                        st.caption(f"Mới nhất: {newest.get('Date', 'N/A')}")
                    with col2:
                        images_in_session = []
                        if newest.get('image-1'):
                            images_in_session.append(newest['image-1'])
                        if newest.get('image-2'):
                            images_in_session.append(newest['image-2'])

                        if images_in_session:
                            img_cols = st.columns(len(images_in_session))
                            for idx, img_url in enumerate(images_in_session):
                                with img_cols[idx]:
                                    file_id = extract_gdrive_id(img_url)
                                    if file_id:
                                        thumbnail_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w200"
                                        st.image(thumbnail_url, use_column_width=True)

    # Map images to slots
    st.markdown("---")
    st.subheader("📋 Map Ảnh Vào Slot (Tất Cả Đơn Hàng)")

    if len(st.session_state.slots) == 0:
        st.warning("⚠️ Không có slot nào cần map ảnh")
    else:
        # Collect ALL images with phone filter info
        all_image_options = ['']
        image_label_to_url = {}  # Map label -> URL
        url_to_label = {}  # Map URL -> label
        image_metadata = {}  # Map URL to metadata (phone, date, thumbnail)

        if st.session_state.all_gdrive_images:
            for phone, sessions in st.session_state.all_gdrive_images.items():
                sorted_sessions = sorted(sessions, key=lambda x: x.get('Date', ''), reverse=True)

                # CHỈ lấy session mới nhất
                if sorted_sessions:
                    newest_session = sorted_sessions[0]
                    date_str = newest_session.get('Date', 'N/A')[:10] if newest_session.get('Date') else 'N/A'

                    if newest_session.get('image-1'):
                        url = newest_session['image-1']
                        label = f"📱 {phone} | {date_str} | Ảnh 1"

                        all_image_options.append(label)
                        image_label_to_url[label] = url
                        url_to_label[url] = label

                        file_id = extract_gdrive_id(url)
                        thumbnail = f"https://drive.google.com/thumbnail?id={file_id}&sz=h40" if file_id else ''
                        image_metadata[url] = {
                            'phone': phone,
                            'date': date_str,
                            'thumbnail': thumbnail,
                            'label': label
                        }

                    if newest_session.get('image-2'):
                        url = newest_session['image-2']
                        label = f"📱 {phone} | {date_str} | Ảnh 2"

                        all_image_options.append(label)
                        image_label_to_url[label] = url
                        url_to_label[url] = label

                        file_id = extract_gdrive_id(url)
                        thumbnail = f"https://drive.google.com/thumbnail?id={file_id}&sz=h40" if file_id else ''
                        image_metadata[url] = {
                            'phone': phone,
                            'date': date_str,
                            'thumbnail': thumbnail,
                            'label': label
                        }

        # Save image_label_to_url to session_state for use in Step 4
        st.session_state.image_label_to_url = image_label_to_url

        # Initialize session_state for image selections if not exists
        if 'image_selections' not in st.session_state:
            st.session_state.image_selections = {}

        # Create ONE big mapping table for ALL slots
        mapping_data = []
        for slot in st.session_state.slots:
            current_url = slot.get('image_url', '')
            phone_digits = normalize_phone(slot['phone'])

            # Get thumbnail and label for current selection
            thumbnail_url = ''
            current_label = ''
            if current_url and current_url in image_metadata:
                thumbnail_url = image_metadata[current_url]['thumbnail']
                current_label = url_to_label.get(current_url, '')

            # Initialize selection in session_state (store URL directly)
            stt = slot['global_idx']
            if stt not in st.session_state.image_selections:
                st.session_state.image_selections[stt] = current_url if current_url else ''

            mapping_data.append({
                'STT': slot['global_idx'],
                'SĐT': slot['phone'],
                '_phone_digits': phone_digits,  # For sorting
                'Order': slot['order_key'],
                'Slot': slot['slot_in_order'],
                'Tên File': slot['suggested_name'],
                'SKU': slot['sku'],
                'Note': slot['yy'],
                'Preview': thumbnail_url,
                'Chọn Ảnh': st.session_state.image_selections[stt]
            })

        mapping_df = pd.DataFrame(mapping_data)

        # SORT by STT (global index)
        mapping_df = mapping_df.sort_values('STT').reset_index(drop=True)

        st.info(f"📊 Tổng cộng: {len(mapping_df)} slots từ {mapping_df['Order'].nunique()} đơn hàng | ⚠️ Chỉ chọn ảnh có SĐT matching!")

        # Show visual separator info
        with st.expander("💡 Hướng dẫn chọn ảnh đúng SĐT", expanded=False):
            st.markdown("""
            **Cách chọn ảnh tránh nhầm:**
            1. Bảng đã được **sắp xếp theo SĐT** (các slot cùng SĐT nằm gần nhau)
            2. Trong dropdown "Chọn Ảnh", label có format: `📱 SĐT | Ngày | Ảnh X`
            3. **CHỈ chọn ảnh có SĐT khớp** với cột "SĐT" của row đó
            4. Hoặc dùng nút "Tự động map" để app tự động chọn đúng
            5. Xem thumbnail ảnh ở cột bên phải để dễ chọn
            """)

        # Custom CSS for modern table design
        st.markdown("""
        <style>
        .compact-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 14px;
        }
        .compact-table th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 12px;
            text-align: left;
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            position: sticky;
            top: 0;
            z-index: 10;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .compact-table th:first-child {
            border-top-left-radius: 12px;
        }
        .compact-table th:last-child {
            border-top-right-radius: 12px;
        }
        .compact-table td {
            padding: 8px;
            vertical-align: middle;
            height: 70px;
            max-height: 70px;
        }
        .compact-table img {
            height: 60px;
            width: auto;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .table-container {
            max-height: 800px;
            overflow-y: auto;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.12);
            background: white;
        }
        /* Row Styling */
        .row-container {
            background: white;
            margin-bottom: 10px;
            padding: 14px;
            border-radius: 12px;
            border: 2px solid #E5E7EB;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .row-container:hover {
            border-color: #667eea;
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.2);
            transform: translateX(6px);
        }
        /* Streamlit component styling */
        .compact-table .stSelectbox,
        .compact-table .stTextInput {
            margin-bottom: 0 !important;
        }
        .compact-table .stSelectbox > div,
        .compact-table .stTextInput > div {
            margin-bottom: 0 !important;
        }
        </style>
        """, unsafe_allow_html=True)

        # HTML table header
        st.markdown('<div class="table-container">', unsafe_allow_html=True)
        st.markdown("""
        <table class="compact-table">
            <thead>
                    <tr>
                        <th style="width: 40px;">STT</th>
                        <th style="width: 100px;">SĐT</th>
                        <th style="width: 50px;">Slot</th>
                        <th style="width: 250px;">Tên File</th>
                        <th style="width: 80px;">SKU</th>
                        <th style="width: 100px;">Note</th>
                        <th style="width: 70px;">Preview</th>
                        <th style="width: 200px;">Chọn Ảnh</th>
                    </tr>
                </thead>
        </table>
        """, unsafe_allow_html=True)

        # Create scrollable container for rows
        table_rows_container = st.container()

        with table_rows_container:
            # Render each row
            for idx, row in mapping_df.iterrows():
                # Get STT and phone info upfront
                stt = int(row['STT'])
                phone_digits = row['_phone_digits']

                # Row container with hover effect
                st.markdown('<div class="row-container">', unsafe_allow_html=True)

                # Create columns for this row
                cols = st.columns([0.5, 1.2, 0.6, 3, 1, 1.2, 0.9, 2.5])

                with cols[0]:  # STT
                    st.markdown(f'<div style="height:60px;line-height:60px;font-size:17px;font-weight:700;color:#667eea;">{int(row["STT"])}</div>', unsafe_allow_html=True)

                with cols[1]:  # SĐT
                    st.markdown(f'<div style="height:60px;line-height:60px;font-size:16px;color:#374151;">{row["SĐT"]}</div>', unsafe_allow_html=True)

                with cols[2]:  # Slot
                    st.markdown(f'<div style="height:60px;line-height:60px;font-size:16px;color:#6B7280;">{int(row["Slot"])}</div>', unsafe_allow_html=True)

                with cols[3]:  # Tên File
                    st.markdown(f'<div style="height:60px;line-height:60px;font-size:15px;color:#111827;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="{row["Tên File"]}">{row["Tên File"]}</div>', unsafe_allow_html=True)

                with cols[4]:  # SKU
                    st.markdown(f'<div style="height:60px;line-height:60px;font-size:15px;font-weight:600;color:#059669;background:#D1FAE5;padding:4px 12px;border-radius:8px;display:inline-block;">{row["SKU"]}</div>', unsafe_allow_html=True)

                with cols[5]:  # Note - EDITABLE
                    # Init note in session_state if not exists
                    if 'note_edits' not in st.session_state:
                        st.session_state.note_edits = {}

                    if stt not in st.session_state.note_edits:
                        # Default to empty, user can edit
                        st.session_state.note_edits[stt] = ''

                    # Editable text input for Note
                    new_note = st.text_input(
                        "note",
                        value=st.session_state.note_edits[stt],
                        key=f'note_{stt}_{idx}',
                        label_visibility='collapsed',
                        max_chars=35
                    )

                    # Update if changed
                    if new_note != st.session_state.note_edits[stt]:
                        st.session_state.note_edits[stt] = new_note

                with cols[6]:  # Preview
                    # Check if there's a selection
                    current_sel = st.session_state.image_selections.get(stt, '')

                    if current_sel and current_sel.startswith('uploaded://'):
                        # Show uploaded file preview
                        if 'uploaded_files' in st.session_state and current_sel in st.session_state.uploaded_files:
                            file_data = st.session_state.uploaded_files[current_sel]
                            file_data.seek(0)  # Reset pointer
                            st.image(file_data, width=60)
                    elif row['Preview']:
                        # Show Google Drive preview
                        st.image(row['Preview'], width=60)
                    else:
                        st.markdown('<div style="height:60px;"></div>', unsafe_allow_html=True)

                with cols[7]:  # Chọn Ảnh - Clickable Thumbnails
                    # Check if there's an alternative phone mapping
                    search_phone = phone_digits
                    if 'alt_phone_mapping' in st.session_state and stt in st.session_state.alt_phone_mapping:
                        search_phone = st.session_state.alt_phone_mapping[stt]

                    # Filter images matching this phone number (or alternative phone)
                    matching_images = []
                    for url, meta in image_metadata.items():
                        if normalize_phone(meta['phone']) == search_phone:
                            matching_images.append({
                                'url': url,
                                'label': meta['label'],
                                'thumbnail': meta['thumbnail']
                            })

                    # Get current selection from session_state
                    current_selection = st.session_state.image_selections.get(stt, '')

                    # Check if current selection is uploaded file
                    is_uploaded = current_selection.startswith('uploaded://')

                    # Auto-select if only 1 image and nothing selected yet
                    if len(matching_images) == 1 and not current_selection:
                        st.session_state.image_selections[stt] = matching_images[0]['url']
                        current_selection = matching_images[0]['url']

                    # Display thumbnails as clickable options
                    if matching_images:
                        # Create sub-columns for thumbnails + upload button
                        num_cols = len(matching_images) + 2  # +1 for clear, +1 for upload
                        thumb_cols = st.columns(num_cols)

                        # Option to clear selection
                        with thumb_cols[0]:
                            st.markdown('<div style="height:60px;line-height:60px;text-align:center;">❌</div>', unsafe_allow_html=True)
                            if st.button("Bỏ chọn", key=f'img_none_{stt}_{idx}', use_container_width=True):
                                st.session_state.image_selections[stt] = ''
                                st.rerun()

                        # Display each image with button
                        for img_idx, img in enumerate(matching_images):
                            with thumb_cols[img_idx + 1]:
                                # Show thumbnail with border if selected (compare URL)
                                is_selected = (img['url'] == current_selection or img['label'] == current_selection)
                                border_style = "border: 3px solid #4CAF50;" if is_selected else "border: 1px solid #ddd;"

                                st.markdown(f'<div style="{border_style}padding:2px;border-radius:4px;">', unsafe_allow_html=True)
                                st.image(img['thumbnail'], use_column_width=True)
                                st.markdown('</div>', unsafe_allow_html=True)

                                # Button below thumbnail
                                if st.button(
                                    f"Ảnh {img_idx + 1}",
                                    key=f'img_btn_{stt}_{img_idx}_{idx}',
                                    use_container_width=True,
                                    type="primary" if is_selected else "secondary"
                                ):
                                    # Store URL directly instead of label for reliability
                                    st.session_state.image_selections[stt] = img['url']
                                    st.rerun()

                        # Upload button (always show)
                        with thumb_cols[-1]:
                            st.markdown('<div style="height:60px;line-height:60px;text-align:center;">📁</div>', unsafe_allow_html=True)
                            if st.button("Upload", key=f'upload_btn_{stt}_{idx}', use_container_width=True, type="primary" if is_uploaded else "secondary"):
                                st.session_state[f'show_upload_{stt}'] = True
                                st.rerun()
                    else:
                        # No images found - show upload and alternative phone options
                        st.markdown('<div style="font-size:11px;color:#999;">⚠️ Không tìm thấy ảnh</div>', unsafe_allow_html=True)

                        opt_cols = st.columns(3)

                        # Clear selection
                        with opt_cols[0]:
                            if st.button("❌ Bỏ", key=f'img_none_{stt}_{idx}', use_container_width=True):
                                st.session_state.image_selections[stt] = ''
                                st.rerun()

                        # Alternative phone
                        with opt_cols[1]:
                            if st.button("➕ SĐT phụ", key=f'alt_phone_{stt}_{idx}', use_container_width=True):
                                st.session_state[f'show_alt_phone_input_{stt}'] = True
                                st.rerun()

                        # Upload button
                        with opt_cols[2]:
                            if st.button("📁 Upload", key=f'upload_btn_{stt}_{idx}', use_container_width=True, type="primary" if is_uploaded else "secondary"):
                                st.session_state[f'show_upload_{stt}'] = True
                                st.rerun()

                        # Show alternative phone input if requested
                        if st.session_state.get(f'show_alt_phone_input_{stt}', False):
                            alt_phone = st.text_input(
                                "Nhập SĐT phụ",
                                key=f'alt_phone_input_{stt}_{idx}',
                                placeholder="0901234567"
                            )

                            if alt_phone and st.button("🔍 Tìm", key=f'search_alt_{stt}_{idx}'):
                                # Fetch images for alternative phone
                                alt_phone_digits = normalize_phone(alt_phone)
                                if alt_phone_digits in st.session_state.all_gdrive_images:
                                    # Found images - reload to show them
                                    st.success(f"✅ Tìm thấy ảnh cho {alt_phone}")
                                    # Store alternative phone mapping
                                    if 'alt_phone_mapping' not in st.session_state:
                                        st.session_state.alt_phone_mapping = {}
                                    st.session_state.alt_phone_mapping[stt] = alt_phone_digits
                                    st.rerun()
                                else:
                                    st.error(f"❌ Không tìm thấy ảnh cho {alt_phone}")

                    # Show manual upload dialog if requested (works for both cases)
                    if st.session_state.get(f'show_upload_{stt}', False):
                        uploaded_file = st.file_uploader(
                            "Chọn ảnh từ máy",
                            type=['jpg', 'jpeg', 'png'],
                            key=f'upload_file_{stt}_{idx}'
                        )

                        if uploaded_file:
                            # Save uploaded file to session_state
                            file_data = io.BytesIO(uploaded_file.read())

                            # Store as "uploaded" URL
                            upload_url = f"uploaded://{stt}/{uploaded_file.name}"
                            st.session_state.image_selections[stt] = upload_url

                            # Store file data
                            if 'uploaded_files' not in st.session_state:
                                st.session_state.uploaded_files = {}
                            st.session_state.uploaded_files[upload_url] = file_data

                            # Close upload dialog after successful upload
                            st.session_state[f'show_upload_{stt}'] = False

                            st.success(f"✅ Đã upload: {uploaded_file.name}")
                            st.rerun()

                # Close row container
                st.markdown('</div>', unsafe_allow_html=True)

        # Close table container
        st.markdown('</div>', unsafe_allow_html=True)

        # Sync session_state (selections AND note_edits) back to slots
        for slot in st.session_state.slots:
            slot_stt = slot['global_idx']

            # Sync Note edits
            if 'note_edits' in st.session_state and slot_stt in st.session_state.note_edits:
                new_note = st.session_state.note_edits[slot_stt]
                slot['yy'] = new_note
                # Update suggested_name: "STT. last4_SKU_note_"
                last4 = slot['phone'][-4:] if len(slot['phone']) >= 4 else slot['phone']
                sku = slot['sku']
                name_parts = [last4, sku]
                if new_note:
                    name_parts.append(new_note)
                slot['suggested_name'] = f"{slot_stt}. " + "_".join(name_parts) + "_"

            # Sync image selections
            selection_value = st.session_state.image_selections.get(slot_stt, '')

            # Handle None or empty string
            if not selection_value or selection_value == '':
                slot['image_url'] = None
                slot['thumbnail_url'] = None
            else:
                # Check if it's uploaded file
                if selection_value.startswith('uploaded://'):
                    slot['image_url'] = selection_value
                    slot['thumbnail_url'] = None  # No thumbnail for uploaded
                # Check if it's already a URL (starts with http)
                elif selection_value.startswith('http'):
                    url_value = selection_value
                    slot['image_url'] = url_value
                    # Update thumbnail
                    if url_value in image_metadata:
                        slot['thumbnail_url'] = image_metadata[url_value]['thumbnail']
                    else:
                        file_id = extract_gdrive_id(url_value)
                        if file_id:
                            slot['thumbnail_url'] = f"https://drive.google.com/thumbnail?id={file_id}&sz=h40"
                        else:
                            slot['thumbnail_url'] = None
                else:
                    # Convert label to URL
                    url_value = image_label_to_url.get(str(selection_value), None)
                    if url_value:
                        slot['image_url'] = url_value
                        if url_value in image_metadata:
                            slot['thumbnail_url'] = image_metadata[url_value]['thumbnail']
                        else:
                            file_id = extract_gdrive_id(url_value)
                            if file_id:
                                slot['thumbnail_url'] = f"https://drive.google.com/thumbnail?id={file_id}&sz=h40"
                            else:
                                slot['thumbnail_url'] = None
                    else:
                        slot['image_url'] = None
                        slot['thumbnail_url'] = None

        # Auto-assign button
        if st.button("🔄 Tự động map ảnh theo thứ tự (theo SĐT)"):
            if st.session_state.all_gdrive_images:
                # Group images by phone (CHỈ lấy ảnh mới nhất)
                images_by_phone = {}
                for phone, sessions in st.session_state.all_gdrive_images.items():
                    sorted_sessions = sorted(sessions, key=lambda x: x.get('Date', ''), reverse=True)
                    images_by_phone[phone] = []

                    # CHỈ lấy session mới nhất
                    if sorted_sessions:
                        newest_session = sorted_sessions[0]
                        if newest_session.get('image-1'):
                            images_by_phone[phone].append(newest_session['image-1'])
                        if newest_session.get('image-2'):
                            images_by_phone[phone].append(newest_session['image-2'])

                # Auto-assign
                for slot in st.session_state.slots:
                    phone_digits = normalize_phone(slot['phone'])
                    if phone_digits in images_by_phone:
                        images = images_by_phone[phone_digits]
                        # Use slot_in_order - 1 as index (0-based)
                        img_idx = slot['slot_in_order'] - 1
                        if img_idx < len(images):
                            slot['image_url'] = images[img_idx]

                st.success("✅ Đã tự động map ảnh theo số điện thoại!")
                st.rerun()
            else:
                st.warning("⚠️ Chưa có ảnh để map")

    # ====================================================================
    # STEP 4: Download Images & Export
    # ====================================================================
    st.header("💾 Bước 4: Tải Ảnh & Export")

    # Check unmapped slots
    unmapped_slots = [s for s in st.session_state.slots if not s.get('image_url')]

    if unmapped_slots:
        st.warning(f"⚠️ Còn {len(unmapped_slots)} slot chưa map ảnh")

        with st.expander("Xem các slot chưa map"):
            unmapped_df = pd.DataFrame([
                {
                    'Order': s['order_key'],
                    'Slot': s['slot_in_order'],
                    'Tên Output': s['suggested_name']
                }
                for s in unmapped_slots
            ])
            st.dataframe(unmapped_df, hide_index=True)

    if st.button("📦 Tải Ảnh & Tạo ZIP cho TẤT CẢ đơn hàng", type="primary", disabled=len(unmapped_slots) > 0):
        with st.spinner("Đang tải ảnh và tạo file ZIP..."):
            try:
                # Sync session_state selections to slots one more time before downloading
                if 'image_selections' in st.session_state:
                    image_label_to_url = st.session_state.get('image_label_to_url', {})

                    for slot in st.session_state.slots:
                        slot_stt = slot['global_idx']
                        selection_value = st.session_state.image_selections.get(slot_stt, '')

                        # Handle None or empty string
                        if not selection_value or selection_value == '':
                            slot['image_url'] = None
                            slot['thumbnail_url'] = None
                        else:
                            # Check if it's already a URL (starts with http)
                            if selection_value.startswith('http'):
                                url_value = selection_value
                            else:
                                # Convert label to URL using mapping
                                url_value = image_label_to_url.get(str(selection_value), None)

                            if url_value:
                                slot['image_url'] = url_value
                                file_id = extract_gdrive_id(url_value)
                                if file_id:
                                    slot['thumbnail_url'] = f"https://drive.google.com/thumbnail?id={file_id}&sz=h40"
                                else:
                                    slot['thumbnail_url'] = None
                            else:
                                slot['image_url'] = None
                                slot['thumbnail_url'] = None

                # Download images (CONCURRENT)
                success_count = 0
                fail_count = 0

                progress_bar = st.progress(0)
                status_text = st.empty()

                # First, handle uploaded files (instant)
                for slot in st.session_state.slots:
                    if slot.get('image_url') and slot['image_url'].startswith('uploaded://'):
                        if 'uploaded_files' in st.session_state and slot['image_url'] in st.session_state.uploaded_files:
                            slot['image_data'] = st.session_state.uploaded_files[slot['image_url']]
                            success_count += 1
                        else:
                            fail_count += 1

                # Then, download from Google Drive concurrently
                slots_to_download = [s for s in st.session_state.slots if s.get('image_url') and not s['image_url'].startswith('uploaded://')]
                total_to_download = len(slots_to_download)
                completed = 0

                def download_for_slot(slot):
                    """Download image for a single slot"""
                    image_data = download_image_from_url(slot['image_url'])
                    return (slot, image_data)

                if slots_to_download:
                    with ThreadPoolExecutor(max_workers=10) as executor:
                        futures = {executor.submit(download_for_slot, slot): slot for slot in slots_to_download}

                        for future in as_completed(futures):
                            try:
                                slot, image_data = future.result()
                                if image_data:
                                    slot['image_data'] = image_data
                                    success_count += 1
                                else:
                                    fail_count += 1

                                completed += 1
                                progress_bar.progress(completed / total_to_download)
                                status_text.text(f"Đã tải {completed}/{total_to_download} ảnh từ Google Drive...")
                            except Exception as e:
                                fail_count += 1
                                completed += 1

                progress_bar.empty()
                status_text.empty()

                # Show download results
                total_images = success_count + fail_count
                if fail_count > 0:
                    st.warning(f"⚠️ Tải {success_count}/{total_images} ảnh thành công. {fail_count} ảnh bị lỗi.")
                else:
                    st.success(f"✅ Đã tải {success_count} ảnh thành công!")

                # Build ZIP for all orders
                zip_data = build_zip_for_all_orders(df, st.session_state.slots)

                # Download button
                zip_filename = "all_orders_ready_for_factory.zip"

                st.download_button(
                    label="⬇️ Tải file ZIP (TẤT CẢ đơn hàng)",
                    data=zip_data,
                    file_name=zip_filename,
                    mime="application/zip"
                )

                # Show summary by order
                orders_summary = {}
                for slot in st.session_state.slots:
                    order_key = slot['order_key']
                    if order_key not in orders_summary:
                        orders_summary[order_key] = {'total': 0, 'mapped': 0}
                    orders_summary[order_key]['total'] += 1
                    if slot.get('image_data'):
                        orders_summary[order_key]['mapped'] += 1

                st.success(f"✅ File ZIP đã sẵn sàng! Tải thành công {success_count}/{len(st.session_state.slots)} ảnh.")

                with st.expander("📊 Chi tiết theo đơn hàng"):
                    summary_data = []
                    for order_key, stats in orders_summary.items():
                        summary_data.append({
                            'Mã ĐH': order_key,
                            'Tổng slot': stats['total'],
                            'Đã map': stats['mapped'],
                            'Tỷ lệ': f"{stats['mapped']}/{stats['total']}"
                        })
                    st.dataframe(pd.DataFrame(summary_data), hide_index=True)

            except Exception as e:
                st.error(f"❌ Lỗi khi tạo ZIP: {str(e)}")

if __name__ == "__main__":
    main()
