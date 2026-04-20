# System Architecture

**Project**: CouplePix (crushroom-form)  
**Last Updated**: 2026-04-20  
**Audience**: Developers, DevOps, maintainers

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ CUSTOMER                                                    │
├─────────────────────────────────────────────────────────────┤
│ Shopify Store              Standalone Web                   │
│ └─ couplepix.liquid        └─ couplepix.html               │
│    (Embedded theme)           (Vercel static)              │
│                                                             │
│ Upload photos + crop (Croppie, intl-tel-input)            │
│ POST FormData (base64 img, phone)                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ GOOGLE APPS SCRIPT (Backend)                                │
├─────────────────────────────────────────────────────────────┤
│ doPost(e)      → Decode, upload Drive, log Sheet, email    │
│ doGet(e)       → Route search/list requests                │
│ searchByPhone  → Validate & match rows                      │
│ listByDateRange→ Filter & group by date                    │
└────────────┬───────────────────┬──────────────┬────────────┘
             │                   │              │
             ▼                   ▼              ▼
         [Drive]            [Sheet         [Email]
         (images)           "form data"]
                            (log)
```

## Component Architecture

### 1. Customer Upload Surface

**Files**: `couplepix.html`, `assets/couple-pix.{js,css}`

**Flow**:
```
User selects image → Croppie modal → Set crop bounds
→ Click "Crop & Select" → Store canvas base64

User clicks Submit → FormData:
  ├─ Phone: "0918260494"
  ├─ ImgData1: "data:image/jpeg;base64,..."
  ├─ Filename1: "photo1.jpg"
  ├─ ImgData2: "data:image/png;base64,..."
  └─ Filename2: "photo2.png"

POST /macros/s/[GAS_ID]/exec
  ↓
[GAS doPost] processes...
  ↓
Returns JSON { success: true, image-1: URL, image-2: URL }
```

**Dependencies**:
- Croppie v2.6.5 (CDN): Image crop UI
- intl-tel-input v20.3.0 (CDN): Phone formatting + VN default

### 2. Admin Panel

**Files**: `admin.html`, `assets/admin.{js,css}`

**Features**:
- **Search by Phone**: GET `?action=search&phone=...` → image grid
- **Browse by Date**: GET `?action=list&from=...&to=...` → day-grouped table
- **Copy ảnh + tin nhắn** (new): Composite montage → clipboard (image + text)

**JS Event Handlers**:
```javascript
searchPhotos(phone)
  → GET /exec?action=search&phone=phone
  → Parse response: { success, results: [...], count }
  → Render image grid (inline image display)

loadListByDateRange(from, to)
  → GET /exec?action=list&from=from&to=to
  → Group by Date
  → Render HTML table (upload timestamp, phone, image previews)

copyMessengerPairedMontage()
  → Lazy-fetch product catalog (GAS action=listProducts) + cache 5 min
  → Build 400×400 side-by-side montage [product thumb | customer thumb]
  → Canvas → PNG blob + text message → ClipboardItem
  → Fallback: direct thumb load → GAS imageProxy (base64 JSON) if tainted
  → Toast success or fallback message
```

### 3. Photo Naming Helper (Streamlit)

**File**: `app.py` (419 LOC)

**Session State**:
```python
st.session_state.df                # Parsed Excel + computed columns
st.session_state.manual_files      # { filename: { bytes, ext, md5 } }
st.session_state.gdrive_images     # [{ image-1, image-2, ... }]
st.session_state.mapping_data      # { order_key: { slot_idx: label } }
```

**Steps**:
1. **Upload Excel** → Parse, compute columns
2. **Select Order** → Filter by _order_key
3. **Fetch Images** → GAS search OR manual upload
4. **Map Slots** → Per-slot dropdowns (paginated if >50)
5. **Export ZIP** → Download renamed images + checklist

**Helper Functions**:
```python
normalize_phone(phone)      # → digits only
clean_sku(sku)             # → "XXX" or uppercase
safe_note(note)            # → sanitize, 35 char limit
expand_slots(df, order_key)# → [{ idx, suggested_name }]
fetch_images_from_gdrive() # → GET /exec?action=search&phone=X
download_image_from_url()  # → Extract Drive ID, download
build_export_excel()       # → openpyxl workbook
build_zip_for_order()      # → zipfile with renamed images
```

### 4. Delivery Date Calculator

**File**: `check-date.html` (509 LOC, inline CSS + JS)

**Logic** (pure client-side):
```
Input: Order date + time

