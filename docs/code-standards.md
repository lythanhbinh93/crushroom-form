# Code Standards & Codebase Structure

**Project**: CouplePix (crushroom-form)  
**Last Updated**: 2026-04-18  
**Applies To**: All code in crushroom-form

## Overview

Code standards for CouplePix: Python (Streamlit app), JavaScript (client-side), Google Apps Script (backend), HTML/CSS (templates), and Shopify Liquid.

## Core Principles

**YAGNI**: Implement only when needed. No database, no auth, rely on URL obscurity.  
**KISS**: Straightforward solutions. Python helpers, vanilla JS, semantic HTML.  
**DRY**: Extract common logic (phone normalization, SKU cleaning, note sanitization).

## File Organization

```
crushroom-form/
├── app.py                              (419 LOC)  Streamlit app
├── google-apps-script-complete.js      (347 LOC)  GAS backend
├── [index|admin|couplepix|check-date].html       HTML templates
├── templates/couplepix.liquid                     Shopify variant
├── assets/                                        CSS + JS
├── docs/                                          Documentation
└── plans/                                         Development plans
```

## Naming Conventions

### Python (app.py)

**Functions**: `snake_case`
```python
def normalize_phone(phone: str) -> str
def clean_sku(sku: str) -> str
def expand_slots(df: pd.DataFrame, order_key: str) -> List[Dict]
```

**Variables**: `snake_case`
```python
uploaded_excel = st.file_uploader(...)
order_data = df[df["_order_key"] == selected_order]
```

**Constants**: `UPPER_SNAKE_CASE`
```python
GOOGLE_SCRIPT_URL = "https://script.google.com/..."
MAX_NOTE_LENGTH = 35
```

**Computed columns**: Prefix with `_`
```python
df["_phone_digits"] = df["Số điện thoại"].apply(normalize_phone)
df["_last4"] = ...
df["_sku"] = ...
df["_need_photo"] = ...
```

### JavaScript (assets/*.js, check-date.html inline)

**Functions**: `camelCase`
```javascript
function searchPhotos(phone) {}
const setupDropzone = (imageNum) => {}
```

**Variables**: `camelCase`
```javascript
const phoneInput = document.getElementById('phone-search');
let selectedImages = {};
```

**Constants**: `UPPER_SNAKE_CASE`
```javascript
const MAX_FILE_SIZE = 10485760; // 10 MB
const GAS_ENDPOINT = "https://script.google.com/...";
```

**IDs/Classes**: `kebab-case`
```html
<div id="phone-search" class="search-box"></div>
<button class="btn-primary"></button>
```

### HTML/CSS

**File names**: `kebab-case`
```
home.css, admin.css, couple-pix.css, couple-pix.js, admin.js
```

**IDs**: `kebab-case`
```html
<div id="loading"></div>
<div id="images-grid"></div>
<input type="date" id="date-from">
```

**Classes**: `kebab-case` (BEM optional)
```css
.tool-card { }
.card-icon { }
.card-title { }
.btn-primary { }
.search-box { }
```

### Google Apps Script

**Functions**: `camelCase`
```javascript
function doPost(e) {}
function searchByPhone(phone) {}
function listByDateRange(fromStr, toStr) {}
```

**Variables**: `camelCase`
```javascript
const sheetName = 'form data';
const recipientEmail = 'crush@crushroom.vn';
```

## Code Style

### Python

- **Indentation**: 2 spaces (Streamlit convention)
- **Line length**: 100 chars
- **Type hints**: Optional but encouraged
  ```python
  def normalize_phone(phone: str) -> str:
  def expand_slots(df: pd.DataFrame, order_key: str) -> List[Dict]:
  ```
- **Docstrings**: For public functions
  ```python
  def clean_sku(sku: str) -> str:
      """Extract SKU code after 'COUPLEPIX-' prefix, or uppercase."""
  ```
- **Comments**: Explain WHY not WHAT
  ```python
  # Chỉ giữ lại các ảnh từ đơn này, loại bỏ các dòng đặt hàng khác
  order_rows = df[df["_order_key"] == order_key]
  ```

### JavaScript

- **Indentation**: 2 spaces
- **Line length**: 100 chars
- **Semicolons**: Use them
- **Quotes**: Double quotes for HTML/CSS (CSS in JS single quotes OK)
- **Functions**: Use modern syntax
  ```javascript
  // Prefer arrow for callbacks
  const searchPhotos = (phone) => { ... }
  
  // OK for declarations
  function calculateDate(date) { ... }
  ```
- **Error handling**: Try-catch with logging
  ```javascript
  try {
    const response = await fetch(gasUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error('Search failed:', error);
    showError('Tìm kiếm thất bại. Vui lòng thử lại.');
  }
  ```

### HTML

- **Semantic tags**: Use `<header>`, `<main>`, `<article>`, `<footer>`
- **Data attributes**: For JS hooks
  ```html
  <input id="phone-search" data-action="search" type="text">
  ```
- **Inline styles**: Only for dynamic values; use CSS for static
- **Comments**: Mark sections
  ```html
  <!-- ========== SEARCH SECTION ========== -->
  <div class="search-section">...</div>
  ```

### CSS

- **Organization**: Top to bottom (general → specific)
- **Selectors**: Prefer classes over IDs
- **Responsive**: Mobile-first
  ```css
  .container {
    /* Base mobile styles */
  }
  @media (min-width: 768px) {
    .container { /* Tablet+ */ }
  }
  ```
- **Naming**: BEM for complex components
  ```css
  .card { }
  .card__title { }
  .card--disabled { }
  ```
