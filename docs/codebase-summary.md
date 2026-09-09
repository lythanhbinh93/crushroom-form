# Codebase Summary

**Project**: CouplePix (crushroom-form)  
**Last Updated**: 2026-04-20  
**Repository**: github.com/lythanhbinh93/crushroom-form

## Directory Structure

```
crushroom-form/
├── app.py                                    (419 LOC) Streamlit Photo Naming Helper
├── google-apps-script-complete.js            (393 LOC) GAS backend: upload, search, list, imageProxy
├── google-apps-script-voice.js               (531 LOC) GAS backend: Voice Gift (separate project)
├── index.html                                (90 LOC)  Staff homepage (B&W minimalist)
├── admin.html                                (116 LOC) Admin image viewer + date-range browse
├── couplepix.html                            (194 LOC) Customer upload + crop form
├── voice-upload.html                         (TBD)    Voice gift customer upload form
├── voice.html                                (TBD)    Voice gift public recipient page (WaveSurfer)
├── check-date.html                           (509 LOC) Delivery date calculator (inline CSS/JS)
├── vercel.json                               (20 LOC)  Static route config
├── templates/
│   └── couplepix.liquid                      (213 LOC) Shopify theme variant
├── assets/
│   ├── home.css                              (100 LOC) Index page styling (B&W)
│   ├── admin.css                             (818 LOC) Admin panel styling + copy-button spinner
│   ├── admin.js                              (775 LOC) Admin search + paired-montage clipboard copy
│   ├── admin-voice-tab.js                    (TBD)    Voice tab controller (QR, publish, archive)
│   ├── couple-pix.css                        (530 LOC) Upload form styling
│   ├── couple-pix.js                         (461 LOC) Upload form logic (Croppie integration)
│   ├── voice-upload.css                      (TBD)    Voice upload form styling
│   ├── voice-upload.js                       (TBD)    Voice upload form logic + file validation
│   ├── voice-page.css                        (TBD)    Voice recipient page styling (dark theme)
│   ├── voice-page.js                         (TBD)    Voice recipient page logic (WaveSurfer integration)
│   ├── croppie.css                           (CDN)    Unused locally; loaded from CDN
│   └── croppie.min.js                        (CDN)    Unused locally; loaded from CDN
├── .claude/                                  Project orchestration (agent configs, rules)
├── docs/                                     Documentation (this file + standards, architecture, roadmap)
├── plans/                                    Development plans and reports
├── requirements.txt                          Python dependencies
├── DEPLOY.md                                 Deployment guide (root)
├── README.md                                 Vietnamese user guide (extended)
└── CLAUDE.md                                 Claude Code project instructions
```

### File Counts

| Category | Count | Notes |
|----------|-------|-------|
| Python | 1 | app.py only |
| JavaScript (client) | 7 | admin.js, couple-pix.js, admin-voice-tab.js, voice-upload.js, voice-page.js, check-date.html (inline) |
| Google Apps Script | 2 | google-apps-script-complete.js, google-apps-script-voice.js (separate project) |
| HTML | 6 | index, admin, couplepix, voice-upload, voice, check-date |
| CSS | 6 | home.css, admin.css, couple-pix.css, voice-upload.css, voice-page.css, check-date.html (inline) |
| Markdown (docs) | 7 | project-overview-pdr, codebase-summary, code-standards, system-architecture, project-roadmap, deployment-guide, design-guidelines |
| Config | 3 | vercel.json, requirements.txt, CLAUDE.md |

## Component Descriptions

### 1. Streamlit App (`app.py`)

**Purpose**: Batch photo renaming for factory orders  
**Entry Point**: `https://crushroomapp.streamlit.app/`  
**Platform**: Streamlit Community Cloud (auto-deploys from GitHub)

**Key Functions**:
- `normalize_phone()` — Extract digits, strip + chars
- `clean_sku()` — Parse "COUPLEPIX-XXX" → "XXX"; uppercase others
- `safe_note()` — Sanitize Vietnamese text for filenames (35 char limit)
- `expand_slots()` — Qty × images/unit → list of slot dicts
- `fetch_images_from_gdrive()` — GET GAS `?action=search&phone=...` → image URLs
- `download_image_from_url()` — Extract Drive file ID, download via export URL
- `build_export_excel()` — Create openpyxl workbook with raw_data + order summary sheets
- `build_zip_for_order()` — Zip renamed images + checklist.xlsx

