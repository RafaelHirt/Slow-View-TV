export interface RoutePoint { lat: number; lon: number; ele: number | null }
export type Transport = 'train' | 'car' | 'walk';
export type Season = 'summer' | 'autumn' | 'winter' | 'spring';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow';
export type VideoResolution = '720p' | '1080p' | '2160p';
export interface Variant {
  id: string; routeId: string; name: string; season: Season;
  timeOfDay: TimeOfDay; weather: Weather; durationMinutes: number;
  temperatureC: number | null; showMap: boolean; createdAt: string;
}
export interface Route {
  id: string; name: string; description: string; sourceName: string;
  transport: Transport; isDemo: boolean; points: RoutePoint[];
  distanceKm: number; elevationKnown: boolean; createdAt: string;
  variants: Variant[];
}
export interface Job {
  id: string; variantId: string | null; routeName: string; variantName: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number; error: string | null; createdAt: string;
  outputSeconds: number; downloadUrl?: string; preview: boolean;
  resolution: VideoResolution; width: number; height: number; fps: number;
}
export type VariantInput = Omit<Variant, 'id' | 'routeId' | 'createdAt'>;
export type RouteInput = Pick<Route, 'name' | 'description' | 'sourceName' | 'transport' | 'isDemo' | 'points'>;
export interface RoutePlan {
  id: string; name: string; origin: string; destination: string;
  transport: Transport; notes: string; createdAt: string;
}
export type RoutePlanInput = Omit<RoutePlan, 'id' | 'createdAt'>;
export const seasonLabels: Record<Season, string> = { summer: 'Verão', autumn: 'Outono', winter: 'Inverno', spring: 'Primavera' };
export const timeLabels: Record<TimeOfDay, string> = { dawn: 'Amanhecer', day: 'Dia', dusk: 'Entardecer', night: 'Noite' };
export const weatherLabels: Record<Weather, string> = { clear: 'Céu limpo', cloudy: 'Nublado', rain: 'Chuva', snow: 'Neve' };
export const transportLabels: Record<Transport, string> = { train: 'Trem', car: 'Carro', walk: 'Caminhada' };
