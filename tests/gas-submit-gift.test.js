/**
 * Regression tests for the simple gift types (link / image), loading the REAL
 * isAllowedGiftLink_ and whitelist maps out of google-apps-script-voice.js.
 *
 * What these guard:
 *  1. The link allowlist is a security boundary — https only, exact host
 *     match, no lookalike/userinfo/subdomain smuggling.
 *  2. handleSubmitGift_ follows every submit-handler rule: script lock,
 *     lookup → publish-lock BEFORE the Drive save, keep-flag fail-closed via
 *     the shared resolver, slug kept, canonical Drive names.
 *  3. The type maps gained exactly the intended entries and getSubmission /
 *     editVoice / replaceMedia can serve the new types through them.
 *
 * Run: node tests/gas-submit-gift.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'google-apps-script-voice.js'), 'utf8').replace(/\r\n/g, '\n');

function grab(re, name) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate ' + (name || re));
  return m[0];
}

const H = new Function(
  [
    grab(/var GIFT_LINK_HOSTS = \[[\s\S]*?\];/, 'GIFT_LINK_HOSTS'),
    grab(/function isAllowedGiftLink_\(url\) \{[\s\S]*?\n\}/, 'isAllowedGiftLink_'),
    grab(/var SUBMISSION_RESPONSE_FIELDS = \{[\s\S]*?\n\};/, 'SUBMISSION_RESPONSE_FIELDS'),
    grab(/var EDITABLE_FIELDS_BY_TYPE = \{[\s\S]*?\n\};/, 'EDITABLE_FIELDS_BY_TYPE'),
    grab(/var MEDIA_SLOTS_BY_TYPE = \{[\s\S]*?\n\};/, 'MEDIA_SLOTS_BY_TYPE')
  ].join('\n') +
  ';return { isAllowedGiftLink_, SUBMISSION_RESPONSE_FIELDS, EDITABLE_FIELDS_BY_TYPE, MEDIA_SLOTS_BY_TYPE };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const allow = H.isAllowedGiftLink_;

console.log('-- link allowlist accepts the real services --');
ok('youtube watch', allow('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
ok('youtu.be short', allow('https://youtu.be/dQw4w9WgXcQ'));
ok('youtube music', allow('https://music.youtube.com/watch?v=abc'));
ok('spotify track', allow('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'));
ok('drive video share link', allow('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing'));
ok('bare allowed host', allow('https://youtu.be'));

console.log('\n-- and rejects everything else --');
ok('http rejected', !allow('http://www.youtube.com/watch?v=x'));
ok('random host rejected', !allow('https://evil.example.com/watch?v=x'));
ok('lookalike suffix rejected', !allow('https://youtube.com.evil.vn/x'));
ok('subdomain smuggle rejected', !allow('https://evil.youtube.com.evil.vn/x'));
ok('userinfo smuggle rejected', !allow('https://youtube.com@evil.vn/x'));
ok('docs.google.com rejected (only drive.google.com carries video)',
   !allow('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit'));
ok('javascript: rejected', !allow('javascript:alert(1)'));
ok('blank rejected', !allow('') && !allow(null));

console.log('\n-- type maps gained exactly the intended entries --');
ok('getSubmission serves link (no slug/phone)', JSON.stringify(H.SUBMISSION_RESPONSE_FIELDS.link) ===
   JSON.stringify(['text_message', 'media_link', 'image_file_id', 'status']));
ok('getSubmission serves image', JSON.stringify(H.SUBMISSION_RESPONSE_FIELDS.image) ===
   JSON.stringify(['text_message', 'image_file_id', 'status']));
ok('editVoice: link edits media_link (validated) + message',
   H.EDITABLE_FIELDS_BY_TYPE.link.media_link.link === true &&
   H.EDITABLE_FIELDS_BY_TYPE.link.media_link.required === true &&
   H.EDITABLE_FIELDS_BY_TYPE.link.text_message.max === 1000);
ok('editVoice: image edits message only',
   JSON.stringify(Object.keys(H.EDITABLE_FIELDS_BY_TYPE.image)) === JSON.stringify(['text_message']));
ok('replaceMedia: image slot required on image gifts, removable on link gifts',
   !H.MEDIA_SLOTS_BY_TYPE.image.image.removable &&
   H.MEDIA_SLOTS_BY_TYPE.link.image.removable === true &&
   H.MEDIA_SLOTS_BY_TYPE.link.image.fileField === 'image_file_id');

console.log('\n-- submitGift handler source pins --');
const g = grab(/function handleSubmitGift_\(e\) \{[\s\S]*?\n\}/, 'handleSubmitGift_');
ok('takes and checks the script lock', /if \(!lock\.tryLock\(30000\)\)/.test(g));
ok('releases the lock', /finally \{\s*lock\.releaseLock\(\);/.test(g));
ok('publish-lock before the Drive save',
   g.indexOf('isRowPublishLocked_') !== -1 &&
   g.indexOf('isRowPublishLocked_') < g.indexOf('saveCounterImage_'));
ok('link validated before any write',
   g.indexOf('isAllowedGiftLink_') !== -1 &&
   g.indexOf('isAllowedGiftLink_') < g.indexOf('voiceFindRowByKey_'));
ok('keep-flag resolves through the shared fail-closed resolver',
   /resolveKeptSlot_\(e\.parameter,[\s\S]{0,80}'keepImage', 'image_file_id', 'image_url'\)/.test(g));
ok('fresh image wins over kept', /if \(!image\) image = keptImage;/.test(g));
ok('slug + published_at kept across resubmission',
   /slug: keptSlug,\s*published_at: keptPublishedAt/.test(g));
ok('canonical Drive name', /driveFileName_\(phone, orderId, 'image', 'jpg'\)/.test(g));
ok('row keyed by its own type', /voiceFindRowByKey_\(phone, orderId, type\)/.test(g));

console.log('\n-- getGift + publish routing pins --');
const gg = grab(/function handleGetGift_\(e\) \{[\s\S]*?\n\}/, 'handleGetGift_');
ok('getGift serves only published link/image rows',
   /ROW_TYPE_LINK && type !== ROW_TYPE_IMAGE/.test(gg) && /'published'/.test(gg));
ok('getGift never returns slug/phone as fields',
   gg.indexOf('phone:') === -1 && gg.indexOf('slug:') === -1);
ok('publish routes link/image to the gift page',
   /ROW_TYPE_LINK \|\| type === ROW_TYPE_IMAGE\) \? GIFT_PAGE_BASE_URL/.test(src));
ok('media_link column appended to the headers',
   /'media_link'\s*\]/.test(grab(/const VOICE_SHEET_HEADERS = \[[\s\S]*?\];/, 'headers')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
