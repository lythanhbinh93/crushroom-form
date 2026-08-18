/**
 * counter-render.js — shared render logic for the Love Counter.
 *
 * ONE renderer, TWO callers: the public page (counter-page.js) and the upload
 * form's live preview (love-counter-upload.js). The form preview must show
 * exactly what the published page will show for the same data — sharing the
 * functions makes drift impossible by construction, which is why nothing in
 * this file may know which caller it is serving.
 *
 * No module system on purpose — every asset in this repo is a plain script
 * tag. This file exposes a single namespace object, window.CounterRender, and
 * MUST be loaded before any script that uses it (counter.html and
 * love-counter-upload.html both list it first).
 *
 * Day-count rules (see docs/love-counter-submit-contract.md):
 *  - INCLUSIVE: the start date itself is day 1 (ngày đầu tiên = ngày 1).
 *  - "Today" resolves in Asia/Ho_Chi_Minh regardless of the viewer's clock.
 *  - Both endpoints of the diff go through Date.UTC, so DST anywhere is
 *    irrelevant and no viewer west of UTC ever sees the previous day.
 */
(function () {
  'use strict';

  var DEFAULT_TITLE = '❤️ Been Love Memory ❤️';

  /** Today's date in Vietnam as 'YYYY-MM-DD' (en-CA formats exactly that). */
  function todayInVN() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  /**
   * Inclusive days between two 'YYYY-MM-DD' strings: same day → 1.
   * Never new Date('YYYY-MM-DD') — that parses as UTC midnight and shifts a day
   * for any viewer west of UTC. Date.UTC on split components is exact.
   */
  function loveDays(startStr, todayStr) {
    var a = String(startStr).split('-').map(Number);
    var b = String(todayStr).split('-').map(Number);
    return Math.round(
      (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000
    ) + 1;
  }

  function formatTime(seconds) {
    var minutes = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
  }

  /**
   * Sheet cell → display string. A field the customer filled with digits only
   * ("1314", a love number) is stored by Sheets as a NUMBER and arrives from
   * GAS as one — Number has no .trim, so every text field must go through
   * here or a valid page dies with a TypeError.
   */
  function cellText(v) {
    return String(v == null ? '' : v).trim();
  }

  /** Drive share URL → thumbnail endpoint, the one Drive serves reliably to <img>. */
  function normalizeThumbUrl(url, size) {
    if (!url) return '';
    var s = String(url).trim();
    var m = s.match(/[-\w]{25,}/);
    if (!m || s.indexOf('drive.google.com') === -1) return s;
    return 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w' + (size || 800);
  }

  function extractDriveFileId(url) {
    if (!url) return '';
    var s = String(url).trim();
    var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
    if (m) return m[1];
    if (s.indexOf('drive.google.com') !== -1) {
      var m2 = s.match(/[-\w]{25,}/);
      if (m2) return m2[0];
    }
    return '';
  }

  /**
   * Only accept the exact thumbnail form normalizeThumbUrl rebuilds. A substring
   * check on 'drive.google.com' would pass a crafted value straight through to a
   * CSS url() / img src; the rebuilt prefix + [-\w] id is safe by construction.
   */
  function isDriveThumbUrl(src) {
    return typeof src === 'string' &&
      src.indexOf('https://drive.google.com/thumbnail?id=') === 0;
  }

  function setAvatar(imgEl, url) {
    var src = normalizeThumbUrl(url || '', 400);
    if (isDriveThumbUrl(src)) {
      imgEl.src = src;
      imgEl.onerror = function () { imgEl.removeAttribute('src'); };
    }
  }

  /**
   * Paint the static counter content into a caller-supplied element map.
   *
   * els: { bg, title, heartText, maleName, femaleName, maleImg, femaleImg,
   *        message } — the caller owns the lookups, so the same function
   * renders the public page and the form preview without either's markup
   * leaking in here. Day count, state screens and audio stay caller-side:
   * the count is stateful (rollover repaints), and the preview never streams.
   *
   * Safe to call repeatedly with evolving data — every branch writes both ways
   * (the message unhides on text and re-hides on blank), which the live form
   * preview relies on.
   */
  function renderCounterInto(els, data) {
    // Background — inline style beats the CSS gradient fallback only when set.
    var bgSrc = normalizeThumbUrl(data.bg_url || '', 1600);
    if (isDriveThumbUrl(bgSrc)) {
      els.bg.style.backgroundImage = 'url("' + bgSrc + '")';
    }

    // All customer strings land via textContent — never innerHTML.
    els.title.textContent = cellText(data.title) || DEFAULT_TITLE;
    els.heartText.textContent = cellText(data.heart_text);
    els.maleName.textContent = cellText(data.male_name);
    els.femaleName.textContent = cellText(data.female_name);

    setAvatar(els.maleImg, data.male_image_url);
    setAvatar(els.femaleImg, data.female_image_url);

    var msg = cellText(data.text_message);
    els.message.textContent = msg;
    els.message.hidden = !msg;
  }

  window.CounterRender = {
    DEFAULT_TITLE: DEFAULT_TITLE,
    todayInVN: todayInVN,
    loveDays: loveDays,
    formatTime: formatTime,
    cellText: cellText,
    normalizeThumbUrl: normalizeThumbUrl,
    extractDriveFileId: extractDriveFileId,
    isDriveThumbUrl: isDriveThumbUrl,
    setAvatar: setAvatar,
    renderCounterInto: renderCounterInto
  };
})();
