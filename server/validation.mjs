export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Export dimensions are fixed presets: callers cannot silently lower the render
// size while labelling the resulting file as 4K.
export const VIDEO_FORMATS = Object.freeze({
  '720p': Object.freeze({ width: 1280, height: 720, fps: 24 }),
  '1080p': Object.freeze({ width: 1920, height: 1080, fps: 24 }),
  '2160p': Object.freeze({ width: 3840, height: 2160, fps: 24 }),
});

function object(value, name = 'Os dados') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${name} devem ser um objeto JSON.`);
  return value;
}
function text(value, name, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new HttpError(400, `${name} deve conter de 1 a ${max} caracteres.`);
  }
  return value.trim();
}
function number(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new HttpError(400, `${name} deve ser um número entre ${min} e ${max}.`);
  return value;
}
function choice(value, name, choices) {
  if (!choices.includes(value)) throw new HttpError(400, `${name} deve ser uma destas opções: ${choices.join(', ')}.`);
  return value;
}
function bool(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new HttpError(400, `${name} deve ser verdadeiro ou falso.`);
  return value;
}

export function distanceKm(points) {
  const rad = Math.PI / 180;
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index];
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    distance += 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  return distance;
}

export function validateRoute(body) {
  object(body);
  if (!Array.isArray(body.points) || body.points.length < 2 || body.points.length > 100000) throw new HttpError(400, 'A rota deve ter entre 2 e 100.000 pontos de GPS.');
  const points = body.points.map((point) => {
    object(point, 'Os pontos');
    return { lat: number(point.lat, 'Latitude', -90, 90), lon: number(point.lon, 'Longitude', -180, 180), ele: point.ele == null ? null : number(point.ele, 'Altitude', -500, 10000) };
  });
  const km = distanceKm(points);
  if (km < 0.001) throw new HttpError(400, 'A rota precisa ter pelo menos dois pontos diferentes e um metro de extensão.');
  const description = body.description === '' ? '' : text(body.description, 'Descrição', 2000, '');
  const sourceName = body.sourceName === '' ? '' : text(body.sourceName, 'Origem do traçado', 240, '');
  return {
    name: text(body.name, 'Nome da rota', 140), description, sourceName,
    transport: choice(body.transport, 'Transporte', ['train', 'car', 'walk']),
    isDemo: bool(body.isDemo, 'Rota de demonstração', false), points, distanceKm: km,
    elevationKnown: points.every((p) => p.ele !== null),
  };
}

export function validatePlan(body) {
  object(body);
  return {
    name: text(body.name, 'Nome do planejamento', 140),
    origin: text(body.origin, 'Origem', 160),
    destination: text(body.destination, 'Destino', 160),
    transport: choice(body.transport, 'Transporte', ['train', 'car', 'walk']),
    notes: body.notes === '' ? '' : text(body.notes, 'Observações', 2000, ''),
  };
}

export function validateVariant(body) {
  object(body);
  const durationMinutes = number(body.durationMinutes, 'Duração em minutos', 1, 720);
  if (!Number.isInteger(durationMinutes)) throw new HttpError(400, 'A duração deve ser um número inteiro de minutos.');
  return {
    name: text(body.name, 'Nome da variação', 140),
    season: choice(body.season, 'Estação', ['summer', 'autumn', 'winter', 'spring']),
    timeOfDay: choice(body.timeOfDay, 'Horário', ['dawn', 'day', 'dusk', 'night']),
    weather: choice(body.weather, 'Clima', ['clear', 'cloudy', 'rain', 'snow']),
    durationMinutes, temperatureC: body.temperatureC == null ? null : number(body.temperatureC, 'Temperatura simulada', -60, 60),
    showMap: bool(body.showMap, 'Exibir mapa', true),
  };
}

export function validateJob(body) {
  object(body);
  const variantId = text(body.variantId, 'Identificador da variação', 80);
  const previewSeconds = body.previewSeconds === undefined ? undefined : number(body.previewSeconds, 'Duração da prévia', 2, 30);
  if (previewSeconds !== undefined && !Number.isInteger(previewSeconds)) throw new HttpError(400, 'A duração da prévia deve ser um número inteiro de segundos.');
  const resolution = choice(body.resolution === undefined ? '720p' : body.resolution, 'Resolução', Object.keys(VIDEO_FORMATS));
  return { variantId, previewSeconds, resolution, ...VIDEO_FORMATS[resolution] };
}
