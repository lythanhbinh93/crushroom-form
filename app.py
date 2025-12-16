import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import base64
from PIL import Image

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
    note_str = re.sub(r'[^\w\s\-.,áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔṌỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]', '', note_str)

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

def expand_slots(df: pd.DataFrame, order_key: str) -> List[Dict]:
    """
    Expand rows into individual photo slots for a specific order.
    Returns list of slot dicts with: idx, last4, sku, yy, suggested_name
    """
    slots = []
    slot_idx = 1

    # Filter rows for this order
    order_rows = df[df['_order_key'] == order_key]

    for _, row in order_rows.iterrows():
        if not row.get('_need_photo', False):
            continue

        qty = row.get('_qty', 1)
        img_per_unit = row.get('_img_per_unit', 1)
        total_slots = qty * img_per_unit

        last4 = row.get('_last4', '0000')
        sku = row.get('_sku', '')
        yy = row.get('_yy', '')

        for _ in range(total_slots):
            # Build suggested name (without extension)
            name_parts = [f"{slot_idx}.", last4, sku]
            if yy:
                name_parts.append(yy)

            suggested_name = "_".join(name_parts)

            slots.append({
                'idx': slot_idx,
                'last4': last4,
                'sku': sku,
                'yy': yy,
                'suggested_name': suggested_name,
                'mapped_file': None
            })

            slot_idx += 1

    return slots

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

