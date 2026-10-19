import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server/index.mjs';
import { trustedMediaUrl, createFootageSources } from '../server/footage-sources.mjs';
import { probeMedia } from '../server/footage-media.mjs';

const execute = promisify(execFile);
const metadata = { title: 'Fixture técnica, sem filmagem real', license: 'own', sourceUrl: '', attribution: 'Teste automatizado', licenseNotes: 'Padrão de cor e tom gerados para teste; não são conteúdo do catálogo.', rightsConfirmed: true };
async function setup(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'slowview-footage-'));
  const service = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true, ...options });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) => {
    const response = await fetch(`${service.baseUrl}/api/footage${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  return { service, dataDir, call };
}
async function fixtures(directory) {
  const video = join(directory, 'technical-fixture.mp4'), audio = join(directory, 'technical-tone.wav');
  await execute('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=1280x720:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-shortest', video]);
  await execute('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=2', audio]);
  return { video: await readFile(video), audio: await readFile(audio) };
}
async function upload(service, call, bytes, name = metadata.title) {
  const created = await call('/assets', { ...metadata, title: name }); assert.equal(created.status, 201);
  const response = await fetch(`${service.baseUrl}/api/footage/assets/${created.body.id}/content`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
  const asset = await response.json(); assert.equal(response.status, 200, JSON.stringify(asset)); return asset;
}
async function finish(call, id) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const job = (await call('/exports')).body.exports.find(item => item.id === id);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    await delay(50);
  }
  throw new Error('A edição não terminou dentro do tempo do teste.');
}
const editInput = assetId => ({ title: 'Trecho técnico de quatro segundos', assetId, start: 1, end: 5, resolution: '720p', audioMode: 'original' });

test('remote footage only uses trusted HTTPS CDNs and rejects unsafe redirects', async () => {
  for (const url of ['http://videos.pexels.com/a.mp4', 'https://127.0.0.1/a.mp4', 'https://videos.pexels.com.evil.example/a.mp4', 'https://user:pass@videos.pexels.com/a.mp4', 'https://videos.pexels.com:8443/a.mp4', 'https://www.youtube.com/watch?v=test']) assert.throws(() => trustedMediaUrl(url));
  assert.equal(trustedMediaUrl('https://videos.pexels.com/a.mp4'), 'https://videos.pexels.com/a.mp4');
  const calls = [];
  const sources = createFootageSources({ fetchImpl: async (url, options) => { calls.push([url, options.headers]); return new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/metadata' } }); } });
  await assert.rejects(sources.download('https://videos.pexels.com/a.mp4', new AbortController().signal), /importação por link/);
  assert.equal(calls.length, 1); assert.equal(calls[0][1].Authorization, undefined); await sources.close();
});

test('Pexels discovery is optional, limits results and sends its key only to the API', async () => {
  const absent = createFootageSources({ pexelsKey: '', fetchImpl: () => assert.fail('No request without a key') });
  assert.equal(absent.configured, false); await assert.rejects(absent.search('forest'), /PEXELS_API_KEY/);
  const sources = createFootageSources({ pexelsKey: 'test-key', fetchImpl: async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.pexels.com'); assert.equal(options.headers.Authorization, 'test-key');
    return Response.json({ videos: [{ id: 1, url: 'https://www.pexels.com/video/1/', user: { name: 'Autor do teste' }, duration: 12,
      video_files: [{ width: 1920, height: 1080, file_type: 'video/mp4', link: 'https://videos.pexels.com/1.mp4' }] }] });
  } });
  const results = await sources.search('forest'); assert.equal(results.length, 1); assert.equal(results[0].author, 'Autor do teste'); assert.equal(JSON.stringify(results).includes('test-key'), false);
});

test('library enforces authentication, source metadata, byte limits and rejects fake media', async t => {
  const { service, call, dataDir } = await setup(t, { authDisabled: false, dashboardPassword: 'senha-de-teste-com-mais-de-doze', mediaMaxUploadBytes: 1024 });
  assert.equal((await call('/assets')).status, 401);
  const login = await (await fetch(`${service.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'senha-de-teste-com-mais-de-doze' }) })).json();
  const headers = { Authorization: `Bearer ${login.token}` };
  assert.equal((await call('/assets', { ...metadata, license: 'pexels' }, 'POST', headers)).status, 400);
  assert.equal((await call('/assets', { ...metadata, sourceUrl: 'https://user:secret@example.com/' }, 'POST', headers)).status, 400);
  for (const [bytes, status] of [[Buffer.alloc(2048), 413], [Buffer.from('not a video, despite its filename'), 400], [Buffer.concat([Buffer.from('0000ftyp'), Buffer.alloc(24)]), 400]]) {
    const created = await call('/assets', metadata, 'POST', headers);
    const response = await fetch(`${service.baseUrl}/api/footage/assets/${created.body.id}/content`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(response.status, status, await response.text());
  }
  assert.deepEqual(await readdir(join(dataDir, 'footage')), []);
  const assets = (await call('/assets', undefined, 'GET', headers)).body.assets; assert.equal(assets.every(item => item.status === 'failed'), true);
  assert.equal((await call('/import', { ...metadata, fileUrl: 'https://localhost/file.mp4' }, 'POST', headers)).status, 400);
});

