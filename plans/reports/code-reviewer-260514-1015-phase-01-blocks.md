# Code Review — Phase 01 Part A: Dopamiles block library (10 blocks + base CSS + supporting edits)

- Date: 2026-05-14 10:15 GMT+7
- Reviewer: code-reviewer
- Scope: 10 new `blocks/dop-*.liquid`, `assets/dopamiles-blocks-base.css`, edits to `sections/dopamiles-home-hero.liquid`, `layout/theme.liquid`, `config/settings_schema.json`
- Theme repo: `d:\github local\pod-tee-theme` (branch `feat/bug-fix-sprint`)

---

## Verdict

**Request changes** before push. Two P0 (one functional bug in heading, one dead-config in settings_schema). Several P1 a11y/safety gaps. CSS is clean and at-budget but has avoidable issues.

**Status:** DONE_WITH_CONCERNS

---

## P0 — Critical (must fix before push)

### P0-1. `dop-heading.liquid` accent_word replace = XSS + double-escape bug
**File:** `blocks/dop-heading.liquid` lines 14-18, 31-37

Flow:
1. `heading_html = block.settings.text` — raw text, **not escaped**.
2. `replace: block.settings.accent_word, wrapped` — string replace.
3. Output `{{ heading_html }}` — Liquid auto-escapes the entire string, including the injected `<span>`.

Two problems:
- **Visible HTML in output.** Because the final `{{ heading_html }}` auto-escapes, the merchant sees literal `<span class="dop-heading__accent">word</span>` rendered as text on the page. The accent highlight never works. This is a functional bug — the headline feature of the block is broken.
- If you fix that by switching to `{{ heading_html }}` raw output / `| replace` after escape, you must escape merchant text first, then run replace on the escaped version, then emit raw. Otherwise a merchant typing `<script>` in the `text` field gets it through verbatim. The current logic plus a raw output would be an XSS vector.

**Fix (safe order):**
```liquid
{%- assign heading_html = block.settings.text | escape -%}
{%- if block.settings.accent_word != blank -%}
  {%- assign needle  = block.settings.accent_word | escape -%}
  {%- assign wrapped = '<span class="dop-heading__accent">' | append: needle | append: '</span>' -%}
  {%- assign heading_html = heading_html | replace: needle, wrapped -%}
{%- endif -%}
...
<h2 ...>{{ heading_html }}</h2>   {# no escape filter — raw is needed for the span #}
```

Also: replace is case-sensitive — a merchant typing accent_word `"shirt"` while heading says `"Shirt"` will silently fail to highlight. Acceptable, but the field's `info` should warn (current copy says "match a word exactly" which is OK).

Also: replace will match inside other words (`"earns"` matches `"earnshirt"` if such existed). Acceptable for Tier 2.

---

### P0-2. `config/settings_schema.json` — 9 new color pickers consumed by zero code
**File:** `config/settings_schema.json` lines 1538-1609

Confirmed by grep: `dop_scheme_*` IDs appear **only** in `settings_schema.json`. No section, snippet, or CSS reads them.

`dopamiles-blocks-base.css` hardcodes the same hex values (`#FBFAF8`, `#1A1A1A`, `#F26419`, `#FFFFFF`) — when a merchant edits these pickers in Theme Editor, nothing changes. Worse: merchants will assume they work, edit them, and report it as a bug.

Two acceptable fixes:
1. **Wire it up.** Move the four `.dop-scheme--*` declarations from the static CSS into a `<style>` block inside `snippets/dopamiles-tokens.liquid` so the values resolve at render time from `settings.dop_scheme_light_bg` etc. The base CSS keeps the layout rules; the scheme colors become Liquid-driven. Pattern matches existing `--dop-accent` resolution in that snippet.
2. **Pull the picker group entirely** if you don't want to ship the indirection in Part A. Add it in Phase 02 when sections actually need it.

Either is fine — but shipping pickers that don't do anything is a P0 UX bug.

Side issue from same diff: file is missing trailing newline (`\ No newline at end of file` in diff). Some validators flag this; cheap to fix.

---

## P1 — Important (fix in next iteration)

### P1-1. `dop-cta.liquid` / `dop-cta-pair.liquid` / `dop-feature-row.liquid` — `javascript:` href is reachable
**Files:** `blocks/dop-cta.liquid:23`, `blocks/dop-cta-pair.liquid:25,34`, `blocks/dop-feature-row.liquid:52`

`{{ block.settings.url | default: '#' }}` — Shopify's `url` setting type **does** restrict the picker UI to safe URL types, but it accepts arbitrary text in the typed-in field. A merchant pasting `javascript:alert(1)` into the URL field will produce a live XSS sink. The `escape` filter does not block `javascript:` — it escapes quotes, not schemes.

This isn't a hypothetical for theme blocks: merchants share JSON exports in communities and paste them into stores. Untrusted JSON → live XSS in your storefront.

