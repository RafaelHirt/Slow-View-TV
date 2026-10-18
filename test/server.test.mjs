import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server/index.mjs';
import { DatabaseSync } from 'node:sqlite';

const routeInput = {
  name: 'Percurso de teste', description: 'Traçado GPS, cenário sintético.', sourceName: 'GPX próprio',
  transport: 'train', isDemo: false,
  points: [{ lat: -23.5505, lon: -46.6333, ele: 760 }, { lat: -23.5605, lon: -46.6233, ele: 762 }],
};
const variantInput = { name: 'Inverno de manhã', season: 'winter', timeOfDay: 'day', weather: 'clear', durationMinutes: 120, temperatureC: 12, showMap: true };

async function setup(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-test-'));
  const service = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true, ...options });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${service.baseUrl}${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let result = text;
    try { result = JSON.parse(text); } catch {}
    return { status: response.status, body: result, headers: response.headers };
  }
  return { service, api, dataDir };
}

async function createRouteVariant(api, headers = {}) {
  const route = await api('/api/routes', { method: 'POST', body: routeInput, headers });
  assert.equal(route.status, 201, JSON.stringify(route.body));
  const variant = await api(`/api/routes/${route.body.id}/variants`, { method: 'POST', body: variantInput, headers });
  assert.equal(variant.status, 201, JSON.stringify(variant.body));
  return { route: route.body, variant: variant.body };
}

async function waitJob(api, id, predicate, headers = {}) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const response = await api(`/api/jobs/${id}`, { headers });
    if (predicate(response.body)) return response.body;
    await delay(20);
  }
  throw new Error(`Exportação ${id} não atingiu o estado esperado.`);
}