def build_zip_for_order(order_key: str, slots: List[Dict], uploaded_files: Dict,
                       excel_data: io.BytesIO) -> io.BytesIO:
    """
    Build ZIP file containing:
    - Renamed photos in <order_key>/ folder
    - order_worklist.xlsx
    """
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add photos
        for slot in slots:
            if slot['mapped_file'] is not None:
                file_name = slot['mapped_file']
                if file_name in uploaded_files:
                    file_obj = uploaded_files[file_name]

                    # Get extension from original file
                    ext = Path(file_name).suffix

                    # Build new filename
                    new_filename = f"{slot['suggested_name']}{ext}"
                    zip_path = f"{order_key}/{new_filename}"

                    # Add to zip
                    file_obj.seek(0)
                    zip_file.writestr(zip_path, file_obj.read())

        # Add Excel worklist
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
    st.markdown("**Giúp đặt tên ảnh theo đơn hàng từ file Excel**")

    # Initialize session state
    if 'df' not in st.session_state:
        st.session_state.df = None
    if 'uploaded_images' not in st.session_state:
        st.session_state.uploaded_images = {}
    if 'slots' not in st.session_state:
        st.session_state.slots = []

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
    # STEP 2: Review & Edit Data
    # ========================================================================
    st.header("✏️ Bước 2: Xem & Chỉnh Sửa Dữ Liệu")

    with st.expander("🔍 Xem dữ liệu đã xử lý", expanded=False):
        # Allow editing key fields
        st.markdown("**Chỉnh sửa các trường quan trọng:**")

        edited_df = st.data_editor(
            df[[
                'Mã đơn hàng',
                'Số điện thoại',
                '_last4',
                'Mã mẫu mã',
                '_sku',
                'Sản phẩm',
                '_note_raw',
                '_yy',
                'Số lượng',
                '_qty',
                '_need_photo',
                '_img_per_unit',
                '_order_key'
            ]],
            column_config={
                '_need_photo': st.column_config.CheckboxColumn('Cần ảnh?'),
                '_img_per_unit': st.column_config.NumberColumn('Ảnh/sản phẩm', min_value=1, max_value=10),
                '_yy': st.column_config.TextColumn('Note (sanitized)'),
                '_qty': st.column_config.NumberColumn('Số lượng', min_value=1),
            },
            disabled=['Mã đơn hàng', 'Số điện thoại', '_last4', 'Mã mẫu mã', 'Sản phẩm', 'Số lượng', '_order_key'],
            hide_index=True,
            use_container_width=True
        )

        # Update session state with edited values
        st.session_state.df['_need_photo'] = edited_df['_need_photo']
        st.session_state.df['_img_per_unit'] = edited_df['_img_per_unit']
        st.session_state.df['_yy'] = edited_df['_yy']

    df = st.session_state.df

    # ========================================================================
    # STEP 3: Select Order
    # ========================================================================
    st.header("🎯 Bước 3: Chọn Đơn Hàng")

    order_keys = df['_order_key'].unique().tolist()

    if not order_keys:
        st.warning("⚠️ Không tìm thấy đơn hàng nào")
        st.stop()

    selected_order = st.selectbox(
        "Chọn đơn hàng cần xử lý:",
        options=order_keys,
        key='order_selector'
    )

    if selected_order:
        order_df = df[df['_order_key'] == selected_order]
        photo_rows = order_df[order_df['_need_photo'] == True]

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Tổng số dòng", len(order_df))
        with col2:
            st.metric("Dòng cần ảnh", len(photo_rows))
        with col3:
            total_photos = (photo_rows['_qty'] * photo_rows['_img_per_unit']).sum()
            st.metric("Tổng số ảnh cần", int(total_photos))

        # Generate slots
        slots = expand_slots(df, selected_order)
        st.session_state.slots = slots

        st.info(f"📋 Đã tạo {len(slots)} slot cho đơn hàng **{selected_order}**")

    # ========================================================================
    # STEP 4: Upload Photos
    # ========================================================================
    st.header("📤 Bước 4: Upload Ảnh")

    uploaded_files = st.file_uploader(
        "Chọn các file ảnh (JPG, PNG, WEBP, HEIC):",
        type=['jpg', 'jpeg', 'png', 'webp', 'heic'],
        accept_multiple_files=True,
        key='image_uploader'
    )

    if uploaded_files:
        # Store uploaded files in session state
        for file in uploaded_files:
            if file.name not in st.session_state.uploaded_images:
                st.session_state.uploaded_images[file.name] = io.BytesIO(file.read())

        st.success(f"✅ Đã upload {len(st.session_state.uploaded_images)} ảnh")

        # Auto-map images to slots (in order)
        if st.button("🔄 Tự động map ảnh theo thứ tự"):
            image_names = list(st.session_state.uploaded_images.keys())
            for i, slot in enumerate(st.session_state.slots):
                if i < len(image_names):
                    slot['mapped_file'] = image_names[i]
                else:
                    slot['mapped_file'] = None
            st.success("✅ Đã map tự động!")
            st.rerun()

    # ========================================================================
    # STEP 5: Map Photos to Slots
    # ========================================================================
    if st.session_state.slots and st.session_state.uploaded_images:
        st.header("🔗 Bước 5: Map Ảnh vào Slot")

        st.markdown("**Chọn ảnh cho từng slot:**")

        image_options = [''] + list(st.session_state.uploaded_images.keys())

        # Display in columns for better layout
        cols_per_row = 3

        for i in range(0, len(st.session_state.slots), cols_per_row):
            cols = st.columns(cols_per_row)

            for j in range(cols_per_row):
                slot_idx = i + j
                if slot_idx >= len(st.session_state.slots):
                    break

                slot = st.session_state.slots[slot_idx]

                with cols[j]:
                    st.markdown(f"**Slot {slot['idx']}**")
                    st.caption(f"📝 Tên output: `{slot['suggested_name']}`")

                    # File selector
                    current_file = slot.get('mapped_file', '')
                    selected_file = st.selectbox(
                        "Chọn ảnh:",
                        options=image_options,
                        index=image_options.index(current_file) if current_file in image_options else 0,
                        key=f"slot_{slot['idx']}"
                    )

                    # Update mapping
                    st.session_state.slots[slot_idx]['mapped_file'] = selected_file if selected_file else None

                    # Preview image
                    if selected_file:
                        try:
                            img_data = st.session_state.uploaded_images[selected_file]
                            img_data.seek(0)
                            img = Image.open(img_data)
                            st.image(img, use_container_width=True)
                        except Exception as e:
                            st.error(f"Lỗi hiển thị: {str(e)}")
                    else:
                        st.warning("Chưa chọn ảnh")

        # ====================================================================
        # STEP 6: Export
        # ====================================================================
        st.header("💾 Bước 6: Export")

        # Check if all slots are mapped
        unmapped_slots = [s for s in st.session_state.slots if s['mapped_file'] is None]

        if unmapped_slots:
            st.warning(f"⚠️ Còn {len(unmapped_slots)} slot chưa map ảnh")

            with st.expander("Xem các slot chưa map"):
                for slot in unmapped_slots:
                    st.write(f"- Slot {slot['idx']}: {slot['suggested_name']}")

        if st.button("📦 Tạo file ZIP", type="primary", disabled=len(unmapped_slots) > 0):
            with st.spinner("Đang tạo file ZIP..."):
                try:
                    # Build Excel
                    excel_data = build_export_excel(df, selected_order)

                    # Build ZIP
                    zip_data = build_zip_for_order(
                        selected_order,
                        st.session_state.slots,
                        st.session_state.uploaded_images,
                        excel_data
                    )

                    # Download button
                    zip_filename = f"{selected_order}_ready_for_factory.zip"

                    st.download_button(
                        label="⬇️ Tải file ZIP",
                        data=zip_data,
                        file_name=zip_filename,
                        mime="application/zip"
                    )

                    st.success("✅ File ZIP đã sẵn sàng!")

                except Exception as e:
                    st.error(f"❌ Lỗi khi tạo ZIP: {str(e)}")

if __name__ == "__main__":
    main()
