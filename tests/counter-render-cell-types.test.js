/**
 * Regression tests for sheet-cell TYPE handling in the Love Counter renderer,
 * loading the REAL functions out of assets/counter-render.js.
 *
 * The bug this locks out: a customer whose heart text (or name, or title, or
 * message) is digits only — "1314" is a common love number — has that cell
 * stored by Google Sheets as a NUMBER. GAS returns it as a number, and the
 * old `(data.heart_text || '').trim()` threw
 *   TypeError: (data.heart_text || "").trim is not a function
 * inside renderCounterInto, before the page hid its loader, so the whole
 * published counter fell through to the error screen. Live case:
 * qr.crushroom.vn/counter?id=ab2498515e.
 *
 * Every text field must therefore survive a number, and 0 must render as "0"
 * rather than vanish through a falsy `||` default.
 *
 * Run: node tests/counter-render-cell-types.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'counter-render.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'counter-page.js'), 'utf8');
const voiceSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'voice-page.js'), 'utf8');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in counter-render.js: ' + re);
  return m[0];
}

// Two-space closing-brace anchor: these functions live inside the module IIFE.
const H = new Function(
  [
    grab(/var DEFAULT_TITLE = .*;/),
    grab(/function cellText\(v\) \{[\s\S]*?\n  \}/),
    grab(/function normalizeThumbUrl\(url, size\) \{[\s\S]*?\n  \}/),
    grab(/function isDriveThumbUrl\(src\) \{[\s\S]*?\n  \}/),
    grab(/function setAvatar\(imgEl, url\) \{[\s\S]*?\n  \}/),
    grab(/function renderCounterInto\(els, data\) \{[\s\S]*?\n  \}/)
  ].join('\n') + ';return { DEFAULT_TITLE, cellText, renderCounterInto };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

/** Minimal stand-ins for the elements the renderer writes into. */
function makeEls() {
  const el = () => ({ textContent: '', hidden: false, style: {}, src: '', removeAttribute() {} });
  return {
    bg: el(), title: el(), heartText: el(), maleName: el(), femaleName: el(),
    maleImg: el(), femaleImg: el(), message: el()
  };
}

console.log('-- cellText coercion --');
ok('number becomes its digits', H.cellText(1314) === '1314');
ok('zero survives (not swallowed by a falsy default)', H.cellText(0) === '0');
ok('string is trimmed', H.cellText('  yêu em  ') === 'yêu em');
ok('null and undefined become empty', H.cellText(null) === '' && H.cellText(undefined) === '');
ok('missing key becomes empty', H.cellText({}.nope) === '');

console.log('-- the live failure: numeric heart_text --');
const numericRow = {
  start_date: '2026-06-16',
  title: '❤️ Been Love Memory ❤️',
  heart_text: 1314,          // exactly what GAS returned for ab2498515e
  male_name: '蔡士杰',
  female_name: 'Thiên thanh',
  text_message: ''
};
let threw = null;
const els = makeEls();
try { H.renderCounterInto(els, numericRow); } catch (e) { threw = e; }
ok('renderCounterInto no longer throws on a numeric cell', threw === null,
   threw && threw.message);
ok('numeric heart text renders as digits', els.heartText.textContent === '1314');
ok('the rest of the row still paints', els.maleName.textContent === '蔡士杰' &&
   els.femaleName.textContent === 'Thiên thanh');

console.log('-- every text field survives a number --');
const allNumeric = makeEls();
let threw2 = null;
try {
  H.renderCounterInto(allNumeric, {
    title: 2026, heart_text: 520, male_name: 123, female_name: 456, text_message: 789
  });
} catch (e) { threw2 = e; }
ok('no field throws when the whole row is numeric', threw2 === null, threw2 && threw2.message);
ok('numeric title renders (does not fall back to the default)',
   allNumeric.title.textContent === '2026');
ok('numeric message unhides the message block',
   allNumeric.message.textContent === '789' && allNumeric.message.hidden === false);

console.log('-- string rows unchanged (no regression) --');
const stringy = makeEls();
H.renderCounterInto(stringy, {
  title: '  Yêu  ', heart_text: ' 1314 ', male_name: ' A ', female_name: ' B ', text_message: '  '
});
ok('strings still trimmed', stringy.title.textContent === 'Yêu' &&
   stringy.heartText.textContent === '1314' && stringy.maleName.textContent === 'A');
ok('blank title still falls back to the default',
   (() => { const e = makeEls(); H.renderCounterInto(e, { title: '   ' });
            return e.title.textContent === H.DEFAULT_TITLE; })());
ok('whitespace-only message stays hidden',
   stringy.message.textContent === '' && stringy.message.hidden === true);

console.log('-- no unguarded .trim() left on sheet fields --');
// Lookbehind so the already-safe String(data.x || '').trim() form does not
// register as a hit — only a bare, unwrapped call does.
const unsafe = /(?<!String)\((?:data|resp)\.[a-z_]+ \|\| ['"]{2}\)\.trim\(\)/;
ok('counter-render.js has no bare (data.x || "").trim()', !unsafe.test(src),
   (src.match(unsafe) || [])[0]);
ok('counter-page.js audio_title goes through cellText',
   /CR\.cellText\(data\.audio_title\)/.test(pageSrc) && !unsafe.test(pageSrc));
ok('voice-page.js message is String()-wrapped first',
   /String\(data\.text_message == null \? '' : data\.text_message\)\.trim\(\)/.test(voiceSrc) &&
   !unsafe.test(voiceSrc));
ok('cellText is exported for both callers', /cellText: cellText/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
