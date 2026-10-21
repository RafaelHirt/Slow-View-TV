import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const pwsh = process.env.PWSH_EXECUTABLE || 'pwsh';
const ffmpeg = process.env.FFMPEG_EXECUTABLE || 'ffmpeg';
const ffprobe = process.env.FFPROBE_EXECUTABLE || 'ffprobe';
const script = resolve('scripts/local-review.ps1');
let powershellAvailable = false;
try { await execute(pwsh, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']); powershellAvailable = true; } catch { /* Optional outside local-tool checks. */ }

async function directory(t) {
  const folder = await mkdtemp(join(tmpdir(), 'slowview-local-review-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  return folder;
}
async function fixture(folder, { audio = true, duration = 6 } = {}) {
  const file = join(folder, "Viagem São João [1] & ! % ' Ω.mp4");
  await execute(ffmpeg, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', `color=c=green:s=320x180:r=25:d=${duration}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=48000:duration=${duration}`] : []),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-g', '50', '-pix_fmt', 'yuv420p',
    ...(audio ? ['-c:a', 'aac', '-ac', '2'] : ['-an']), '-n', file], { timeout: 30000 });
  return file;
}
async function probe(file) {
  return JSON.parse((await execute(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout);
}
async function digest(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function run(input, args = [], env = {}) {
  const resolvedFFmpeg = (await execute(pwsh, ['-NoProfile', '-Command', `(Get-Command '${ffmpeg.replaceAll("'", "''")}' -CommandType Application).Source`])).stdout.trim();
  return execute(pwsh, ['-NoLogo', '-NoProfile', '-File', script, '-InputPath', input,
    '-FFmpegPath', resolvedFFmpeg, '-NoOpen', ...args], { timeout: 30000, env: { ...process.env, ...env } });
}
async function outputs(folder) { return (await readdir(folder)).filter(name => name.startsWith('Avaliacao-')).map(name => join(folder, name)); }
const mediaTest = (name, fn) => test(name, { skip: !powershellAvailable && 'Install pwsh or set PWSH_EXECUTABLE.' }, fn);

test('package contains an ASCII, CRLF launcher below CMD limits with no execution-policy change', async t => {
  const folder = await directory(t);
  await execute(process.execPath, ['scripts/package-local-review.mjs', folder]);
  const launcher = await readFile(join(folder, '1-separar-trecho.cmd'), 'utf8');
  assert.equal(launcher.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(/[^\x00-\x7F]/.test(launcher), false);
  const command = launcher.split('\r\n').find(line => line.startsWith('powershell.exe '));
  assert.ok(command.length < 7800);
  assert.match(launcher, /setlocal DisableDelayedExpansion/);
  assert.match(launcher, /set "SLOWVIEW_REVIEW_INPUT=%~1"/);
  assert.match(launcher, /set "result=%errorlevel%"/);
  assert.doesNotMatch(launcher, /ExecutionPolicy|Invoke-Expression|EncodedCommand/i);
  assert.deepEqual((await readdir(folder)).sort(), ['1-separar-trecho.cmd', 'LEIA-ME.txt', 'local-review.ps1']);
  const copy = await readFile(join(folder, 'local-review.ps1'), 'utf8');
  assert.equal(copy[0], '\uFEFF');
  assert.equal(copy.slice(1), await readFile(script, 'utf8'));
});

mediaTest('copies original video and stereo audio without changing bytes, frame rate or source', async t => {
  const folder = await directory(t), input = await fixture(folder);
  const before = await digest(input);
  const original = await probe(input);
  const result = await run(input, ['-Start', '1', '-Duration', '3']);
  assert.match(result.stdout, /PRONTO/);
  const [output] = await outputs(folder);
  const clip = await probe(join(output, 'trecho-original.mp4'));
  const video = clip.streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.width, 320); assert.equal(video.height, 180);
  assert.equal(video.avg_frame_rate, '25/1'); assert.equal(video.codec_name, 'h264');
  assert.equal(clip.streams.find(stream => stream.codec_type === 'audio').channels, 2);
  assert.ok(Number(clip.format.duration) >= 3 && Number(clip.format.duration) < 6);
  for (const type of ['video', 'audio']) {
    const index = original.streams.find(stream => stream.codec_type === type).index;
    const outputIndex = clip.streams.find(stream => stream.codec_type === type).index;
    const packets = async (file, map) => JSON.parse((await execute(ffprobe, ['-v', 'error', '-select_streams', String(map),
      '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'packet=data_hash', '-of', 'json', file])).stdout).packets.map(packet => packet.data_hash);
    const sourceHashes = new Set(await packets(input, index));
    assert.ok((await packets(join(output, 'trecho-original.mp4'), outputIndex)).every(hash => sourceHashes.has(hash)), `${type} packets must be copied unchanged`);
  }
  assert.equal(await digest(input), before);
  const report = JSON.parse((await readFile(join(output, 'informacoes.json'), 'utf8')).replace(/^\uFEFF/, ''));
  assert.equal(report.original, input); assert.equal(report.requestedStartSeconds, 1);
  assert.equal(report.requestedDurationSeconds, 3);
});

mediaTest('defaults to the requested 10-minute position in a long technical video', async t => {
  const folder = await directory(t), input = await fixture(folder, { audio: false, duration: 650 });
  await run(input);
  const [output] = await outputs(folder);
  const report = JSON.parse((await readFile(join(output, 'informacoes.json'), 'utf8')).replace(/^\uFEFF/, ''));
  assert.equal(report.requestedStartSeconds, 600); assert.equal(report.requestedDurationSeconds, 45);
  assert.ok(Number(report.clip.format.duration) >= 45 && Number(report.clip.format.duration) < 49);
});

mediaTest('short silent source works and repeated runs create separate folders', async t => {
  const folder = await directory(t), input = await fixture(folder, { audio: false });
  const before = await digest(input);
  await run(input); await run(input);
  const created = await outputs(folder);
  assert.equal(created.length, 2);
  for (const output of created) {
    const clip = await probe(join(output, 'trecho-original.mp4'));
    assert.equal(clip.streams.some(stream => stream.codec_type === 'audio'), false);
    assert.ok(Number(clip.format.duration) > 5);
  }
  assert.equal(await digest(input), before);
});

mediaTest('literal command embedded in the downloadable launcher parses and runs with a filename from environment', async t => {
  const folder = await directory(t), input = await fixture(folder);
  const packaged = join(folder, 'package');
  await execute(process.execPath, ['scripts/package-local-review.mjs', packaged]);
  const launcher = await readFile(join(packaged, '1-separar-trecho.cmd'), 'utf8');
  const line = launcher.split('\r\n').find(value => value.startsWith('powershell.exe '));
  const command = line.slice(line.indexOf('-Command "') + '-Command "'.length, -1);
  // NoOpen skips only the final folder viewer. The literal default code is otherwise unchanged.
  const tested = command.replace('$NoOpen = $false;', '$NoOpen = $true;');
  const result = await execute(pwsh, ['-NoProfile', '-Command', tested], {
    env: { ...process.env, SLOWVIEW_REVIEW_INPUT: input }, timeout: 30000,
  });
  assert.match(result.stdout, /PRONTO/); assert.equal((await outputs(folder)).length, 1);
});

mediaTest('invalid media, missing paths and torrent files fail before creating output', async t => {
  const folder = await directory(t);
  const invalid = join(folder, 'invalido.mp4'), torrent = join(folder, 'viagem.torrent');
  await writeFile(invalid, 'not a video'); await writeFile(torrent, 'not a video');
  for (const input of [invalid, torrent, join(folder, 'missing.mp4'), folder]) {
    await assert.rejects(run(input), error => error.code === 1 && error.stdout.includes('ERRO:'));
  }
  assert.deepEqual(await outputs(folder), []);
});

mediaTest('missing companion FFprobe fails with a clear message without touching the source', async t => {
  const folder = await directory(t), input = await fixture(folder);
  const executable = join(folder, 'ffmpeg.exe'); await writeFile(executable, 'not executed');
  await assert.rejects(run(input, ['-FFmpegPath', executable]), error => error.stdout.includes('FFprobe nao encontrado'));
  assert.deepEqual(await outputs(folder), []);
});

mediaTest('a cover image is not included as the extracted movie', async t => {
  const folder = await directory(t), input = await fixture(folder);
  const cover = join(folder, 'cover.jpg'), covered = join(folder, 'com-capa.mp4');
  await execute(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=64x64', '-frames:v', '1', '-threads', '1', cover]);
  await execute(ffmpeg, ['-v', 'error', '-i', input, '-i', cover, '-map', '1:v', '-map', '0:v', '-map', '0:a',
    '-c', 'copy', '-disposition:v:0', 'attached_pic', covered]);
  assert.ok((await probe(covered)).streams.some(stream => stream.disposition.attached_pic === 1));
  await run(covered);
  const [output] = await outputs(folder), clip = await probe(join(output, 'trecho-original.mp4'));
  assert.equal(clip.streams.filter(stream => stream.codec_type === 'video').length, 1);
  assert.equal(clip.streams.find(stream => stream.codec_type === 'video').codec_name, 'h264');
});

test('a read-only source directory reports the failure without modifying the original', { skip: !powershellAvailable || process.platform === 'win32' }, async t => {
  const folder = await directory(t), readonly = join(folder, 'read-only'); await mkdir(readonly);
  const input = await fixture(readonly), before = await digest(input);
  await chmod(readonly, 0o555);
  try { await assert.rejects(run(input), error => error.code === 1 && error.stdout.includes('ERRO:')); }
  finally { await chmod(readonly, 0o755); }
  assert.equal(await digest(input), before);
});
