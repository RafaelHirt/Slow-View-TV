import type { RoutePoint } from '../types';

const EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;

export interface ProjectedPoint { x: number; y: number; z: number; distance: number }
export interface ProjectedRoute { points: ProjectedPoint[]; length: number }
export interface RoutePosition extends ProjectedPoint { tangentX: number; tangentZ: number; slope: number }

function shortestLongitude(degrees: number) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

/** Local metric projection, with antimeridian unwrapping and measured route distances. */
export function projectRoute(source: RoutePoint[]): ProjectedRoute {
  if (source.length < 2) throw new Error('A rota precisa de pelo menos dois pontos.');
  const referenceLat = source.reduce((sum, point) => sum + point.lat, 0) / source.length;
  // Partial elevation must never turn an unknown point into a plunge to sea level.
  // Preserve the original GPX in storage and use one flat plane for this preview.
  const hasElevation = source.every(point => point.ele !== null && Number.isFinite(point.ele));
  const originElevation = hasElevation ? source[0].ele! : 0;
  const points: ProjectedPoint[] = [];
  let longitude = 0;
  let distance = 0;
  let previous: RoutePoint | undefined;
  for (const point of source) {
    if (![point.lat, point.lon, point.ele ?? 0].every(Number.isFinite)) {
      throw new Error('A rota contém coordenadas inválidas.');
    }
    if (previous) {
      const deltaLon = shortestLongitude(point.lon - previous.lon);
      const deltaLat = (point.lat - previous.lat) * RAD;
      const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(previous.lat * RAD) * Math.cos(point.lat * RAD) * Math.sin(deltaLon * RAD / 2) ** 2;
      const step = 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
      if (step < 0.001) continue;
      distance += step;
      longitude += deltaLon;
    }
    points.push({ x: longitude * RAD * Math.cos(referenceLat * RAD) * EARTH_RADIUS, y: hasElevation ? point.ele! - originElevation : 0, z: -(point.lat - source[0].lat) * RAD * EARTH_RADIUS, distance });
    previous = point;
  }
  if (points.length < 2 || distance <= 0) throw new Error('A rota precisa ter distância maior que zero.');
  return { points, length: distance };
}

/** Follows each supplied segment. No spline can cut across a bend in the GPX. */
export function sampleRoutePosition(route: ProjectedRoute, requestedDistance: number): RoutePosition {
  const distance = Math.max(0, Math.min(route.length, requestedDistance));
  let lo = 0;
  let hi = route.points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (route.points[mid].distance <= distance) lo = mid;
    else hi = mid;
  }
  const a = route.points[lo];
  const b = route.points[hi];
  const ratio = (distance - a.distance) / (b.distance - a.distance);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const horizontal = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * ratio, y: a.y + (b.y - a.y) * ratio, z: a.z + dz * ratio, distance, tangentX: dx / horizontal, tangentZ: dz / horizontal, slope: (b.y - a.y) / horizontal };
}

export function routeStations(route: ProjectedRoute, from: number, to: number, spacing = 25) {
  const start = Math.max(0, from);
  const end = Math.min(route.length, to);
  const distances = [start, end];
  for (const point of route.points) if (point.distance > start && point.distance < end) distances.push(point.distance);
  for (let distance = Math.ceil(start / spacing) * spacing; distance < end; distance += spacing) distances.push(distance);
  distances.sort((a, b) => a - b);
  return distances.filter((distance, index) => !index || distance - distances[index - 1] > 0.005).map(distance => sampleRoutePosition(route, distance));
}

export function seeded(seed: number) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let next = Math.imul(value ^ value >>> 15, 1 | value);
    next ^= next + Math.imul(next ^ next >>> 7, 61 | next);
    return ((next ^ next >>> 14) >>> 0) / 4_294_967_296;
  };
}
