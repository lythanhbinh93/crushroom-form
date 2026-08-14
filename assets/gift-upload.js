/**
 * gift-upload.js — the type chooser in front of every customer upload form.
 *
 * One link for CS to send: /gift-upload?phone=X&order=Y[&types=a,b].
 * Picking a card forwards to that type's form page with the query carried
 * verbatim (minus `types`). `types` is a CS-side constraint: a link can
 * narrow the choice to what the customer actually bought; unknown or empty
 * values fall back to showing every enabled type, so a typo in a sent link
 * can never strand a customer on an empty page.
 *
 * Card list is data-driven — future gift types only append entries here.
 */

var GIFT_TYPES = [
  {
    key: 'voice', page: 'voice-upload', icon: '🎙️',
    title: 'Lời nhắn giọng nói',
    desc: 'Ghi âm lời nhắn của bạn kèm một tấm ảnh — người nhận quét QR để nghe.'
  },
  {
    key: 'counter', page: 'love-counter-upload', icon: '❤️',
    title: 'Love Counter',
    desc: 'Trang đếm ngày yêu nhau với ảnh hai bạn, ảnh nền và nhạc riêng.'
  },
  {
    key: 'link', page: 'link-upload', icon: '🎵',
    title: 'Bài hát / video',
    desc: 'Dán link YouTube, Spotify hoặc video Google Drive — người nhận quét QR để nghe và xem ngay.'
  },
  {
    key: 'image', page: 'image-upload', icon: '🖼️',
    title: 'Tấm ảnh kỷ niệm',
    desc: 'Một tấm ảnh đẹp kèm lời nhắn của bạn.'
  },
  {
    key: 'video', page: 'video-upload', icon: '🎬',
    title: 'Video kỷ niệm',
    desc: 'Tải video từ máy lên (tối đa 500MB) — người nhận quét QR để xem ngay.'
  }
];

/**
 * Which cards a link shows. `typesParam` is the raw ?types= value; blank or
 * all-unknown falls back to every type. Pure — extracted by the Node tests.
 */
function guChooserCards(allTypes, typesParam) {
  var allow = String(typesParam || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
  if (!allow.length) return allTypes;
  var filtered = allTypes.filter(function (t) { return allow.indexOf(t.key) !== -1; });
  return filtered.length ? filtered : allTypes;
}

/**
 * The query string to carry to the chosen form: everything except `types`.
 * The forms read phone/order themselves — forwarding verbatim means a future
 * param added to sent links keeps working with no chooser change. Pure.
 */
function guForwardQuery(search) {
  var params = new URLSearchParams(search || '');
  params.delete('types');
  var qs = params.toString();
  return qs ? '?' + qs : '';
}

/* ── Controller ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  var listEl = document.getElementById('gift-type-list');
  var params = new URLSearchParams(location.search);
  var cards = guChooserCards(GIFT_TYPES, params.get('types'));
  var forward = guForwardQuery(location.search);

  // A link constrained to exactly one valid type skips the chooser — the
  // customer lands straight on their form, params intact.
  if (params.get('types') && cards.length === 1) {
    location.replace('/' + cards[0].page + forward);
    return;
  }

  cards.forEach(function (t) {
    var a = document.createElement('a');
    a.className = 'gu-card';
    a.href = '/' + t.page + forward;
    a.innerHTML =
      '<span class="gu-icon" aria-hidden="true"></span>' +
      '<span class="gu-body"><strong></strong><small></small></span>' +
      '<span class="gu-arrow" aria-hidden="true">→</span>';
    a.querySelector('.gu-icon').textContent = t.icon;
    a.querySelector('strong').textContent = t.title;
    a.querySelector('small').textContent = t.desc;
    listEl.appendChild(a);
  });
});
