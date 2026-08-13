/**
 * Regression tests for the publish-lock, loading the REAL isRowPublishLocked_
 * out of google-apps-script-voice.js.
 *
 * What these guard:
 *  1. A published row can never be overwritten by the customer form — both
 *     submit handlers reject it BEFORE any Drive save (a locked identity must
 *     not leave orphaned anyone-with-link files).
 *  2. Pending/archived rows keep today's resubmit-with-kept-slug behavior;
 *     archive→restore (status back to 'pending') unlocks — the lock tests
 *     'published' equality only.
 *  3. Staff endpoints (editVoice/replaceMedia/publish/archive) are NOT gated —
 *     they are the designed post-publish edit path.
 *
 * Run: node tests/gas-publish-lock.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'google-apps-script-voice.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');

function grab(re, name) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate ' + (name || re));
  return m[0];
}

const H = new Function(
  [
    grab(/const VOICE_SHEET_HEADERS = \[[\s\S]*?\];/, 'VOICE_SHEET_HEADERS'),
    grab(/function rowFromObject_\(obj\) \{[\s\S]*?\n\}/, 'rowFromObject_'),
    grab(/function isRowPublishLocked_\(existing\) \{[\s\S]*?\n\}/, 'isRowPublishLocked_')
  ].join('\n') + ';return { rowFromObject_, isRowPublishLocked_ };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const rowWith = (status) => ({ rowIdx: 5, row: H.rowFromObject_({ status: status, type: 'voice' }) });

console.log('-- lock predicate --');
ok('no existing row is never locked', H.isRowPublishLocked_(null) === false);
ok('published row locks', H.isRowPublishLocked_(rowWith('published')) === true);
ok('pending row does not lock', H.isRowPublishLocked_(rowWith('pending')) === false);
ok('archived row does not lock (restore path stays open)',
   H.isRowPublishLocked_(rowWith('archived')) === false);
ok('restored row (pending again) is unlocked', H.isRowPublishLocked_(rowWith('pending')) === false);
ok('case/whitespace tolerated', H.isRowPublishLocked_(rowWith(' Published ')) === true);
ok('blank status does not lock', H.isRowPublishLocked_(rowWith('')) === false);

console.log('\n-- both submit handlers reject BEFORE any Drive save --');
const finishSrc = grab(/function handleFinishUpload_\(e\) \{[\s\S]*?\n    \}\n\}/, 'handleFinishUpload_');
const counterSrc = grab(/function handleSubmitCounter_\(e\) \{[\s\S]*?\n\}/, 'handleSubmitCounter_');

function lockBeforeSave(handlerSrc, saveMarker) {
  const lockIdx = handlerSrc.indexOf('isRowPublishLocked_');
  const saveIdx = handlerSrc.indexOf(saveMarker);
  return lockIdx !== -1 && saveIdx !== -1 && lockIdx < saveIdx;
}
ok('finishUpload locks before its audio/image saves',
   lockBeforeSave(finishSrc, 'createFile'));
ok('finishUpload returns the published_locked error',
   /published_locked/.test(finishSrc));
ok('submitCounter locks before saveCounterImage_',
   lockBeforeSave(counterSrc, 'saveCounterImage_'));
ok('submitCounter returns the published_locked error',
   /published_locked/.test(counterSrc));

console.log('\n-- staff endpoints stay ungated --');
['handleEditVoice_', 'handleReplaceMedia_', 'handlePublishVoice_', 'handleArchiveVoice_'].forEach(function (fn) {
  const s = grab(new RegExp('function ' + fn + '\\(e\\) \\{[\\s\\S]*?\\n\\}'), fn);
  ok(fn + ' has no publish-lock', s.indexOf('isRowPublishLocked_') === -1);
});

console.log('\n-- status flips serialize with customer submits (script lock) --');
// Without this, a submit in flight during publish rewrites the row from its
// stale pre-publish read and wipes the minted slug — bricking that QR.
['handlePublishVoice_', 'handleArchiveVoice_', 'handleFinishUpload_', 'handleSubmitCounter_'].forEach(function (fn) {
  const s = grab(new RegExp('function ' + fn + '\\(e\\) \\{[\\s\\S]*?\\n\\}'), fn);
  ok(fn + ' checks tryLock and fails busy',
     /if \(!lock\.tryLock\(30000\)\)/.test(s));
});
['handlePublishVoice_', 'handleArchiveVoice_'].forEach(function (fn) {
  const s = grab(new RegExp('function ' + fn + '\\(e\\) \\{[\\s\\S]*?releaseLock[\\s\\S]*?\\n\\}'), fn + ' finally');
  ok(fn + ' releases the lock', /finally \{\s*lock\.releaseLock\(\);/.test(s));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
