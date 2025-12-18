import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Optional
import requests

# Google Apps Script URL
GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

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
    note_str = note_str.replace(" ", "")
    return note_str[:max_length]

def expand_slots(df: pd.DataFrame, order_key: str) -> List[Dict]:
    slots = []
    slot_idx = 1
    order_rows = df[df['_order_key'] == order_key]
    for _, row in order_rows.iterrows():
        if not row.get('_need_photo', False): continue
        qty = row.get('_qty', 1)
        img_per_unit = row.get('_img_per_unit', 1)
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
        response = requests.get(f"{GOOGLE_SCRIPT_URL}?action=search&phone={phone}", timeout=30)
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
# STREAMLIT UI
# ============================================================================

def main():
    st.set_page_config(page_title="Order Photo Helper", page_icon="📸", layout="wide")
    
    # Khởi tạo Session State
    if 'df' not in st.session_state: st.session_state.df = None
    if 'gdrive_images' not in st.session_state: st.session_state.gdrive_images = []
    if 'manual_files_dict' not in st.session_state: st.session_state.manual_files_dict = {}
    if 'mapping_state' not in st.session_state: st.session_state.mapping_state = {}

    st.title("📸 Order → Photo Naming Helper")

    # --- BƯỚC 1: UPLOAD EXCEL ---
    uploaded_excel = st.file_uploader("Upload file orders-check.xlsx", type=['xlsx', 'xls'])
    if uploaded_excel and st.session_state.df is None:
        df = pd.read_excel(uploaded_excel)
        df['_phone_digits'] = df['Số điện thoại'].apply(normalize_phone)
        df['_last4'] = df['_phone_digits'].apply(lambda x: x[-4:].zfill(4) if x else '0000')
        df['_sku'] = df['Mã mẫu mã'].apply(clean_sku)
        df['_yy'] = df.apply(lambda r: safe_note(r['Ghi chú để in'] if not pd.isna(r['Ghi chú để in']) else r['Ghi chú nội bộ']), axis=1)
        # Tự động xác định cần ảnh
        df['_need_photo'] = df.apply(lambda r: 'chiếu ảnh' in str(r['Sản phẩm']).lower() or str(r['Mã mẫu mã']).upper().startswith('COUPLEPIX'), axis=1)
        df['_qty'] = df['Số lượng'].fillna(1).astype(int)
        df['_img_per_unit'] = df.apply(lambda r: 2 if str(r['Mã mẫu mã']).upper().startswith('COUPLEPIX') else 1, axis=1)
        df['_order_key'] = df['Mã đơn hàng đầy đủ'] if 'Mã đơn hàng đầy đủ' in df.columns else df['Mã đơn hàng']
        st.session_state.df = df

    if st.session_state.df is None: st.stop()

    # --- CHỌN ĐƠN HÀNG ---
    order_keys = st.session_state.df['_order_key'].unique().tolist()
    selected_order = st.selectbox("🎯 Chọn đơn hàng:", options=order_keys)

    if selected_order:
        df = st.session_state.df
        mask = df['_order_key'] == selected_order
        
        # 1. Sửa Note tại Bước 3
        with st.expander("📝 Chỉnh sửa Note & Số lượng ảnh", expanded=False):
            edited_df = st.data_editor(
                df[mask][['_sku', 'Sản phẩm', '_yy', '_need_photo', '_img_per_unit']],
                column_config={'_yy': 'Note', '_need_photo': 'Cần ảnh?'},
                disabled=['_sku', 'Sản phẩm'], width="stretch", key=f"ed_{selected_order}"
            )
            if st.button("Lưu thay đổi"):
                df.loc[mask, ['_yy', '_need_photo', '_img_per_unit']] = edited_df.values
                st.session_state.df = df
                st.rerun()

        # 2. Quản lý nguồn ảnh
        st.subheader("🖼️ Nguồn ảnh")
        c1, c2 = st.columns(2)
        with c1:
            order_phone = df[mask]['_phone_digits'].iloc[0]
            check_p = st.text_input("SĐT quét Drive:", value=order_phone)
            if st.button("🔍 Quét Drive"):
                with st.spinner("Đang tìm..."):
                    st.session_state.gdrive_images = fetch_images_from_gdrive(check_p)
        with c2:
            new_files = st.file_uploader("Upload tay:", accept_multiple_files=True, type=['jpg','png','jpeg'])
            if new_files:
                for f in new_files: st.session_state.manual_files_dict[f.name] = f

        # 3. Mapping Ảnh (Quan trọng: Sửa lỗi vòng lặp)
        st.subheader("🔗 Gán ảnh cho Slot")
        slots = expand_slots(df, selected_order)
        
        # Tạo danh sách options
        img_options = ["-- Trống --"]
        map_data = {"-- Trống --": None}
        for s in st.session_state.gdrive_images:
            for k in ['image-1', 'image-2']:
                if s.get(k): 
                    label = f"Drive: {s[k][-20:]}"
                    img_options.append(label)
                    map_data[label] = s[k]
        for name, f in st.session_state.manual_files_dict.items():
            label = f"Máy: {name}"
            img_options.append(label)
            map_data[label] = f

        # Duy trì trạng thái mapping trong session_state để tránh reset khi rerun
        if selected_order not in st.session_state.mapping_state:
            st.session_state.mapping_state[selected_order] = {s['idx']: "-- Trống --" for s in slots}
        
        # Chuẩn bị bảng mapping dựa trên session_state
        current_mapping = st.session_state.mapping_state[selected_order]
        mapping_table = pd.DataFrame([
            {'Slot': s['idx'], 'Tên File': s['suggested_name'], 'Nguồn Ảnh': current_mapping.get(s['idx'], "-- Trống --")} 
            for s in slots
        ])
        
        # Hiển thị bảng gán ảnh
        res_map = st.data_editor(
            mapping_table,
            column_config={'Nguồn Ảnh': st.column_config.SelectboxColumn("Chọn Ảnh", options=img_options, width="large")},
            hide_index=True, width="stretch", key=f"map_table_{selected_order}"
        )

        # Cập nhật ngược lại session_state khi người dùng thay đổi bảng
        for _, row in res_map.iterrows():
            st.session_state.mapping_state[selected_order][row['Slot']] = row['Nguồn Ảnh']

        # 4. ZIP & Download
        if st.button("📦 Xuất File ZIP", type="primary", width="stretch"):
            zip_buf = io.BytesIO()
            success_count = 0
            with zipfile.ZipFile(zip_buf, 'w') as zf:
                for _, row in res_map.iterrows():
                    source = map_data.get(row['Nguồn Ảnh'])
                    if not source: continue
                    
                    if isinstance(source, str): # Drive
                        img_bytes = download_image_from_url(source)
                        if img_bytes:
                            zf.writestr(f"{selected_order}/{row['Tên File']}.jpg", img_bytes.getvalue())
                            success_count += 1
                    else: # Manual
                        zf.writestr(f"{selected_order}/{row['Tên File']}{Path(source.name).suffix}", source.getvalue())
                        success_count += 1
                
                # Add Excel Worklist
                wb_buf = io.BytesIO()
                df[mask].to_excel(wb_buf, index=False)
                zf.writestr(f"{selected_order}/_DANH_SACH_DON.xlsx", wb_buf.getvalue())

            if success_count > 0:
                st.download_button("⬇️ Tải xuống ZIP", zip_buf.getvalue(), f"{selected_order}.zip", width="stretch")
            else:
                st.error("Chưa gán ảnh nào!")

if __name__ == "__main__": main()
