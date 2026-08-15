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
    grab(/function gpDriveFileIdFromLink\(link\) \{[\s\S]*?\n\}/),
    grab(/function gpFmtTime\(sec\) \{[\s\S]*?\n\}/),
    grab(/function gpEmbedUrl\(link\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { gpEmbedUrl, gpDriveFileIdFromLink, gpFmtTime };'
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
ok('every youtube shape carries the bare id for the branded player', (() => {
  const shapes = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=x',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ'
  ];
  return shapes.every(u => E(u).id === 'dQw4w9WgXcQ');
})());

console.log('\n-- Spotify shapes --');
ok('track', E('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC').src ===
   'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator');
ok('intl locale prefix stripped', E('https://open.spotify.com/intl-vi/track/4uLU6hMCjMI75M1A2tKUQC').src ===
   'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator');
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

console.log('\n-- branded player: Drive id extraction --');
const X = H.gpDriveFileIdFromLink;
ok('constructed /view link → id', X('https://drive.google.com/file/d/' + driveId + '/view') === driveId);
ok('bare file/d link → id', X('https://drive.google.com/file/d/' + driveId) === driveId);
ok('open?id= legacy link → id', X('https://drive.google.com/open?id=' + driveId + '&usp=x') === driveId);
ok('youtube link → empty (keeps the embed path)', X('https://youtu.be/dQw4w9WgXcQ') === '');
ok('folder link → empty', X('https://drive.google.com/drive/folders/' + driveId) === '');
ok('short id → empty', X('https://drive.google.com/file/d/tiny/view') === '');
ok('non-drive host with drive-looking path → empty',
   X('https://evil.example.com/file/d/' + driveId + '/view') === '');

console.log('\n-- branded player: time formatting --');
ok('0 → 0:00', H.gpFmtTime(0) === '0:00');
ok('65 → 1:05', H.gpFmtTime(65) === '1:05');
ok('3671 → 1:01:11', H.gpFmtTime(3671) === '1:01:11');
ok('garbage → 0:00', H.gpFmtTime('x') === '0:00');

console.log('\n-- branded player: source-reveal pins --');
ok('video rows stream through the worker, not Drive',
   /PROXY_URL \+ '\/video\/stream\/' \+ driveId/.test(src));
const mountSrc = grab(/function gpMountPlayer\(container, src, onFail\) \{[\s\S]*?\n  \}/);
const chromeSrc = grab(/function gpPlayerChrome\(container, mediaHtml, extraClass, onFail\) \{[\s\S]*?\n  \}/);
ok('player markup never references drive.google.com',
   mountSrc.indexOf('drive.google.com') === -1 &&
   chromeSrc.indexOf('drive.google.com') === -1);
ok('media failure falls back to the embed so the gift is never blank',
   /wrap\.remove\(\);\s*onFail\(\);/.test(chromeSrc) && /mountEmbedFallback\(data\)/.test(src));
ok('fail is gated on started — a mid-play hiccup keeps the player',
   /if \(chrome\.started\) return;/.test(chromeSrc));

console.log('\n-- branded player: YouTube backend pins --');
const ytSrc = grab(/function gpMountYtPlayer\(container, videoId, onFail\) \{[\s\S]*?\n  \}/);
ok('yt player embeds with the js api on the nocookie host',
   /youtube-nocookie\.com\/embed\//.test(ytSrc) &&
   /enablejsapi=1/.test(ytSrc) && /autoplay=1/.test(ytSrc));
ok('non-iOS stays chromeless inline; iPhone branch trades chrome for iOS native fullscreen',
   /&playsinline=1&controls=0&disablekb=1/.test(ytSrc) &&
   /\? '&controls=1'/.test(ytSrc) &&
   /iosNativeFs = !chrome\.wrap\.requestFullscreen/.test(ytSrc));
ok('iframe is created lazily on the first play tap (activation → sound)',
   /if \(!iframe\) \{[\s\S]{0,400}createIframe\(\);[\s\S]{0,80}return;\s*\}/.test(ytSrc));
ok('iframe carries the autoplay allow delegation', /allow', 'autoplay/.test(ytSrc));
ok('messages from other windows are ignored',
   /e\.source !== iframe\.contentWindow/.test(ytSrc));
ok('youtube errors and silence both downgrade to the embed',
   /d\.event === 'onError'/.test(ytSrc) && /setTimeout\(function \(\) \{ chrome\.fail\(\); \}/.test(ytSrc));
ok('pre-play frame is our own poster from the thumb host',
   /i\.ytimg\.com\/vi\//.test(ytSrc) && /gp-vp-poster/.test(ytSrc));

console.log('\n-- auto fullscreen on first play --');
ok('native: first play enters fullscreen once, inside the tap gesture',
   /if \(!autoFsDone\) \{ autoFsDone = true; goFullscreen\(\); \}/.test(mountSrc) &&
   /video\.play\(\)\.catch/.test(mountSrc));
ok('native: iOS falls back to the video element fullscreen',
   /webkitEnterFullscreen && !chrome\.wrap\.requestFullscreen/.test(mountSrc));
ok('yt: fullscreen rides the same gesture that creates the iframe',
   /goFullscreen\(\);\s*createIframe\(\);/.test(ytSrc));
ok('yt: iPhone retires our chrome when the iframe exists (taps reach YT)',
   /gp-vp-yt-native/.test(ytSrc) &&
   /if \(iosNativeFs\) chrome\.wrap\.classList\.add/.test(ytSrc));

console.log('\n-- page render condition --');
ok('link rows and non-streamable video rows use the embed path',
   /\(data\.type === 'link' \|\| data\.type === 'video'\)/.test(src));
ok('video AND link rows both reach the branded-player gate',
   /\(data\.type === 'video' \|\| data\.type === 'link'\) && data\.media_link/.test(src));
ok('youtube links route to the branded yt player, spotify stays on embed',
   /emb\.kind === 'youtube' && emb\.id/.test(src) && /gpMountYtPlayer\(elEmbed, emb\.id/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