**Session State Keys**:
- `df` — Parsed Excel data with computed columns
- `manual_files` — `{filename: {"bytes": b"...", "ext": ".jpg", "md5": "..."}, ...}`
- `gdrive_images` — List of dicts from GAS search response
- `mapping_data` — `{order_key: {slot_idx: selected_label}, ...}`

**Dependencies**: streamlit>=1.31, pandas>=2.2, openpyxl>=3.1.2, Pillow>=10.3, requests>=2.31

**Workflow**:
1. Upload orders-check.xlsx
2. Select order → compute slots
3. Fetch images from Drive OR upload manually
4. Map images to slots (paginated form)
5. Download ZIP (renamed images + checklist)

### 2. Google Apps Script (`google-apps-script-complete.js`)

**Purpose**: Backend for photo uploads, admin searches, product catalog, and image proxy  
**Deployment**: Apps Script Web App (manual deploy via Editor)  
**Endpoint**: `https://script.google.com/macros/s/[SCRIPT_ID]/exec`

**Key Functions**:
- `doPost(e)` — Receive FormData from couplepix upload; decode base64; upload to Drive; log to Sheet; email notification
- `doGet(e)` — Route `?action=search&phone=...` → `searchByPhone()` or `?action=list&from=...&to=...` → `listByDateRange()` or `?action=listProducts` or `?action=imageProxy`
- `searchByPhone(phone)` — Strict phone validation (8–12 digits, max 5 non-digit chars); match exact/suffix/prefix; return matching rows as JSON
- `listByDateRange(from, to)` — Date range filter; return grouped by day; apply phone validation
- `listProducts()` — Read 'products' sheet; return catalog (SKU, Name, ImagesPerUnit, ThumbnailUrl) for admin panel
- `imageProxy(id, size)` — Fetch Drive image by ID server-side, return base64 JSON (CORS-safe fallback for canvas-taint)
- `isProxyAllowed_(file)` — Security check: allow-list file parent folder to customer-uploads and product-images only

**Google Services**: SpreadsheetApp, DriveApp, MailApp, ContentService, Utilities, PropertiesService, LockService, UrlFetchApp

**Config** (in script):
- `sheetName = 'form data'` — Log sheet name
- `productsSheetName = 'products'` — Product catalog sheet
- `driveFolderId` — Customer upload folder ID
- `productImagesFolderId` — Product images folder ID (REQUIRED for imageProxy; if empty, imageProxy blocks all product requests)
- `recipientEmail = 'crush@crushroom.vn'` — Mail notification
- `scriptProp.getProperty('key')` — Spreadsheet ID (set via `intialSetup()`)

**Security**: 10s LockService lock during upload (prevent concurrent writes)

### 3. Staff Homepage (`index.html` + `assets/home.css`)

**Purpose**: Navigation hub for all tools  
**Design**: B&W minimalist (card grid)  
**Links**:
- Admin Panel → `./admin.html`
- Photo Naming Helper → https://crushroomapp.streamlit.app/
- Check Date Tool → `./check-date.html`
- QR Recording (disabled) → TBD
- Love Counter (disabled) → TBD

### 4. Admin Panel (`admin.html` + `assets/admin.css` + `assets/admin.js`)