test('real FFmpeg trims, fades, normalizes audio, loops an ambient track and exports silence', { timeout: 120000 }, async t => {
  const { service, dataDir, call } = await setup(t);
  const fixture = await fixtures(dataDir);
  const video = await upload(service, call, fixture.video), audio = await upload(service, call, fixture.audio, 'Faixa técnica para testar repetição');
  assert.equal(video.kind, 'video'); assert.equal(video.hasAudio, true); assert.equal(audio.kind, 'audio');
  assert.equal((await call('/exports', { ...editInput(video.id), resolution: '2160p' })).status, 400);
  assert.equal((await call('/exports', { ...editInput(video.id), end: 8 })).status, 400);
  await call(`/assets/${video.id}`, { ...metadata, rightsConfirmed: false }, 'PUT');
  assert.equal((await call('/exports', editInput(video.id))).status, 400);
  await call(`/assets/${video.id}`, metadata, 'PUT');
  for (const audioMode of ['original', 'ambient', 'silent']) {
    const created = await call('/exports', { ...editInput(video.id), audioMode, ambientId: audio.id }); assert.equal(created.status, 202);
    const job = await finish(call, created.body.id); assert.equal(job.status, 'completed', job.error);
    const response = await fetch(`${service.baseUrl}${job.fileUrl}`); assert.equal(response.status, 200);
    const path = join(dataDir, `${audioMode}.mp4`); await writeFile(path, Buffer.from(await response.arrayBuffer()));
    const probe = await probeMedia(path); assert.equal(probe.width, 1280); assert.equal(probe.height, 720); assert.ok(Math.abs(probe.duration - 4) < .1); assert.equal(probe.hasAudio, audioMode !== 'silent');
    assert.equal(job.sources.length, audioMode === 'ambient' ? 2 : 1);
    if (audioMode !== 'silent') {
      const { stdout } = await execute('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1'], { encoding: 'buffer', maxBuffer: 4 * 1024 ** 2 });
      const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
      const rms = (start, count) => Math.sqrt(samples.subarray(start, start + count).reduce((sum, value) => sum + value * value, 0) / count);
      const middle = rms(2 * 48000, 4800);
      assert.ok(rms(0, 4800) < middle * .3, 'audio fades in'); assert.ok(rms(samples.length - 4800, 4800) < middle * .3, 'audio fades out');
      assert.ok(samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) < .82, 'true-peak target leaves headroom');
    }
    if (audioMode === 'original') {
      const pixels = async position => (await execute('ffmpeg', ['-v', 'error', '-ss', position, '-i', path, '-frames:v', '1', '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer' })).stdout[0];
      assert.ok(await pixels('0') < 12, 'video starts dark'); assert.ok(await pixels('2') > 40, 'middle keeps source image');
    }
  }
  assert.equal((await call(`/assets/${video.id}`, undefined, 'DELETE')).status, 409, 'source retained for credits/history');
});

