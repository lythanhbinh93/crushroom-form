import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import requests
from PIL import Image

# Google Apps Script URL - same as admin.html
GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def normalize_phone(phone: str) -> str:
    """Extract digits only from phone number."""
    if pd.isna(phone):
        return ""
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
    Get default images per unit:
    - If SKU starts with COUPLEPIX → 2
    - Else → 1
    """
    sku_raw = str(row.get('Mã mẫu mã', '')) if not pd.isna(row.get('Mã mẫu mã')) else ''

    if sku_raw.upper().startswith('COUPLEPIX'):
        return 2

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
            phone = row.get('Số điện thoại', '')

            for _ in range(total_slots):
                # Build suggested name using GLOBAL index (STT) and ending with _
                name_parts = [f"{global_idx}.", last4, sku]
                if yy:
                    name_parts.append(yy)

                suggested_name = "_".join(name_parts) + "_"

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
    Fetch images for all unique phone numbers in the dataframe.
    Returns dict mapping phone -> list of image sessions
    """
    all_images = {}

    # Get unique phone numbers from rows that need photos
    photo_rows = df[df['_need_photo'] == True]
    unique_phones = photo_rows['_phone_digits'].unique()

    progress_bar = st.progress(0)
    status_text = st.empty()

    for idx, phone in enumerate(unique_phones):
        if phone:
            status_text.text(f"Đang tải ảnh cho SĐT {phone}... ({idx + 1}/{len(unique_phones)})")
            progress_bar.progress((idx + 1) / len(unique_phones))

            images = fetch_images_from_gdrive(phone)
            if images:
                all_images[phone] = images

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

