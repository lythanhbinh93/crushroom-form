import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import requests
from PIL import Image

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
    if re.match(r'^CP\d+', sku_clean): return True
    return False

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
        total_slots = qty * img_per_unit
        for _ in range(total_slots):
            name_parts = [f"{slot_idx}.", row.get('_last4', '0000'), row.get('_sku', '')]
            if row.get('_yy'): name_parts.append(row['_yy'])
            slots.append({
                'idx': slot_idx,
                'last4': row.get('_last4', '0000'),
                'sku': row.get('_sku', ''),
                'yy': row.get('_yy', ''),
                'suggested_name': "_".join(name_parts),
                'image_url': None,
                'manual_file': None
            })
            slot_idx += 1
    return slots

def fetch_images_from_gdrive(phone: str) -> List[Dict]:
    try:
        response = requests.get(f"{GOOGLE_SCRIPT_URL}?action=search&phone={phone}", timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get('results', []) if data.get('success') else []
    except Exception as e:
        st.error(f"Lỗi Drive: {str(e)}")
        return []

def extract_gdrive_id(url: str) -> Optional[str]:
    if not url: return None
    match = re.search(r'[-\w]{25,}', url)
    return match.group(0) if match else None

def download_image_from_url(url: str) -> Optional[io.BytesIO]:
    try:
        file_id = extract_gdrive_id(url)
        direct_url = f"https://drive.google.com/uc?export=download&id={file_id}" if file_id else url
        response = requests.get(direct_url, timeout=30)
        response.raise_for_status()
        return io.BytesIO(response.content)
    except: return None

# ============================================================================
# STREAMLIT UI
# ============================================================================

def main():
    st.set_page_config(page_title="Order Photo Helper", page_icon="📸", layout="wide")
    st.title("📸 Order → Photo Naming Helper")

    if 'df' not in st.session_state: st.session_state.df = None
    if 'gdrive_images' not in st.session_state: st.session_state.gdrive_images = []
    if 'manual_files' not in st.session_state: st.session_state.manual_files = []

    # --- STEP 1: UPLOAD ---
    uploaded_excel = st.file_uploader("Upload file orders-check.xlsx", type=['xlsx', 'xls'])
    if uploaded_excel and st.session_state.df is None:
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
        st.success("✅ Đã load Excel")

    if st.session_state.df is None: st.stop()

    # --- STEP 3 (Tính năng sửa note được đẩy lên trước) ---
    st.header("🎯 Xử lý Đơn hàng")
    df = st.session_state.df
    order_keys = df['_order_key'].unique().tolist()
    selected_order = st.selectbox("Chọn đơn hàng:", options=order_keys)

    if selected_order:
        # 1. Sửa note trực tiếp
        st.subheader("📝 Sửa nhanh thông tin (Bước 3)")
        mask = df['_order_key'] == selected_order
        edited_order_df = st.data_editor(
            df[mask][['_sku', 'Sản phẩm', '_yy', '_need_photo', '_img_per_unit']],
            column_config={'_yy': 'Note (YY)', '_need_photo': 'Cần ảnh?'},
            disabled=['_sku', 'Sản phẩm'],
            use_container_width=True,
            key=f"ed_{selected_order}"
        )
        # Cập nhật state ngay lập tức
        df.loc[mask, ['_yy', '_need_photo', '_img_per_unit']] = edited_order_df.values
        st.session_state.df = df

        # 2. Lấy ảnh
        order_phone = df[mask]['_phone_digits'].iloc[0]
        col1, col2 = st.columns([2, 1])
        with col1:
            check_phone = st.text_input("SĐT quét ảnh:", value=order_phone)
        with col2:
            st.write("##")
            if st.button("🔄 Quét Drive", type="primary"):
                st.session_state.gdrive_images = fetch_images_from_gdrive(check_phone)
                if not st.session_state.gdrive_images: st.warning("Không tìm thấy ảnh trên Drive.")

        # 3. Tính năng bổ sung khi không thấy ảnh
        if not st.session_state.gdrive_images:
            st.info("💡 Không thấy ảnh? Thử SĐT phụ hoặc upload tay dưới đây:")
        
        with st.expander("🛠️ Tùy chọn SĐT phụ & Upload thủ công"):
            c1, c2 = st.columns(2)
            with c1:
                alt_p = st.text_input("Nhập SĐT phụ:")
                if st.button("Check SĐT phụ") and alt_p:
                    st.session_state.gdrive_images = fetch_images_from_gdrive(normalize_phone(alt_p))
                    st.rerun()
            with c2:
                up_files = st.file_uploader("Up ảnh từ máy tính:", accept_multiple_files=True, type=['jpg','png','jpeg'])
                if up_files: st.session_state.manual_files = up_files

        # 4. Hiển thị ảnh & Mapping
        st.markdown("---")
        slots = expand_slots(df, selected_order)
        
        # Tạo danh sách option để chọn (Drive + Manual)
        img_map = {"-- Trống --": None}
        for s in st.session_state.gdrive_images:
            for k in ['image-1', 'image-2']:
                if s.get(k): img_map[f"Drive: {s[k][-20:]}"] = s[k]
        for f in st.session_state.manual_files:
            img_map[f"Máy: {f.name}"] = f

        st.subheader(f"🔗 Map {len(slots)} ảnh cho đơn {selected_order}")
        mapping_table = pd.DataFrame([{ 'Slot': s['idx'], 'Tên File': s['suggested_name'], 'Chọn Ảnh': "-- Trống --" } for s in slots])
        
        edited_map = st.data_editor(
            mapping_table,
            column_config={'Chọn Ảnh': st.column_config.SelectboxColumn("Chọn Nguồn Ảnh", options=list(img_map.keys()))},
            hide_index=True, use_container_width=True
        )

        # --- STEP 4: DOWNLOAD ---
        if st.button("📦 Tải Ảnh & Tạo ZIP", type="primary"):
            zip_buf = io.BytesIO()
            success_count = 0
            with zipfile.ZipFile(zip_buf, 'w') as zf:
                for idx, row in edited_map.iterrows():
                    choice = row['Chọn Ảnh']
                    data = img_map.get(choice)
                    if not data: continue
                    
                    # Lấy byte dữ liệu
                    if isinstance(data, str): # Drive URL
                        img_bytes = download_image_from_url(data)
                        content = img_bytes.read() if img_bytes else None
                        ext = ".jpg"
                    else: # Manual File
                        content = data.getvalue()
                        ext = Path(data.name).suffix
                    
                    if content:
                        zf.writestr(f"{selected_order}/{row['Tên File']}{ext}", content)
                        success_count += 1
                
                # Add Excel summary
                order_df = df[df['_order_key'] == selected_order]
                ex_out = io.BytesIO()
                with pd.ExcelWriter(ex_out, engine='openpyxl') as writer:
                    order_df.to_excel(writer, index=False)
                zf.writestr(f"{selected_order}/order_summary.xlsx", ex_out.getvalue())

            st.download_button(f"⬇️ Tải file ZIP ({success_count} ảnh)", zip_buf.getvalue(), f"{selected_order}.zip", "application/zip")

if __name__ == "__main__": main()