- **Variables**: CSS custom properties
  ```css
  :root {
    --color-primary: #667eea;
    --color-secondary: #764ba2;
    --spacing-unit: 8px;
  }
  ```

## Security Standards

### Data Validation

**Phone numbers** (app.py):
```python
def normalize_phone(phone: str) -> str:
    if pd.isna(phone):
        return ""
    return re.sub(r"\D", "", str(phone))  # Only digits
```

**SKU parsing** (app.py):
```python
def clean_sku(sku: str) -> str:
    if pd.isna(sku):
        return ""
    sku_str = str(sku).strip()
    if "COUPLEPIX-" in sku_str.upper():
        parts = sku_str.upper().split("COUPLEPIX-")
        if len(parts) > 1 and parts[1]:
            return parts[1].split()[0]  # Stop at space
    return sku_str.upper().replace(" ", "")
```

**GAS phone normalization** (google-apps-script-complete.js):
```javascript
function normalizeVNPhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 11 && digits.length <= 12 && digits.indexOf('84') === 0) {
    digits = digits.slice(2);  // Strip country code 84
  }
  if (digits.length === 9 && /^[3-9]/.test(digits)) digits = '0' + digits;
  return digits;
}
```
Applied at write-time (doPost, image-1/2 filenames). Handles intl format (`+84 96...` → `0963...`) and raw 11-12 digit country codes.

**GAS search validation** (google-apps-script-complete.js):
- Validate phone length: 8–12 digits
- Reject rows with >5 non-digit chars (likely notes, not phones)
- Match exact, suffix, or prefix (±3 country code)

### Input Sanitization

**Note sanitization** (app.py):
```python
def safe_note(note: str, max_length: int = 35) -> str:
    """Remove special chars, keep Vietnamese."""
    if pd.isna(note) or not note:
        return ""
    # Remove / \ : and special chars, allow Vietnamese
    note_str = re.sub(r"[^\w\s\-...Vietnamese chars...]", "", note_str)
    return note_str.replace(" ", "")[:max_length]
```

### No Secrets in Code

- GAS endpoint URL: OK to hardcode (public-ish)
- Spreadsheet ID: Stored in PropertiesService, not code
- Drive folder ID: Hardcoded (acceptable for internal tool)
- Mail recipient: Hardcoded (internal tool only)

## Error Handling

### Python (Streamlit)

```python
try:
    df = pd.read_excel(uploaded_file)
    # Process
except Exception as e:
    st.error(f"Lỗi: {str(e)}")
    st.stop()
```

### JavaScript (Frontend)

```javascript
try {
    const response = await fetch(gasUrl);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.success) {
        showError(data.error || 'Yêu cầu thất bại');
        return;
    }
    // Process
} catch (error) {
    console.error('Error:', error);
    showError('Có lỗi xảy ra. Vui lòng thử lại.');
}
```

### GAS

```javascript
function doGet(e) {
    try {
        const action = e.parameter.action;
        if (action === 'search' && e.parameter.phone) {
            return searchByPhone(e.parameter.phone);
        }
        // ...
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ 'success': false, 'error': error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
```

## Git Standards

### Commit Messages

**Format**: Conventional Commits
```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Test additions
- `chore`: Maintenance (not .claude/** files)

**Examples**:
```
feat(app): add pagination for photo slots

Improves UI for orders with 50+ photos.
Per-page options: 10, 20, 30, 50, 100.

fix(admin): validate phone length in search

Allow 8–12 digits; reject rows with >5 non-digits.

docs: update deployment guide for GAS webhook
```

**Rules**:
- Imperative mood, lowercase, no period
- Max 72 chars subject
- No AI attribution

### Branch Naming

```
feature/[name]     feature/date-range-browse
fix/[name]         fix/phone-validation
docs/[name]        docs/deployment-guide
```

## File Size Limits

- **Python files**: <500 LOC (app.py is 419, OK)
- **JS files**: <500 LOC
- **HTML files**: <600 LOC (check-date.html is 509, inline CSS/JS acceptable)
- **CSS files**: <800 LOC (admin.css is 796, refactor if exceeds)

When approaching limits:
1. Extract utility functions to separate file
2. Split CSS into logical modules
3. Move inline JS to external files

## Testing (Future)

When tests are added:
- Unit tests for data processing (normalize_phone, clean_sku, etc.)
- Integration tests for GAS API responses
- E2E tests for critical workflows (upload → ZIP download)
- Fixtures for sample Excel data, GAS responses

## Documentation Standards

### Code Comments

**When to comment**:
- Complex business logic (e.g., slot expansion formula)
- Non-obvious optimizations (e.g., MD5 check to avoid re-uploading)
- Configuration values with rationale
- Vietnamese text in English codebase

**When NOT to comment**:
- Self-documenting function names
- Simple variable assignments
- Obvious loops/conditionals

### Markdown Documentation

- Use `.md` extension
- Keep files <800 LOC (split if larger)
- Include: Purpose, Features, Architecture, Examples
- Link to related docs

## Vietnamese Localization

- All UI text: Vietnamese
- Code comments: Vietnamese OK (matches context)
- Variable/function names: English (cross-project standard)
- Commit messages: English (convention)

Example:
```python
def safe_note(note: str, max_length: int = 35) -> str:
    """Xóa các ký tự đặc biệt, giữ lại Tiếng Việt."""
    # Xóa / \ : và ký tự không hợp lệ
    note_str = re.sub(r"[^\w\s\-...Vietnamese chars...]", "", note_str)
    return note_str.replace(" ", "")[:max_length]
```

## Unresolved Questions

- Should there be type hints enforcement (mypy for Python)?
- CSS preprocessor needed (SASS) or CSS variables sufficient?
- When should code be refactored into classes vs. function-based?

