import type { RoutePoint } from './types';

export interface RailService {
  relationId: number; name: string; from: string | null; to: string | null;
  ref: string | null; operator: string | null;
  bounds: { minlat: number; minlon: number; maxlat: number; maxlon: number } | null;
  center: { lat: number; lon: number } | null; sourceUrl: string;
}
export interface RailSearchResponse {
  routes: RailService[]; bbox: number[]; source: { name: string; url: string }; attribution: string; truncated: boolean;
}
export interface RailDetail extends RailService {
  points: RoutePoint[]; sourceTimestamp?: string | null;
  diagnostics: { valid: boolean; issues: { code: string; message: string }[]; wayCount: number; pointCount: number };
  attribution: string;
}
