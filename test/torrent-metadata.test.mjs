import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTorrent, sameTorrentContent } from '../server/torrent-metadata.mjs';

function encode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === 'string') return encode(Buffer.from(value));
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  return Buffer.concat([Buffer.from('d'), ...Object.keys(value).sort().flatMap(key => [encode(key), encode(value[key])]), Buffer.from('e')]);
}
const technicalInfo = { length: 1024, name: 'technical-fixture-not-real-nrk.mp4', 'piece length': 512, pieces: Buffer.alloc(40, 7), private: 1 };

test('content comparison survives tracker/name/privacy changes but rejects different file bytes', () => {
  const original = inspectTorrent(encode({ announce: 'https://original.invalid/announce', info: technicalInfo }));
  const mirror = inspectTorrent(encode({ announce: 'https://mirror.invalid/announce', info: { ...technicalInfo, name: 'different-name.mp4', private: 0 } }));
  assert.equal(original.privateTorrent, true); assert.equal(mirror.privateTorrent, false);
  assert.notEqual(original.infoHash, mirror.infoHash); assert.equal(sameTorrentContent(original, mirror), true);
  const changed = inspectTorrent(encode({ info: { ...technicalInfo, pieces: Buffer.alloc(40, 8) } }));
  assert.equal(sameTorrentContent(original, changed), false);
});

test('metadata inspection rejects oversized, truncated, inconsistent and ambiguous input', () => {
  for (const bytes of [Buffer.alloc(500001), Buffer.from('degarbage'), Buffer.from('d4:infoi-0ee'), Buffer.from('d4:info999:bad'), encode({ info: { ...technicalInfo, pieces: Buffer.alloc(20) } }), Buffer.from('d4:infoi1e4:infoi2ee')]) assert.throws(() => inspectTorrent(bytes));
});
