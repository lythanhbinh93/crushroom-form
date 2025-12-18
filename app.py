import streamlit as st
import pandas as pd
import re
import io
import zipfile
from pathlib import Path
from typing import List, Dict, Optional
import requests

# ============================================================================
# CẤU HÌNH & HÀM HỖ TRỢ
# ============================================================================
GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec"


def normalize_phone(phone: str) -> str:
    if pd.isna(phone):
        return ""
    return re.sub(r"\D", "", str(phone))


def clean_sku(sku: str) -> str:
    if pd.isna(sku):
        return ""
    sku_str = str(sku).strip()
    if "COUPLEPIX-" in sku_str.upper():
        parts = sku_str.upper().split("COUPLEPIX-")
        if len(parts) > 1 and parts[1]:
            return parts[1].split()[0]
    return sku_str.upper().replace(" ", "")


def safe_note(note: str, max_length: int = 35) -> str:
    if pd.isna(note) or not note:
        return ""
    note_str = (
        str(note)
        .strip()
        .replace("/", "-")
        .replace("\\", "-")
        .replace(":", "-")
    )
    note_str = re.sub(
        r"[^\w\s\-.,áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]",
        "",
        note_str,
    )
    return note_str.replace(" ", "")[:max_length]


def expand_slots(df: pd.DataFrame, order_key: str) -> List[Dict]:
    slots = []
    slot_idx = 1
    order_rows = df[df["_order_key"] == order_key]

    for _, row in order_rows.iterrows():
        if not row.get("_need_photo", False):
            continue

        qty = int(row.get("_qty", 1))
        img_per_unit = int(row.get("_img_per_unit", 1))

        for _ in range(qty * img_per_unit):
            name_parts = [
                f"{slot_idx}.",
                row.get("_last4", "0000"),
                row.get("_sku", ""),
            ]
            if row.get("_yy"):
                name_parts.append(row["_yy"])
            slots.append({"idx": slot_idx, "suggested_name": "_".join(name_parts)})
            slot_idx += 1

    return slots


