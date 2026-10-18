import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeDistances, pointAtProgress } from '../src/geo.ts';

test('map marker advances by measured distance instead of equal point intervals', () => {
  const points = [{ lat: 0, lon: 0, ele: 10 }, { lat: 0, lon: .01, ele: 20 }, { lat: 0, lon: .03, ele: 40 }];
  const distances = cumulativeDistances(points);
  const half = pointAtProgress(points, .5, distances);
  assert.ok(Math.abs(half.lon - .015) < 1e-9);
  assert.ok(Math.abs(half.ele - 25) < 1e-8);
  const end = pointAtProgress(points, 1, distances);
  assert.ok(Math.abs(end.lon - .03) < 1e-9);
  assert.equal(end.lat, 0);
  assert.equal(end.ele, 40);
});

test('map marker crosses the antimeridian without jumping to Greenwich', () => {
  const points = [{ lat: 0, lon: 179.9, ele: null }, { lat: 0, lon: -179.9, ele: null }];
  const half = pointAtProgress(points, .5, cumulativeDistances(points));
  assert.ok(Math.abs(Math.abs(half.lon) - 180) < 1e-9);
  assert.equal(half.ele, null);
});
