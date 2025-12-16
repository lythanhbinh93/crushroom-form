# 🚀 Hướng Dẫn Deploy App Lên Streamlit Cloud

## Cách 1: Deploy Lên Streamlit Community Cloud (MIỄN PHÍ)

### Bước 1: Push code lên GitHub (ĐÃ XONG ✅)
Code đã được push lên branch `claude/order-photo-naming-app-MgxaI`

### Bước 2: Truy cập Streamlit Cloud
1. Vào https://streamlit.io/cloud
2. Click "Sign up" hoặc "Sign in with GitHub"
3. Authorize Streamlit truy cập GitHub repo của bạn

### Bước 3: Deploy App
1. Click "New app"
2. Chọn repository: `lythanhbinh93/crushroom-form`
3. Chọn branch: `claude/order-photo-naming-app-MgxaI`
4. Main file path: `app.py`
5. Click "Deploy"

### Bước 4: Đợi Deploy
- Streamlit sẽ tự động cài dependencies từ `requirements.txt`
- Mất khoảng 2-3 phút
- Sau khi xong sẽ có URL public dạng: `https://your-app.streamlit.app`

---

## Cách 2: Chạy Local Trên Máy Của Bạn

Nếu muốn chạy trên máy local của bạn:

```bash
# Clone repo
git clone https://github.com/lythanhbinh93/crushroom-form.git
cd crushroom-form

# Checkout branch
git checkout claude/order-photo-naming-app-MgxaI

# Cài dependencies
pip install -r requirements.txt

# Chạy app
streamlit run app.py
```

App sẽ tự động mở browser tại `http://localhost:8501`

---

## Cách 3: Deploy Lên Các Nền Tảng Khác

### Railway (Free tier)
1. Vào https://railway.app
2. Connect GitHub repo
3. Deploy from branch

### Render (Free tier)
1. Vào https://render.com
2. New Web Service
3. Connect repo và deploy

### Heroku
1. Cần tạo `Procfile`:
   ```
   web: sh setup.sh && streamlit run app.py
   ```

2. Tạo `setup.sh`:
   ```bash
   mkdir -p ~/.streamlit/
   echo "[server]\nheadless = true\nport = $PORT\n" > ~/.streamlit/config.toml
   ```

---

## ⚠️ Lưu Ý

- **Streamlit Cloud**: Miễn phí, dễ nhất, tích hợp GitHub tốt
- App sẽ có URL public, ai cũng truy cập được
- Nếu cần private app, dùng Streamlit for Teams (trả phí)
- File Excel và ảnh upload sẽ chỉ lưu trong session, không lưu trên server

---

## 📧 Support

Gặp vấn đề khi deploy? Check logs tại Streamlit Cloud dashboard.
