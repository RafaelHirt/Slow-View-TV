import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRoute, sampleRoutePosition, routeStations, seeded } from './geometry';

test('camera follows individual route segments rather than cutting a right-angle bend', () => {
  const route = projectRoute([{ lat: 0, lon: 0, ele: 40 }, { lat: 0, lon: 0.001, ele: 50 }, { lat: 0.001, lon: 0.001, ele: 60 }]);
  const turn = route.points[1];
  const before = sampleRoutePosition(route, turn.distance / 2);
  assert.equal(before.z, 0);
  assert.equal(before.y, 5);
  const after = sampleRoutePosition(route, turn.distance + (route.length - turn.distance) / 2);
  assert.equal(after.x, turn.x);
  assert.ok(after.z < 0);
  assert.equal(sampleRoutePosition(route, -100).distance, 0);
  assert.equal(sampleRoutePosition(route, route.length + 100).distance, route.length);
});

test('render stations retain all GPX bends, including corners between regular samples', () => {
  const route = projectRoute([{ lat: 48, lon: 8, ele: null }, { lat: 48.0001, lon: 8.0002, ele: null }, { lat: 48.002, lon: 8.0002, ele: null }]);
  const stations = routeStations(route, 0, route.length, 40);
  assert.ok(stations.some(point => point.distance === route.points[1].distance));
  assert.ok(stations.every(point => Number.isFinite(point.x) && point.y === 0));
});

test('duplicate fixes are ignored, degenerate paths fail, and antimeridian is unwrapped', () => {
  const route = projectRoute([{ lat: 0, lon: 179.999, ele: null }, { lat: 0, lon: 179.999, ele: null }, { lat: 0, lon: -179.999, ele: null }]);
  assert.equal(route.points.length, 2);
  assert.ok(route.length > 200 && route.length < 250);
  assert.ok(Math.abs(route.points[1].x) < 250);
  assert.throws(() => projectRoute([{ lat: 0, lon: 0, ele: null }, { lat: 0, lon: 0, ele: null }]));
});

test('illustrative scenery has repeatable seeds for deterministic frame exports', () => {
  const one = seeded(77);
  const two = seeded(77);
  assert.deepEqual(Array.from({ length: 12 }, () => one()), Array.from({ length: 12 }, () => two()));
});

test('incomplete elevation uses a level preview instead of dropping missing samples to sea level', () => {
  const points = [{ lat: -25, lon: -49, ele: 760 }, { lat: -25.001, lon: -49, ele: null }, { lat: -25.002, lon: -49, ele: 762 }];
  const path = projectRoute(points);
  assert.deepEqual(path.points.map(point => point.y), [0, 0, 0]);
  assert.equal(points[0].ele, 760);
  assert.equal(points[1].ele, null);
});