**Purpose**: Search & browse customer-uploaded images; copy paired montage to Messenger  
**Design**: Gradient purple (#667eea → #764ba2)

**Features**:
- **Search by Phone**: Input phone → GAS `?action=search&phone=...` → display image grid
- **Browse by Date Range**: Select from/to dates → GAS `?action=list&from=...&to=...` → display by day table
- **Copy ảnh + tin nhắn** (NEW): Build montage of product + customer image pairs → ClipboardItem (image/png + text/plain)

**JS Logic** (`admin.js`):
- `searchPhotos(phone)` — Fetch, validate response, render grid
- `loadListByDateRange(from, to)` — Fetch, group by date, render table
- `loadProductCatalog()` — GAS `?action=listProducts`, cache 5 min, memoize
- `buildPairedMontage(items, productMap)` — 400×400 side-by-side grid [product thumb | customer thumb]; canvas → PNG blob
- `buildDriveThumbUrl(id, size)` — Construct `lh3.googleusercontent.com/d/{id}=w{size}` URL (CORS-stable)
- `loadThumbDirect(id, size)` — <img crossOrigin="anonymous"> loader
- `loadThumbViaProxy(id, size)` — GAS imageProxy fallback (base64 JSON → Blob → blob URL)
- `writeImageAndText(blob, text)` — navigator.clipboard.write(ClipboardItem) with image/png + text/plain MIME types
- Event listeners for search btn, date-range btn, copy btn, Enter key

### 5. Customer Upload Form (`couplepix.html` + `assets/couple-pix.css` + `assets/couple-pix.js`)

**Purpose**: Customer-facing photo upload + crop (Shopify-embedded)  
**Design**: Form-styled grays  
**Dependencies**: intl-tel-input v20.3.0, Croppie v2.6.5 (both CDN)

**Features**:
- Phone input with VN country code default
- Dual dropzones (image-1, image-2)
- Croppie crop modal per image
- GET aspect ratio from query param (`?aspect=3/2`)
- POST FormData (ImgData1, ImgData2 base64, Filename1/2, phone, etc.) to GAS

**JS Logic** (`couple-pix.js`):
- `initTelInput()` — Setup intl-tel-input with VN default
- `setupDropzone(imageNum)` — File selection, preview
- `openCropModal(imageNum)` — Croppie instance, crop overlay
- `submitForm()` — Base64 encode crops, POST to GAS endpoint

### 6. Delivery Date Calculator (`check-date.html`)

**Purpose**: Real-time delivery date quote for customer inquiries  
**Design**: B&W minimalist (inline CSS/JS)  
**Logic**: Pure client-side (no backend call)

**Features**:
- Input: Order date + time
- Validation: After 17:00 = next day
- Production batches: Friday / Monday / Wednesday (fixed schedule)
- Delivery offsets by province:
  - HCM: +2 days
  - Hà Nội: +3 days
  - Phú Quốc: +5 days
  - Grab HCM: +1 day
  - Others: +3 days (default)
- Output: Production ready date, customer receive date

**JS Logic** (inline):
- `calculateDeliveryDate()` — Parse input, apply 17:00 cutoff, find next batch, apply offset
- Special holiday handling (e.g., Lunar New Year)

### 7. Voice Gift System (GAS + HTML/JS/CSS)

**Purpose**: Customers upload voice message + image + text → staff publishes → QR-linkable public page  
**Platform**: Standalone GAS project (separate from main backend) + Vercel static pages  
**Deployment**: Manual GAS deploy; Vercel auto-deploys HTML/JS/CSS

**Backend** (`google-apps-script-voice.js`):
- **Endpoints** (6 total):
  - `finishUpload` (POST) — Save base64 audio + image to Drive, append row (status=pending)
  - `listVoice` (GET) — Filter voice_pages sheet by status (pending/published/archived)
  - `publishVoice` (POST) — Generate 8-char slug, set status=published, return URL
  - `getVoice` (GET) — Public lookup by slug, return data for recipient page
  - `archiveVoice` (POST) — Toggle status between archived ↔ pending
  - `audioProxy` (GET) — Proxy Drive audio as base64 JSON (CORP bypass)
- **Data Model**:
  - Sheet `voice_pages`: phone | order_id | status | slug | audio_id | image_id | message_text | uploaded_at | published_at | url
  - Drive folders: VOICE_AUDIO_FOLDER_ID, VOICE_IMAGE_FOLDER_ID

**Customer Upload** (`voice-upload.html` + `assets/voice-upload.{js,css}`):
- Phone + order_id (optional prefills from URL params)
- File input: MP3/M4A/AAC (validation, 35 MB client-side cap)
- Image upload: auto-crop to 1200×1200 JPEG q0.85 — the stored crop is the only copy, and the gift pages request `sz=w1200` to match (Drive never upscales)
- Text message: max 1000 chars
- Single POST base64 to GAS finishUpload

**Public Recipient Page** (`voice.html` + `assets/voice-page.{js,css}`):
- URL: `https://qr.crushroom.vn/voice?id=SLUG`
- Renders: customer image + message text + WaveSurfer audio player (dark theme)
- Audio playback via GAS audioProxy (Drive CORP policy workaround)

**Admin Voice Tab** (`assets/admin-voice-tab.js`):
- List pending voice submissions
- Preview audio (player) + image + text
- Publish button → generate slug + QR (via qr-code-styling lib)
- Copy QR to clipboard (ClipboardItem with image/png)
- Archive button → toggle status

**Security**: Allow-list folder IDs (VOICE_AUDIO_FOLDER_ID, VOICE_IMAGE_FOLDER_ID) in audioProxy; GAS "Execute as Me" for DriveApp access.

### 8. Shopify Liquid Template (`templates/couplepix.liquid`)

**Purpose**: Shopify theme-embedded version of couplepix.html  
**Differences**: Uses Liquid asset URLs (`asset_url | stylesheet_tag`)  
**Deployment**: Copy into Shopify theme assets/

## Entry Points by Surface

| Surface | URL | File | Tech |
|---------|-----|------|------|
| **Customer (Shopify)** | `https://store.myshopify.com/pages/couplepix` | couplepix.liquid | Liquid (Shopify) |
| **Customer (Photo Upload)** | `https://admin.crushroom.vn/couplepix` | couplepix.html | HTML5 + JS |
| **Customer (Voice Upload)** | `https://qr.crushroom.vn/voice-upload?phone=X&order=Y` | voice-upload.html | HTML5 + JS |
| **Recipient (Voice Page)** | `https://qr.crushroom.vn/voice?id=SLUG` | voice.html | HTML5 + JS + WaveSurfer |
| **Staff (Homepage)** | `https://admin.crushroom.vn/` | index.html | HTML5 + CSS |
| **Staff (Admin)** | `https://admin.crushroom.vn/admin` (+ #voice tab) | admin.html + admin-voice-tab.js | HTML5 + JS |
| **Staff (Photo Helper)** | `https://crushroomapp.streamlit.app/` | app.py | Streamlit |
| **Staff (Date Calc)** | `https://admin.crushroom.vn/check-date` | check-date.html | HTML5 + JS |
| **Backend (Main)** | `https://script.google.com/macros/s/.../exec` | google-apps-script-complete.js | GAS |
| **Backend (Voice)** | `https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6.../exec` | google-apps-script-voice.js | GAS |

## Data Structures

### Excel Input (orders-check.xlsx)

**Required Columns** (exact names):
| Column | Type | Example |
|--------|------|---------|
| Mã mẫu mã | string | COUPLEPIX-DCW |
| Số điện thoại | string/int | 0918260494 |
| Mã đơn hàng | string | ORD-001 |
| Mã đơn hàng đầy đủ | string | ORD-001-FULL |
| Sản phẩm | string | Khung ảnh gỗ 20x30 |
| Ghi chú để in | string | Yêu nhau mãi mãi |
| Ghi chú nội bộ | string | Note for staff |
| Số lượng | int | 2 |
| Loại | string | Khắc OR Chiếu ảnh |

**Computed Columns**:
- `_phone_digits` — Digits only (e.g., "918260494")
- `_last4` — Last 4 digits, zero-padded
- `_sku` — Cleaned SKU
- `_yy` — Sanitized note (35 char max)
- `_need_photo` — Boolean (heuristic: keyword match or SKU starts with COUPLEPIX)
- `_qty` — Quantity as int
- `_img_per_unit` — 1 or 2 (2 if SKU starts with COUPLEPIX, else 1)
- `_order_key` — Full order code (or fallback to order ID)

### GAS Sheet Schema (form data)

**Columns** (auto-created on first upload):
| Column | Type | Notes |
|--------|------|-------|
| Name | string | Customer phone (from POST body) |
| Phone | string | Full phone (from POST body) |
| image-1 | string | Google Drive URL of image 1 |
| image-2 | string | Google Drive URL of image 2 |
| Date | date | Timestamp of upload |
| Email | string | Email field (if provided) |
| Message | string | Custom message (if provided) |
| (others) | mixed | Any extra FormData fields |

### ZIP Export Structure

```
{order_key}_FULL.zip
├── {order_key}/
│   ├── 1. 1234_DCW_GhichuA.jpg
│   ├── 2. 1234_DCW_GhichuA.jpg
│   ├── 3. 5678_CP123_GhichuB.png
│   └── ...
└── Checklist_{order_key}.xlsx
    ├── Sheet 1 (raw_data): Full order rows + computed columns
    └── Sheet 2 (order): Summary (order_id, phone, total_qty, photo_rows, etc.)
```

## Unresolved Questions

- Are local croppie.css/croppie.min.js files used, or always CDN?
- What is the exact Drive folder ID (currently hardcoded)?
- Is there a disaster recovery / backup plan for Google Drive quota?
- How are old sheets archived (annual rotation)?
- **Semantic Versioning**: Automated version management
- **Conventional Commits**: Structured commit messages

## Key Components

### 1. Agent Orchestration System (14 Agents)

**Claude Code Agents** (`.claude/agents/`):
- `planner.md` - Technical planning and architecture (Opus model)
- `researcher.md` - Research and analysis
- `fullstack-developer.md` - Full-stack implementation
- `code-reviewer.md` - Code quality assessment
- `tester.md` - Testing and validation
- `debugger.md` - Issue analysis and debugging
- `docs-manager.md` - Documentation management (Gemini model)
- `git-manager.md` - Version control operations
- `journal-writer.md` - Development journaling
- `brainstormer.md` - Solution ideation
- `project-manager.md` - Project tracking
- `ui-ux-designer.md` - UI/UX design
- `mcp-manager.md` - MCP server management
- `code-simplifier.md` - Code optimization and simplification

### 2. Slash Commands System (Skill-Backed)

**Core Development Commands**:
- `/ck:plan` - Research and planning
- `/ck:cook` - Feature implementation
- `/ck:test` - Test execution
- `/ck:ask` - Technical consultation
- `/ck:bootstrap` - Project initialization
- `/ck:brainstorm` - Solution ideation
- `/ck:debug` - Issue debugging
- `/ck:fix` - Bug fixes

**Skill Directories** (`.claude/skills/`):
- `bootstrap/` - Project initialization workflows
- `docs/` - Documentation workflows
- `plan/` - Planning variants
- `code-review/` - Code review workflows
- `test/` - Testing workflows

### 3. Skills Library (38 Skills)

**Phase 1 Organized Groups** (Progressive Disclosure):
- **DevOps** (`devops/`) - Cloudflare (5 skills), Docker, Google Cloud Platform
  - 11 references, 2 Python utilities, 45 tests
- **Databases** (`databases/`) - MongoDB, PostgreSQL
  - 8 references, 3 Python utilities
- **Web Frameworks** (`web-frameworks/`) - Next.js, Turborepo, RemixIcon
  - 7 references, 2 Python utilities
- **UI Styling** (`ui-styling/`) - shadcn/ui, Tailwind CSS, canvas-design
  - 7 references, 2 Python utilities

**Current Skills** (47+ Total):
- ai-artist, ai-multimodal, agent-browser, backend-development, better-auth
- brainstorm, chrome-devtools, code-review, common, context-engineering
- cook, copywriting, databases, debug, devops
- docs-seeker, document-skills, find-skills, frontend-design, frontend-development
- git, gkg, google-adk-python, markdown-novel-viewer, mcp-builder
- mcp-management, media-processing, mermaidjs-v11, mobile-development, payment-integration
- plan, plans-kanban, problem-solving, react-best-practices, remotion
- repomix, research, scout, sequential-thinking, shader
- shopify, skill-creator, template-skill, threejs, ui-styling
- ui-ux-pro-max, web-design-guidelines, web-frameworks, web-testing

### 4. Hook System (9+ Core Hooks)

**Location**: `.claude/hooks/`

**Core Hooks:**

1. **session-init.cjs** - Session Initialization
   - Detects project type (monorepo/library)
   - Identifies package manager (pnpm/npm/yarn)
   - Detects framework (Next/React/etc)
   - Writes 25+ environment variables for context cascade

2. **dev-rules-reminder.cjs** - Development Context Injection
   - Injects dev rules & context on every prompt
   - Smart deduplication prevents redundancy
   - Provides branch-matched workflow suggestions
   - Optimized for token efficiency

3. **subagent-init.cjs** - Subagent Context Injection
   - Injects compact context (~200 tokens) when spawning subagents
   - Minimizes token overhead during delegation
   - Enables efficient agent-to-agent communication

4. **scout-block.cjs** - Cross-Platform Performance Optimization
   - Blocks access to heavy directories (node_modules, .git, __pycache__, dist/, build/)
   - Pure Node.js implementation (`scout-block.cjs`) — cross-platform
   - Modular internals: `scout-block/` (pattern-matcher, path-extractor, error-formatter, broad-pattern-detector)
   - Improves AI response time and token efficiency

5. **session-state.cjs** - Session State Persistence
   - Persists session progress across sessions and context compactions
   - Refreshes cached statusline activity on task/todo `PostToolUse` events
   - Finalizes and archives session state on `Stop`, appends subagent results on `SubagentStop`
   - Archives old states with rotation (keeps 5)
   - Extracts todos, modified files, branch, and plan info
   - 7-day auto-expiry, atomic writes, fail-safe
   - Startup and post-compaction recovery messaging is handled by `session-init.cjs`

6. **privacy-block.cjs** - Sensitive File Access Control
7. **descriptive-name.cjs** - Naming conventions enforcement
8. **post-edit-simplify-reminder.cjs** - Post-edit optimization hints
9. **usage-context-awareness.cjs** - Gated prompt-awareness wrapper for usage-based injection
10. **usage-quota-cache-refresh.cjs** - Cosmetic 5h / wk cache warmer for the statusline

**Hook Features:**
- Fail-Safe: All hooks exit 0 (non-blocking) - graceful degradation
- Performance: Optimized token consumption
- Cross-Platform: Windows (PowerShell) & Unix (Bash) via Node.js dispatcher
- Comprehensive Test Coverage: scout-block hook validated via Node.js test suite

### 5. Workflows

**Primary Workflows** (`.claude/rules/`):
1. **primary-workflow.md**: Core development cycle
   - Code implementation
   - Testing
   - Code quality
   - Integration
   - Debugging

2. **orchestration-protocol.md**: Agent coordination patterns
   - Sequential chaining
   - Parallel execution

3. **development-rules.md**: Development standards
   - File size management (<500 lines)
   - YAGNI, KISS, DRY principles
   - Code quality guidelines
   - Pre-commit/push rules

4. **documentation-management.md**: Doc maintenance
   - Roadmap and changelog updates
   - Automatic update triggers
   - Documentation protocols

## Entry Points

### For Users
- **README.md**: Project overview and quick start
- **guide/SKILLS.md**: Comprehensive skills reference (7,073 tokens)
- **CLAUDE.md**: Development instructions and workflows

### For Developers
- **package.json**: Dependencies and scripts
- **.releaserc.json**: Semantic release configuration
- **.commitlintrc.json**: Commit message linting rules
- **.gitignore**: Version control exclusions

### For Agents
- **CLAUDE.md**: Primary agent instructions
- **.claude/rules/**: Development rules and protocols
- **plans/templates/**: Implementation plan templates

## Development Principles

### YAGNI (You Aren't Gonna Need It)
Avoid over-engineering and unnecessary features

### KISS (Keep It Simple, Stupid)
Prefer simple, straightforward solutions

### DRY (Don't Repeat Yourself)
Eliminate code duplication

### File Size Management
- Keep files under 500 lines
- Split large files into focused components
- Extract utilities into separate modules

### Security First
- Try-catch error handling
- Security standards coverage
- No secrets in commits
- Confidential info protection

## Agent Communication Protocol

**Report Format**: Markdown files in `./plans/<plan-name>/reports/`
**Naming Convention**: `{date}-from-[agent]-to-[agent]-[task]-report.md`

**Communication Patterns**:
- Sequential: Task dependencies require ordered execution
- Parallel: Independent tasks run simultaneously
- Query Fan-Out: Multiple researchers explore different approaches

## Git Workflow

**Commit Message Format**: Conventional Commits
```
type(scope): description

Types:
- feat: Features (minor bump)
- fix: Bug fixes (patch bump)
- docs: Documentation (patch bump)
- refactor: Code refactoring (patch bump)
- test: Tests (patch bump)
- ci: CI changes (patch bump)
- BREAKING CHANGE: Major version bump
```

**Automated Release**:
- Every push to `main` triggers release check
- Semantic versioning (MAJOR.MINOR.PATCH)
- Automated changelog generation
- GitHub releases with generated notes

## Testing Strategy

- Comprehensive unit tests required
- High code coverage mandatory
- Error scenario testing
- Performance validation
- Tests must pass before push
- No ignoring failed tests

## Documentation Standards

**Required Docs** (`./docs/`):
- `project-overview-pdr.md` - Project overview and PDR
- `code-standards.md` - Coding standards and structure
- `codebase-summary.md` - This file
- `system-architecture.md` - Architecture documentation
- `project-roadmap.md` - Development roadmap
- `project-changelog.md` - Detailed changelog
- `statusline-windows-support.md` - Windows statusline setup guide
- `statusline-architecture.md` - Technical statusline implementation

**Documentation Triggers**:
- Feature implementation completion
- Major milestone achievements
- Bug fixes
- Security updates
- Weekly reviews

## Dependencies Overview

### Production Dependencies
None (template project)

### Development Dependencies
- **@commitlint/cli**: ^18.4.3
- **@commitlint/config-conventional**: ^18.4.3
- **@semantic-release/changelog**: ^6.0.3
- **@semantic-release/commit-analyzer**: ^11.1.0
- **@semantic-release/git**: ^10.0.1
- **@semantic-release/github**: ^9.2.6
- **@semantic-release/npm**: ^11.0.2
- **@semantic-release/release-notes-generator**: ^12.1.0
- **conventional-changelog-conventionalcommits**: ^7.0.2
- **husky**: ^8.0.3
- **semantic-release**: ^22.0.12

## File Statistics

**Total Files**: 48 files (in repomix output)
**Total Tokens**: 38,868 tokens
**Total Characters**: 173,077 chars

**Top 5 Files by Token Count**:
1. `guide/SKILLS.md` - 7,073 tokens (18.2%)
2. `CHANGELOG.md` - 4,836 tokens (12.4%)
3. `README.md` - 3,261 tokens (8.4%)

## Integration Capabilities

### Discord Notifications
Script: `.claude/hooks/notifications/notify.cjs` + `providers/discord.cjs`
Purpose: Send project updates to Discord channels

### GitHub Actions
Workflow: `.github/workflows/release.yml`
Features: Automated releases, changelog generation

### Agent Skills
- **brain**: Advanced reasoning
- **docs-seeker**: Documentation reading
- **ai-multimodal**: Visual understanding
- **ai-multimodal & imagemagick skills**: Content generation and processing

## Critical Files

### Configuration
- `package.json` - Node.js config
- `.releaserc.json` - Release config
- `.commitlintrc.json` - Commit linting
- `.gitignore` - Git exclusions
- `.repomixignore` - Repomix exclusions

### Documentation
- `README.md` - Main project docs
- `CLAUDE.md` - Agent instructions
- `CHANGELOG.md` - Version history
- `guide/SKILLS.md` - Skills reference

### Workflows
- `.claude/rules/primary-workflow.md`
- `.claude/rules/development-rules.md`
- `.claude/rules/orchestration-protocol.md`
- `.claude/rules/documentation-management.md`

## Related Projects

- **claudekit** - ClaudeKit website (`../claudekit`)
- **claudekit-marketing** - Marketing Kit (`../claudekit-marketing`)
- **claudekit-cli** - CLI setup tool (`../claudekit-cli`)
- **claudekit-docs** - Public docs (`../claudekit-docs`)

## Version History

**Current**: v2.9.0-beta.2 (released 2026-01-28)
**License**: MIT
**Author**: Duy Nguyen
**Repository**: https://github.com/claudekit/claudekit-engineer

## Unresolved Questions

None identified. All core components are well-documented and functional.
