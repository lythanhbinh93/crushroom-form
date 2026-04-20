# Project Overview & Product Development Requirements

**Project Name**: CouplePix (crushroom-form)  
**Type**: Internal Staff Toolkit  
**Status**: Active Development  
**Repository**: github.com/lythanhbinh93/crushroom-form  
**Branch**: claude/image-upload-crop-tool-*

## Executive Summary

CouplePix is an internal staff toolkit for a Vietnamese e-commerce photo personalization business. It streamlines workflow across four interconnected tools: customer-facing photo uploads (Shopify-embedded), staff photo-naming for factory orders, admin image browsing, and delivery date calculation by province.

## Project Purpose

### Vision
Reduce manual photo renaming, image lookup, and delivery date calculation overhead through integrated web tools and backend automation.

### Mission
Provide:
- Automated photo-to-order naming (`A. BBBB_XX_YY.ext` format) with ZIP export for factory
- Admin panel to search & browse customer-uploaded images by phone or date range
- Customer photo upload + crop tool (Shopify-embedded)
- Delivery date calculator with provincial delivery offsets

### Value Proposition
- Rename 50+ photos in <2 min vs 15+ min manual (75% time saved)
- Eliminate image mix-ups via centralized admin search
- Real-time delivery date quotes for Shopify checkout
- Zero database: Google Drive + Sheets = no infrastructure cost

## Target Users

### Primary Users
1. **Photo Studio Operations Staff** (2–5 people)
   - Upload photo renaming, Excel parsing, ZIP export for factory
   - Admin panel: search uploaded images by customer phone

2. **Customer Service** (3–8 people)
   - Check delivery dates by province for customer inquiries
   - Reference admin panel for uploaded photos

3. **Customers** (via Shopify embedded form)
   - Upload couple photos + crop for personalization

### User Personas

**Persona 1: Operations Specialist**
- **Needs**: Fast batch processing, error prevention, easy image verification
- **Pain Points**: Manual renaming is tedious and error-prone (wrong phone mapping)
- **Solution**: Photo Naming Helper app + Admin search

**Persona 2: Customer Service Rep**
- **Needs**: Quick delivery date lookup, customer image confirmation
- **Pain Points**: "When will my order arrive?" asked ~20× daily; images scattered in Drive
- **Solution**: Check Date tool + Admin panel with date-range browse

**Persona 3: Customer**
- **Needs**: Upload couple photos, crop/rotate to fit template, confirm
- **Pain Points**: Images don't fit frame, unclear cropping bounds
- **Solution**: Croppie-powered upload form with real-time preview

## Scope

### In Scope
- Streamlit Photo Naming Helper (orders → ZIP export)
- Admin Panel (search by phone, browse by date range)
- Couplepix Upload Form (HTML5 + Croppie)
- Check Date Tool (17:00 cutoff, provincial offsets)
- Staff homepage (B&W minimalist card grid)
- Google Apps Script backend (Drive upload, Sheet logging)
- Shopify Liquid template variant

### Out of Scope
- User authentication (GAS endpoint is public; rely on URL obscurity)
- Rate limiting / quota management
- Mobile app (web only)
- QR recording, Love Counter (disabled cards, future)
- Order management / invoice system

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Photo naming time per order | <2 min (50 photos) | TBD |
| Admin image search latency | <500 ms | TBD |
| Photo upload success rate | >99% | TBD |
| Delivery date accuracy | 100% (no missed holidays) | TBD |

## Non-Goals

- Full e-commerce platform (tools integrate with existing Shopify store)
- Order fulfillment tracking
- Custom image effects / filters
- Multi-language UI (Vietnamese only, for now)

## Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| Google Drive quota (~15 GB free) | ~300 couple photos max | Monitor, archive old uploads |
| GAS URL hardcoded in clients | Manual edit for URL rotation | Document in DEPLOY.md |
| No database | Session state lost on Streamlit restart | Acceptable for transient app |
| No user auth | Public GAS endpoint; rely on URL obscurity | Use long, random script ID |
| Sheet size (5M cells) | ~100k upload rows max | Archive sheets annually |

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend (Customer)** | HTML5 + Croppie | CDN v2.6.5 |
| **Frontend (Staff)** | Streamlit | >=1.31 |
| **Frontend (Static)** | Vercel | Static hosting |
| **Backend** | Google Apps Script | Apps Script v2 |
| **Storage** | Google Drive + Sheets | -/Pro |
| **Deployment** | Streamlit Cloud + Vercel + GAS | -/Web app |

## Data Flow

```
[Customer] → couplepix.html/liquid
  ↓ (POST FormData: base64 img + phone)
[Google Apps Script] → Decode, Validate, Lock (10s)
  ↓
[Google Drive folder] (save img files)
  ↓
[Google Sheet "form data"] (log row: Name, image-1, image-2, Date, etc.)
  ↓
[MailApp] → crush@crushroom.vn (notification)

[Staff] → admin.html (GET ?action=search&phone=...)
  ↓
[GAS searchByPhone()] → Validate phone, Match rows, Return JSON
  ↓
[Admin display] (image grid, date-range table)

[Staff] → app.py (Streamlit)
  ↓ (fetch orders-check.xlsx)
[Normalize phone, SKU, Note] → Compute _need_photo, _img_per_unit
  ↓ (GET ?action=search&phone=...)
[GAS] → Return image URLs
  ↓
[Map images to slots, Download, Build ZIP]
  ↓ (download)
[Staff] (order_FULL.zip: images + checklist.xlsx)
```

## Unresolved Questions

- Should there be webhook triggers for Drive quota alerts?
- Rate limiting strategy if upload volume spikes?
- Archival policy for old Sheet rows (annual, monthly)?
- Multi-language support roadmap?

