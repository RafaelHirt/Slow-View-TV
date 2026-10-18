import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import polygonClipping from 'polygon-clipping';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MERCATOR_LATITUDE_LIMIT = 85.0511287798066;
const EPSILON = 1e-8;

function samePoint(a, b) { return a[0] === b[0] && a[1] === b[1]; }

// Natural Earth's spherical rings may use both -180 and +180 at the same
// meridian. Leaflet interprets GeoJSON as planar coordinates, so those jumps
// must be unwrapped before an ordinary planar polygon intersection is valid.
export function unwrapRing(source) {
  if (source.length < 4) throw new Error('A country ring has fewer than four coordinates.');
  const ring = [[...source[0]]];
  for (const point of source.slice(1)) {
    let longitude = point[0];
    const previous = ring.at(-1)[0];
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    const next = [longitude, point[1]];
    if (!samePoint(next, ring.at(-1))) ring.push(next);
  }
  const first = ring[0], last = ring.at(-1);
  const windsAroundPole = Math.abs(last[0] - first[0]) > 180;
  if (windsAroundPole) {
    // A spherical closed ring can finish one complete longitude turn away
    // from its beginning. Closing it across the coast would fill the ocean.
    // Its planar counterpart closes through the enclosed geographic pole.
    const latitudes = ring.map((point) => point[1]);
    const pole = Math.max(...latitudes) < 0 ? -90 : Math.min(...latitudes) > 0 ? 90 : null;
    if (pole === null) throw new Error('An ambiguous pole-winding ring needs a geodesic review.');
    ring.push([last[0], pole], [first[0], pole], [...first]);
  } else if (!samePoint(first, last)) ring.push([...first]);
  return { ring, windsAroundPole };
}

function longitudeBounds(ring) {
  let min = Infinity, max = -Infinity;
  for (const [longitude] of ring) { min = Math.min(min, longitude); max = Math.max(max, longitude); }
  return [min, max];
}

function shifted(ring, amount) { return ring.map(([longitude, latitude]) => [longitude + amount, latitude]); }
function windowPolygon(west, east) {
  return [[[west, -MERCATOR_LATITUDE_LIMIT], [east, -MERCATOR_LATITUDE_LIMIT],
    [east, MERCATOR_LATITUDE_LIMIT], [west, MERCATOR_LATITUDE_LIMIT], [west, -MERCATOR_LATITUDE_LIMIT]]];
}

export function projectWorldGeometry(geometry) {
  if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) throw new Error(`Unsupported country geometry: ${geometry.type}`);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const result = [];
  for (const source of polygons) {
    const exterior = unwrapRing(source[0]);
    const [west, east] = longitudeBounds(exterior.ring);
    const center = (west + east) / 2;
    const holes = source.slice(1).map((sourceHole) => {
      const hole = unwrapRing(sourceHole);
      if (hole.windsAroundPole) throw new Error('A pole-winding interior ring needs a geodesic review.');
      const [min, max] = longitudeBounds(hole.ring);
      return shifted(hole.ring, Math.round((center - (min + max) / 2) / 360) * 360);
    });
    const polygon = [exterior.ring, ...holes];
    // Shift whole polygons, preserving holes, then intersect the world window.
    // Split polar caps into hemispheres: the projection's southern/northern
    // boundary is real, and no output edge needs a 360-degree longitude jump.
    const windows = exterior.windsAroundPole ? [[-180, 0], [0, 180]] : [[-180, 180]];
    const minShift = Math.ceil((-180 - east) / 360);
    const maxShift = Math.floor((180 - west) / 360);
    for (let turn = minShift; turn <= maxShift; turn += 1) {
      const copy = polygon.map((ring) => shifted(ring, turn * 360));
      for (const [left, right] of windows) result.push(...polygonClipping.intersection(copy, windowPolygon(left, right)));
    }
  }
  if (!result.length) throw new Error('A country disappeared during projection clipping.');
  return result.length === 1 ? { type: 'Polygon', coordinates: result[0] } : { type: 'MultiPolygon', coordinates: result };
}

export function validateWorldMap(collection) {
  for (const country of collection.features) {
    const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      if (ring.length < 4 || !samePoint(ring[0], ring.at(-1))) throw new Error(`${country.properties.name}: an output ring is not closed.`);
      for (let index = 0; index < ring.length; index += 1) {
        const [longitude, latitude] = ring[index];
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 + EPSILON
          || Math.abs(latitude) > MERCATOR_LATITUDE_LIMIT + EPSILON) throw new Error(`${country.properties.name}: a coordinate is outside Web Mercator bounds.`);
        if (index && Math.abs(longitude - ring[index - 1][0]) > 180 + EPSILON) throw new Error(`${country.properties.name}: an edge crosses the antimeridian.`);
      }
    }
  }
}

export async function prepareWorldMap() {
  const topology = JSON.parse(await readFile(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
  const countries = feature(topology, topology.objects.countries);
  const projected = { ...countries, features: countries.features.map((country) => ({ ...country, geometry: projectWorldGeometry(country.geometry) })) };
  validateWorldMap(projected);
  const directory = resolve(root, 'public/data');
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, 'countries-110m.geojson');
  await writeFile(output, JSON.stringify(projected) + '\n');
  return { countries: projected.features.length, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { countries, output } = await prepareWorldMap();
  console.log(`Prepared ${countries} Natural Earth countries for Web Mercator: ${output}`);
}
