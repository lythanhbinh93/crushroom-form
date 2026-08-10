/**
 * upload-sheet.js — the bottom-sheet stepper frame shared by both customer
 * upload forms (love-counter-upload.js and voice-upload.js).
 *
 * Owns only the FRAME: step visibility, progress dots, collapse-at-review,
 * expand-on-tap, keyboard avoidance (visualViewport) and focus scrolling.
 * Validation, hydration and submission stay in each form's controller —
 * those are where the two forms genuinely differ.
 *
 * Plain script tag + window.UploadSheet namespace, like every other asset.
 * Markup contract: opts.stepEls carry data-step="0..n"; the last step is the
 * review step, where the sheet collapses so the assembled page behind it is
 * the review.
 */
(function () {
  'use strict';

  /**
   * @param {Object} opts
   *   sheetEl   — the fixed bottom sheet (.lc-collapsed = grab-tap peek at review)
   *   grabEl    — the grab-handle button (toggles collapse at review)
   *   dotsEl    — container for the progress dots
   *   stepEls   — array of step sections, in order
   *   onStep(i) — called after every step change
   */
  function create(opts) {
    var sheetEl = opts.sheetEl;
    var stepEls = opts.stepEls;
    var reviewStep = stepEls.length - 1;

    var api = {
      step: 0,
      goStep: goStep
    };

    function renderDots() {
      opts.dotsEl.innerHTML = '';
      for (var i = 0; i < stepEls.length; i++) {
        var dot = document.createElement('i');
        if (i <= api.step) dot.className = 'on';
        opts.dotsEl.appendChild(dot);
      }
    }

    function goStep(i) {
      api.step = i;
      stepEls.forEach(function (el) {
        el.hidden = Number(el.getAttribute('data-step')) !== i;
      });
      renderDots();
      // The review step arrives EXPANDED: the submit button must be visible
      // without a discovery tap (auto-collapsing hid it below the 64px peek).
      // The review pane is short, so most of the page still shows above it;
      // tapping the grab collapses for the full-page look, and any earlier
      // step always clears a leftover collapse.
      if (i !== reviewStep) sheetEl.classList.remove('lc-collapsed');
      sheetEl.scrollTop = 0;
      if (opts.onStep) opts.onStep(i);
    }

    // Tap the grab zone to toggle at the review step; tap anywhere on a
    // collapsed sheet (except a button) to expand it.
    opts.grabEl.addEventListener('click', function () {
      if (api.step === reviewStep) sheetEl.classList.toggle('lc-collapsed');
    });
    sheetEl.addEventListener('click', function (e) {
      if (sheetEl.classList.contains('lc-collapsed') && !e.target.closest('button')) {
        sheetEl.classList.remove('lc-collapsed');
      }
    });

    // Keep the sheet above the iOS keyboard: lift it by however much height
    // the keyboard steals from the layout viewport.
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var onVV = function () {
        var stolen = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        sheetEl.style.bottom = stolen ? stolen + 'px' : '';
      };
      vv.addEventListener('resize', onVV);
      vv.addEventListener('scroll', onVV);
    }
    // Belt-and-braces: make sure the focused control is inside the sheet's view.
    sheetEl.addEventListener('focusin', function (e) {
      if (e.target && e.target.scrollIntoView) {
        setTimeout(function () {
          e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 250);
      }
    });

    return api;
  }

  window.UploadSheet = { create: create };
})();