**Fix:** apply a scheme guard:
```liquid
{%- assign safe_url = block.settings.url | default: '#' -%}
{%- if safe_url contains 'javascript:' or safe_url contains 'data:' or safe_url contains 'vbscript:' -%}
  {%- assign safe_url = '#' -%}
{%- endif -%}
<a href="{{ safe_url }}" ...>
```
Or use `block.settings.url | escape` — `escape` will turn `javascript:` into `javascript%3A` only when the browser interprets it as href; safer to whitelist.

Applies to all 3 files. Same pattern.

### P1-2. `dop-cta` / `dop-cta-pair` / `dop-feature-row` — no `:focus` / `:focus-visible` style
**File:** `assets/dopamiles-blocks-base.css`

Grep confirms zero `:focus` rules in the base CSS. CTAs use `text-decoration:none` and rely on background+color hover, but keyboard users hitting Tab get **no visible focus ring** because Dawn's global focus styles target `.button` / `.link`, not `.dop-cta__link`.

This is a WCAG 2.4.7 fail for keyboard users. Add to base CSS:
```css
.dop-cta__link:focus-visible { outline: 2px solid var(--blk-accent, #F26419); outline-offset: 3px; }
```

Phase 01 spec called this out implicitly ("CTAs have visible focus states (likely inherited from base CSS — confirm)"). They are not inherited.

### P1-3. `dop-image.liquid` alt text fallback order is wrong + nested escape
**File:** `blocks/dop-image.liquid:22`

```liquid
alt="{{ block.settings.alt | default: block.settings.image.alt | escape }}"
```

Two issues:
- Order of operations: `default` runs **before** `escape`. If `block.settings.alt` is blank, Liquid falls back to `image.alt` — but `image.alt` may be `nil` (no alt set on the asset). `default` only catches blank, not nil consistently across Shopify versions. Behavior: when both are unset, you may render `alt=""` (acceptable for decorative) or `alt="nil"` (bad). 
- More importantly, `block.settings.image.alt` is **already** stored as plain text in Shopify's asset metadata; running `escape` on the merchant's `alt` override is correct, but you also want a final empty-string fallback so screen readers don't get the literal word `nil`.

**Fix:**
```liquid
{%- assign img_alt = block.settings.alt | default: block.settings.image.alt | default: '' | escape -%}
<img ... alt="{{ img_alt }}" ...>
```

Same issue in `dop-feature-row.liquid:33` (uses `image.alt` only, no override, no empty fallback).

### P1-4. `dop-heading.liquid` — h1 is selectable everywhere
**File:** `blocks/dop-heading.liquid` lines 67-77

Block lets merchant choose `h1`. With `{"type":"@theme"}` on every section, the merchant can drop multiple h1s on a single template, or a heading block on the cart page that becomes a second h1 alongside the section's own h1. Failing WCAG 1.3.1 and bad for SEO.

**Recommendation:** drop `h1` from the enum; restrict to `h2/h3/h4` for blocks. If you need h1 it should be section-owned, not block-owned. (Spec says h1-h3 — push back on spec or document.)

### P1-5. `dop-feature-row.liquid` heading is hardcoded `<h2>`
**File:** `blocks/dop-feature-row.liquid:45`

No `level` control; always `h2`. If a merchant nests a feature-row inside a section that itself has an h2 hero heading, the page has duplicate h2s. Add an optional `heading_level` select like `dop-heading`, default `h3` (since this block typically appears below a section heading).

### P1-6. `dop-icon-card.liquid` heading hardcoded `<h3>`
**File:** `blocks/dop-icon-card.liquid:44`

Same issue as P1-5. h3 is a reasonable default but should be configurable, or at minimum documented as "h3 only — set parent section heading to h2".

### P1-7. `dop-badge-row.liquid` `||` separator collision
**File:** `blocks/dop-badge-row.liquid:13-19`

Concatenates badges into a string with `||` as delimiter then `split: '||'`. If any merchant types `||` literally in a badge (e.g., `"Free shipping || US only"`) the split eats it. Low probability but trivially avoidable by looping with conditional appends instead of string-join-and-split. Tier 2 acceptable, but flag a P2 nit.

Better pattern: just write 6 conditional spans with a counter for separator placement, no string-join needed. ~20 lines, cleaner.

### P1-8. `dop-feature-row.liquid` inline `grid-template-columns` in style attribute
**File:** `blocks/dop-feature-row.liquid:26`

`style="...grid-template-columns:{{ grid_cols }};"` — fine functionally, but `grid_cols` comes from Liquid concatenation that produces values like `"2fr 3fr"`. The mobile override in base.css at line 152 uses **the same specificity** (single class selector), and the mobile rule needs `!important` (lines 153-154) to defeat the inline-style cascade. Inline styles are part of the css cascade ordering and `!important` is the only way to override them — but it's brittle.

Better: drop the inline `grid-template-columns` and use modifier classes instead:
```liquid
class="dop-feature-row dop-feature-row--cols-{{ block.settings.image_width }} {{ img_side_class }}"
```
Then `.dop-feature-row--cols-40 { grid-template-columns: 2fr 3fr; }` etc. in CSS. The mobile override no longer needs `!important`.

This is the root cause of the only two `!important`s in the codebase. Worth fixing.