test('signed media links support seeking and cannot authorize another file or API mutation', { timeout: 60000 }, async t => {
  const { service, call, dataDir } = await setup(t, { authDisabled: false, dashboardPassword: 'senha-para-links-privados-de-teste', enableFootageWorker: false });
  const login = await (await fetch(`${service.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'senha-para-links-privados-de-teste' }) })).json();
  const headers = { Authorization: `Bearer ${login.token}` };
  const fixture = await fixtures(dataDir);
  const created = await call('/assets', metadata, 'POST', headers);
  const response = await fetch(`${service.baseUrl}/api/footage/assets/${created.body.id}/content`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: fixture.video });
  const asset = await response.json(); assert.equal(response.status, 200);
  const range = await fetch(`${service.baseUrl}${asset.fileUrl}`, { headers: { Range: 'bytes=0-31' } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 32);
  assert.equal((await fetch(`${service.baseUrl}${asset.fileUrl.split('?')[0]}`)).status, 401);
  assert.equal((await fetch(`${service.baseUrl}${asset.fileUrl.replace(asset.id, '00000000-0000-0000-0000-000000000000')}`)).status, 401);
  assert.equal((await fetch(`${service.baseUrl}${asset.fileUrl.replace(/expires=\d+/, 'expires=1')}`)).status, 401);
  assert.equal((await fetch(`${service.baseUrl}${asset.fileUrl}`, { method: 'DELETE' })).status, 401);
  const edit = await call('/exports', editInput(asset.id), 'POST', headers);
  const duplicate = await call('/exports', editInput(asset.id), 'POST', headers); assert.equal(duplicate.body.id, edit.body.id);
  assert.equal((await call(`/exports/${edit.body.id}/cancel`, {}, 'POST', headers)).body.status, 'cancelled');
});

test('exports preserve 25, 50 and fractional frame rates instead of forcing 30 fps', { timeout: 120000 }, async t => {
  const { service, call, dataDir } = await setup(t);
  for (const [rate, expected] of [['25', 25], ['50', 50], ['30000/1001', 30000 / 1001]]) {
    const input = join(dataDir, 'cadence-input.mp4');
    await execute('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=green:s=1280x720:r=${rate}:d=4`, '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', input]);
    const asset = await upload(service, call, await readFile(input), `Cadência técnica ${rate}`);
    assert.ok(Math.abs(asset.frameRate - expected) < .001);
    const created = await call('/exports', { ...editInput(asset.id), start: 0, end: 3, audioMode: 'silent' });
    assert.equal(created.status, 202);
    const job = await finish(call, created.body.id); assert.equal(job.status, 'completed', job.error);
    const output = join(dataDir, 'cadence-output.mp4');
    await writeFile(output, Buffer.from(await (await fetch(`${service.baseUrl}${job.fileUrl}`)).arrayBuffer()));
    const probe = await probeMedia(output);
    assert.ok(Math.abs(probe.frameRate - expected) < .001, `keeps ${rate} fps`);
    const { stdout } = await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', output]);
    assert.equal(Number(JSON.parse(stdout).streams[0].nb_read_frames), Math.ceil(3 * expected), 'no frames added or removed to reach 30 fps');
  }
});

test('asynchronous CDN import stores valid media, releases oversized bodies and survives restart', { timeout: 60000 }, async t => {
  let bytes, cancelled = false;
  const { service, call, dataDir } = await setup(t, { mediaMaxUploadBytes: 1000000, footageSources: { fetchImpl: async url => {
    if (url.endsWith('large.mp4')) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '1000001' } });
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
  } } });
  bytes = (await fixtures(dataDir)).video;
  const input = { ...metadata, license: 'pexels', sourceUrl: 'https://www.pexels.com/video/test-source/', fileUrl: 'https://videos.pexels.com/test.mp4' };
  const imported = await call('/import', input); assert.equal(imported.status, 202); assert.equal(imported.body.status, 'importing');
  const wait = async id => {
    for (let i = 0; i < 100; i++) { const asset = (await call('/assets')).body.assets.find(item => item.id === id); if (['ready', 'failed'].includes(asset.status)) return asset; await delay(50); }
    throw new Error('Importação não concluiu.');
  };
  const asset = await wait(imported.body.id); assert.equal(asset.status, 'ready', asset.error); assert.equal(asset.width, 1280);
  const large = await call('/import', { ...input, fileUrl: 'https://videos.pexels.com/large.mp4' });
  assert.equal((await wait(large.body.id)).status, 'failed'); assert.equal(cancelled, true);
  assert.equal((await readdir(join(dataDir, 'footage'))).some(name => name.endsWith('.upload')), false);
  await service.close();
  const reopened = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true }); t.after(() => reopened.close());
  const saved = await (await fetch(`${reopened.baseUrl}/api/footage/assets`)).json();
  assert.equal(saved.assets.find(item => item.id === asset.id).attribution, metadata.attribution);
  assert.equal((await fetch(`${reopened.baseUrl}${saved.assets.find(item => item.id === asset.id).fileUrl}`)).status, 200);
});

test('cancelling an active edit removes partial files and releases the serial queue', { timeout: 60000 }, async t => {
  const { service, call, dataDir } = await setup(t);
  const asset = await upload(service, call, (await fixtures(dataDir)).video);
  const first = await call('/exports', editInput(asset.id));
  for (let i = 0; i < 100; i++) {
    const job = (await call('/exports')).body.exports.find(item => item.id === first.body.id);
    if (job.status === 'editing') break;
    await delay(10);
  }
  const second = await call('/exports', { ...editInput(asset.id), title: 'Edição seguinte', audioMode: 'silent' });
  assert.equal((await call(`/exports/${first.body.id}/cancel`, {})).body.status, 'cancelled');
  assert.equal((await finish(call, second.body.id)).status, 'completed');
  const files = await readdir(join(dataDir, 'footage'));
  assert.equal(files.some(file => file.startsWith(first.body.id)), false);
  const cancelled = (await call('/exports')).body.exports.find(item => item.id === first.body.id);
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.fileUrl, undefined);
});
