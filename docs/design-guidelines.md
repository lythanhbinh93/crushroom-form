# Design Guidelines

**Project**: CouplePix (crushroom-form)  
**Last Updated**: 2026-04-18  
**Audience**: UI/UX designers, frontend developers

## Design System Overview

CouplePix uses two design languages:
1. **B&W Minimalist** — Staff-facing tools (homepage, date calculator)
2. **Gradient Purple** — Admin panel (image viewer)

Both emphasize clarity, accessibility, and Vietnamese user preferences.

## Color Palette

### Primary Colors

| Use | Color | Hex | RGB |
|-----|-------|-----|-----|
| Text (dark) | Black | #111111 | 17, 17, 17 |
| Text (medium) | Charcoal | #444444 | 68, 68, 68 |
| Text (light) | Medium Gray | #666666 | 102, 102, 102 |
| Background | White | #FFFFFF | 255, 255, 255 |
| Borders | Light Gray | #CCCCCC | 204, 204, 204 |
| Disabled | Very Light Gray | #EEEEEE | 238, 238, 238 |

### Accent Colors (Gradient Purple)

| Component | Color | Hex |
|-----------|-------|-----|
| Gradient Start | Soft Blue | #667EEA |
| Gradient End | Deep Purple | #764BA2 |

### Semantic Colors

| Semantic | Color | Use |
|----------|-------|-----|
| Success | Green | #4CAF50 | ✅ Upload success |
| Error | Red | #F44336 | ❌ Validation errors |
| Warning | Amber | #FF9800 | ⚠️ Quota warnings |
| Info | Blue | #2196F3 | ℹ️ Help text |

## Typography

### Font Stack

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", 
               Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

**Rationale**: System fonts load fast, feel native on macOS/Windows/Linux

### Font Sizes & Scales

| Level | Size | Line Height | Use |
|-------|------|-------------|-----|
| **H1** | 32px (2rem) | 1.2 | Page titles |
| **H2** | 24px (1.5rem) | 1.3 | Section headers |
| **H3** | 20px (1.25rem) | 1.4 | Subsection headers |
| **Body** | 16px (1rem) | 1.5 | Regular text |
| **Small** | 14px (0.875rem) | 1.5 | Captions, labels |
| **Tiny** | 12px (0.75rem) | 1.4 | Hints, metadata |

### Font Weights

| Weight | Value | Use |
|--------|-------|-----|
| Regular | 400 | Body text |
| Semibold | 600 | Section headers, labels |
| Bold | 700 | Page titles, emphasis |

## Spacing System

### Base Unit: 8px

All spacing is a multiple of 8px for consistent rhythm.

| Scale | Value | Common Uses |
|-------|-------|-------------|
| **xs** | 4px | Icon padding, tight spacing |
| **sm** | 8px | Element margins, padding |
| **md** | 16px | Section spacing, component gaps |
| **lg** | 24px | Major section dividers |
| **xl** | 32px | Page margins, containers |
| **2xl** | 48px | Large gaps, full-width spacing |

### Example

```css
.card {
  padding: 24px;        /* md */
  margin-bottom: 16px;  /* sm */
}

.card__title {
  margin-bottom: 8px;   /* xs */
  font-size: 1.25rem;
}
```

## Component Library

### Buttons

#### Primary Button

```css
.btn-primary {
  background: #111111;
  color: #FFFFFF;
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
}

.btn-primary:hover {
  background: #444444;
  transform: translateY(-2px);  /* Subtle lift */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

#### Secondary Button

```css
.btn-secondary {
  background: transparent;
  color: #111111;
  border: 2px solid #111111;
  padding: 10px 22px;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #F5F5F5;
  border-color: #444444;
}
```

### Cards

```css
.tool-card {
  background: #FFFFFF;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  padding: 24px;
  transition: border 0.2s, transform 0.15s;
}

.tool-card:hover {
  border-color: #111111;
  transform: translateY(-2px);
}

.tool-card.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.card-icon {
  font-size: 3rem;  /* 48px */
  margin-bottom: 12px;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111111;
  margin-bottom: 8px;
}

.card-description {
  font-size: 0.875rem;
  color: #666666;
  line-height: 1.5;
}
```

### Input Fields

```css
input[type="text"],
input[type="email"],
input[type="date"],
input[type="time"],
select {
  padding: 8px 12px;
  border: 1px solid #CCCCCC;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus,
select:focus {
  outline: none;
  border-color: #111111;
  box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.1);
}

