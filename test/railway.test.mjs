import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { openDatabase } from '../server/database.mjs';
import { extractRailwayGeometry } from '../server/railway-geometry.mjs';
import { createRailwayRouter, createRailwayService, parseRailwayBbox, OVERPASS_URL, OSM_ATTRIBUTION } from '../server/railway.mjs';

// Deliberately illustrative graph fixtures, not real-world railway coordinates.
const A = { lat: 1, lon: 1 }, B = { lat: 1, lon: 1.01 }, C = { lat: 1.01, lon: 1.02 }, D = { lat: 1.02, lon: 1.01 };
const stamp = '2026-10-18T10:00:00Z';
function way(id, geometry, nodes, tags = { railway: 'rail' }) { return { type: 'way', id, geometry, nodes, tags }; }
function fixture(ways = [way(1, [A, B], [11, 12]), way(2, [C, B], [13, 12])], members) {
  const relation = {
    type: 'relation', id: 123, timestamp: '2026-09-01T00:00:00Z',
    tags: { type: 'route', route: 'train', name: 'Percurso ilustrativo de teste', from: 'Estação A', to: 'Estação C', ref: 'TEST', operator: 'Fixture' },
    members: members ?? ways.map((entry) => ({ type: 'way', ref: entry.id, role: '', geometry: entry.geometry })),
  };
  return { elements: [relation, ...ways], osm3s: { timestamp_osm_base: stamp } };
}
function extract(body) { return extractRailwayGeometry(body.elements[0], body.elements); }
function response(body, options) { return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...options }); }

test('rail geometry joins reversed segments using shared OSM nodes and preserves every point', () => {
  const result = extract(fixture());
  assert.equal(result.diagnostics.valid, true);
  assert.equal(result.diagnostics.connectivity, 'shared-osm-nodes');
  assert.deepEqual(result.points, [A, B, C].map((point) => ({ ...point, ele: null })));
  assert.equal(result.diagnostics.pointCount, 3);
  assert.equal(result.diagnostics.wayCount, 2);
});

test('exact coordinate fallback is allowed but never snaps nearby disconnected endpoints', () => {
  const body = fixture();
  body.elements = [body.elements[0]];
  assert.equal(extract(body).diagnostics.connectivity, 'exact-coordinates');
  body.elements[0].members[1].geometry = [C, { lat: B.lat + 0.000001, lon: B.lon }];
  const result = extract(body);
  assert.equal(result.diagnostics.valid, false);
  assert.deepEqual(result.points, []);
  assert.ok(result.diagnostics.issues.some((issue) => issue.code === 'disconnected_track'));
});

test('branches at interior nodes, missing geometry, nested relations and repeated tracks are rejected', () => {
  const cases = [
    [fixture([way(1, [A, B, C], [11, 12, 13]), way(2, [B, D], [12, 14])]), 'branching_track'],
    [fixture([], [{ type: 'way', ref: 6, role: '' }]), 'missing_geometry'],
    [fixture([], [{ type: 'relation', ref: 6, role: '' }]), 'nested_member'],
    [fixture([way(1, [A, B], [11, 12]), way(2, [B, A], [12, 11])]), 'repeated_track'],
  ];
  for (const [body, code] of cases) {
    const result = extract(body);
    assert.equal(result.diagnostics.valid, false, code);
    assert.deepEqual(result.points, [], code);
    assert.ok(result.diagnostics.issues.some((issue) => issue.code === code), JSON.stringify(result));
  }
});

test('separate loops are disconnected and closed continuous loops remain usable', () => {
  const loop = way(1, [A, B, C, A], [11, 12, 13, 11]);
  const result = extract(fixture([loop]));
  assert.equal(result.diagnostics.valid, true);
  assert.equal(result.diagnostics.closedLoop, true);
  assert.deepEqual(result.points[0], result.points.at(-1));
  const other = way(2, [{ lat: 2, lon: 2 }, { lat: 2, lon: 2.1 }, { lat: 2.1, lon: 2 }, { lat: 2, lon: 2 }], [20, 21, 22, 20]);
  const disconnected = extract(fixture([loop, other]));
  assert.equal(disconnected.diagnostics.valid, false);
  assert.equal(disconnected.diagnostics.issues[0].code, 'disconnected_track');
});

