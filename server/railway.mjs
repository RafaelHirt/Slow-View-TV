import express from 'express';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { routeFromRow } from './database.mjs';
import { HttpError, validateRoute } from './validation.mjs';
import { extractRailwayGeometry } from './railway-geometry.mjs';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors · ODbL 1.0';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_RESULTS = 40;
const SOURCE = { name: 'OpenStreetMap / Overpass', url: 'https://www.openstreetmap.org/copyright' };

class RailwayError extends HttpError {
  constructor(status, code, message, extra = {}) { super(status, message); this.code = code; Object.assign(this, extra); }
}

export function parseRailwayBbox(value) {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) {
    throw new RailwayError(400, 'invalid_bbox', 'Informe bbox=sul,oeste,norte,leste em coordenadas decimais.');
  }
  const [south, west, north, east] = value.split(',').map(Number);
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) {
    throw new RailwayError(400, 'invalid_bbox', 'Os limites do mapa são inválidos. Regiões que cruzam o antimeridiano devem ser consultadas separadamente.');
  }
  if ((north - south) * (east - west) > 4 || north - south > 4 || east - west > 4) {
    throw new RailwayError(400, 'zoom_required', 'Aproxime o mapa para pesquisar uma região de até 4 graus quadrados.');
  }
  return [south, west, north, east];
}

function relationId(value) {
  if (!/^[1-9]\d{0,15}$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new RailwayError(400, 'invalid_relation', 'Informe um identificador numérico positivo de relação OSM.');
  }
  return Number(value);
}

function summary(relation) {
  const tags = relation.tags ?? {};
  const bounds = relation.bounds;
  const center = relation.center ?? (bounds ? { lat: (bounds.minlat + bounds.maxlat) / 2, lon: (bounds.minlon + bounds.maxlon) / 2 } : null);
  return {
    relationId: relation.id, name: tags.name || [tags.from, tags.to].filter(Boolean).join(' → ') || tags.ref || `Relação ${relation.id}`,
    from: tags.from || null, to: tags.to || null, ref: tags.ref || null, operator: tags.operator || null,
    bounds: bounds ?? null, center, sourceUrl: `https://www.openstreetmap.org/relation/${relation.id}`,
  };
}

async function boundedJson(response) {
  const length = Number(response.headers?.get('content-length'));
  if (length > MAX_BYTES) {
    await response.body?.cancel();
    throw new RailwayError(502, 'response_too_large', 'A fonte excedeu o limite de 20 MB. Aproxime o mapa ou prepare a relação em partes.');
  }
  let bytes = 0;
  const chunks = [];
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new RailwayError(502, 'response_too_large', 'A fonte excedeu o limite de 20 MB. Nenhum percurso parcial foi importado.');
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  } else {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES) throw new RailwayError(502, 'response_too_large', 'A resposta excedeu o limite de 20 MB.');
    chunks.push(Buffer.from(text));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(body.elements) || body.remark) throw new Error('incomplete');
    return body;
  } catch {
    throw new RailwayError(502, 'invalid_source_response', 'A fonte não retornou dados OSM completos. Nenhum percurso parcial foi importado.');
  }
}

