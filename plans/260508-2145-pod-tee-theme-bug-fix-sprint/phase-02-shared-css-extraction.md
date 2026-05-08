# Phase 02 — Shared CSS extraction + 5 fixes

**Owner:** me
**Bugs fixed:** #8 (italic accent), #9 (blue underlined links), #10 (drawer dim), #12 (Subscribe button contrast), #14 (eyebrow/tag contrast), #7 (newsletter heading)
**Effort:** ~45 min (actual: completed)
**Status:** completed
**Depends on:** none — runs parallel with Phase 01

## Goal

Extract reusable component styles from `dopamiles-pdp.css` (which only loads on PDP template) into a new `dopamiles-shared.css` loaded globally. Fix 5 bugs in one stylesheet refactor.

## Files

**Create:**
- `assets/dopamiles-shared.css` — new stylesheet for shared components

**Modify:**
- `layout/theme.liquid` — add `<link>` for shared CSS (1 line in `<head>`)
- `assets/dopamiles-pdp.css` — remove rules being extracted (avoid duplication)

## Steps

### Step 2.1 — Identify rules to extract from `dopamiles-pdp.css`

Scope: rules used in sections that appear OUTSIDE the PDP template (e.g. `dopamiles-shop-by-niche`, `dopamiles-more-from-niche`, home eyebrow text, newsletter, footer).

Rules to extract (based on bug audit):
- `.dop-card` and descendants (product card layout used on home + collection)
- `.dop-eyebrow`, `.dop-jnl-eye`, `.doc-hero-eye` — eyebrow text styling
- `.dop-section-head h2 em`, `.dop-faqs-heading em` — italic accent rule (generalize selector)
- `.dop-btn` — generic button
- `.doh-split-photo-tag`, `.dop-404-art-tag` — tag overlays

### Step 2.2 — Create `assets/dopamiles-shared.css` with extracted + new rules

```css
/* dopamiles-shared.css
 * Shared components used across multiple templates.
 * Loaded globally via layout/theme.liquid.
 * Split from dopamiles-pdp.css (PDP-only) to fix bugs where
 * sections rendered outside PDP lacked component styles.
 */

/* === italic accent — generalized selector to fix bug #8 ===
 * Was: .dop-section-head h2 em (PDP-only, missed home + more-from-niche sections)
 * Now: any heading <em> inside a dopamiles section head
 */
:where(
  .dop-section-head,
  .doh-split-body,
  .dop-niche-head,
  .dop-shop-by-niche__head,
  .dop-more-from-niche__head,
  .dop-faqs-heading,
  [class*="dop-"][class*="-head"]
) :is(h1, h2, h3, h4) em {
  color: var(--dop-accent);
  font-style: italic;
  font-weight: 400;
}

/* === product card — fix bug #9 (blue underlined links on home niche cards) === */
.dop-card { /* extracted from pdp.css — copy existing rules */ }
.dop-card a {
  color: var(--color-foreground);
  text-decoration: none;
}
.dop-card a:hover {
  color: var(--dop-accent);
}
.dop-card .dop-card__title {
  color: var(--color-foreground);
  font-weight: 500;
}
.dop-card .dop-card__meta {
  color: var(--color-foreground-secondary, #666);
}

/* === mobile nav drawer backdrop — fix bug #10 === */
.menu-drawer__overlay,
.dop-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 19;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}
.menu-drawer[open] ~ .menu-drawer__overlay,
.menu-drawer.is-open ~ .menu-drawer__overlay,
.dop-drawer.is-open ~ .dop-drawer-overlay {
  opacity: 1;
  pointer-events: auto;
}

/* === newsletter Subscribe button — fix bug #12 (contrast) ===
 * Brand orange #F26419 + white text fails WCAG AA.
 * Solution: use darker shade #C8501A for buttons (passes 4.5:1 with white).
 */
.dop-newsletter-form > button[type="submit"],
.dop-btn--accent {
  background: var(--dop-accent-button, #C8501A);
  color: #fff;
  font-weight: 500;
}
.dop-newsletter-form > button[type="submit"]:hover {
  background: var(--dop-accent-button-hover, #B0461A);
}

/* === eyebrow / tag contrast — fix bug #14 ===
 * Various .dop-eyebrow / .doc-hero-eye / .dop-jnl-eye / .dop-404-art-tag / .doh-split-photo-tag
 * were rendering at light orange ~#F26419 on white = ~3:1 (fails AA 4.5:1 for small text).
 * Fix: bump to darker accent for small uppercase eyebrows.
 */
.dop-eyebrow,
.doc-hero-eye,
.dop-jnl-eye,
.dop-404-art-tag,
.doh-split-photo-tag {
  color: var(--dop-accent-text, #C8501A);
  font-weight: 600;
  letter-spacing: 0.05em;
  font-size: 0.75rem;
  text-transform: uppercase;
}

/* === Globo fallback (only if Phase 01 Task 1.4 fallback path) === */
/* Uncomment if Globo app config didn't allow option-level disable:
.globo-options-fields,
[class*="globo"][class*="options-fields"] {
  display: none !important;
}
*/
```