Validation: if time >= 17:00 → next day

Production schedule: Fixed (Fri/Mon/Wed)
  └─ Find next batch date

Province offset:
  ├─ HCM: +2 days
  ├─ Hà Nội: +3 days
  ├─ Phú Quốc: +5 days
  ├─ Grab HCM: +1 day
  └─ Other: +3 days

Output: Ngày sản xuất + Ngày giao hàng
```

### 5. Google Apps Script Backend

**File**: `google-apps-script-complete.js` (393 LOC)

**Endpoints**:

| Method | URL | Handler |
|--------|-----|---------|
| POST | `/exec` | `doPost(e)` |
| GET | `/exec?action=search&phone=X` | `searchByPhone(X)` |
| GET | `/exec?action=list&from=X&to=Y` | `listByDateRange(X, Y)` |
| GET | `/exec?action=listProducts` | `listProducts()` |
| GET | `/exec?action=imageProxy&id=X&size=w600` | `imageProxy(X, size)` |

**doPost(e) Pipeline**:
```
1. Extract FormData (Phone, ImgData1/2, Filename1/2, extras)
2. Decode base64 → binary image
3. Acquire LockService (10s lock, prevent concurrent writes)
4. Upload to Drive → Get shareable URL
5. Append row to Sheet "form data"
6. Send email notification to crush@crushroom.vn
7. Release lock, return JSON
```

**searchByPhone(phone) Validation**:
```
1. Normalize: extract digits, validate 8-12 length
2. For each row in Sheet:
   a. Extract digits from Name column
   b. Check: valid length (8-12) AND non-digits ≤ 5
   c. Match: exact OR suffix (±3 country) OR prefix
   d. If match: add to results
3. Return JSON with matching rows
```

**listByDateRange(from, to)**:
```
1. Parse dates (YYYY-MM-DD format)
2. Filter rows where Date in [from, to]
3. Apply phone validation (same as searchByPhone)
4. Group by date
5. Return JSON with results grouped by day
```

**listProducts()**:
```
1. Read 'products' sheet (SKU, Name, ImagesPerUnit, ThumbnailUrl)
2. Return JSON array for frontend product picker
```

**imageProxy(id, size)**:
```
1. Fetch Drive file by id using DriveApp (script-owner credentials)
2. Check file parent folder is in allow-list (customer uploads or product images folder)
3. If blocked: return { success: false, error: 'forbidden' }
4. Get file.getThumbnail() — thumbnail-only, never full blob
5. Return { success: true, mime: type, base64: encoded_bytes }
6. Used by admin panel when direct <img crossOrigin> fails (canvas-taint fallback)
```

**Security**: Allow-list check in `isProxyAllowed_()` restricts imageProxy to two folder IDs only: `driveFolderId` (customer uploads) and `productImagesFolderId` (product images). Prevents arbitrary Drive enumeration.

### 6. Staff Homepage

**File**: `index.html` (90 LOC)

**Design**: B&W minimalist card grid

**Cards**:
- Check Photo (Admin) → admin.html
- Photo Naming Helper → Streamlit Cloud
- Check Date Tool → check-date.html
- QR Recording (disabled)
- Love Counter (disabled)

## Data Persistence

### Google Drive

**Role**: Image storage

**Folder**: Target folder (ID hardcoded in GAS script)

**Filename Format**: ISO-DATE_PHONE_FILENAME.ext (example: `2026-04-18_0918260494_photo1.jpg`)

**Access**: Public shareable URL (returned by GAS)

**URL Format**: `https://drive.google.com/file/d/[FILE_ID]/view`

