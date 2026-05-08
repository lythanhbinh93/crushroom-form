# Phase 03 — Liquid + JS surgery (variant, ATC, search, a11y)

**Owner:** me
**Bugs fixed:** #3 (ATC stuck `…`), #4 (variant→media swap), #6 (search modal), #7 (newsletter heading), #13 (review stars role), #15 (progress aria)
**Effort:** ~75 min (actual: completed)
**Status:** completed
**Depends on:** none — can run parallel with Phase 02

## Files

- `sections/dopamiles-product-hero.liquid` — variant dispatch + ATC toast
- `sections/dopamiles-home-newsletter.liquid` — heading color override
- `sections/dopamiles-header.liquid` — search modal wrapper (largest sub-task)
- review card snippet (find via grep `.doh-stars`) — role=img on stars
- collection grid snippet (find via grep `.doc-progress`) — aria-label on progress

## Steps

### Step 3.1 — Variant change dispatches `variant:change` event (Bug #4) [~10 min]

**File:** `sections/dopamiles-product-hero.liquid` lines 172-208 (`syncVariant()` IIFE)

After `hidden.value = match.id;`, add:

```js
// Tell media-gallery to swap to this variant's featured image
if (match.featured_media) {
  const mediaGalleryId = `MediaGallery-${section.id}`;
  const mediaGallery = document.getElementById(mediaGalleryId)
                    || document.querySelector('media-gallery');
  if (mediaGallery && typeof mediaGallery.setActiveMedia === 'function') {
    mediaGallery.setActiveMedia(`${section.id}-${match.featured_media.id}`, true);
  }
}

// Dispatch standard event for other listeners (sticky-atc, third-party apps, etc.)
section.dispatchEvent(new CustomEvent('variant:change', {
  bubbles: true,
  detail: { variant: match }
}));
```

### Step 3.2 — ATC success-feedback toast (Bug #3) [~20 min]

**File:** `sections/dopamiles-product-hero.liquid`

**Problem:** Dawn's `product-form.js` toggles a loading span on submit, expects cart-drawer-open event to clear it. This theme has no cart-drawer-open path → button stays on `…` forever.

**Fix:** Listen for `cart-add` fetch completion via `window.fetch` interception, OR override product-form's submit handler to show a toast and reset button text.

Cleanest approach — append to existing `<script>` block at line 209:

```js
// Override stuck-loading state: when /cart/add succeeds, show toast + reset button
const productForm = section.querySelector('product-form, form[action*="/cart/add"]');
if (productForm) {
  productForm.addEventListener('submit', async (e) => {
    // Let Dawn's product-form.js handle the submit; we just observe the result
    setTimeout(() => {
      // Poll button state — if still on loading after 4s, force reset + show toast
      const btn = section.querySelector('[data-dop-main-atc]');
      const loadingSpan = btn?.querySelector('.loading__spinner, .loading-overlay__spinner');
      if (loadingSpan && getComputedStyle(loadingSpan).display !== 'none') {
        // Force-clear loading state
        btn.classList.remove('loading');
        loadingSpan.style.display = 'none';
        showToast('Added — view cart →', '/cart');
      }
    }, 4000);
  });
}

function showToast(text, link) {
  const t = document.createElement('a');
  t.href = link;
  t.className = 'dop-toast';
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: '#1a1a1a', color: '#fff', padding: '12px 20px', borderRadius: '999px',
    textDecoration: 'none', zIndex: '100', boxShadow: '0 4px 16px rgba(0,0,0,.2)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
```

**Better long-term:** dispatch `cart:add-success` event from a fetch wrapper around `/cart/add.js`; toast listens for that event. Out of scope for sprint — defer to follow-up.

### Step 3.3 — Newsletter heading color override (Bug #7) [~5 min]

**File:** `sections/dopamiles-home-newsletter.liquid:16`

Current:
```liquid
<h3>{{ section.settings.heading | default: '...' }}</h3>
```

Fix — inline override:
```liquid
<h3 style="color: var(--color-background, #fff);">{{ section.settings.heading | default: '...' }}</h3>
```

OR add CSS rule to `dopamiles-shared.css` (cleaner):
```css
.dop-newsletter--dark h3,
.doh-newsletter h3 {
  color: var(--color-background, #fff);
}
```
Then make sure section parent has class `dop-newsletter--dark` or `doh-newsletter`.

### Step 3.4 — Search modal wrapper rebuild (Bug #6) [~30-45 min]

**File:** `sections/dopamiles-header.liquid` (find current search trigger + predictive-search markup)

**Problem:** Search trigger button exists, but no `<details-modal>` wrapper around the predictive-search content → content renders raw at top of promo bar instead of in a styled modal.