def fetch_images_from_gdrive(phone: str) -> List[Dict]:
    try:
        resp = requests.get(
            f"{GOOGLE_SCRIPT_URL}?action=search&phone={phone}",
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("results", []) if isinstance(data, dict) else []
    except Exception:
        return []


def download_image_from_url(url: str) -> Optional[io.BytesIO]:
    try:
        match = re.search(r"[-\w]{25,}", url)
        direct_url = (
            f"https://drive.google.com/uc?export=download&id={match.group(0)}"
            if match
            else url
        )
        resp = requests.get(direct_url, timeout=30)
        if resp.status_code != 200:
            return None
        return io.BytesIO(resp.content)
    except Exception:
        return None


def drive_thumb(url: str, size: int = 200) -> str:
    m = re.search(r"[-\w]{25,}", url)
    if not m:
        return url
    return f"https://drive.google.com/thumbnail?id={m.group(0)}&sz=w{size}"


# ============================================================================
# MAIN
# ============================================================================
def main():
    st.set_page_config(page_title="Photo Helper Pro", page_icon="📸", layout="wide")
    st.title("📸 Order → Photo Naming Helper")

    # --- SESSION STATE ---
    if "df" not in st.session_state:
        st.session_state.df = None

    # Lưu ảnh upload thủ công dạng bytes để không bị stale / mất file khi rerun
    # manual_files: { filename: {"bytes": b"...", "ext": ".jpg"} }
    if "manual_files" not in st.session_state:
        st.session_state.manual_files = {}

    if "gdrive_images" not in st.session_state:
        st.session_state.gdrive_images = []

    # mapping_data: { order_key: { slot_idx: selected_label } }
    if "mapping_data" not in st.session_state:
        st.session_state.mapping_data = {}

    # --- 1) UPLOAD EXCEL ---
    with st.expander("📁 1. Upload Excel", expanded=(st.session_state.df is None)):
        uploaded_excel = st.file_uploader("Chọn file orders-check.xlsx", type=["xlsx", "xls"])
        if uploaded_excel and st.session_state.df is None:
            df = pd.read_excel(uploaded_excel)

            df["_phone_digits"] = df["Số điện thoại"].apply(normalize_phone)
            df["_last4"] = df["_phone_digits"].apply(lambda x: x[-4:].zfill(4) if x else "0000")
            df["_sku"] = df["Mã mẫu mã"].apply(clean_sku)

            df["_yy"] = df.apply(
                lambda r: safe_note(
                    r["Ghi chú để in"] if not pd.isna(r.get("Ghi chú để in", None)) else r.get("Ghi chú nội bộ", "")
                ),
                axis=1,
            )

            df["_need_photo"] = df.apply(
                lambda r: ("chiếu ảnh" in str(r.get("Sản phẩm", "")).lower())
                          or str(r.get("Mã mẫu mã", "")).upper().startswith("COUPLEPIX"),
                axis=1,
            )

            df["_qty"] = df["Số lượng"].fillna(1).astype(int)
            df["_img_per_unit"] = df.apply(
                lambda r: 2 if str(r.get("Mã mẫu mã", "")).upper().startswith("COUPLEPIX") else 1,
                axis=1,
            )

            if "Mã đơn hàng đầy đủ" in df.columns:
                df["_order_key"] = df["Mã đơn hàng đầy đủ"].astype(str)
            else:
                df["_order_key"] = df["Mã đơn hàng"].astype(str)

            st.session_state.df = df
            st.success("✅ Đã load dữ liệu thành công!")

    if st.session_state.df is None:
        st.stop()

    df = st.session_state.df

    # --- 2) CHỌN ĐƠN ---
    order_keys = df["_order_key"].unique().tolist()
    col_sel1, _ = st.columns([3, 1])
    with col_sel1:
        selected_order = st.selectbox("🎯 Chọn đơn hàng:", options=order_keys)

    if not selected_order:
        st.stop()

    mask = df["_order_key"] == selected_order
    order_data = df[mask]

    # --- 3) EDIT NOTE (FORM: đã ổn, tránh rerun liên tục) ---
    with st.expander("📝 Chỉnh sửa Note & Cấu hình", expanded=False):
        with st.form("edit_note_form"):
            edited_df = st.data_editor(
                order_data[["_sku", "Sản phẩm", "_yy", "_need_photo", "_img_per_unit"]],
                column_config={
                    "_yy": "Note (Tên ảnh)",
                    "_need_photo": "Cần ảnh?",
                    "_img_per_unit": "Ảnh / 1 SP",
                },
                disabled=["_sku", "Sản phẩm"],
                use_container_width=True,
                key=f"editor_{selected_order}",
            )
            submit_note = st.form_submit_button("Lưu thay đổi")

        if submit_note:
            df.loc[mask, ["_yy", "_need_photo", "_img_per_unit"]] = edited_df[["_yy", "_need_photo", "_img_per_unit"]].values
            st.session_state.df = df
            st.success("✅ Đã cập nhật Note!")

    # --- 4) NGUỒN ẢNH ---
    st.markdown("---")
    st.subheader("🖼️ Quản lý Ảnh")

    c1, c2 = st.columns(2)

    # Drive
    with c1:
        st.info("🌐 **Nguồn 1: Google Drive**")
        default_phone = order_data["_phone_digits"].iloc[0] if len(order_data) else ""
        search_phone = st.text_input("SĐT tìm kiếm:", value=default_phone, key="search_phone")

        if st.button("🔍 Quét Drive", key="scan_drive_btn"):
            with st.spinner("Đang tìm..."):
                st.session_state.gdrive_images = fetch_images_from_gdrive(search_phone)
                if not st.session_state.gdrive_images:
                    st.warning("Không thấy ảnh trên Drive")

    # Manual upload (lưu bytes)
    with c2:
        st.warning("💻 **Nguồn 2: Upload Thủ Công**")
        uploaded_files = st.file_uploader(
            "Kéo thả ảnh vào đây:",
            accept_multiple_files=True,
            type=["jpg", "png", "jpeg"],
            key=f"manual_uploader_{selected_order}",
        )

        if uploaded_files:
            for f in uploaded_files:
                ext = Path(f.name).suffix.lower() or ".jpg"
                st.session_state.manual_files[f.name] = {
                    "bytes": f.getvalue(),
                    "ext": ext,
                }

        if st.session_state.manual_files:
            if st.button("🗑️ Xóa ảnh đã upload", use_container_width=True, key="clear_manual_btn"):
                st.session_state.manual_files = {}
                st.rerun()

    # --- 4.1) GALLERY ---
    all_images_to_show: List[Dict] = []

    # Drive images
    for session in st.session_state.gdrive_images:
        for k in ["image-1", "image-2"]:
            if session.get(k):
                all_images_to_show.append(
                    {"type": "drive", "name": f"Drive: ...{session[k][-10:]}", "src": session[k]}
                )

    # Manual images
    for name, meta in st.session_state.manual_files.items():
        all_images_to_show.append(
            {"type": "manual", "name": f"Máy: {name}", "src": meta["bytes"], "ext": meta["ext"]}
        )

    with st.expander("👁️ Xem trước ảnh đã có", expanded=True):
        if not all_images_to_show:
            st.caption("Chưa có ảnh nào. Hãy Quét Drive hoặc Upload.")
        else:
            cols = st.columns(6)
            for idx, img_item in enumerate(all_images_to_show):
                with cols[idx % 6]:
                    if img_item["type"] == "drive":
                        st.image(drive_thumb(img_item["src"], 200), use_container_width=True)
                    else:
                        st.image(img_item["src"], use_container_width=True)
                    st.caption(img_item["name"], help=img_item["name"])

    # --- 5) MAPPING (✅ FIX RELOAD LIÊN TỤC: bọc data_editor vào FORM) ---
    st.markdown("---")
    st.subheader("🔗 Gán ảnh vào Slot")

    slots = expand_slots(df, selected_order)

    # options_map: label -> None hoặc object mô tả nguồn
    options_map: Dict[str, Optional[Dict]] = {"-- Trống --": None}
    for img in all_images_to_show:
        label = f"✅ {img['name']}"
        if img["type"] == "drive":
            options_map[label] = {"kind": "drive", "url": img["src"]}
        else:
            options_map[label] = {"kind": "manual", "bytes": img["src"], "ext": img.get("ext", ".jpg")}

    if selected_order not in st.session_state.mapping_data:
        st.session_state.mapping_data[selected_order] = {}

    table_data = []
    for slot in slots:
        current_val = st.session_state.mapping_data[selected_order].get(slot["idx"], "-- Trống --")
        if current_val not in options_map:
            current_val = "-- Trống --"
        table_data.append(
            {"Slot": slot["idx"], "Tên File Sẽ Lưu": slot["suggested_name"], "Chọn Ảnh": current_val}
        )

    save_map = False
    with st.form(f"map_form_{selected_order}"):
        edited_mapping = st.data_editor(
            pd.DataFrame(table_data),
            column_config={
                "Slot": st.column_config.NumberColumn(width="small", disabled=True),
                "Tên File Sẽ Lưu": st.column_config.TextColumn(width="medium", disabled=True),
                "Chọn Ảnh": st.column_config.SelectboxColumn(
                    "Nguồn Ảnh",
                    options=list(options_map.keys()),
                    width="large",
                    required=True,
                ),
            },
            hide_index=True,
            use_container_width=True,
            key=f"map_editor_{selected_order}",
        )
        save_map = st.form_submit_button("💾 Lưu gán ảnh")

    if save_map:
        for _, row in edited_mapping.iterrows():
            st.session_state.mapping_data[selected_order][int(row["Slot"])] = row["Chọn Ảnh"]
        st.success("✅ Đã lưu gán ảnh! (Dropdown không còn làm app rerun liên tục)")

    # --- 6) ZIP ---
    st.markdown("###")
    if st.button("📦 Tải File ZIP", type="primary", use_container_width=True):
        my_bar = st.progress(0, text="Đang xử lý...")

        # đảm bảo ZIP dùng mapping đã lưu gần nhất
        # nếu user chưa bấm "Lưu gán ảnh", ta vẫn lấy theo mapping_data
        mapping_for_zip = st.session_state.mapping_data.get(selected_order, {})

        zip_buffer = io.BytesIO()
        files_processed = 0
        total_files = len(slots)

        with zipfile.ZipFile(zip_buffer, "w") as zf:
            # 1) Thêm ảnh theo slot
            for i, slot in enumerate(slots, start=1):
                chosen_label = mapping_for_zip.get(slot["idx"], "-- Trống --")
                src = options_map.get(chosen_label)

                if src:
                    file_name = slot["suggested_name"]
                    try:
                        if src["kind"] == "drive":
                            img_data = download_image_from_url(src["url"])
                            if img_data:
                                zf.writestr(f"{selected_order}/{file_name}.jpg", img_data.getvalue())
                                files_processed += 1
                        else:
                            ext = src.get("ext") or ".jpg"
                            zf.writestr(f"{selected_order}/{file_name}{ext}", src["bytes"])
                            files_processed += 1
                    except Exception as e:
                        st.error(f"Lỗi ảnh {file_name}: {e}")

                my_bar.progress(min(i / max(total_files, 1), 1.0))

            # 2) Thêm Excel Summary (lấy mới nhất)
            order_data_latest = st.session_state.df[mask]
            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
                order_data_latest.to_excel(writer, index=False)
            zf.writestr(f"{selected_order}/Checklist_{selected_order}.xlsx", excel_buffer.getvalue())

        my_bar.empty()

        if files_processed > 0:
            st.success(f"✅ Đã nén thành công {files_processed} ảnh!")
            st.download_button(
                label="⬇️ Click để tải xuống ZIP",
                data=zip_buffer.getvalue(),
                file_name=f"{selected_order}_FULL.zip",
                mime="application/zip",
                type="secondary",
            )
        else:
            st.warning("⚠️ Chưa có ảnh nào được chọn để tải xuống.")


if __name__ == "__main__":
    main()
