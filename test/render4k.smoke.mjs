// Explicit, hardware-dependent validation; intentionally outside the unit suite.
// node --test test/render4k.smoke.mjs
// SLOWVISTA_SMOKE_FRONTEND=1 exercises the built application instead of the
// diagnostic canvas. Build first; the real 3D scene can be slow without a GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server/index.mjs';

const run = promisify(execFile);
const realFrontend = process.env.SLOWVISTA_SMOKE_FRONTEND === '1';

test(`2s native 3840×2160/24fps export (${realFrontend ? 'application scene' : 'engine fixture'})`, { timeout: 20 * 60 * 1000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'slowvista-4k-smoke-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  let distDir = resolve('dist');
  if (!realFrontend) {
    distDir = join(temporary, 'fixture');
    await mkdir(distDir);
    await writeFile(join(distDir, 'index.html'), `<!doctype html>
      <style>html,body{margin:0}#render-stage,canvas{display:block;width:3840px;height:2160px}</style>
      <main id="render-stage"><canvas width="3840" height="2160"></canvas></main>
      <script>
        const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
        window.slowvistaRenderer={ready:true,setProgress(p){
          ctx.fillStyle='#132c33';ctx.fillRect(0,0,3840,2160);
          ctx.fillStyle='#a6cfbd';ctx.fillRect(Math.floor(p*3800),0,3,2160);
          // Native one-pixel detail cannot be supplied by a 720p canvas upscale.
          for(let x=0;x<3840;x+=2){ctx.fillStyle=x%4?'#d6e8df':'#527b70';ctx.fillRect(x,2100,1,60)}
        }};
      </script>`);
  }
  const service = await startServer({
    port: 0, dataDir: join(temporary, 'data'), distDir, authDisabled: true,
    noSandbox: process.env.CHROMIUM_NO_SANDBOX === '1',
  });
  t.after(() => service.close());
  const api = async (path, body) => {
    const response = await fetch(`${service.baseUrl}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return response.json();
  };
  const route = await api('/api/routes', { name: 'Teste técnico 4K', transport: 'train', isDemo: true, sourceName: 'Percurso ilustrativo de teste', points: [{ lat: 48.18, lon: 16.375, ele: 180 }, { lat: 48.184, lon: 16.38, ele: 181 }, { lat: 48.192, lon: 16.385, ele: 180 }] });
  const variant = await api(`/api/routes/${route.id}/variants`, { name: 'Dia claro', season: 'summer', timeOfDay: 'day', weather: 'clear', durationMinutes: 120, showMap: true });
  const created = await api('/api/jobs', { variantId: variant.id, previewSeconds: 2, resolution: '2160p' });
  assert.equal(created.outputSeconds, 2);
  assert.equal(created.resolution, '2160p');
  const started = Date.now();
  let job = created, lastLogged = 0;
  while (!['completed', 'cancelled', 'failed'].includes(job.status)) {
    await delay(1000);
    job = await api(`/api/jobs/${created.id}`);
    if (Date.now() - lastLogged > 15000) {
      console.log(`4K ${job.status}: ${Math.round(job.progress * 100)}%; ${Math.round((Date.now() - started) / 1000)}s decorridos`);
      lastLogged = Date.now();
    }
  }
  assert.equal(job.status, 'completed', job.error);
  const video = join(temporary, 'data', 'videos', `${job.id}.mp4`);
  const { stdout } = await run(process.env.FFPROBE_EXECUTABLE || 'ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', video]);
  const probe = JSON.parse(stdout);
  assert.equal(probe.streams[0].width, 3840);
  assert.equal(probe.streams[0].height, 2160);
  assert.equal(probe.streams[0].r_frame_rate, '24/1');
  assert.equal(Number(probe.streams[0].nb_read_frames), 48);
  assert.equal(Number(probe.format.duration), 2);
  const download = await fetch(`${service.baseUrl}${job.downloadUrl}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal((await download.arrayBuffer()).byteLength, (await readFile(video)).byteLength);
  const artifactDir = resolve('test-results');
  await mkdir(artifactDir, { recursive: true });
  const base = realFrontend ? '4k-scene-smoke' : '4k-engine-smoke';
  await writeFile(join(artifactDir, `${base}.mp4`), await readFile(video));
  await writeFile(join(artifactDir, `${base}.json`), JSON.stringify({ source: realFrontend ? 'application-3d-scene' : 'diagnostic-native-canvas-fixture', seconds: 2, journeySeconds: 7200, elapsedSeconds: (Date.now() - started) / 1000, ...probe }, null, 2));
  console.log(JSON.stringify({ artifact: `test-results/${base}.mp4`, probe }));
});