test('direction roles are respected and inconsistent roles are rejected', () => {
  const body = fixture();
  body.elements[0].members[0].role = 'backward';
  body.elements[0].members[1].role = 'forward';
  assert.deepEqual(extract(body).points, [C, B, A].map((point) => ({ ...point, ele: null })));
  body.elements[0].members[1].role = 'backward';
  assert.equal(extract(body).diagnostics.issues[0].code, 'direction_conflict');
});

test('platforms and stops do not turn into rails, unknown roles fail closed', () => {
  const body = fixture();
  body.elements[0].members.push({ type: 'node', ref: 50, role: 'stop' }, { type: 'way', ref: 7, role: 'platform' });
  assert.equal(extract(body).diagnostics.valid, true);
  body.elements[0].members.push({ type: 'way', ref: 8, role: 'alternative' });
  assert.equal(extract(body).diagnostics.issues[0].code, 'unsupported_role');
});

test('geometry point limits never silently simplify a real route', () => {
  const result = extractRailwayGeometry(fixture().elements[0], fixture().elements, { maxPoints: 2 });
  assert.equal(result.diagnostics.valid, false);
  assert.ok(result.diagnostics.issues.some((issue) => issue.code === 'too_many_points'));
  assert.deepEqual(result.points, []);
});

test('full railway geometry above 10000 vertices keeps every source point', () => {
  const geometry = Array.from({ length: 10001 }, (_, index) => ({ lat: 48 + index / 1000000, lon: 16 + index / 1000000 }));
  const nodes = Array.from({ length: geometry.length }, (_, index) => index + 1);
  const result = extract(fixture([way(1, geometry, nodes)]));
  assert.equal(result.diagnostics.valid, true);
  assert.equal(result.points.length, geometry.length);
  assert.deepEqual(result.points, geometry.map((point) => ({ ...point, ele: null })));
});

test('bbox parser rejects huge, reversed and injected queries while allowing a normal map viewport', () => {
  assert.deepEqual(parseRailwayBbox('48,15,49,17.5'), [48, 15, 49, 17.5]);
  for (const value of [undefined, '-90,-180,90,180', '48,15,47,16', '48,15,49,15', '48,15,49,20', '48,15,49,16);out;', '91,15,92,16']) {
    assert.throws(() => parseRailwayBbox(value), { status: 400 });
  }
});

test('Overpass queries use a fixed host, bounded train relations, caching and a truncated result list', async () => {
  const calls = [];
  const original = fixture();
  const elements = Array.from({ length: 41 }, (_, index) => ({ ...original.elements[0], id: index + 1, center: A }));
  const service = createRailwayService({ fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ elements }); } });
  assert.equal(service.status().status, 'unchecked');
  const result = await service.list('48,15,49,17.5');
  assert.equal(result.routes.length, 40);
  assert.equal(result.truncated, true);
  assert.equal(result.attribution, OSM_ATTRIBUTION);
  assert.match(result.coverage, /não representa todos/);
  assert.equal(result.routes[0].sourceUrl, 'https://www.openstreetmap.org/relation/1');
  const query = new URLSearchParams(calls[0].options.body).get('data');
  assert.match(query, /relation\["type"="route"\]\["route"="train"\]/);
  assert.match(query, /out tags center 41/);
  assert.equal(calls[0].url, OVERPASS_URL);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  await service.list('48,15,49,17.5');
  assert.equal(calls.length, 1);
  assert.equal(service.status().status, 'ready');
});

test('concurrent requests share one source operation and error caching expires without hiding a denial', async () => {
  let calls = 0, time = 100000;
  const service = createRailwayService({ now: () => time, fetchImpl: async () => { calls += 1; return response({}, { status: 403 }); } });
  const outcomes = await Promise.allSettled([service.list('48,15,49,16'), service.list('48,15,49,16')]);
  assert.ok(outcomes.every((result) => result.status === 'rejected' && result.reason.status === 503 && result.reason.code === 'source_forbidden'));
  assert.equal(calls, 1);
  assert.equal(service.status().status, 'unavailable');
  await assert.rejects(service.list('48,15,49,16'), { code: 'source_forbidden' });
  assert.equal(calls, 1);
  time += 16000;
  await assert.rejects(service.list('48,15,49,16'), { code: 'source_forbidden' });
  assert.equal(calls, 2);
});

