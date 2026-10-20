import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNrkMirrorIndex } from '../server/nrk-source-index.mjs';

const page = 'https://blog.nytsoi.net/nrk-torrents';
test('the exact cross-host Flåmsbanen link supplied by the user can be inspected', () => {
  const url = 'https://trainfulness.nytsoi.net/torrents/flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4.torrent';
  const index = inspectNrkMirrorIndex(`<a href="${url}">Flåmsbanen Full HD</a><a href="https://trainfulness.nytsoi.net.evil.invalid/f.torrent">Other</a>`, page);
  assert.equal(index.torrentLinks[0].fetchUrl, url); assert.equal(index.torrentLinks[0].canInspect, true);
  assert.equal(index.torrentLinks[1].canInspect, false);
});
test('discovery finds legacy HTTP, numeric filenames and magnet-only journey links', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const index = inspectNrkMirrorIndex(`<title>NRK archive</title><h2>Fl&#229;msbanen</h2>
    <a href="http://blog.nytsoi.net/files/123.torrent">1080p torrent</a>
    <a href="magnet:?xt=urn:btih:${hash}&amp;dn=Fl%C3%A5msbanen&amp;tr=https://user:public-page-key@tracker.invalid/announce">Fl&aring;msbanen 1080p</a>`, page);
  assert.equal(index.torrentLinkCount, 1); assert.equal(index.torrentLinks[0].fetchUrl, 'https://blog.nytsoi.net/files/123.torrent');
  assert.equal(index.torrentLinks[0].canInspect, true); assert.equal(index.torrentLinks[0].matchesJourney, true);
  assert.equal(index.magnetLinkCount, 1); assert.equal(index.magnetLinks[0].infoHash, hash);
  assert.equal(index.magnetLinks[0].magnet, `magnet:?xt=urn:btih:${hash}`);
  assert.equal(JSON.stringify(index).includes('public-page-key'), false);
});

test('unknown hosts, attachments and challenge pages stay visible without automatic approval', () => {
  const index = inspectNrkMirrorIndex('<title>NRK files</title><a href="https://files.example/Flamsbanen.torrent">Flåmsbanen</a><a href="/?attachment_id=42&amp;token=private-page-key">Download torrent</a><a href="https://user:pass@blog.nytsoi.net/f.torrent">Bad link</a>', page);
  assert.equal(index.torrentLinks[0].canInspect, false); assert.equal(index.relatedLinks[0].requiresReview, true);
  assert.equal(JSON.stringify(index).includes('private-page-key'), false); assert.equal(index.linkCount, 3);
  const challenge = inspectNrkMirrorIndex('<title>Verify your browser</title><script>privateScript()</script><p>Checking access</p>', page);
  assert.equal(challenge.pageTitle, 'Verify your browser'); assert.equal(challenge.magnetLinkCount, 0);
  assert.equal(challenge.pageExcerpt.includes('privateScript'), false);
});

test('base32 magnets normalize to their hash and duplicate magnets are collapsed', () => {
  const hash = '0000000000000000000000000000000000000000';
  const index = inspectNrkMirrorIndex(`<a href=magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA>Flamsbanen</a><a href="magnet:?xt=urn:btih:${hash}">Again</a>`, page);
  assert.equal(index.magnetLinkCount, 1); assert.equal(index.magnetLinks[0].infoHash, hash);
});