input:disabled {
  background: #F5F5F5;
  color: #999999;
  cursor: not-allowed;
}

label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 0.875rem;
  color: #222222;
}
```

### Grid Layout

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  padding: 24px;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
```

## B&W Minimalist (Staff Tools)

### Philosophy

Clarity without distraction. Used for:
- Homepage (index.html)
- Date calculator (check-date.html)

### Key Elements

- Pure black text on white background (#111 on #FFF)
- 1px borders in light gray (#CCC)
- Hover state: -2px lift + darker border
- System fonts, no decorative effects
- High contrast for accessibility

### Example: Homepage Card

```html
<article class="tool-card active">
  <div class="card-icon">📸</div>
  <p class="card-subtitle">Order → Photo Helper</p>
  <h2 class="card-title">Photo Naming Helper</h2>
  <p class="card-description">
    Đặt tên ảnh theo đơn hàng từ file Excel, tự động export ZIP cho nhà máy.
  </p>
  <a href="https://crushroomapp.streamlit.app/" class="card-cta">
    Mở App →
  </a>
</article>
```

**CSS**:
```css
.tool-card {
  background: white;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
}

.tool-card:hover {
  border-color: #111;
  transform: translateY(-2px);
}

.card-icon {
  font-size: 3rem;
  margin-bottom: 8px;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111;
}

.card-subtitle {
  font-size: 0.75rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-cta {
  display: inline-block;
  margin-top: 12px;
  color: #111;
  text-decoration: none;
  font-weight: 600;
  transition: transform 0.2s;
}

.card-cta:hover {
  transform: translateX(4px);
}
```

## Gradient Purple (Admin Panel)

### Philosophy

Modern, approachable. Used for:
- Admin panel (admin.html)

### Color Scheme

**Gradient**: #667EEA (blue) → #764BA2 (purple)

**Usage**:
- Header background
- Primary buttons
- Accent elements
- Links

### Example: Admin Header

```html
<div class="admin-header">
  <h1>🖼️ CouplePix Admin Panel</h1>
  <p class="subtitle">Kiểm tra ảnh khách hàng đã upload</p>
</div>
```

**CSS**:
```css
.admin-header {
  background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
  color: white;
  padding: 32px 24px;
  text-align: center;
}

.admin-header h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.admin-header .subtitle {
  font-size: 1rem;
  opacity: 0.95;
}
```

## Responsive Design

### Breakpoints

| Breakpoint | Width | Devices |
|------------|-------|---------|
| **Mobile** | <640px | Phone |
| **Tablet** | 640–1024px | iPad, tablet |
| **Desktop** | >1024px | Laptop, desktop |

### Mobile-First Approach

```css
/* Base: Mobile */
.container {
  padding: 16px;
  font-size: 16px;
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    padding: 24px;
    font-size: 18px;
  }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .container {
    padding: 32px;
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

### Grid Responsiveness

```css
.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;  /* Mobile: 1 column */
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);  /* Tablet: 2 columns */
    gap: 24px;
  }
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);  /* Desktop: 3+ columns */
    gap: 32px;
  }
}
```

## Accessibility

### Color Contrast

- Text on background: 4.5:1 minimum (WCAG AA)
- #111 on #FFF: 16:1 ✅ Excellent
- #666 on #FFF: 7:1 ✅ Good

### Interactive Elements

- Min size: 44×44px (touch targets)
- Focus visible: 2px outline or shadow
- Don't rely on color alone (use icons + labels)

### Example

```css
button:focus {
  outline: 2px solid #111;
  outline-offset: 2px;
}

a:focus {
  box-shadow: 0 0 0 2px white, 0 0 0 4px #111;
  border-radius: 2px;
}
```

## Vietnamese Localization

- Date format: DD/MM/YYYY (not MM/DD/YYYY)
- Time format: HH:MM (24-hour)
- Currency: "đ" suffix (if needed)
- Text density: Allow extra line-height for readability
- Font: Ensure Vietnamese diacritics render correctly

## Dark Mode (Future)

Not currently implemented, but plan for:
```css
@media (prefers-color-scheme: dark) {
  body {
    background: #1a1a1a;
    color: #E5E5E5;
  }
  /* ... */
}
```

## Unresolved Questions

- Should there be a dark mode option?
- What is the preferred Vietnamese font for bodies?
- Should animations be reduced for users with `prefers-reduced-motion`?

