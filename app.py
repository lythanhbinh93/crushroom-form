import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Optional
import requests

# ============================================================================
# CẤU HÌNH & HELPER
# ============================================================================
GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec'

def normalize_phone(phone: str) -> str:
    if pd.isna(phone): return ""
    return re.sub(r'\D', '', str(phone))

def clean_sku(sku: str) -> str:
    if pd.isna(sku): return ""
    sku_str = str(sku).strip()
    if "COUPLEPIX-" in sku_str.upper():
        parts = sku_str.upper().split("COUPLEPIX-")
        if len(parts) > 1 and parts[1]:
            return parts[1].split()[0]
    return sku_str.upper().replace(" ", "")

def safe_note(note: str, max_length: int = 35) -> str:
    if pd.isna(note) or not note: return ""
    note_str = str(note).strip().replace("/", "-").replace("\\", "-").replace(":", "-")
    note_str = re.sub(r'[^\w\s\-.,áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]', '', note_str)
    return note_str.replace(" ", "")[:max_length]

def expand_slots(df: pd.DataFrame, order_key: str) -> List[Dict]:
    slots = []
    slot_idx = 1
    order_rows = df[df['_order_key'] == order_key]
    for _, row in order_rows.iterrows():
        if not row.get('_need_photo', False): continue
        qty = int(row.get('_qty', 1))
        img_per_unit = int(row.get('_img_per_unit', 1))
        for _ in range(qty * img_per_unit):
            name_parts = [f"{slot_idx}.", row.get('_last4', '0000'), row.get('_sku', '')]
            if row.get('_yy'): name_parts.append(row['_yy'])
            slots.append({
                'idx': slot_idx,
                'suggested_name': "_".join(name_parts)
            })
            slot_idx += 1
    return slots

def fetch_images_from_gdrive(phone: str) -> List[Dict]:
    try:
        response = requests.get(f"{GOOGLE_SCRIPT_URL}?action=search&phone={phone}", timeout=15)
        return response.json().get('results', []) if response.status_code == 200 else []
    except: return []

def download_image_from_url(url: str) -> Optional[io.BytesIO]:
    try:
        match = re.search(r'[-\w]{25,}', url)
        direct_url = f"https://drive.google.com/uc?export=download&id={match.group(0)}" if match else url
        response = requests.get(direct_url, timeout=30)
        return io.BytesIO(response.content) if response.status_code == 200 else None
    except: return None

# ============================================================================
# MAIN UI
# ============================================================================

