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

def needs_photo(row: pd.Series) -> bool:
    loai = str(row.get('Loại', '')).lower() if not pd.isna(row.get('Loại')) else ''
    san_pham = str(row.get('Sản phẩm', '')).lower() if not pd.isna(row.get('Sản phẩm')) else ''
    sku_raw = str(row.get('Mã mẫu mã', '')) if not pd.isna(row.get('Mã mẫu mã')) else ''
    if 'khắc' in loai: return False
    if 'chiếu ảnh' in san_pham or 'chieu anh' in san_pham: return True
    if sku_raw.upper().startswith('COUPLEPIX'): return True
    sku_clean = clean_sku(sku_raw)
    return bool(re.match(r'^CP\d+', sku_clean))

def get_img_per_unit(row: pd.Series) -> int:
    sku_raw = str(row.get('Mã mẫu mã', '')) if not pd.isna(row.get('Mã mẫu mã')) else ''
    return 2 if sku_raw.upper().startswith('COUPLEPIX') else 1

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
    
    # Init Session State
    if 'df' not in st.session_state: st.session_state.df = None
    if 'gdrive_images' not in st.session_state: st.session_state.gdrive_images = []
    if 'manual_files_dict' not in st.session_state: st.session_state.manual_files_dict = {}

    st.title("📸 Order → Photo Naming Helper")

    # --- BƯỚC 1: UPLOAD EXCEL ---
    with st.expander("📁 Bước 1: Upload File Excel", expanded=(st.session_state.df is None)):
        uploaded_excel = st.file_uploader("Chọn file orders-check.xlsx", type=['xlsx', 'xls'])
        if uploaded_excel:
            df = pd.read_excel(uploaded_excel)
            df['_phone_digits'] = df['Số điện thoại'].apply(normalize_phone)
            df['_last4'] = df['_phone_digits'].apply(lambda x: x[-4:].zfill(4) if x else '0000')
            df['_sku'] = df['Mã mẫu mã'].apply(clean_sku)
            df['_yy'] = df.apply(lambda r: safe_note(r['Ghi chú để in'] if not pd.isna(r['Ghi chú để in']) else r['Ghi chú nội bộ']), axis=1)
            df['_need_photo'] = df.apply(needs_photo, axis=1)
            df['_qty'] = df['Số lượng'].fillna(1).astype(int)
            df['_img_per_unit'] = df.apply(get_img_per_unit, axis=1)
            df['_order_key'] = df['Mã đơn hàng đầy đủ'] if 'Mã đơn hàng đầy đủ' in df.columns else df['Mã đơn hàng']
            st.session_state.df = df
            st.success("✅ Đã load dữ liệu!")

    if st.session_state.df is None: st.stop()

    # --- BƯỚC 2 & 3: XỬ LÝ ĐƠN HÀNG ---
    st.header("🎯 Xử lý Đơn hàng")
    df = st.session_state.df
    order_keys = df['_order_key'].unique().tolist()
    selected_order = st.selectbox("Chọn đơn hàng cần xử lý:", options=order_keys)

    if selected_order:
        mask = df['_order_key'] == selected_order
        
        # 1. Sửa Note tại Bước 3
        st.subheader("📝 1. Kiểm tra & Sửa Note")
        edited_df = st.data_editor(
            df[mask][['_sku', 'Sản phẩm', '_yy', '_need_photo', '_img_per_unit']],
            column_config={'_yy': 'Note (Tên ảnh)', '_need_photo': 'Cần ảnh?'},
            disabled=['_sku', 'Sản phẩm'], use_container_width=True, key=f"editor_{selected_order}"
        )
        df.loc[mask, ['_yy', '_need_photo', '_img_per_unit']] = edited_df.values
        st.session_state.df = df

        # 2. Lấy ảnh (Drive + Manual)
        st.subheader("🖼️ 2. Nguồn ảnh")
        col1, col2 = st.columns([1, 1])
        
        with col1:
            st.markdown("**Quét Google Drive**")
            order_phone = df[mask]['_phone_digits'].iloc[0]
            check_p = st.text_input("SĐT tìm ảnh:", value=order_phone, key="phone_input")
            if st.button("🔄 Tìm trên Drive"):
                st.session_state.gdrive_images = fetch_images_from_gdrive(check_p)
                if not st.session_state.gdrive_images: st.toast("Không tìm thấy ảnh trên Drive", icon="⚠️")

        with col2:
            st.markdown("**Upload thủ công**")
            new_files = st.file_uploader("Chọn ảnh từ máy tính:", accept_multiple_files=True, type=['jpg','png','jpeg'], key="manual_up")
            if new_files:
                for f in new_files:
                    st.session_state.manual_files_dict[f.name] = f
                st.toast(f"Đã lưu {len(new_files)} ảnh vào bộ nhớ tạm", icon="✅")

        # 3. Mapping Ảnh
        st.markdown("---")
        slots = expand_slots(df, selected_order)
        
        # Xây dựng danh sách lựa chọn
        options_map = {"-- Trống --": None}
        for s in st.session_state.gdrive_images:
            for k in ['image-1', 'image-2']:
                if s.get(k): options_map[f"Drive: {s[k][-25:]}"] = s[k]
        for name, file_obj in st.session_state.manual_files_dict.items():
            options_map[f"Máy: {name}"] = file_obj

        st.subheader(f"🔗 3. Gán ảnh cho {len(slots)} slot")
        mapping_table = pd.DataFrame([{'Slot': s['idx'], 'Tên File Dự Kiến': s['suggested_name'], 'Nguồn Ảnh': "-- Trống --"} for s in slots])
        
        res_map = st.data_editor(
            mapping_table,
            column_config={'Nguồn Ảnh': st.column_config.SelectboxColumn("Chọn Ảnh", options=list(options_map.keys()), width="large")},
            hide_index=True, use_container_width=True, key=f"map_{selected_order}"
        )

        # 4. ZIP & Download
        st.markdown("---")
        if st.button("📦 Tải Ảnh & Tạo File ZIP", type="primary", use_container_width=True):
            zip_buf = io.BytesIO()
            count = 0
            with zipfile.ZipFile(zip_buf, 'w') as zf:
                for _, row in res_map.iterrows():
                    choice = row['Nguồn Ảnh']
                    source = options_map.get(choice)
                    if not source: continue

                    if isinstance(source, str): # Drive URL
                        img_data = download_image_from_url(source)
                        if img_data:
                            zf.writestr(f"{selected_order}/{row['Tên File Dự Kiến']}.jpg", img_data.getvalue())
                            count += 1
                    else: # UploadedFile object
                        ext = Path(source.name).suffix
                        zf.writestr(f"{selected_order}/{row['Tên File Dự Kiến']}{ext}", source.getvalue())
                        count += 1
                
                # Thêm Excel Worklist vào ZIP
                worklist_buf = io.BytesIO()
                df[mask].to_excel(worklist_buf, index=False)
                zf.writestr(f"{selected_order}/worklist.xlsx", worklist_buf.getvalue())

            if count > 0:
                st.success(f"Đã chuẩn bị xong {count} ảnh!")
                st.download_button("⬇️ Tải xuống file .ZIP", zip_buf.getvalue(), f"{selected_order}.zip", "application/zip", use_container_width=True)
            else:
                st.error("Chưa có ảnh nào được gán!")

if __name__ == "__main__":
    main()