---

## P2 — Nits (note for future)

- **`dopamiles-blocks-base.css` at 8192 bytes is exactly 8 KB** — any further additions push over. There's quick-win compaction available: the four `.dop-scheme--*` rules at lines 9-12 duplicate the `background-color` and `color` declarations. You can hoist those into a single `.dop-block[class*="dop-scheme--"]` rule reading the custom properties. Saves ~120 bytes.
- **`dop-spacer.liquid`** sets `--spacer-h` inline but the CSS also defines a fallback default of 64px. Redundancy — Liquid always sets the var. Cosmetic.
- **`dop-text.liquid`** uses `block.settings.content` (richtext) directly. Liquid trusts merchant richtext by design; this is the documented behavior. No change needed but worth a comment in the file noting "richtext is unescaped by Shopify intentionally."
- **`dop-stat.liquid`** has `display:block` on `.dop-stat` and `display:block` on each child. The wrapper alignment classes use `text-align`, which works for these inline children but won't flow correctly if a merchant ever wraps the stat in a flex container. Acceptable.
- **`dop-icon-card.liquid`** SVGs: confirmed all 9 hardcoded paths, no user data interpolated. `aria-hidden="true"` on parent — good. SVGs themselves don't have `focusable="false"`; IE11 ghost (irrelevant in 2026). Skip.
- **Color scheme defaults: text on accent.** `.dop-scheme--brand-accent` uses `#F26419` background + `#FFFFFF` text. Contrast ratio ≈ 3.31:1 — **fails WCAG AA for normal text (4.5:1)**. Passes AA Large only. Since the scheme is used on small text (badges, stat labels), this needs darker text (e.g., `#1A1A1A` for ~4.6:1 contrast) or restrict the brand-accent scheme to display-text-only blocks. Bumping to P1 if you care about a11y compliance.

Promoting that last one — actually P1.

### P1-9. `brand-accent` color scheme fails AA contrast (3.31:1)
`#FFFFFF` on `#F26419` background is below 4.5:1 required for body text. Fix: change `--blk-text` to `#1A1A1A` (8.07:1) or `#FFFFFF` only on `display:` text sizes. Test with chrome devtools accessibility panel before sign-off.

---

## What looks good

- **Schema correctness:** every block has a valid `presets` array; no `target` keys; all setting types (`select`, `range`, `richtext`, `text`, `textarea`, `checkbox`, `color`, `image_picker`, `url`, `header`) are Dawn 15.4.1 supported. Schemas are parseable JSON. Dawn validator will accept all 10.
- **`block.shopify_attributes` placement** correct on the outer wrapper of every block — Theme Editor click-to-select will work.
- **CSS naming:** strict `.dop-*` prefix throughout. No collision risk with Dawn's `.button`, `.card`, `.icon`. Confirmed via grep — no unprefixed selectors at the top level.
- **Mobile scaling pattern** (`@media (max-width:767px)` × `*0.6`) is clean and consistent.
- **Inline style scoping via CSS variables** is correct — `--block-pad-top` etc. are set on the block wrapper, no global leak.
- **Image blocks** use `image_url: width: 1200` / `width: 900` correctly; lazy loading set.
- **Color scheme indirection** with `--blk-bg/--blk-text/--blk-accent` is well-thought-out — each block reads only the abstract vars, blocks compose cleanly. (Just wire P0-2 to make it actually merchant-configurable.)

---

## Summary table

| Priority | Count | Areas |
|---|---|---|
| P0 | 2 | Heading accent_word broken; orphaned color settings |
| P1 | 9 | XSS-via-url, focus rings, alt text, h1 risk, AA contrast, inline grid |
| P2 | 4 | CSS compaction, redundancy, richtext docnote |

---

## Recommended next actions (ordered)

1. Fix P0-1 (heading replace + escape order) — 5 min.
2. Decide P0-2 (wire color settings or remove them) — 15-30 min.
3. Add `:focus-visible` rule to base CSS (P1-2) — 2 min.
4. Add `javascript:` url guard to 3 CTA blocks (P1-1) — 5 min.
5. Fix image alt fallback chain (P1-3) — 3 min.
6. Drop `h1` option from `dop-heading` enum (P1-4) — 1 min.
7. Add heading-level selector to feature-row + icon-card (P1-5, P1-6) — 10 min.
8. Fix `brand-accent` contrast (P1-9) — 1 min.
9. Refactor feature-row grid columns to class modifier (P1-8) — 10 min.

Estimated total: ~60 min to clear all P0 + P1.

---

## Unresolved questions

- Are the `dop_scheme_*` settings_schema additions intentional and intended to be wired in Phase 02, or were they meant to drive the CSS now? (Affects P0-2 disposition.)
- Phase 02 plan says hero may revert `{"type":"@theme"}` — if so, are these blocks intended to be usable on the cart/account/password templates too, or just home/product? (Affects whether `dopamiles-blocks-base.css` should load unconditionally or be conditional on template.)
- Spec mentions h1-h3 in heading enum; is the spec OK to revise to h2-h4 for accessibility? (P1-4)
