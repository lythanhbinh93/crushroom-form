# Project Roadmap

**Project**: CouplePix (crushroom-form)  
**Last Updated**: 2026-04-20  
**Status**: Active Development

## Executive Summary

CouplePix is an internal staff toolkit for Vietnamese e-commerce photo personalization. Core tools (photo naming, admin search, customer upload, date calculator) are production-ready. Roadmap focuses on reliability improvements, optional enhancements, and operational automation.

## Phase Overview

### Phase 1: Core Tools (COMPLETE)

**Status**: ✅ Complete | **Completion**: PR #3 (optimize-photo-naming)

**Deliverables**:
- Photo Naming Helper (Streamlit) — Batch rename & ZIP export
- Admin Panel — Search by phone, browse by date
- **Admin Panel Enhancement** — Copy paired montage (product + customer image) to Messenger (shipped 2026-04-20)
- Customer Upload Form — Croppie crop + GAS backend
- Delivery Date Calculator — 17:00 cutoff, provincial offsets
- Staff Homepage — B&W minimalist card grid
- Google Apps Script backend — Multi-endpoint server (+ imageProxy CORS fallback)
- Shopify Liquid template — Embedded form variant
- Deployment on Streamlit Cloud + Vercel + GAS

**Success Metrics**:
- Photo rename time: <2 min per order (50 photos)
- Admin search latency: <500 ms
- Upload success rate: >99%
- Date calc accuracy: 100%

### Phase 2: Reliability & Security (NEXT)

**Status**: 🚧 In Backlog | **Priority**: Medium

**Items**:
- [ ] Add auth/API key to GAS endpoint (current: URL obscurity only)
- [ ] Input validation for Excel column headers (current: silent fail)
- [ ] Error handling: Streamlit app silent fail if GAS down
- [ ] Rate limiting & quota monitoring for GAS
- [ ] Backup / archival strategy for old Sheet rows
- [ ] GAS endpoint URL rotation procedure (document + automate)

**Acceptance Criteria**:
- GAS endpoint requires authentication
- Excel validation shows clear error messages
- Streamlit displays GAS unavailability error
- Rate limiting prevents Drive quota exhaustion
- Annual Sheet archival runs successfully
- URL rotation can be done in <10 min

### Phase 3: Testing & Documentation (PLANNED)

**Status**: 💡 Backlog | **Priority**: Medium

**Items**:
- [ ] Unit tests for Python helpers (normalize_phone, clean_sku, safe_note)
- [ ] Integration tests for GAS API (search, list, upload)
- [ ] E2E tests for critical workflows (upload → ZIP export)
- [ ] Docstring coverage for all Python functions
- [ ] API documentation for GAS endpoints (Swagger/OpenAPI)
- [ ] Troubleshooting guide in README

**Acceptance Criteria**:
- >80% code coverage (Python)
- All GAS endpoints have request/response examples
- E2E tests cover happy path + error scenarios
- README includes FAQ section

### Phase Voice Gift QR (COMPLETE — P1–P4, P5 IN PROGRESS)

**Status**: ✅ P1–P4 Complete | P5 In Progress (docs + polish) | P6 Deferred

**Deliverables (P1–P4)**:
- `google-apps-script-voice.js` — standalone GAS with 6 endpoints (finishUpload, listVoice, publishVoice, getVoice, archiveVoice, audioProxy)
- `voice-upload.html` + `assets/voice-upload.{js,css}` — customer upload form (base64 single POST, 35 MB max)
- `voice.html` + `assets/voice-page.{js,css}` — public gift page (WaveSurfer dark theme, GAS audio proxy)
- `assets/admin-voice-tab.js` — admin Voice tab (QR code, Copy QR, Publish, Archive)
- GAS deployed: `https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec`

