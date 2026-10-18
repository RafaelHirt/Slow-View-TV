import type { RoutePoint } from './types';
const rad = Math.PI / 180;
export function distanceMeters(a: RoutePoint, b: RoutePoint) {
  const lat = (b.lat - a.lat) * rad;
  const lon = (b.lon - a.lon) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function cumulativeDistances(points: RoutePoint[]) {
  let total = 0;
  return points.map((p, i) => { if (i) total += distanceMeters(points[i - 1], p); return total; });
}
export function pointAtProgress(points: RoutePoint[], progress: number, distances = cumulativeDistances(points)): RoutePoint {
  const target = (distances.at(-1) || 0) * Math.max(0, Math.min(1, progress));
  const index = Math.max(1, distances.findIndex((d) => d >= target));
  const a = points[index - 1]; const b = points[index] || a;
  const t = distances[index] === distances[index - 1] ? 0 : (target - distances[index - 1]) / (distances[index] - distances[index - 1]);
  const dlon = ((b.lon - a.lon + 540) % 360) - 180;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: ((a.lon + dlon * t + 540) % 360) - 180, ele: a.ele !== null && b.ele !== null ? a.ele + (b.ele - a.ele) * t : null };
}
