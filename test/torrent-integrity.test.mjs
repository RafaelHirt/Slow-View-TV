import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectTorrent, compareTorrentMetadata } from '../server/torrent-metadata.mjs';
import { verifyTorrentFile } from '../server/torrent-integrity.mjs';
import { downloadNrkTorrent, FLAMSBANEN, validateFlamsbanenMirror } from '../server/nrk-ingest.mjs';

function encode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === 'string') return encode(Buffer.from(value));
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  return Buffer.concat([Buffer.from('d'), ...Object.keys(value).sort().flatMap(key => [encode(key), encode(value[key])]), Buffer.from('e')]);
}
function torrent(data, pieceLength, privateTorrent) {
  const hashes = [];
  for (let start = 0; start < data.length; start += pieceLength) hashes.push(createHash('sha1').update(data.subarray(start, start + pieceLength)).digest());
  return encode({ info: { name: FLAMSBANEN.filename, length: data.length, 'piece length': pieceLength, pieces: Buffer.concat(hashes), private: Number(privateTorrent) } });
}
async function fixture(t, corruptMirror = false) {
  const directory = await mkdtemp(join(tmpdir(), 'slowview-original-pieces-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const originalData = randomBytes(262144 * 9 + 73), mirrorData = Buffer.from(originalData);
  if (corruptMirror) mirrorData[300000] ^= 1;
  const official = torrent(originalData, 262144, true), mirror = torrent(mirrorData, 2097152, false);
  const originalInfo = inspectTorrent(official), mirrorInfo = inspectTorrent(mirror);
  const preset = { ...FLAMSBANEN, ...originalInfo, torrentSha256: originalInfo.metadataSha256,
    mirrorTorrentSha256: mirrorInfo.metadataSha256, mirrorInfoHash: mirrorInfo.infoHash, mirrorPieceLength: mirrorInfo.pieceLength };
  const path = join(directory, FLAMSBANEN.filename), input = join(directory, 'technical-source-not-real-nrk.bin');
  await writeFile(input, mirrorData); await writeFile(join(directory, 'source.torrent'), official);
  const binary = join(directory, 'technical-transfer');
  await writeFile(binary, `#!${process.execPath}\nrequire('node:fs').copyFileSync(${JSON.stringify(input)},${JSON.stringify(path)});\nprocess.stdout.write('[#technical ${mirrorData.length}B/${mirrorData.length}B(100%) CN:0]\\n');\n`, { mode: 0o700 });
  return { directory, path, binary, preset, official, mirror, originalData, mirrorData, originalInfo, mirrorInfo };
}

test('a different partition is unknown before file verification, not proof of different media', async t => {
  const f = await fixture(t), comparison = compareTorrentMetadata(f.originalInfo, f.mirrorInfo);
  assert.deepEqual(comparison, { filenameMatches: true, sizeMatches: true, samePartition: false, contentMatchesOfficial: null });
  assert.equal(validateFlamsbanenMirror(f.mirror, f.preset).pieceLength, 2097152);
  assert.throws(() => validateFlamsbanenMirror(f.mirror, { ...f.preset, mirrorTorrentSha256: 'unreviewed' }), /outra divisão/);
  assert.equal(inspectTorrent(f.official).pieceHashes, undefined);
  assert.equal(inspectTorrent(f.official, { includePieces: true }).pieceHashes.length, 10 * 20);
});

test('streamed verification checks every original piece, including a short final piece', async t => {
  const f = await fixture(t), progress = [];
  await writeFile(f.path, f.originalData);
  const proof = await verifyTorrentFile(f.path, f.official, { onProgress: value => progress.push(value) });
  assert.equal(proof.bytes, f.originalData.length); assert.equal(proof.pieces, 10);
  assert.equal(proof.fileSha256, createHash('sha256').update(f.originalData).digest('hex'));
  assert.deepEqual(progress[0], { verified: 0, total: f.originalData.length });
  assert.deepEqual(progress.at(-1), { verified: f.originalData.length, total: f.originalData.length });
  await writeFile(f.path, f.originalData.subarray(0, -1));
  await assert.rejects(verifyTorrentFile(f.path, f.official), /tamanho/);
});

test('selected public transfer is accepted only after the complete file matches the original reference', async t => {
  const f = await fixture(t), updates = []; let checks = 0;
  const result = await downloadNrkTorrent({ ...f, signal: new AbortController().signal,
    fetchImpl: async url => { assert.equal(url, f.preset.mirrorUrl); return new Response(f.mirror); },
    onDiagnostic: value => updates.push(value), onVerification: () => checks++ });
  assert.equal(result, f.path); assert.equal(checks, 1);
  assert.ok(updates.some(value => value.verification === 'pending' && !value.contentVerified));
  assert.ok(updates.some(value => value.verification === 'checking' && value.verifiedBytes === 0));
  assert.equal(updates.at(-1).verification, 'passed'); assert.equal(updates.at(-1).contentVerified, true);
  assert.equal(updates.at(-1).verifiedBytes, f.originalData.length);
  assert.deepEqual(await readFile(join(f.directory, 'source.torrent')), f.official);
});

test('a complete file valid under the public torrent is rejected if it differs from original NRK pieces', async t => {
  const f = await fixture(t, true), updates = [];
  assert.equal(validateFlamsbanenMirror(f.mirror, f.preset).metadataSha256, f.preset.mirrorTorrentSha256);
  await assert.rejects(downloadNrkTorrent({ ...f, signal: new AbortController().signal,
    fetchImpl: async () => new Response(f.mirror), onDiagnostic: value => updates.push(value) }), /parte 2.*não coincide/);
  assert.equal(updates.at(-1).verification, 'failed'); assert.equal(updates.at(-1).contentVerified, false);
  assert.equal(updates.at(-1).reason, 'official_integrity');
  assert.deepEqual(await readFile(f.path), f.mirrorData);
});

test('pausing the original-piece check preserves media and records a pause', async t => {
  const f = await fixture(t), controller = new AbortController(), updates = [];
  await assert.rejects(downloadNrkTorrent({ ...f, signal: controller.signal,
    fetchImpl: async () => new Response(f.mirror), onVerification: () => controller.abort(), onDiagnostic: value => updates.push(value) }));
  assert.equal(updates.at(-1).verification, 'paused'); assert.equal(updates.at(-1).contentVerified, false);
  assert.deepEqual(await readFile(f.path), f.originalData);
});

test('unverified original metadata cannot be bypassed by selected public metadata', async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, 'source.torrent'), 'corrupt reference');
  await assert.rejects(downloadNrkTorrent({ ...f, binary: 'must-never-start', signal: new AbortController().signal,
    fetchImpl: async () => new Response(f.mirror) }), /torrent oficial mudou/);
  await assert.rejects(readFile(f.path), { code: 'ENOENT' });
});
