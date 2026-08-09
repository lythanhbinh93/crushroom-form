/**
 * Regression tests for the Love Counter form's crop geometry, loading the REAL
 * picker configs out of assets/love-counter-upload.js.
 *
 * The background crop shipped as 16:9 landscape and had to be fixed: the page
 * is opened by scanning a QR on a bracelet — a portrait phone — and
 * counter-page.css paints the background full-viewport with cover, so a
 * landscape source loses most of its width to the viewport fit. This suite
 * pins the ratios so a future edit cannot silently flip them back.
 *
 * Run: node tests/love-counter-form-crop-geometry.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'love-counter-upload.js'), 'utf8');

/**
 * Pull the literal config object passed to createImagePicker for one key.
 * The key anchors IMMEDIATELY after the opening brace — a lazy [\s\S]*? before
 * the key would anchor at the first createImagePicker call in the file and
 * silently return a different picker's config.
 */
function pickerConfig(key) {
  const re = new RegExp("createImagePicker\\((\\{\\s*key: '" + key + "'[\\s\\S]*?\\})\\);");
  const m = src.match(re);
  if (!m) throw new Error('picker config not found for key: ' + key);
  return new Function('return (' + m[1] + ');')();
}

const male = pickerConfig('maleAvatar');
const female = pickerConfig('femaleAvatar');
const bg = pickerConfig('background');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

function ratio(o) { return o.width / o.height; }

console.log('-- background: 9:16 portrait, the shape of a phone that scanned the QR --');
ok('output is exactly 675x1200', bg.output.width === 675 && bg.output.height === 1200,
   bg.output.width + 'x' + bg.output.height);
ok('output ratio is exactly 9:16', Math.abs(ratio(bg.output) - 9 / 16) < 1e-9);
ok('viewport ratio matches the output ratio', Math.abs(ratio(bg.viewport) - ratio(bg.output)) < 1e-9,
   'viewport ' + bg.viewport.width + 'x' + bg.viewport.height);
ok('viewport is PORTRAIT (taller than wide)', bg.viewport.height > bg.viewport.width);
ok('viewport fits inside its boundary',
   bg.viewport.width <= bg.boundary.width && bg.viewport.height <= bg.boundary.height,
   'viewport ' + bg.viewport.width + 'x' + bg.viewport.height + ' vs boundary ' + bg.boundary.width + 'x' + bg.boundary.height);

console.log('\n-- avatars: square, they render in a circle --');
[['male', male], ['female', female]].forEach(function (pair) {
  const cfg = pair[1];
  ok(pair[0] + ' output is square 400x400', cfg.output.width === 400 && cfg.output.height === 400);
  ok(pair[0] + ' viewport is square and circular-cropped',
     cfg.viewport.width === cfg.viewport.height && cfg.viewport.type === 'circle');
  ok(pair[0] + ' viewport fits its boundary',
     cfg.viewport.width <= cfg.boundary.width && cfg.viewport.height <= cfg.boundary.height);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
