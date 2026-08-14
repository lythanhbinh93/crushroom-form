/**
 * Regression tests for the gift-type chooser's pure logic, loading the REAL
 * guChooserCards / guForwardQuery out of assets/gift-upload.js.
 *
 * What these guard:
 *  1. ?types= narrows the cards; blank/unknown values fall back to ALL types
 *     (a typo in a CS-sent link must never strand a customer on an empty page).
 *  2. The forwarded query carries everything verbatim EXCEPT `types` — the
 *     forms depend on phone/order arriving untouched.
 *  3. The card registry contains the two live types with the right form pages.
 *
 * Run: node tests/gift-upload-chooser.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'gift-upload.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in gift-upload.js: ' + re);
  return m[0];
}

const H = new Function(
  [
    grab(/var GIFT_TYPES = \[[\s\S]*?\n\];/),
    grab(/function guChooserCards\(allTypes, typesParam\) \{[\s\S]*?\n\}/),
    grab(/function guForwardQuery\(search\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { GIFT_TYPES, guChooserCards, guForwardQuery };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const T = H.GIFT_TYPES;
const keys = (cards) => cards.map(c => c.key).join(',');

console.log('-- registry --');
ok('voice card routes to voice-upload',
   T.some(t => t.key === 'voice' && t.page === 'voice-upload'));
ok('counter card routes to love-counter-upload',
   T.some(t => t.key === 'counter' && t.page === 'love-counter-upload'));
ok('link card routes to link-upload',
   T.some(t => t.key === 'link' && t.page === 'link-upload'));
ok('image card routes to image-upload',
   T.some(t => t.key === 'image' && t.page === 'image-upload'));
ok('video card routes to video-upload',
   T.some(t => t.key === 'video' && t.page === 'video-upload'));

console.log('\n-- types filter --');
ok('no types param shows everything', keys(H.guChooserCards(T, null)) === keys(T));
ok('types=voice narrows to voice', keys(H.guChooserCards(T, 'voice')) === 'voice');
ok('types list narrows and keeps registry order',
   keys(H.guChooserCards(T, 'counter,voice')) === 'voice,counter');
ok('unknown-only types fall back to everything',
   keys(H.guChooserCards(T, 'hologram')) === keys(T));
ok('mixed unknown+known keeps the known one',
   keys(H.guChooserCards(T, 'hologram,counter')) === 'counter');
ok('case/whitespace tolerated', keys(H.guChooserCards(T, ' VOICE ')) === 'voice');

console.log('\n-- query forwarding --');
ok('phone and order carried verbatim',
   H.guForwardQuery('?phone=0912345678&order=DH-1') === '?phone=0912345678&order=DH-1');
ok('types is stripped from the forwarded query',
   H.guForwardQuery('?phone=09&types=voice&order=A') === '?phone=09&order=A');
ok('empty search forwards nothing', H.guForwardQuery('') === '');
ok('only-types search forwards nothing', H.guForwardQuery('?types=voice') === '');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