test('timeouts, invalid, incomplete and oversized source responses do not supply partial routes', async () => {
  const cases = [
    [async () => { throw new DOMException('fixture timeout', 'TimeoutError'); }, 'source_timeout'],
    [async () => new Response('broken-json'), 'invalid_source_response'],
    [async () => response({ elements: [], remark: 'runtime error: Query timed out' }), 'invalid_source_response'],
    [async () => new Response('', { headers: { 'content-length': String(21 * 1024 * 1024) } }), 'response_too_large'],
  ];
  for (const [fetchImpl, code] of cases) {
    const service = createRailwayService({ fetchImpl });
    await assert.rejects(service.relation(123), { code });
    assert.equal(service.status().status, 'unavailable');
  }
});

test('relation retrieval preserves source metadata and refuses non-train identities and invalid IDs', async () => {
  let calls = 0;
  const service = createRailwayService({ fetchImpl: async () => { calls += 1; return response(fixture()); } });
  const result = await service.relation(123);
  assert.equal(result.sourceTimestamp, stamp);
  assert.equal(result.relationTimestamp, '2026-09-01T00:00:00Z');
  assert.equal(result.attribution, OSM_ATTRIBUTION);
  assert.equal(result.elevationKnown, false);
  assert.equal(result.diagnostics.valid, true);
  for (const id of ['0', '-1', '123);out;', 1.5, '9007199254740992']) await assert.rejects(service.relation(id), { status: 400 });
  assert.equal(calls, 1);
  await assert.rejects(service.relation(456), { status: 404 });
});

test('import persists verified geometry and attribution, deduplicates and never writes disconnected routes', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-railway-'));
  const db = openDatabase(dataDir);
  t.after(async () => { db.close(); await rm(dataDir, { recursive: true, force: true }); });
  let body = fixture();
  const service = createRailwayService({ db, fetchImpl: async () => response(body) });
  const imported = await service.importRoute({ relationId: 123, name: 'Minha rota' });
  assert.equal(imported.created, true);
  assert.equal(imported.route.name, 'Minha rota');
  assert.equal(imported.route.isDemo, false);
  assert.equal(imported.route.elevationKnown, false);
  assert.equal(imported.route.points.length, 3);
  assert.match(imported.route.sourceName, /OSM relation\/123/);
  assert.match(imported.route.sourceName, /2026-10-18/);
  assert.match(imported.route.description, /OpenStreetMap contributors, ODbL 1\.0/);
  assert.equal((await service.importRoute({ relationId: 123 })).created, false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM routes').get().n, 1);
  await assert.rejects(service.importRoute({ relationId: '123' }), { status: 400 });
  body = fixture([way(1, [A, B], [11, 12]), way(2, [C, D], [13, 14])]);
  body.elements[0].id = 456;
  await assert.rejects(service.importRoute({ relationId: 456 }), (error) => error.status === 422 && error.diagnostics.valid === false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM routes').get().n, 1);
});

test('router exposes usable status and diagnostic errors to the map without a server error', async (t) => {
  const app = express();
  app.use(express.json());
  const router = createRailwayRouter({ fetchImpl: async () => response(fixture([way(1, [A, B], [11, 12]), way(2, [C, D], [13, 14])])) });
  app.use('/api/railway', router);
  const server = createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => { await new Promise((done) => server.close(done)); await router.railwayService.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/railway`;
  assert.equal((await (await fetch(`${base}/status`)).json()).status, 'unchecked');
  const invalidQuery = await fetch(`${base}/routes?bbox=-90,-180,90,180`);
  assert.equal(invalidQuery.status, 400);
  assert.equal((await invalidQuery.json()).code, 'zoom_required');
  const detail = await (await fetch(`${base}/relations/123`)).json();
  assert.equal(detail.diagnostics.valid, false);
  assert.deepEqual(detail.points, []);
  const imported = await fetch(`${base}/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ relationId: 123 }) });
  assert.equal(imported.status, 422);
  assert.equal((await imported.json()).diagnostics.issues[0].code, 'disconnected_track');
  assert.equal((await (await fetch(`${base}/status`)).json()).status, 'ready');
});
