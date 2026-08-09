/**
 * Regression tests for the media-replacement path, loading the REAL maps and
 * functions out of the GAS file, the admin controller, and BOTH customer forms.
 *
 * What these guard:
 *  1. The GAS slot map is the security boundary of an unauthenticated endpoint:
 *     every column it can write must be a media column — never status, slug,
 *     names, or dates.
 *  2. Admin crop geometry must equal the customer forms' geometry EXACTLY. The
 *     public pages render one file per slot; an admin-cropped background at
 *     16:9 would reintroduce the landscape bug the form already fixed.
 *  3. Audio replacement must always overwrite peaks + duration — waveform
 *     peaks belonging to the previous audio are wrong data, not stale data.
 *
 * Run: node tests/admin-media-slots.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
}
const gasSrc = read('google-apps-script-voice.js');
const adminSrc = read('assets/admin-voice-tab.js');
const counterFormSrc = read('assets/love-counter-upload.js');
const voiceFormSrc = read('assets/voice-upload.js');

function grab(source, re, label) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate ' + label + ': ' + re);
  return m[0];
}

const GAS = new Function(
  [
    grab(gasSrc, /function csvSafe_\(v\) \{[\s\S]*?\n\}/, 'csvSafe_'),
    grab(gasSrc, /const VOICE_SHEET_HEADERS = \[[\s\S]*?\];/, 'VOICE_SHEET_HEADERS'),
    grab(gasSrc, /var MEDIA_SLOTS_BY_TYPE = \{[\s\S]*?\n\};/, 'MEDIA_SLOTS_BY_TYPE (gas)'),
    grab(gasSrc, /function buildMediaCellUpdates_\(spec, fileId, url, peaksJson, audioDuration\) \{[\s\S]*?\n\}/, 'buildMediaCellUpdates_')
  ].join('\n') +
  ';return { MEDIA_SLOTS_BY_TYPE, buildMediaCellUpdates_, VOICE_SHEET_HEADERS };'
)();

function buildAdminSlots(source) {
  return new Function(
    grab(source, /const MEDIA_SLOTS_BY_TYPE = Object\.assign\(Object\.create\(null\), \{[\s\S]*?\n  \}\);/, 'MEDIA_SLOTS_BY_TYPE (admin)') +
    ';return MEDIA_SLOTS_BY_TYPE;'
  )();
}
const ADMIN = buildAdminSlots(adminSrc);

/** Extract a createImagePicker config object from the counter form by key. */
function formPickerConfig(key) {
  const text = grab(counterFormSrc, new RegExp("\\{\\s*key: '" + key + "'[\\s\\S]*?quality: [\\d.]+", ''), 'picker ' + key) + ' }';
  return new Function('return ' + text)();
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function sameGeometry(a, b) {
  return JSON.stringify({ v: a.viewport, b: a.boundary, o: a.output, q: a.quality }) ===
         JSON.stringify({ v: b.viewport, b: b.boundary, o: b.output, q: b.quality });
}

console.log('-- GAS slot map: exact slots, media columns only --');
ok('voice slots are exactly [image, audio]',
   JSON.stringify(Object.keys(GAS.MEDIA_SLOTS_BY_TYPE.voice).sort()) === '["audio","image"]');
ok('counter slots are exactly [audio, bg, female, male]',
   JSON.stringify(Object.keys(GAS.MEDIA_SLOTS_BY_TYPE.counter).sort()) === '["audio","bg","female","male"]');
const MEDIA_COLUMNS = [
  'image_file_id', 'image_url', 'audio_file_id', 'audio_url',
  'male_image_file_id', 'male_image_url', 'female_image_file_id', 'female_image_url',
  'bg_file_id', 'bg_url', 'peaks', 'audio_duration'
];
Object.keys(GAS.MEDIA_SLOTS_BY_TYPE).forEach(function (type) {
  Object.keys(GAS.MEDIA_SLOTS_BY_TYPE[type]).forEach(function (slot) {
    const spec = GAS.MEDIA_SLOTS_BY_TYPE[type][slot];
    ok(type + '.' + slot + ' names real sheet columns',
       GAS.VOICE_SHEET_HEADERS.indexOf(spec.fileField) !== -1 &&
       GAS.VOICE_SHEET_HEADERS.indexOf(spec.urlField) !== -1);
    const updates = GAS.buildMediaCellUpdates_(spec, 'FILE', 'URL', '[1,2]', 3);
    const badCols = Object.keys(updates).filter(function (c) { return MEDIA_COLUMNS.indexOf(c) === -1; });
    ok(type + '.' + slot + ' updates touch media columns only', badCols.length === 0, JSON.stringify(badCols));
  });
});

console.log('\n-- audio slots always overwrite peaks + duration --');
const audioUpdates = GAS.buildMediaCellUpdates_(GAS.MEDIA_SLOTS_BY_TYPE.counter.audio, 'F', 'U', '', 0);
ok('blank peaks still written (clears stale ones)',
   'peaks' in audioUpdates && audioUpdates.peaks === '' &&
   'audio_duration' in audioUpdates && audioUpdates.audio_duration === 0);
const audioUpdates2 = GAS.buildMediaCellUpdates_(GAS.MEDIA_SLOTS_BY_TYPE.voice.audio, 'F', 'U', '=IMPORTRANGE("x")', 5);
ok('peaks pass through csvSafe_', audioUpdates2.peaks.charAt(0) === "'");
const imgUpdates = GAS.buildMediaCellUpdates_(GAS.MEDIA_SLOTS_BY_TYPE.counter.bg, 'F', 'U', '[1]', 9);
ok('image slots never touch peaks/duration', !('peaks' in imgUpdates) && !('audio_duration' in imgUpdates));

console.log('\n-- thumbnail mirror + removability are exactly where the contract says --');
ok('mirrorThumb only on counter.male',
   GAS.MEDIA_SLOTS_BY_TYPE.counter.male.mirrorThumb === true &&
   !GAS.MEDIA_SLOTS_BY_TYPE.counter.female.mirrorThumb &&
   !GAS.MEDIA_SLOTS_BY_TYPE.counter.bg.mirrorThumb &&
   !GAS.MEDIA_SLOTS_BY_TYPE.voice.image.mirrorThumb);
const maleUpdates = GAS.buildMediaCellUpdates_(GAS.MEDIA_SLOTS_BY_TYPE.counter.male, 'F', 'U', '', 0);
ok('male replacement mirrors the row thumbnail pair',
   maleUpdates.image_file_id === 'F' && maleUpdates.image_url === 'U');
ok('removable only counter.audio',
   GAS.MEDIA_SLOTS_BY_TYPE.counter.audio.removable === true &&
   !GAS.MEDIA_SLOTS_BY_TYPE.voice.audio.removable &&
   !GAS.MEDIA_SLOTS_BY_TYPE.voice.image.removable);

console.log('\n-- admin slot map mirrors the GAS map --');
['voice', 'counter'].forEach(function (type) {
  ok('admin ' + type + ' slots match GAS exactly',
     JSON.stringify(Object.keys(ADMIN[type]).sort()) === JSON.stringify(Object.keys(GAS.MEDIA_SLOTS_BY_TYPE[type]).sort()));
  Object.keys(ADMIN[type]).forEach(function (slot) {
    ok('admin ' + type + '.' + slot + ' kind matches GAS',
       ADMIN[type][slot].kind === GAS.MEDIA_SLOTS_BY_TYPE[type][slot].kind);
  });
});
ok('admin counter.audio removable flag matches GAS', ADMIN.counter.audio.removable === true);

console.log('\n-- crop geometry parity with the customer forms --');
ok('admin counter.male equals form maleAvatar', sameGeometry(ADMIN.counter.male, formPickerConfig('maleAvatar')));
ok('admin counter.female equals form femaleAvatar', sameGeometry(ADMIN.counter.female, formPickerConfig('femaleAvatar')));
ok('admin counter.bg equals form background (9:16 portrait)',
   sameGeometry(ADMIN.counter.bg, formPickerConfig('background')),
   JSON.stringify(ADMIN.counter.bg.output));

// voice-upload.js hardcodes its geometry inline rather than in a config object.
const vpm = voiceFormSrc.match(/viewport: \{ width: (\d+), height: (\d+), type: '(\w+)' \},\s*boundary: \{ width: (\d+), height: (\d+) \}/);
const vout = voiceFormSrc.match(/size: \{ width: (\d+), height: (\d+) \},\s*format: 'jpeg',\s*quality: ([\d.]+)/);
if (!vpm || !vout) throw new Error('could not extract voice-upload.js geometry');
const V = ADMIN.voice.image;
ok('admin voice.image viewport equals voice form',
   V.viewport.width === +vpm[1] && V.viewport.height === +vpm[2] && V.viewport.type === vpm[3]);
ok('admin voice.image boundary equals voice form',
   V.boundary.width === +vpm[4] && V.boundary.height === +vpm[5]);
ok('admin voice.image output + quality equal voice form',
   V.output.width === +vout[1] && V.output.height === +vout[2] && V.quality === +vout[3]);

console.log('\n-- mutation sensitivity: a drifted admin geometry must fail this suite --');
const mutated = buildAdminSlots(adminSrc.replace('output: { width: 675, height: 1200 }', 'output: { width: 1200, height: 675 }'));
ok('flipping bg back to landscape is caught', !sameGeometry(mutated.counter.bg, formPickerConfig('background')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
