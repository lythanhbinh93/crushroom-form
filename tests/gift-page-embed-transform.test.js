/**
 * Regression tests for the gift page's embed transform, loading the REAL
 * gpEmbedUrl out of assets/gift-page.js.
 *
 * What these guard:
 *  1. Every real-world YouTube/Spotify URL shape maps to the right embed.
 *  2. The embed src is BUILT from validated segments — a crafted "allowed
 *     host" URL can never smuggle arbitrary content into the iframe.
 *  3. Untransformable links return null (page falls back to a plain anchor).
 *
 * Run: node tests/gift-page-embed-transform.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'gift-page.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in gift-page.js: ' + re);
  return m[0];
}

const H = new Function(
  [
    grab(/function gpIsVideoId\(id\) \{[\s\S]*?\n\}/),
    grab(/function gpIsDriveFileId\(id\) \{[\s\S]*?\n\}/),
    grab(/function gpEmbedUrl\(link\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { gpEmbedUrl };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const E = H.gpEmbedUrl;
const yt = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

console.log('-- YouTube shapes --');
ok('watch?v=', E('https://www.youtube.com/watch?v=dQw4w9WgXcQ').src === yt);
ok('watch with extra params', E('https://www.youtube.com/watch?t=42&v=dQw4w9WgXcQ&list=x').src === yt);
ok('youtu.be short', E('https://youtu.be/dQw4w9WgXcQ').src === yt);
ok('youtu.be with query', E('https://youtu.be/dQw4w9WgXcQ?si=share123').src === yt);
ok('shorts', E('https://www.youtube.com/shorts/dQw4w9WgXcQ').src === yt);
ok('music.youtube watch', E('https://music.youtube.com/watch?v=dQw4w9WgXcQ').src === yt);
ok('mobile host', E('https://m.youtube.com/watch?v=dQw4w9WgXcQ').src === yt);

console.log('\n-- Spotify shapes --');
ok('track', E('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC').src ===
   'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
ok('intl locale prefix stripped', E('https://open.spotify.com/intl-vi/track/4uLU6hMCjMI75M1A2tKUQC').src ===
   'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
ok('album', E('https://open.spotify.com/album/2up3OPMp9Tb4dAKM2erWXQ').kind === 'spotify');
ok('playlist with query', E('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x').kind === 'spotify');

console.log('\n-- Google Drive video shapes --');
const driveId = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const drivePreview = 'https://drive.google.com/file/d/' + driveId + '/preview';
ok('file/d share link', E('https://drive.google.com/file/d/' + driveId + '/view?usp=sharing').src === drivePreview);
ok('file/d without /view', E('https://drive.google.com/file/d/' + driveId).src === drivePreview);
ok('open?id= legacy link', E('https://drive.google.com/open?id=' + driveId + '&usp=drive_link').src === drivePreview);
ok('drive kind tagged', E('https://drive.google.com/file/d/' + driveId + '/view').kind === 'drive');
ok('folder link returns null', E('https://drive.google.com/drive/folders/' + driveId) === null);
ok('short/bad file id returns null', E('https://drive.google.com/file/d/tiny') === null);
ok('docs.google.com is not drive', E('https://docs.google.com/document/d/' + driveId + '/edit') === null);

console.log('\n-- no smuggling, no surprises --');
ok('watch without v returns null', E('https://www.youtube.com/watch?list=only') === null);
ok('bad video id returns null', E('https://www.youtube.com/watch?v=<script>') === null);
ok('unknown yt path returns null', E('https://www.youtube.com/@channel') === null);
ok('unknown spotify kind returns null', E('https://open.spotify.com/user/abc123defg') === null);
ok('non-allowlisted host returns null', E('https://evil.example.com/watch?v=dQw4w9WgXcQ') === null);
ok('blank returns null', E('') === null && E(null) === null);
ok('embed src is always a fixed-origin prefix', (() => {
  const cases = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/abc_def-123',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://drive.google.com/file/d/' + driveId + '/view'
  ];
  return cases.every(u => {
    const e = E(u);
    return e && (e.src.indexOf('https://www.youtube.com/embed/') === 0 ||
                 e.src.indexOf('https://open.spotify.com/embed/') === 0 ||
                 e.src.indexOf('https://drive.google.com/file/d/') === 0);
  });
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
