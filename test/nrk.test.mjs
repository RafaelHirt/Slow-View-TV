import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server/index.mjs';
import { FLAMSBANEN, downloadNrkTorrent, parseAriaProgress } from '../server/nrk-ingest.mjs';
import { validateMediaMetadata, validateFootageEdit } from '../server/footage-media.mjs';

const execute = promisify(execFile);
async function setup(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'slowview-nrk-'));
  const service = await startServer({ port: 0, dataDir, distDir: null, authDisabled: true, enableWorker: false, ...options });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function call(path = '/nrk', body, method = body ? 'POST' : 'GET') {
    const response = await fetch(`${service.baseUrl}/api/footage${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  return { service, dataDir, call };
}
async function waitFor(call, state) {
  for (let i = 0; i < 200; i++) { const value = (await call()).body; if (value.download?.status === state) return value; await delay(25); }
  throw new Error(`Import did not reach ${state}: ${JSON.stringify((await call()).body)}`);
}

test('NRK metadata requires explicit attribution and propagates share-alike to adaptations', () => {
  assert.throws(() => validateMediaMetadata({ ...FLAMSBANEN, attribution: '' }), /Autor e créditos/);
  const metadata = validateMediaMetadata(FLAMSBANEN);
  assert.equal(metadata.license, 'cc-by-sa-3.0-no');
  const video = { ...metadata, id: 'video', status: 'ready', kind: 'video', duration: 90, width: 1920, height: 1080, hasAudio: true };
  const input = { title: 'Amostra técnica', start: 0, end: 60, resolution: '720p', audioMode: 'original' };
  const edit = validateFootageEdit(input, video);
  assert.equal(edit.outputLicense, metadata.license); assert.equal(edit.outputLicenseUrl, FLAMSBANEN.licenseUrl);
  const ambient = { id: 'audio', status: 'ready', kind: 'audio', license: 'pexels', hasAudio: true, rightsConfirmed: true };
  assert.throws(() => validateFootageEdit({ ...input, audioMode: 'ambient' }, video, ambient), /compatibilidade/);
  assert.equal(validateFootageEdit({ ...input, audioMode: 'ambient' }, video, { ...ambient, license: 'cc0' }).outputLicense, metadata.license);
});

test('official torrent changes are rejected before any peer connection', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'slowview-torrent-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(downloadNrkTorrent({ directory, signal: new AbortController().signal, onProgress() {}, binary: 'must-never-start', fetchImpl: async (url, options) => {
    assert.equal(url, FLAMSBANEN.torrentUrl); assert.equal(options.redirect, 'error');
    return new Response('unreviewed torrent');
  } }), /torrent oficial mudou/);
  assert.deepEqual(parseAriaProgress('[#abc123 123456B/3763728590B(0%) CN:4 DL:222B]'), { completed: 123456, total: FLAMSBANEN.bytes });
  assert.equal(parseAriaProgress('No data received yet'), null);
});

test('NRK download is authenticated, optional and checks capacity before creating an asset', async t => {
  const privateService = await setup(t, { authDisabled: false, dashboardPassword: 'senha-somente-deste-teste-nrk' });
  assert.equal((await privateService.call()).status, 401);
  assert.equal((await privateService.call('/nrk/flamsbanen', {})).status, 401);
  const disabled = await setup(t, { nrkIngest: { enabled: false } });
  assert.equal((await disabled.call()).body.available, false);
  assert.equal((await disabled.call('/nrk/flamsbanen', {})).status, 503);
  assert.equal((await disabled.call('/nrk/arbitrary-path', {})).status, 404);
  const lowDisk = await setup(t, { nrkIngest: { enabled: true, freeBytes: async () => 1000, downloadImpl: () => assert.fail('No download without capacity') } });
  assert.equal((await lowDisk.call('/nrk/flamsbanen', {})).status, 507);
  assert.equal((await lowDisk.call('/assets')).body.assets.length, 0);
});

test('server imports a large file outside the browser cap, pauses/resumes once and preserves NRK credits in the MP4', { timeout: 90000 }, async t => {
  let attempts = 0, fixture, partialPath;
  const { service, dataDir, call } = await setup(t, { mediaMaxUploadBytes: 1024, nrkIngest: { enabled: true, freeBytes: async () => 12 * 1024 ** 3,
    downloadImpl: async ({ directory, signal, onProgress }) => {
      attempts++; partialPath = join(directory, FLAMSBANEN.filename);
      if (attempts === 1) {
        await writeFile(partialPath, 'technical resume marker'); onProgress({ completed: 12345, total: FLAMSBANEN.bytes });
        await new Promise((_, reject) => { const abort = () => reject(new Error('paused technical transfer')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
      } else {
        assert.equal(await readFile(partialPath, 'utf8'), 'technical resume marker');
        await copyFile(fixture, partialPath); await truncate(partialPath, FLAMSBANEN.bytes);
        onProgress({ completed: FLAMSBANEN.bytes, total: FLAMSBANEN.bytes });
        return partialPath;
      }
    } } });
  fixture = join(dataDir, 'fixture-technical-not-real-nrk.mp4');
  await execute('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=1920x1080:r=25:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', fixture]);
  const first = await call('/nrk/flamsbanen', {}); assert.equal(first.status, 202);
  const assetId = first.body.download.assetId;
  for (let i = 0; i < 100 && !(await call()).body.download.completed; i++) await delay(10);
  assert.equal((await call('/nrk/flamsbanen', {})).body.download.assetId, assetId);
  assert.equal(attempts, 1);
  assert.equal((await call(`/assets/${assetId}`, undefined, 'DELETE')).status, 409);
  const paused = await call('/nrk/flamsbanen/pause', {}); assert.equal(paused.body.download.status, 'paused');
  assert.equal((await stat(partialPath)).isFile(), true);
  assert.equal((await call('/nrk/flamsbanen', {})).body.download.assetId, assetId);
  const ready = await waitFor(call, 'ready');
  assert.equal(ready.download.asset.bytes, FLAMSBANEN.bytes);
  assert.equal(ready.download.asset.license, 'cc-by-sa-3.0-no');
  assert.equal(ready.download.asset.width, 1920); assert.equal(ready.download.asset.frameRate, 25);
  assert.equal((await call('/assets')).body.assets.length, 1);
  assert.equal((await fetch(`${service.baseUrl}${ready.download.asset.fileUrl}`, { headers: { Range: 'bytes=0-31' } })).status, 206);
  assert.equal((await call('/nrk/flamsbanen', {})).body.download.status, 'ready'); assert.equal(attempts, 2);
  const created = await call('/exports', { title: 'Fixture de créditos NRK — não é viagem real', assetId, start: 0, end: 4, resolution: '720p', audioMode: 'original' });
  assert.equal(created.status, 202);
  let job;
  for (let i = 0; i < 500; i++) { job = (await call('/exports')).body.exports[0]; if (['completed', 'failed'].includes(job.status)) break; await delay(50); }
  assert.equal(job.status, 'completed', job.error); assert.equal(job.outputLicenseUrl, FLAMSBANEN.licenseUrl);
  assert.equal(job.sources[0].attribution, FLAMSBANEN.attribution);
  const output = join(dataDir, 'edited-fixture.mp4');
  await writeFile(output, Buffer.from(await (await fetch(`${service.baseUrl}${job.fileUrl}`)).arrayBuffer()));
  const { stdout } = await execute('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', output]);
  const comment = JSON.parse(stdout).format.tags.comment;
  assert.match(comment, /NRK/); assert.ok(comment.includes(FLAMSBANEN.licenseUrl)); assert.match(comment, /Adaptação Slow View TV/);
});

test('restart preserves a paused download and its asset record with ingestion disabled', async t => {
  let started = false;
  const { service, dataDir, call } = await setup(t, { nrkIngest: { enabled: true, freeBytes: async () => 12 * 1024 ** 3, downloadImpl: async ({ signal }) => {
    started = true; await new Promise((_, reject) => { const abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
  } } });
  await call('/nrk/flamsbanen', {});
  while (!started) await delay(5);
  await service.close();
  const reopened = await startServer({ port: 0, dataDir, distDir: null, authDisabled: true, enableWorker: false, nrkIngest: { enabled: false } }); t.after(() => reopened.close());
  const status = await (await fetch(`${reopened.baseUrl}/api/footage/nrk`)).json();
  assert.equal(status.download.status, 'paused'); assert.equal(status.available, false);
  assert.equal((await (await fetch(`${reopened.baseUrl}/api/footage/assets`)).json()).assets.length, 1);
});