def main():
    st.set_page_config(page_title="Photo Helper Pro", page_icon="📸", layout="wide")
    st.title("📸 Order → Photo Naming Helper")

    # --- STATE MANAGEMENT ---
    if 'df' not in st.session_state: st.session_state.df = None
    if 'manual_files' not in st.session_state: st.session_state.manual_files = {} # Dict: {name: file_obj}
    if 'gdrive_images' not in st.session_state: st.session_state.gdrive_images = []
    if 'mapping_data' not in st.session_state: st.session_state.mapping_data = {} # {order_key: {slot_id: source_key}}

    # --- 1. UPLOAD EXCEL ---
    with st.expander("📁 1. Upload Excel", expanded=(st.session_state.df is None)):
        uploaded_excel = st.file_uploader("Chọn file orders-check.xlsx", type=['xlsx', 'xls'])
        if uploaded_excel and st.session_state.df is None:
            df = pd.read_excel(uploaded_excel)
            # Pre-processing
            df['_phone_digits'] = df['Số điện thoại'].apply(normalize_phone)
            df['_last4'] = df['_phone_digits'].apply(lambda x: x[-4:].zfill(4) if x else '0000')
            df['_sku'] = df['Mã mẫu mã'].apply(clean_sku)
            df['_yy'] = df.apply(lambda r: safe_note(r['Ghi chú để in'] if not pd.isna(r['Ghi chú để in']) else r['Ghi chú nội bộ']), axis=1)
            df['_need_photo'] = df.apply(lambda r: 'chiếu ảnh' in str(r['Sản phẩm']).lower() or str(r['Mã mẫu mã']).upper().startswith('COUPLEPIX'), axis=1)
            df['_qty'] = df['Số lượng'].fillna(1).astype(int)
            df['_img_per_unit'] = df.apply(lambda r: 2 if str(r['Mã mẫu mã']).upper().startswith('COUPLEPIX') else 1, axis=1)
            df['_order_key'] = str(df['Mã đơn hàng đầy đủ'].iloc[0]) if 'Mã đơn hàng đầy đủ' in df.columns else df['Mã đơn hàng'].astype(str)
            
            # Create a robust order key
            if 'Mã đơn hàng đầy đủ' in df.columns:
                 df['_order_key'] = df['Mã đơn hàng đầy đủ'].astype(str)
            else:
                 df['_order_key'] = df['Mã đơn hàng'].astype(str)

            st.session_state.df = df
            st.success("✅ Đã load dữ liệu thành công!")

    if st.session_state.df is None: st.stop()

    # --- 2. SELECT ORDER ---
    df = st.session_state.df
    order_keys = df['_order_key'].unique().tolist()
    
    col_sel1, col_sel2 = st.columns([3, 1])
    with col_sel1:
        selected_order = st.selectbox("🎯 Chọn đơn hàng:", options=order_keys)
    
    if not selected_order: st.stop()

    # Filter data for selected order
    mask = df['_order_key'] == selected_order
    order_data = df[mask]
    
    # --- 3. EDIT NOTE (FORM để tránh Rerun liên tục) ---
    with st.expander("📝 Chỉnh sửa Note & Cấu hình", expanded=False):
        with st.form("edit_note_form"):
            edited_df = st.data_editor(
                order_data[['_sku', 'Sản phẩm', '_yy', '_need_photo', '_img_per_unit']],
                column_config={'_yy': 'Note (Tên ảnh)', '_need_photo': 'Cần ảnh?'},
                disabled=['_sku', 'Sản phẩm'],
                use_container_width=True,
                key=f"editor_{selected_order}"
            )
            submit_note = st.form_submit_button("Lưu thay đổi")
            if submit_note:
                df.loc[mask, ['_yy', '_need_photo', '_img_per_unit']] = edited_df.values
                st.session_state.df = df
                st.success("Đã cập nhật Note!")

    # --- 4. IMAGE SOURCE & GALLERY (THUMBNAILS) ---
    st.markdown("---")
    st.subheader("🖼️ Quản lý Ảnh")
    
    c1, c2 = st.columns(2)
    
    # Left: Drive
    with c1:
        st.info("🌐 **Nguồn 1: Google Drive**")
        default_phone = order_data['_phone_digits'].iloc[0]
        search_phone = st.text_input("SĐT tìm kiếm:", value=default_phone)
        if st.button("🔍 Quét Drive"):
            with st.spinner("Đang tìm..."):
                st.session_state.gdrive_images = fetch_images_from_gdrive(search_phone)
                if not st.session_state.gdrive_images:
                    st.warning("Không thấy ảnh trên Drive")

    # Right: Manual Upload
    with c2:
        st.warning("💻 **Nguồn 2: Upload Thủ Công**")
        uploaded_files = st.file_uploader("Chọn ảnh từ máy (JPG/PNG):", accept_multiple_files=True, type=['jpg','png','jpeg'])
        if uploaded_files:
            # Update dictionary with new files
            for f in uploaded_files:
                st.session_state.manual_files[f.name] = f

    # === GALLERY PREVIEW (Hiển thị Thumbnail) ===
    st.write("#### 👁️ Xem trước ảnh đã có:")
    
    # Collect all images into a list for display
    all_images_to_show = []
    
    # 1. Drive Images
    for session in st.session_state.gdrive_images:
        for k in ['image-1', 'image-2']:
            if session.get(k):
                all_images_to_show.append({
                    "type": "drive", 
                    "name": f"Drive: ...{session[k][-10:]}", 
                    "src": session[k],
                    "key": session[k]
                })
    
    # 2. Manual Images
    for name, file_obj in st.session_state.manual_files.items():
        all_images_to_show.append({
            "type": "manual",
            "name": f"Máy: {name}",
            "src": file_obj, # UploadedFile object works directly in st.image
            "key": f"manual_{name}"
        })

    if not all_images_to_show:
        st.caption("Chưa có ảnh nào. Hãy Quét Drive hoặc Upload.")
    else:
        # Display Grid of Images
        cols = st.columns(6) # 6 ảnh trên 1 hàng
        for idx, img_item in enumerate(all_images_to_show):
            with cols[idx % 6]:
                # Hiển thị ảnh
                if img_item['type'] == 'drive':
                    # Lấy thumbnail Drive nếu có thể, hoặc link gốc
                    file_id = re.search(r'[-\w]{25,}', img_item['src'])
                    thumb_url = f"https://drive.google.com/thumbnail?id={file_id.group(0)}&sz=w200" if file_id else img_item['src']
                    st.image(thumb_url, use_column_width=True)
                else:
                    st.image(img_item['src'], use_column_width=True)
                
                st.caption(img_item['name'])

    # --- 5. MAPPING TABLE ---
    st.markdown("---")
    st.subheader("🔗 Gán ảnh vào Slot")
    
    slots = expand_slots(df, selected_order)
    
    # Build options map
    # Key: Label hiển thị trong Dropdown, Value: Dữ liệu thực (URL hoặc File Object)
    options_map = {"-- Bỏ qua --": None}
    
    # Add Drive Options
    for img in all_images_to_show:
        if img['type'] == 'drive':
            label = f"🌐 {img['name']}"
            options_map[label] = img['src']
        else:
            label = f"💻 {img['name']}"
            options_map[label] = img['src'] # Đây là UploadedFile object

    # Init mapping state for this order if new
    if selected_order not in st.session_state.mapping_data:
        st.session_state.mapping_data[selected_order] = {}
        
    # Prepare Data for Editor
    table_data = []
    for slot in slots:
        current_val = st.session_state.mapping_data[selected_order].get(slot['idx'], "-- Bỏ qua --")
        # Validate if current_val still exists in options, if not reset
        if current_val not in options_map:
            current_val = "-- Bỏ qua --"
            
        table_data.append({
            "Slot ID": slot['idx'],
            "Tên File Output": slot['suggested_name'],
            "Chọn Ảnh": current_val
        })
    
    # Render Editor
    edited_mapping = st.data_editor(
        pd.DataFrame(table_data),
        column_config={
            "Slot ID": st.column_config.NumberColumn(width="small"),
            "Tên File Output": st.column_config.TextColumn(width="medium"),
            "Chọn Ảnh": st.column_config.SelectboxColumn(
                "Nguồn Ảnh",
                options=list(options_map.keys()),
                width="large",
                required=True
            )
        },
        hide_index=True,
        use_container_width=True,
        key=f"map_editor_{selected_order}"
    )

    # Save mapping changes to session state
    for _, row in edited_mapping.iterrows():
        st.session_state.mapping_data[selected_order][row['Slot ID']] = row['Chọn Ảnh']

    # --- 6. DOWNLOAD ---
    st.markdown("###")
    if st.button("📦 Tải File ZIP", type="primary", use_container_width=True):
        progress_text = "Đang xử lý..."
        my_bar = st.progress(0, text=progress_text)
        
        zip_buffer = io.BytesIO()
        files_processed = 0
        total_files = len(slots)
        
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            # 1. Add Images
            for idx, row in edited_mapping.iterrows():
                selection = row['Chọn Ảnh']
                source_obj = options_map.get(selection)
                
                if source_obj:
                    file_name = row['Tên File Output']
                    
                    try:
                        if isinstance(source_obj, str): # Drive URL
                            img_data = download_image_from_url(source_obj)
                            if img_data:
                                zf.writestr(f"{selected_order}/{file_name}.jpg", img_data.getvalue())
                                files_processed += 1
                        else: # Manual Upload Object
                            # Reset pointer just in case
                            source_obj.seek(0)
                            file_ext = Path(source_obj.name).suffix
                            # Default to jpg if extension is missing/weird
                            if not file_ext: file_ext = ".jpg"
                            
                            zf.writestr(f"{selected_order}/{file_name}{file_ext}", source_obj.getvalue())
                            files_processed += 1
                    except Exception as e:
                        st.error(f"Lỗi ảnh {file_name}: {e}")
                
                my_bar.progress(min((idx + 1) / total_files, 1.0))

            # 2. Add Excel Summary
            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                order_data.to_excel(writer, index=False)
            zf.writestr(f"{selected_order}/Checklist_Don_Hang.xlsx", excel_buffer.getvalue())
            
        my_bar.empty()
        
        if files_processed > 0:
            st.success(f"✅ Đã nén thành công {files_processed} ảnh!")
            st.download_button(
                label="⬇️ Click để tải xuống ZIP",
                data=zip_buffer.getvalue(),
                file_name=f"{selected_order}_FULL.zip",
                mime="application/zip",
                type="secondary"
            )
        else:
            st.warning("⚠️ Chưa có ảnh nào được chọn để tải xuống.")

if __name__ == "__main__":
    main()