**P5 Tasks (this phase)**:
- [x] Homepage card updated (voice-upload.html + admin#voice)
- [x] README Voice section added
- [x] system-architecture.md voice section added
- [x] project-roadmap.md updated
- [x] deployment-guide.md Voice GAS setup added
- [x] validation edge case: missing URL params shows error panel

**Deferred to P6**:
- [ ] R2 migration (replace Drive audio storage + audioProxy bottleneck)
- [ ] Mobile E2E smoke test (iOS + Android)
- [ ] Monthly orphan Drive file cleanup script
- [ ] Admin analytics / view counts
- [ ] In-browser audio recording (replace file upload)

**index.html Decision**: Staff cards for voice-upload + admin#voice added (internal dashboard — not publicly indexed).

### Phase 4: Optional Enhancements (BACKLOG)

**Status**: 💡 Future | **Priority**: Low

**Items**:
- [x] QR Recording / Voice Gift upload tool — shipped (see Phase Voice Gift QR above)
- [ ] Love Counter configuration tool (card exists, disabled)
- [ ] Bulk image tagging/metadata in admin panel
- [ ] Export admin search results as CSV
- [ ] Webhook notifications for upload completion
- [ ] Mobile app (currently web only)
- [ ] Multi-language UI (currently Vietnamese only)
- [ ] Dark mode theme toggle
- [ ] Custom delivery date presets per customer

**Note**: These are not planned unless requested by stakeholders.

## Progress Tracking

| Phase | Overall | Documentation | Code | Testing | Deployment |
|-------|---------|---|---|----|---|
| Phase 1 | ✅ 100% | ✅ Done | ✅ Done | ⚠️ None | ✅ Done |
| Phase 2 | 🚧 0% | ⚠️ Planned | 🚧 In progress | ⚠️ Planned | ⚠️ TBD |
| Phase 3 | 💡 0% | 💡 Planned | 💡 Planned | 💡 Planned | 💡 Planned |
| Phase 4 | 💡 0% | 💡 Future | 💡 Future | 💡 Future | 💡 Future |

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| No user authentication | Public GAS endpoint; rely on URL obscurity | Use long, random script ID; rotate URL quarterly |
| GAS URL hardcoded in 4 files | Rotation requires code edits | Document rotation process; automate in Phase 2 |
| No database | Session state lost on Streamlit restart | Acceptable for transient app; data persists in Drive/Sheet |
| Drive quota (~15 GB free) | ~300 couple photos max | Monitor quarterly; archive old uploads |
| No rate limiting | Potential Drive quota exhaustion | Implement in Phase 2 |
| Sheet size limit (5M cells) | ~100k rows max | Archive annually |
| No input validation | Silent fail on missing Excel columns | Add validation UI in Phase 2 |

## Metrics & Success Criteria

### Current Status

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Photo naming time (50 photos) | <2 min | TBD | ⏳ Measure |
| Admin search latency | <500 ms | TBD | ⏳ Measure |
| Photo upload success | >99% | TBD | ⏳ Measure |
| Date calc accuracy | 100% | TBD | ⏳ Measure |
| Documentation coverage | 100% | 80% | ✅ Near complete |
| Code coverage (tests) | >80% | 0% | ⏳ Phase 3 |

### Action Items

- [ ] Measure actual photo naming time in production
- [ ] Monitor GAS response times (add logging)
- [ ] Track upload success rate
- [ ] Set up Drive quota alerts
- [ ] Schedule Phase 2 kickoff (Q2/Q3 2026)

## Milestones

| Milestone | Target Date | Status | Notes |
|-----------|-------------|--------|-------|
| Core tools production-ready | 2026-04-15 | ✅ Complete | All 4 tools live |
| Documentation complete | 2026-04-18 | ✅ Complete | Updated all 7 docs |
| Phase 2 kickoff (auth + validation) | 2026-05-01 | 📅 Scheduled | Depends on stakeholder feedback |
| Phase 3 (tests + API docs) | 2026-06-01 | 📅 Tentative | Start after Phase 2 |
| Phase 4 (optional features) | 2026-09-01 | 📅 Tentative | Only if requested |

## Dependencies & Blockers

**External Dependencies**:
- Google Drive API quota (15 GB free)
- Google Apps Script runtime quotas
- Streamlit Community Cloud availability
- Vercel uptime

**Internal Blockers**:
- None currently blocking Phase 2
- Phase 3 blocked until Phase 2 complete

## Rollout Strategy

### Phase 1 (Current)
- Beta testing with internal staff
- Monitor error rates, response times
- Gather feedback for Phase 2

### Phase 2 (Coming)
- Add authentication before public API
- Improve error messaging
- Implement rate limiting
- Increase monitoring

### Phase 3+ (Future)
- Only after Phase 2 stable
- Require stakeholder sign-off for Phase 4

## Unresolved Questions

- Should QR Recording & Love Counter be implemented or permanently removed?
- What is acceptable wait time for photo rename batch (2 min vs 5 min)?
- Should backup Sheet be maintained separately or automated archival?
- Monthly/quarterly review cadence for metrics?