export function createRailwayService({ db, fetchImpl, now = () => Date.now(), timeoutMs = 30000 } = {}) {
  const cache = new Map(), pending = new Map();
  let dispatcher;
  let observation = { status: 'unchecked', lastCheckedAt: null, error: null };
  const clock = () => new Date(now()).toISOString();
  const base = () => ({ source: SOURCE, attribution: OSM_ATTRIBUTION });
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  function remember(key, value) {
    if (cache.size >= 128 && !cache.has(key)) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  }
  async function request(key, query, ttl = 300000) {
    const previous = cache.get(key);
    if (previous && previous.until > now()) {
      if (previous.error) throw previous.error;
      return previous.body;
    }
    if (pending.has(key)) return pending.get(key);
    // Start on the next microtask so even a synchronously throwing custom fetch
    // cannot leave a rejected entry stuck in pending beyond the cache lifetime.
    const work = Promise.resolve().then(async () => {
      try {
        if (!fetchImpl && proxy && !dispatcher) dispatcher = new ProxyAgent(proxy);
        const response = await (fetchImpl ?? undiciFetch)(OVERPASS_URL, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'SlowViewTV-Studio/0.1 (railway-route-preview)' },
          body: new URLSearchParams({ data: query }).toString(), ...(dispatcher ? { dispatcher } : {}),
        });
        if (!response.ok) {
          await response.body?.cancel();
          const forbidden = response.status === 403;
          throw new RailwayError(503, forbidden ? 'source_forbidden' : 'source_unavailable', forbidden
            ? 'O acesso ao Overpass foi recusado. Verifique a permissão para overpass-api.de nas configurações de rede.'
            : `A fonte ferroviária está indisponível (HTTP ${response.status}). Tente novamente mais tarde.`);
        }
        const body = await boundedJson(response);
        observation = { status: 'ready', lastCheckedAt: clock(), error: null };
        remember(key, { body, until: now() + ttl });
        return body;
      } catch (error) {
        const publicError = error instanceof RailwayError ? error : new RailwayError(503,
          ['TimeoutError', 'AbortError'].includes(error.name) ? 'source_timeout' : 'source_unreachable',
          ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'A consulta ferroviária excedeu o tempo limite. Nenhum dado parcial foi importado.'
            : 'Não foi possível acessar overpass-api.de pelo serviço. Verifique a rede e tente novamente.');
        observation = { status: 'unavailable', lastCheckedAt: clock(), error: publicError.message, code: publicError.code };
        remember(key, { error: publicError, until: now() + 15000 });
        throw publicError;
      } finally { pending.delete(key); }
    });
    pending.set(key, work);
    return work;
  }
  async function list(value) {
    const bbox = parseRailwayBbox(value);
    const body = await request(`bbox:${bbox.join(',')}`, `[out:json][timeout:20][maxsize:20000000];relation["type"="route"]["route"="train"](${bbox.join(',')});out tags center ${MAX_RESULTS + 1};`);
    const candidates = body.elements.filter((element) => element.type === 'relation' && element.tags?.type === 'route' && element.tags?.route === 'train');
    return { routes: candidates.slice(0, MAX_RESULTS).map(summary), bbox, ...base(), truncated: candidates.length > MAX_RESULTS,
      coverage: 'Relações ferroviárias cadastradas no OpenStreetMap. A lista não representa todos os serviços ou todos os trilhos do mundo.' };
  }
  async function relation(value) {
    const id = relationId(value);
    // Include full member ways (nodes + tags) so shared node IDs can distinguish
    // real junctions from geographically coincident, unconnected tracks.
    const body = await request(`relation:${id}`, `[out:json][timeout:20][maxsize:20000000];relation(${id})["type"="route"]["route"="train"]->.route;(.route;way(r.route););out meta geom;`, 3600000);
    const found = body.elements.find((element) => element.type === 'relation' && element.id === id && element.tags?.type === 'route' && element.tags?.route === 'train');
    if (!found) throw new RailwayError(404, 'relation_not_found', 'A relação ferroviária não foi encontrada na fonte.');
    return { ...summary(found), ...extractRailwayGeometry(found, body.elements), ...base(),
      sourceTimestamp: body.osm3s?.timestamp_osm_base ?? null, relationTimestamp: found.timestamp ?? null,
      fetchedAt: clock(), elevationKnown: false };
  }
  async function importRoute(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RailwayError(400, 'invalid_import', 'Envie um objeto JSON com relationId.');
    if (typeof body.relationId !== 'number') throw new RailwayError(400, 'invalid_relation', 'relationId deve ser um número inteiro positivo.');
    const detail = await relation(body.relationId);
    if (!detail.diagnostics.valid) throw new RailwayError(422, 'invalid_topology', 'Este cadastro OSM requer revisão; nenhum traçado foi importado.', { diagnostics: detail.diagnostics });
    const timestamp = detail.sourceTimestamp || 'data da base não informada';
    const input = validateRoute({
      name: body.name === undefined ? detail.name.slice(0, 140) : body.name,
      description: `Traçado contínuo da relação OSM ${detail.relationId}. ${detail.from || '?'} → ${detail.to || '?'}. Fonte: ${detail.sourceUrl}. Base OSM: ${timestamp}. © OpenStreetMap contributors, ODbL 1.0. A continuidade topológica foi conferida; horários, relevo, cenário e operação atual precisam de validação.`,
      sourceName: `OSM relation/${detail.relationId} · ${timestamp} · © OpenStreetMap contributors (ODbL 1.0)`,
      transport: 'train', isDemo: false, points: detail.points,
    });
    if (!db) throw new RailwayError(500, 'missing_database', 'O banco de dados ferroviário não está disponível.');
    const id = `osm-relation-${detail.relationId}`;
    const existing = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
    if (existing) return { route: routeFromRow(db, existing), created: false };
    db.prepare('INSERT INTO routes (id, name, description, source_name, transport, is_demo, points, distance_km, elevation_known, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.name, input.description, input.sourceName, input.transport, 0, JSON.stringify(input.points), input.distanceKm, 0, clock());
    return { route: routeFromRow(db, db.prepare('SELECT * FROM routes WHERE id = ?').get(id)), created: true };
  }
  return { list, relation, importRoute, status: () => ({ ...observation, ...base(), endpoint: OVERPASS_URL }),
    close: async () => { if (dispatcher) await dispatcher.close(); } };
}

export function createRailwayRouter(options) {
  const router = express.Router(), service = createRailwayService(options);
  const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  router.get('/status', (_req, res) => res.json(service.status()));
  router.get('/routes', handle(async (req, res) => res.json(await service.list(req.query.bbox))));
  router.get('/relations/:id', handle(async (req, res) => res.json(await service.relation(req.params.id))));
  router.post('/import', handle(async (req, res) => {
    const { route, created } = await service.importRoute(req.body);
    res.status(created ? 201 : 200).json(route);
  }));
  router.use((error, _req, res, next) => {
    if (!(error instanceof HttpError)) return next(error);
    res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) });
  });
  router.railwayService = service;
  return router;
}