def build_zip_for_all_orders(df: pd.DataFrame, slots: List[Dict]) -> io.BytesIO:
    """
    Build ZIP file containing:
    - Renamed photos in <order_key>/ folders for each order
    - order_worklist.xlsx for each order
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Group slots by order
        orders = {}
        for slot in slots:
            order_key = slot['order_key']
            if order_key not in orders:
                orders[order_key] = []
            orders[order_key].append(slot)

        # Process each order
        for order_key, order_slots in orders.items():
            # Add photos
            for slot in order_slots:
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
                    zip_path = f"{order_key}/{new_filename}"

                    # Add to zip
                    slot['image_data'].seek(0)
                    zip_file.writestr(zip_path, slot['image_data'].read())

            # Add Excel worklist for this order
            excel_data = build_export_excel(df, order_key)
            excel_data.seek(0)
            zip_file.writestr(f"{order_key}/order_worklist.xlsx", excel_data.read())

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

    st.title("📸 Order → Photo Naming Helper")
    st.markdown("**Giúp đặt tên ảnh theo đơn hàng từ file Excel + Google Drive**")

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

            # Combine notes: prefer "Ghi chú để in", fallback to "Ghi chú nội bộ"
            df['_note_raw'] = df.apply(
                lambda row: row['Ghi chú để in'] if not pd.isna(row['Ghi chú để in']) and str(row['Ghi chú để in']).strip()
                else row['Ghi chú nội bộ'],
                axis=1
            )
            df['_yy'] = df['_note_raw'].apply(safe_note)

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

                for session_idx, session in enumerate(sorted_sessions):
                    date_str = session.get('Date', 'N/A')[:10] if session.get('Date') else 'N/A'
                    session_label = f"Session {session_idx + 1} - {date_str}"

                    if session.get('image-1'):
                        url = session['image-1']
                        label = f"📱 {phone} | {session_label} | Ảnh 1"

                        all_image_options.append(label)
                        image_label_to_url[label] = url
                        url_to_label[url] = label

                        file_id = extract_gdrive_id(url)
                        thumbnail = f"https://drive.google.com/thumbnail?id={file_id}&sz=w200" if file_id else ''
                        image_metadata[url] = {
                            'phone': phone,
                            'date': date_str,
                            'thumbnail': thumbnail,
                            'label': label
                        }

                    if session.get('image-2'):
                        url = session['image-2']
                        label = f"📱 {phone} | {session_label} | Ảnh 2"

                        all_image_options.append(label)
                        image_label_to_url[label] = url
                        url_to_label[url] = label

                        file_id = extract_gdrive_id(url)
                        thumbnail = f"https://drive.google.com/thumbnail?id={file_id}&sz=w200" if file_id else ''
                        image_metadata[url] = {
                            'phone': phone,
                            'date': date_str,
                            'thumbnail': thumbnail,
                            'label': label
                        }

        # Show image gallery to help user identify images
        if image_metadata:
            with st.expander("🖼️ XEM THUMBNAIL TẤT CẢ ẢNH (để biết chọn label nào)", expanded=True):
                st.markdown("**Xem ảnh ở đây, sau đó chọn label tương ứng trong bảng bên dưới**")

                # Group images by phone for better organization
                images_by_phone = {}
                for url, meta in image_metadata.items():
                    phone = meta['phone']
                    if phone not in images_by_phone:
                        images_by_phone[phone] = []
                    images_by_phone[phone].append({
                        'url': url,
                        'label': meta['label'],
                        'thumbnail': meta['thumbnail']
                    })

                # Display images grouped by phone
                for phone, images in images_by_phone.items():
                    st.markdown(f"### 📱 SĐT: {phone}")

                    # Create columns for thumbnails (4 per row)
                    cols_per_row = 4
                    for i in range(0, len(images), cols_per_row):
                        cols = st.columns(cols_per_row)
                        for j in range(cols_per_row):
                            idx = i + j
                            if idx < len(images):
                                with cols[j]:
                                    img = images[idx]
                                    if img['thumbnail']:
                                        st.image(img['thumbnail'], use_column_width=True)
                                    st.caption(f"**{img['label']}**")

                    st.markdown("---")

        # Create ONE big mapping table for ALL slots
        mapping_data = []
        for slot in st.session_state.slots:
            current_url = slot.get('image_url', '')

            # Get thumbnail and label for current selection
            thumbnail_url = ''
            current_label = ''
            if current_url and current_url in image_metadata:
                thumbnail_url = image_metadata[current_url]['thumbnail']
                current_label = url_to_label.get(current_url, '')

            mapping_data.append({
                'STT': slot['global_idx'],
                'SĐT': slot['phone'],
                'Order': slot['order_key'],
                'Slot': slot['slot_in_order'],
                'Tên File': slot['suggested_name'],
                'SKU': slot['sku'],
                'Note': slot['yy'],
                'Preview': thumbnail_url,
                'Chọn Ảnh': current_label
            })

        mapping_df = pd.DataFrame(mapping_data)

        st.info(f"📊 Tổng cộng: {len(mapping_df)} slots từ {mapping_df['Order'].nunique()} đơn hàng")

        # Show ONE big table with all slots
        edited_mapping = st.data_editor(
            mapping_df,
            column_config={
                'STT': st.column_config.NumberColumn('STT', disabled=True, width='small'),
                'SĐT': st.column_config.TextColumn('SĐT', disabled=True, width='medium'),
                'Order': st.column_config.TextColumn('Mã ĐH', disabled=True, width='small'),
                'Slot': st.column_config.NumberColumn('Slot', disabled=True, width='small'),
                'Tên File': st.column_config.TextColumn('Tên File', disabled=True, width='large'),
                'SKU': st.column_config.TextColumn('SKU', disabled=True, width='small'),
                'Note': st.column_config.TextColumn('Note', disabled=True, width='small'),
                'Preview': st.column_config.ImageColumn(
                    'Preview',
                    help='Ảnh đã chọn',
                    width='medium'
                ),
                'Chọn Ảnh': st.column_config.SelectboxColumn(
                    'Chọn Ảnh',
                    help='Copy label từ gallery ở trên vào đây',
                    options=all_image_options,
                    required=False,
                    width='large'
                )
            },
            hide_index=True,
            use_container_width=True,
            key='mapping_editor_all',
            height=600
        )

        # Update ALL slots with selected images (convert label back to URL)
        for idx, row in edited_mapping.iterrows():
            slot_stt = row['STT']
            for slot in st.session_state.slots:
                if slot['global_idx'] == slot_stt:
                    label_value = row['Chọn Ảnh']

                    # Handle None, NaN, or empty string
                    if pd.isna(label_value) or not label_value or label_value == '':
                        slot['image_url'] = None
                        slot['thumbnail_url'] = None
                    else:
                        # Convert label back to URL
                        url_value = image_label_to_url.get(str(label_value), None)
                        if url_value:
                            slot['image_url'] = url_value
                            # Update thumbnail
                            if url_value in image_metadata:
                                slot['thumbnail_url'] = image_metadata[url_value]['thumbnail']
                            else:
                                file_id = extract_gdrive_id(url_value)
                                if file_id:
                                    slot['thumbnail_url'] = f"https://drive.google.com/thumbnail?id={file_id}&sz=w100"
                                else:
                                    slot['thumbnail_url'] = None
                        else:
                            slot['image_url'] = None
                            slot['thumbnail_url'] = None
                    break

        # Auto-assign button
        if st.button("🔄 Tự động map ảnh theo thứ tự (theo SĐT)"):
            if st.session_state.all_gdrive_images:
                # Group images by phone
                images_by_phone = {}
                for phone, sessions in st.session_state.all_gdrive_images.items():
                    images_by_phone[phone] = []
                    for session in sorted(sessions, key=lambda x: x.get('Date', ''), reverse=True):
                        if session.get('image-1'):
                            images_by_phone[phone].append(session['image-1'])
                        if session.get('image-2'):
                            images_by_phone[phone].append(session['image-2'])

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
                # Download images
                success_count = 0
                fail_count = 0

                progress_bar = st.progress(0)
                status_text = st.empty()

                for idx, slot in enumerate(st.session_state.slots):
                    status_text.text(f"Đang tải ảnh {idx + 1}/{len(st.session_state.slots)}...")
                    progress_bar.progress((idx + 1) / len(st.session_state.slots))

                    if slot.get('image_url'):
                        image_data = download_image_from_url(slot['image_url'])
                        if image_data:
                            slot['image_data'] = image_data
                            success_count += 1
                        else:
                            fail_count += 1

                progress_bar.empty()
                status_text.empty()

                if fail_count > 0:
                    st.warning(f"⚠️ Tải thành công {success_count}/{len(st.session_state.slots)} ảnh. {fail_count} ảnh bị lỗi.")

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