test('routes and seasonal variants persist and cascade without editing their GPS points', async (t) => {
  const { service, api, dataDir } = await setup(t);
  const { route, variant } = await createRouteVariant(api);
  assert.ok(route.distanceKm > 1 && route.distanceKm < 2);
  assert.equal(route.elevationKnown, true);
  assert.deepEqual(route.points, routeInput.points);
  assert.equal(variant.durationMinutes, 120);
  const listed = await api('/api/routes');
  assert.equal(listed.body.routes[0].variants[0].id, variant.id);
  await service.close();
  const reopened = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true });
  t.after(() => reopened.close());
  const persisted = await (await fetch(`${reopened.baseUrl}/api/routes`)).json();
  assert.equal(persisted.routes[0].id, route.id);
  assert.equal(persisted.routes[0].variants[0].season, 'winter');
  assert.equal((await fetch(`${reopened.baseUrl}/api/routes/${route.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(await (await fetch(`${reopened.baseUrl}/api/routes`)).json(), { routes: [] });
});

test('route plans persist independently while waiting for a verified GPS route', async (t) => {
  const { service, api, dataDir } = await setup(t);
  const input = {
    name: 'Viena → Praga', origin: 'Viena', destination: 'Praga', transport: 'train',
    notes: 'Trajeto ferroviário ainda aguardando GPX verificado.',
  };
  assert.equal((await api('/api/plans', { method: 'POST', body: { ...input, origin: '' } })).status, 400);
  assert.equal((await api('/api/plans', { method: 'POST', body: { ...input, transport: 'plane' } })).status, 400);
  const created = await api('/api/plans', { method: 'POST', body: input });
  assert.equal(created.status, 201);
  assert.equal(created.body.origin, input.origin);
  assert.equal(created.body.destination, input.destination);
  assert.equal(created.body.points, undefined);
  assert.deepEqual((await api('/api/routes')).body.routes, []);
  await service.close();
  const reopened = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true });
  t.after(() => reopened.close());
  const persisted = await (await fetch(`${reopened.baseUrl}/api/plans`)).json();
  assert.equal(persisted.plans.length, 1);
  assert.equal(persisted.plans[0].id, created.body.id);
  assert.equal(persisted.plans[0].notes, input.notes);
  assert.equal((await fetch(`${reopened.baseUrl}/api/plans/${created.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${reopened.baseUrl}/api/plans/${created.body.id}`, { method: 'DELETE' })).status, 404);
  assert.deepEqual(await (await fetch(`${reopened.baseUrl}/api/plans`)).json(), { plans: [] });
});

test('full routes above 10000 GPS points are accepted and preserved without simplification', async (t) => {
  const { api } = await setup(t);
  const points = Array.from({ length: 10001 }, (_, index) => ({ lat: 48 + index / 1000000, lon: 16 + index / 1000000, ele: null }));
  const created = await api('/api/routes', { method: 'POST', body: { ...routeInput, name: 'Percurso completo extenso', points } });
  assert.equal(created.status, 201);
  assert.equal(created.body.points.length, points.length);
  assert.deepEqual(created.body.points, points);
  const listed = await api('/api/routes');
  assert.deepEqual(listed.body.routes[0].points, points);
  const tooMany = Array.from({ length: 100001 }, (_, index) => ({ lat: 48 + index / 1000000, lon: 16, ele: null }));
  const rejected = await api('/api/routes', { method: 'POST', body: { ...routeInput, points: tooMany } });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /100\.000/);
  assert.equal((await api('/api/routes')).body.routes.length, 1);
});

test('invalid GPS coordinates, variants, missing IDs and oversized JSON are rejected', async (t) => {
  const { api, service } = await setup(t);
  assert.equal((await api('/api/routes', { method: 'POST', body: { ...routeInput, points: [{ lat: 91, lon: 0 }, { lat: 0, lon: 1 }] } })).status, 400);
  assert.equal((await api('/api/routes', { method: 'POST', body: { ...routeInput, points: [routeInput.points[0], routeInput.points[0]] } })).status, 400);
  assert.equal((await api('/api/routes', { method: 'POST', body: { ...routeInput, isDemo: 'false' } })).status, 400);
  const { route } = await createRouteVariant(api);
  assert.equal((await api(`/api/routes/${route.id}/variants`, { method: 'POST', body: { ...variantInput, durationMinutes: 721 } })).status, 400);
  assert.equal((await api(`/api/routes/${route.id}/variants`, { method: 'POST', body: { ...variantInput, weather: 'tornado' } })).status, 400);
  assert.equal((await api('/api/jobs', { method: 'POST', body: { variantId: 'missing' } })).status, 404);
  const broken = await fetch(`${service.baseUrl}/api/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(broken.status, 400);
  assert.match((await broken.json()).error, /JSON/);
  const oversized = await fetch(`${service.baseUrl}/api/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(16 * 1024 * 1024) }) });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /16 MB/);
});

test('queued jobs protect routes, deduplicate requests, cancel, and restart as interrupted', async (t) => {
  const { api, service, dataDir } = await setup(t);
  const { route, variant } = await createRouteVariant(api);
  const request = { method: 'POST', body: { variantId: variant.id, previewSeconds: 2 } };
  const job = await api('/api/jobs', request);
  assert.equal(job.status, 202);
  assert.equal(job.body.outputSeconds, 2);
  assert.equal(job.body.preview, true);
  assert.equal(job.body.resolution, '720p');
  assert.deepEqual([job.body.width, job.body.height, job.body.fps], [1280, 720, 24]);
  assert.equal((await api('/api/jobs', request)).body.id, job.body.id);
  assert.equal((await api(`/api/routes/${route.id}`, { method: 'DELETE' })).status, 409);
  assert.equal((await api(`/api/variants/${variant.id}`, { method: 'DELETE' })).status, 409);
  assert.equal((await api(`/api/jobs/${job.body.id}/video`)).status, 409);
  assert.equal((await api(`/api/jobs/${job.body.id}/cancel`, { method: 'POST' })).body.status, 'cancelled');
  const another = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id } });
  assert.equal(another.body.outputSeconds, 7200);
  assert.equal(another.body.preview, false);
  await service.close();
  const reopened = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true });
  t.after(() => reopened.close());
  const restarted = await (await fetch(`${reopened.baseUrl}/api/jobs/${another.body.id}`)).json();
  assert.equal(restarted.status, 'failed');
  assert.match(restarted.error, /reinicialização/);
});

test('native resolution presets preserve full duration, reject invalid values, and distinguish queued exports', async (t) => {
  const { api } = await setup(t);
  const { variant } = await createRouteVariant(api);
  for (const resolution of ['4k', '480p', '', null, 2160, {}]) {
    const invalid = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, resolution } });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, /Resolução/);
  }
  for (const previewSeconds of [0, 1, 31, 2.5]) {
    assert.equal((await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, previewSeconds, resolution: '2160p' } })).status, 400);
  }
  const full = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, resolution: '2160p', width: 64, height: 64, fps: 1 } });
  assert.equal(full.status, 202);
  assert.deepEqual([full.body.resolution, full.body.width, full.body.height, full.body.fps], ['2160p', 3840, 2160, 24]);
  assert.equal(full.body.outputSeconds, 120 * 60);
  assert.equal(full.body.preview, false);
  const duplicate = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, resolution: '2160p' } });
  assert.equal(duplicate.body.id, full.body.id);
  const legacy = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id } });
  assert.notEqual(legacy.body.id, full.body.id);
  assert.equal(legacy.body.outputSeconds, full.body.outputSeconds);
  assert.equal(legacy.body.resolution, '720p');
  const preview = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, previewSeconds: 30, resolution: '1080p' } });
  assert.equal(preview.body.outputSeconds, 30);
  assert.equal(preview.body.preview, true);
  assert.deepEqual([preview.body.width, preview.body.height, preview.body.fps], [1920, 1080, 24]);
  const scene = await api(`/api/jobs/${full.body.id}/scene`);
  assert.equal(scene.body.variant.durationMinutes, 120);
  assert.deepEqual([scene.body.outputSeconds, scene.body.resolution, scene.body.width, scene.body.height, scene.body.fps], [7200, '2160p', 3840, 2160, 24]);
  const jobs = (await api('/api/jobs')).body.jobs;
  assert.equal(jobs.length, 3);
});

test('additive migration preserves legacy completed video records and uses their original 720p dimensions', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-legacy-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const legacy = new DatabaseSync(join(dataDir, 'slowvista.sqlite'));
  legacy.exec(`CREATE TABLE jobs (
    id TEXT PRIMARY KEY, variant_id TEXT, route_name TEXT NOT NULL, variant_name TEXT NOT NULL,
    status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL,
    output_seconds REAL NOT NULL, preview INTEGER NOT NULL, output_file TEXT
  )`);
  legacy.prepare('INSERT INTO jobs VALUES (?, NULL, ?, ?, ?, 1, NULL, ?, 7200, 0, ?)')
    .run('legacy-video', 'Rota antiga', 'Verão', 'completed', '2026-01-01T00:00:00.000Z', 'legacy-video.mp4');
  legacy.close();
  const service = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true });
  t.after(() => service.close());
  const job = await (await fetch(`${service.baseUrl}/api/jobs/legacy-video`)).json();
  assert.equal(job.status, 'completed');
  assert.equal(job.outputSeconds, 7200);
  assert.equal(job.routeName, 'Rota antiga');
  assert.equal(job.downloadUrl, '/api/jobs/legacy-video/video');
  assert.deepEqual([job.resolution, job.width, job.height, job.fps], ['720p', 1280, 720, 24]);
  assert.equal(service.db.prepare('SELECT output_file FROM jobs WHERE id = ?').get(job.id).output_file, 'legacy-video.mp4');
  await service.close();
  const reopened = await startServer({ port: 0, dataDir, distDir: null, enableWorker: false, authDisabled: true });
  t.after(() => reopened.close());
  assert.equal(reopened.db.prepare('PRAGMA table_info(jobs)').all().filter((column) => column.name === 'resolution').length, 1);
});

test('render workers receive native 4K dimensions and the entire journey duration', async (t) => {
  let captured;
  const render = async (input) => {
    captured = input;
    input.onProgress(0.5);
    await writeFile(input.outputPath, 'worker-4k-contract');
  };
  const { api } = await setup(t, { enableWorker: true, render });
  const { variant } = await createRouteVariant(api);
  const response = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, resolution: '2160p' } });
  const job = await waitJob(api, response.body.id, (result) => result.status === 'completed');
  assert.equal(captured.journeySeconds, 7200);
  assert.equal(captured.job.outputSeconds, 7200);
  assert.deepEqual([captured.job.width, captured.job.height, captured.job.fps], [3840, 2160, 24]);
  assert.equal(captured.gpuMode, 'software');
  assert.equal(job.outputSeconds, 7200);
});

test('the queue completes a file, serializes exports and issues scoped download links with authentication', async (t) => {
  let running = 0, maxRunning = 0;
  const render = async ({ outputPath, onProgress }) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    onProgress(0.5);
    await delay(50);
    await writeFile(outputPath, Buffer.from('mp4-test-output'));
    running -= 1;
  };
  const { api } = await setup(t, { enableWorker: true, render, adminToken: 'test-only-private-token', authDisabled: false });
  const headers = { Authorization: 'Bearer test-only-private-token' };
  assert.equal((await api('/api/health')).body.authRequired, true);
  assert.equal((await api('/api/routes')).status, 401);
  assert.equal((await api('/api/routes', { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
  const { route, variant } = await createRouteVariant(api, headers);
  const secondVariant = (await api(`/api/routes/${route.id}/variants`, { method: 'POST', body: { ...variantInput, name: 'Noite', timeOfDay: 'night' }, headers })).body;
  const first = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, previewSeconds: 2 }, headers });
  const second = await api('/api/jobs', { method: 'POST', body: { variantId: secondVariant.id, previewSeconds: 2 }, headers });
  const completed = await waitJob(api, first.body.id, (job) => job.status === 'completed', headers);
  await waitJob(api, second.body.id, (job) => job.status === 'completed', headers);
  assert.equal(maxRunning, 1);
  assert.equal(completed.progress, 1);
  assert.ok(!completed.downloadUrl.includes('test-only-private-token'));
  const downloaded = await api(completed.downloadUrl);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.body, 'mp4-test-output');
  assert.match(downloaded.headers.get('content-disposition'), /attachment/);
  assert.equal((await api(completed.downloadUrl.replace(first.body.id, second.body.id))).status, 401);
  assert.equal((await api(completed.downloadUrl.replace('signature=', 'signature=bad'))).status, 401);
  assert.equal((await api(`/api/routes/${route.id}`, { method: 'DELETE', headers })).status, 204);
  assert.equal((await api(`/api/jobs/${first.body.id}`, { headers })).body.variantId, null);
});

test('active rendering cancellation removes partial output and releases its route', async (t) => {
  const render = async ({ signal, outputPath }) => {
    await writeFile(outputPath, 'partial');
    // Cancellation can arrive while the asynchronous file preparation is pending.
    // Real workers check already-aborted signals; the fixture must do the same.
    signal.throwIfAborted();
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const { api } = await setup(t, { enableWorker: true, render });
  const { route, variant } = await createRouteVariant(api);
  const response = await api('/api/jobs', { method: 'POST', body: { variantId: variant.id, previewSeconds: 2 } });
  await waitJob(api, response.body.id, (job) => job.status === 'rendering');
  await api(`/api/jobs/${response.body.id}/cancel`, { method: 'POST' });
  const cancelled = await waitJob(api, response.body.id, (job) => job.status === 'cancelled');
  assert.equal(cancelled.downloadUrl, undefined);
  assert.equal((await api(`/api/routes/${route.id}`, { method: 'DELETE' })).status, 204);
});
