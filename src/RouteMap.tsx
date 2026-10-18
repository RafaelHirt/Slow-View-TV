import { useMemo } from 'react';
import { cumulativeDistances, pointAtProgress } from './geo';
import type { Route } from './types';

export function RouteMap({ route, progress = 0, compact = false }: { route: Route; progress?: number; compact?: boolean }) {
  const distances = useMemo(() => cumulativeDistances(route.points), [route.points]);
  const geometry = useMemo(() => {
    const origin = route.points[0];
    const project = (p: { lat: number; lon: number }) => ({ x: (((p.lon - origin.lon + 540) % 360) - 180) * Math.max(.01, Math.cos(origin.lat * Math.PI / 180)), y: -p.lat });
    const coords = route.points.map(project);
    const { minX, maxX, minY, maxY } = coords.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const scale = Math.min(240 / Math.max(maxX - minX, .00001), 120 / Math.max(maxY - minY, .00001));
    const transform = (p: { lat: number; lon: number }) => { const c = project(p); return { x: 150 + (c.x - (minX + maxX) / 2) * scale, y: 80 + (c.y - (minY + maxY) / 2) * scale }; };
    return { transform, path: route.points.map((p, i) => { const c = transform(p); return `${i ? 'L' : 'M'}${c.x.toFixed(2)},${c.y.toFixed(2)}`; }).join(' ') };
  }, [route]);
  const point = geometry.transform(pointAtProgress(route.points, progress, distances));
  const start = geometry.transform(route.points[0]); const end = geometry.transform(route.points.at(-1)!);
  return <svg viewBox="0 0 300 160" className={`route-map ${compact ? 'compact' : ''}`} role="img" aria-label={`Traçado de ${route.name}, ${Math.round(progress * 100)}% do percurso`}>
    <path d={geometry.path} className="map-track-shadow" />
    <path d={geometry.path} className="map-track" pathLength="100" />
    <path d={geometry.path} className="map-traveled" pathLength="100" strokeDasharray={`${progress * 100} 100`} />
    <circle cx={start.x} cy={start.y} r="4" className="map-endpoint" /><circle cx={end.x} cy={end.y} r="4" className="map-endpoint" />
    <circle cx={point.x} cy={point.y} r="9" className="map-marker-halo" /><circle cx={point.x} cy={point.y} r="4" className="map-marker" />
    {!compact && <><text x="14" y="150">{route.isDemo ? 'TRAÇADO ILUSTRATIVO' : 'TRAÇADO GPX · SEM MAPA-BASE'}</text><text x="286" y="150" textAnchor="end">{route.distanceKm.toFixed(1)} km</text></>}
  </svg>;
}