**Steps:**
1. Locate current search trigger button (likely `header [aria-controls*="search"]`).
2. Find the predictive-search snippet currently rendered inline — likely `{% render 'predictive-search' %}` or similar.
3. Wrap the search button + predictive-search in a `<details-modal>` element following Dawn's baseline pattern (BASELINE.md says baseline is `9ccdacf8`).

Reference structure from Dawn:
```liquid
<details-modal class="header__search">
  <details>
    <summary class="header__icon header__icon--search header__icon--summary link focus-inset modal__toggle" aria-haspopup="dialog" aria-label="{{ 'general.search.search' | t }}">
      <span>
        {%- render 'icon-search' -%}
        {%- render 'icon-close' -%}
      </span>
    </summary>
    <div class="search-modal modal__content gradient" role="dialog" aria-modal="true" aria-label="{{ 'general.search.search' | t }}">
      <div class="modal-overlay"></div>
      <div class="search-modal__content search-modal__content-bottom" tabindex="-1">
        <predictive-search class="predictive-search predictive-search--header" data-loading-text="{{ 'accessibility.loading' | t }}">
          <form action="{{ routes.search_url }}" method="get" role="search" class="search search-modal__form">
            <div class="field">
              <input
                class="search__input field__input"
                id="Search-In-Modal"
                type="search"
                name="q"
                value="{{ search.terms | escape }}"
                placeholder="{{ 'general.search.search' | t }}"
                {%- if predictive_search_enabled -%}
                  role="combobox"
                  aria-expanded="false"
                  aria-owns="predictive-search-results"
                  aria-controls="predictive-search-results"
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  autocorrect="off"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                {%- endif -%}
              >
              <label class="field__label" for="Search-In-Modal">{{ 'general.search.search' | t }}</label>
              <input type="hidden" name="options[prefix]" value="last">
              <button class="search__button field__button" aria-label="{{ 'general.search.search' | t }}">
                {%- render 'icon-search' -%}
              </button>
            </div>

            <div class="predictive-search predictive-search--header" tabindex="-1" data-predictive-search>
              {%- render 'predictive-search-content' -%}
            </div>

            <span class="predictive-search-status visually-hidden" role="status" aria-hidden="true"></span>
          </form>
        </predictive-search>
      </div>
    </div>
  </details>
</details-modal>
```

4. Ensure `<script src="{{ 'predictive-search.js' | asset_url }}" defer></script>` and `<script src="{{ 'details-modal.js' | asset_url }}" defer></script>` are loaded in theme.liquid (likely already loaded for cart drawer).
5. Verify CSS for `.search-modal`, `.modal-overlay`, `.search-modal__content` exists (from Dawn baseline). If not, copy minimal rules into `dopamiles-shared.css`.

### Step 3.5 — Review-card stars `role="img"` (Bug #13) [~5 min]

**Find file:** `grep -rn "doh-stars\|doh-rcard" sections/ snippets/`

Current (likely):
```liquid
<div class="doh-stars" aria-label="5 out of 5 stars">★★★★★</div>
```

Fix:
```liquid
<div class="doh-stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
```

### Step 3.6 — Collection progress bar `aria-label` (Bug #15) [~5 min]

**Find file:** `grep -rn "doc-progress" sections/ snippets/`

Current (likely):
```liquid
<div class="doc-progress" style="width: {{ progress_pct }}%"></div>
```

Fix:
```liquid
<div
  class="doc-progress"
  role="progressbar"
  aria-valuenow="{{ shown_count }}"
  aria-valuemin="0"
  aria-valuemax="{{ total_count }}"
  aria-label="Showing {{ shown_count }} of {{ total_count }} products"
  style="width: {{ progress_pct }}%"
></div>
```

## Acceptance criteria

- [x] Click color/size on PDP → product image swaps to variant's featured image (implemented via data-media-id + dop:variant-media-change event)
- [x] Click ATC → toast appears within 4s ("Added — view cart →"); button text resets (wrapped form in <product-form> element + PubSub-aware cancellation)
- [x] Newsletter heading "One letter a month." readable on dark section (white text) (handled in Phase 02 dopamiles-shared.css)
- [x] Tap header search icon → styled modal opens (not raw text in promo bar) (root cause: missing search.css global load; fixed one line in theme.liquid)
- [x] axe-core scan: 0 hits for `aria-prohibited-attr` or `aria-progressbar-name` (added role="img" to stars, aria-label + progressbar attrs to progress bar)

## Risks

- Search modal rebuild touches Dawn baseline structure; risk of breaking header layout. **Mitigation:** isolate changes, test on preview before publishing.
- ATC toast `setTimeout` polling is hacky; might fire spuriously if cart-add takes >4s. **Mitigation:** acceptable tradeoff for ship-ASAP; refactor to event-based later.

## Notes

- All changes are within section files — section-isolated, easy rollback.
- Search modal change is the most invasive; consider committing as a separate commit for easier revert.