**Thumbnail**: `https://drive.google.com/thumbnail?id=[FILE_ID]&sz=w200`

### Google Sheets ("form data")

**Role**: Transaction log

**Auto-created** on first upload (columns created dynamically)

**Schema**:
| Name | Phone | image-1 | image-2 | Date | Email | Message | (extras) |
|------|-------|---------|---------|------|-------|---------|----------|
| 0918260494 | 0918260494 | URL | URL | 2026-04-18 00:00:00 | ... | ... | ... |

**Indexing**: Date column (for range queries)

## Integration Points

### Streamlit ↔ GAS

**Request**:
```
GET /exec?action=search&phone=0918260494
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "Name": "0918260494",
      "image-1": "https://drive.google.com/file/d/...",
      "image-2": "https://drive.google.com/file/d/...",
      "Date": "2026-04-18"
    }
  ],
  "count": 1
}
```

**Streamlit Processing**:
```python
resp = requests.get(f"{GOOGLE_SCRIPT_URL}?action=search&phone={phone}")
data = resp.json()
if data.get("success"):
    st.session_state.gdrive_images = data.get("results", [])
```

### Admin Panel ↔ GAS (Search)

Same request/response as Streamlit.

**JS Processing**:
```javascript
fetch(gasUrl + '?action=search&phone=' + phone)
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      const gridHtml = data.results.map(result =>
        `<div><img src="${result['image-1']}" /></div>`
      ).join('');
      document.getElementById('images-grid').innerHTML = gridHtml;
    }
  });
```

### Admin Panel ↔ GAS (Product Catalog)

**Request**:
```
GET /exec?action=listProducts
```

**Response**:
```json
{
  "success": true,
  "products": [
    {"sku": "CPFE107807", "name": "Frame 1x1", "imagesPerUnit": 2, "thumbnailUrl": "https://drive.google.com/thumbnail?id=abc123&sz=w600"}
  ]
}
```

**Frontend Caching**: Memoized 5 min per session (refreshes mid-shift if new SKUs added to product sheet).

### Admin Panel ↔ GAS (Image Proxy Fallback)

**Request** (when direct thumbnail fails canvas-taint):
```
GET /exec?action=imageProxy&id=[DRIVE_ID]&size=w600
```

**Response** (CORS-safe base64):
```json
{
  "success": true,
  "mime": "image/jpeg",
  "base64": "..."
}
```

**Frontend Handling**: base64 → Uint8Array → Blob → blob URL → `<img src="blob:">` (same-origin, no CORS taint).

### Customer Upload ↔ GAS

**Request**:
```
POST /exec
Content-Type: multipart/form-data

Phone: 0918260494
ImgData1: data:image/jpeg;base64,...
Filename1: photo1.jpg
ImgData2: data:image/png;base64,...
Filename2: photo2.png
```

**Response**:
```json
{
  "success": true,
  "image-1": "https://drive.google.com/file/d/abc123/view",
  "image-2": "https://drive.google.com/file/d/def456/view"
}
```

## Deployment

| Component | Platform | Deploy Method |
|-----------|----------|---|
| **Streamlit app** | Streamlit Cloud | GitHub auto-deploy (push to app.py) |
| **Static frontend** | Vercel | Git push, vercel.json routing |
| **GAS backend** | Google Apps Script | Manual Editor deploy |

**DNS**:
- `crushroomapp.streamlit.app` → Streamlit app
- `crushroom-form.vercel.app` → Vercel (static + routing)
- `script.google.com/macros/s/[ID]/exec` → GAS endpoint

## Unresolved Questions

- How to rotate GAS endpoint URL (hardcoded in 4 places)?
- Rate limiting / throttling for GAS queries?
- Disaster recovery if Drive quota exceeded?
- Annual archival strategy for old Sheet rows?
- Should GAS deployment be automated via CI/CD?