### Step 2.3 — Update `layout/theme.liquid` to include shared CSS globally

Add after existing brand-token snippet inclusion in `<head>`:

```liquid
{{ 'dopamiles-shared.css' | asset_url | stylesheet_tag }}
```

### Step 2.4 — Remove now-duplicated rules from `dopamiles-pdp.css`

Delete the rules now in `dopamiles-shared.css` to avoid double-application and reduce PDP CSS payload:
- `.dop-section-head h2 em` (line 503) — covered by generalized selector in shared
- `.dop-faqs-heading em` (line 695) — covered
- Any `.dop-card`, `.dop-eyebrow`, `.dop-btn`, `.doh-split-photo-tag`, etc.

Keep PDP-only rules (`.dop-buy`, `.dop-hero`, `.dop-gallery`, `.dop-trust-item`, etc.) in pdp.css.

## Acceptance criteria

- [x] `assets/dopamiles-shared.css` exists with all extracted + new rules (155 lines, created on branch feat/bug-fix-sprint)
- [x] `layout/theme.liquid` includes shared CSS in `<head>`
- [ ] `dopamiles-pdp.css` no longer duplicates extracted rules (intentionally deferred per risk mitigation — both loaded for first push; scheduled for Phase 05 post-publish)
- [ ] Visual check on preview:
  - [x] Home "Shop by **niche.**" — `niche.` renders orange italic
  - [x] PDP "More **slow runners.**" — `slow runners.` renders orange italic
  - [x] Home `.doh-split-body` "notice" word renders orange italic
  - [x] Home niche cards: black title + gray meta (not blue underlined)
  - [x] Mobile nav drawer opens with dim backdrop
  - [x] Newsletter Subscribe button contrast passes axe-core
  - [x] Eyebrow text on home + collection + 404 reads dark enough
  - [x] Newsletter heading "One letter a month." white on dark section (added .doh-news h3 rule)

## Risks

- **Risk:** removing rules from pdp.css breaks PDP-only styling if rules were doing double-duty. **Mitigation:** keep both stylesheets loaded on PDP for the first push; delete pdp.css duplicates only after shared.css verified working.
- **Risk:** brand-shift from `#F26419` to `#C8501A` for buttons changes brand feel. **Mitigation:** use shade only on buttons; keep accent text/headlines on `#F26419`.

## Notes

- The italic-accent generalized selector uses `:where()` for low specificity — won't override more-specific rules elsewhere.
- New CSS variables (`--dop-accent-button`, `--dop-accent-button-hover`, `--dop-accent-text`) should be added to `snippets/dopamiles-tokens.liquid` for centralization. If short on time, inline the hex values.
