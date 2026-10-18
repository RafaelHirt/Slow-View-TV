import type { RoutePoint } from './types';
import { cumulativeDistances } from './geo';

export function parseGPX(xml: string): { points: RoutePoint[]; name: string } {
  if (new TextEncoder().encode(xml).length > 12_000_000) throw new Error('O GPX pode ter até 12 MB. Prepare o arquivo em partes conectadas se ele ultrapassar esse limite.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.documentElement.localName !== 'gpx') throw new Error('Este arquivo não é um GPX válido.');
  const segments = Array.from(document.getElementsByTagNameNS('*', 'trkseg')).filter((s) => s.getElementsByTagNameNS('*', 'trkpt').length);
  const routes = Array.from(document.getElementsByTagNameNS('*', 'rte')).filter((s) => s.getElementsByTagNameNS('*', 'rtept').length);
  if (segments.length + routes.length !== 1) throw new Error('Importe um GPX com um único percurso contínuo. Separe arquivos com várias trilhas ou segmentos para evitar saltos na viagem.');
  const source = segments[0] || routes[0];
  const nodes = Array.from(source.getElementsByTagNameNS('*', segments.length ? 'trkpt' : 'rtept'));
  if (nodes.length < 2 || nodes.length > 100000) throw new Error('A rota precisa ter entre 2 e 100.000 pontos. Nenhum trecho será removido automaticamente.');
  const points = nodes.map((node) => {
    const rawLat = node.getAttribute('lat'); const rawLon = node.getAttribute('lon');
    const lat = Number(rawLat); const lon = Number(rawLon);
    const elevation = node.getElementsByTagNameNS('*', 'ele')[0]?.textContent?.trim();
    const ele = elevation ? Number(elevation) : null;
    if (!rawLat?.trim() || !rawLon?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (ele !== null && (!Number.isFinite(ele) || ele < -500 || ele > 9000))) throw new Error('O GPX contém coordenadas ou elevações inválidas.');
    return { lat, lon, ele };
  }).filter((p, i, all) => !i || p.lat !== all[i - 1].lat || p.lon !== all[i - 1].lon);
  if (points.length < 2 || (cumulativeDistances(points).at(-1) || 0) < 1) throw new Error('O percurso precisa ter pelo menos um metro de extensão.');
  const names = document.getElementsByTagNameNS('*', 'name');
  return { points, name: names[0]?.textContent?.trim().slice(0, 120) || '' };
}

// An original illustrative track; these are not verified coordinates of a real journey.
export function demoPoints(): RoutePoint[] {
  return Array.from({ length: 180 }, (_, i) => {
    const t = i / 179;
    return { lat: -25 + t * 0.055, lon: -49 + t * 0.035 + Math.sin(t * Math.PI * 3) * 0.004, ele: 550 + Math.sin(t * Math.PI * 2) * 8 };
  });
}
