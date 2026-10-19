import express from 'express';
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, routeFromRow, planFromRow, variantFromRow, jobFromRow } from './database.mjs';
import { createQueue } from './queue.mjs';
import { createRailwayRouter } from './railway.mjs';
import { createAuth, isLoopback } from './auth.mjs';
import { createKnowledgeRouter } from './knowledge.mjs';
import { HttpError, validateRoute, validatePlan, validateVariant, validateJob } from './validation.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const activeStatuses = ['queued', 'rendering'];

function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function startServer(options = {}) {
  const dataDir = resolve(options.dataDir || process.env.SLOWVISTA_DATA_DIR || join(projectRoot, 'data'));
  const distDir = options.distDir === null ? null : (options.distDir || join(projectRoot, 'dist'));
  const hasFrontend = Boolean(distDir && existsSync(join(distDir, 'index.html')));
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.PORT || 3001);
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  const appOriginSetting = options.appOrigin || process.env.APP_ORIGIN;
  let appOrigin = appOriginSetting || `http://127.0.0.1:${hasFrontend ? port : 5173}`;
  const workerToken = randomBytes(32).toString('hex');
  const signingKey = randomBytes(32);
  const allowedOrigins = new Set((options.corsOrigins ?? process.env.CORS_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  allowedOrigins.add(new URL(appOrigin).origin);
  const db = openDatabase(dataDir, {
    journalMode: options.sqliteJournalMode ?? process.env.SLOWVISTA_SQLITE_JOURNAL_MODE ?? 'WAL',
    lockingMode: options.sqliteLockingMode ?? process.env.SLOWVISTA_SQLITE_LOCKING_MODE ?? 'NORMAL',
  });
  let auth;
  try {
    auth = await createAuth({ db, allowedOrigins, adminToken,
      dashboardPassword: options.dashboardPassword ?? process.env.DASHBOARD_PASSWORD ?? '',
      authDisabled: options.authDisabled === true, allowLocalSetup: options.allowLocalSetup === true, now: options.authNow,
    });
    if (!isLoopback(host) && !auth.configured()) throw new Error('Configure DASHBOARD_PASSWORD, ADMIN_TOKEN ou uma senha local persistida antes de expor o servidor fora de localhost.');
  } catch (error) { db.close(); throw error; }
  const app = express();
  let queue;
  let closed = false;
  const enableWorker = options.enableWorker !== false;

  function jobResponse(row) {
    const job = jobFromRow(row);
    if (job?.downloadUrl && auth.enforced) {
      // A scoped link must remain usable during a complete multi-hour playback.
      const expires = Math.floor(Date.now() / 1000) + Math.min(46800, Math.max(1800, job.outputSeconds + 3600));
      const signature = createHmac('sha256', signingKey).update(`${job.id}:${expires}`).digest('hex');
      job.downloadUrl += `?expires=${expires}&signature=${signature}`;
    }
    return job;
  }
  function validDownload(req) {
    const match = /^\/api\/jobs\/([^/]+)\/video$/.exec(req.path);
    const expires = Number(req.query.expires), signature = req.query.signature;
    if (!match || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 46800) return false;
    const expected = createHmac('sha256', signingKey).update(`${match[1]}:${expires}`).digest('hex');
    return secureEqual(signature, expected);
  }
  function findRoute(id) {
    const route = routeFromRow(db, db.prepare('SELECT * FROM routes WHERE id = ?').get(id));
    if (!route) throw new HttpError(404, 'Rota não encontrada.');
    return route;
  }
  function findVariant(id) {
    const variant = variantFromRow(db.prepare('SELECT * FROM variants WHERE id = ?').get(id));
    if (!variant) throw new HttpError(404, 'Variação não encontrada.');
    return variant;
  }
  function findJob(id) {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!job) throw new HttpError(404, 'Exportação não encontrada.');
    return job;
  }
  function forbidActiveVariant(id) {
    if (db.prepare("SELECT id FROM jobs WHERE variant_id = ? AND status IN ('queued', 'rendering') LIMIT 1").get(id)) throw new HttpError(409, 'Cancele a exportação em andamento antes de excluir esta variação.');
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Origem não autorizada. Configure CORS_ORIGINS para este painel.' });
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '16mb', strict: true }));
  app.use('/api/auth', auth.router);
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    const workerRead = req.method === 'GET' && /^\/jobs\/[^/]+(?:\/scene)?$/.test(req.path) && secureEqual(req.get('x-slowvista-worker'), workerToken);
    if (!auth.enforced || workerRead || auth.authenticated(req) || validDownload({ ...req, path: `/api${req.path}`, query: req.query })) return next();
    res.status(401).json({ error: 'Acesso protegido. Entre com sua senha para abrir o painel.' });
  });
  const railwayRouter = createRailwayRouter({ db });
  app.use('/api/railway', railwayRouter);
  app.use('/api/knowledge', createKnowledgeRouter({ db }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'slowvista', authRequired: auth.enforced }));
  app.get('/api/plans', (_req, res) => res.json({ plans: db.prepare('SELECT * FROM route_plans ORDER BY created_at DESC, rowid DESC').all().map(planFromRow) }));
  app.post('/api/plans', (req, res) => {
    const plan = validatePlan(req.body), id = randomUUID();
    db.prepare('INSERT INTO route_plans (id, name, origin, destination, transport, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, plan.name, plan.origin, plan.destination, plan.transport, plan.notes, new Date().toISOString());
    res.status(201).json(planFromRow(db.prepare('SELECT * FROM route_plans WHERE id = ?').get(id)));
  });
  app.delete('/api/plans/:id', (req, res) => {
    const removed = db.prepare('DELETE FROM route_plans WHERE id = ?').run(req.params.id);
    if (!removed.changes) throw new HttpError(404, 'Planejamento não encontrado.');
    res.sendStatus(204);
  });
  app.get('/api/routes', (_req, res) => res.json({ routes: db.prepare('SELECT * FROM routes ORDER BY created_at DESC, id DESC').all().map((row) => routeFromRow(db, row)) }));
  app.post('/api/routes', (req, res) => {
    const route = validateRoute(req.body), id = randomUUID();
    db.prepare('INSERT INTO routes (id, name, description, source_name, transport, is_demo, points, distance_km, elevation_known, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, route.name, route.description, route.sourceName, route.transport, Number(route.isDemo), JSON.stringify(route.points), route.distanceKm, Number(route.elevationKnown), new Date().toISOString());
    res.status(201).json(findRoute(id));
  });
  app.delete('/api/routes/:id', (req, res) => {
    const route = findRoute(req.params.id);
    route.variants.forEach((variant) => forbidActiveVariant(variant.id));
    db.prepare('DELETE FROM routes WHERE id = ?').run(route.id);
    res.sendStatus(204);
  });
  app.post('/api/routes/:id/variants', (req, res) => {
    const route = findRoute(req.params.id), variant = validateVariant(req.body), id = randomUUID();
    db.prepare('INSERT INTO variants (id, route_id, name, season, time_of_day, weather, duration_minutes, temperature_c, show_map, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, route.id, variant.name, variant.season, variant.timeOfDay, variant.weather, variant.durationMinutes, variant.temperatureC, Number(variant.showMap), new Date().toISOString());
    res.status(201).json(findVariant(id));
  });
  app.delete('/api/variants/:id', (req, res) => {
    const variant = findVariant(req.params.id);
    forbidActiveVariant(variant.id);
    db.prepare('DELETE FROM variants WHERE id = ?').run(variant.id);
    res.sendStatus(204);
  });
  app.get('/api/jobs', (_req, res) => res.json({ jobs: db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, id DESC').all().map(jobResponse) }));
  app.post('/api/jobs', (req, res) => {
    const request = validateJob(req.body), variant = findVariant(request.variantId), route = findRoute(variant.routeId), id = randomUUID();
    const preview = request.previewSeconds !== undefined;
    // Repeated clicks should not multiply an expensive running export.
    const duplicate = db.prepare("SELECT * FROM jobs WHERE variant_id = ? AND preview = ? AND output_seconds = ? AND resolution = ? AND status IN ('queued','rendering') LIMIT 1")
      .get(variant.id, Number(preview), request.previewSeconds ?? variant.durationMinutes * 60, request.resolution);
    if (duplicate) return res.status(202).json(jobResponse(duplicate));
    db.prepare('INSERT INTO jobs (id, variant_id, route_name, variant_name, status, progress, error, created_at, output_seconds, preview, resolution, width, height, fps) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, variant.id, route.name, variant.name, 'queued', new Date().toISOString(), request.previewSeconds ?? variant.durationMinutes * 60, Number(preview), request.resolution, request.width, request.height, request.fps);
    res.status(202).json(jobResponse(findJob(id)));
    if (enableWorker) queue.kick();
  });
  app.get('/api/jobs/:id', (req, res) => res.json(jobResponse(findJob(req.params.id))));
  app.get('/api/jobs/:id/scene', (req, res) => {
    const job = findJob(req.params.id);
    if (!job.variant_id) throw new HttpError(410, 'A rota ou variação desta exportação foi excluída.');
    const variant = findVariant(job.variant_id), route = findRoute(variant.routeId);
    const { resolution, width, height, fps } = jobFromRow(job);
    res.json({ route, variant, outputSeconds: job.output_seconds, resolution, width, height, fps });
  });
  app.post('/api/jobs/:id/cancel', (req, res) => {
    const job = findJob(req.params.id);
    if (!activeStatuses.includes(job.status)) throw new HttpError(409, 'Somente exportações na fila ou em andamento podem ser canceladas.');
    queue.cancel(job.id);
    res.json(jobResponse(findJob(job.id)));
  });
  app.get('/api/jobs/:id/video', async (req, res, next) => {
    try {
      const job = findJob(req.params.id);
      if (job.status !== 'completed' || !job.output_file) throw new HttpError(409, 'O vídeo ainda não está disponível para download.');
      const file = join(dataDir, 'videos', job.output_file);
      try { await stat(file); } catch { throw new HttpError(404, 'O arquivo deste vídeo não está mais disponível.'); }
      const callback = (error) => { if (error && !res.headersSent) next(error); };
      if (req.query.inline === '1') {
        res.type('video/mp4');
        res.set('Content-Disposition', `inline; filename="slow-view-tv-${job.id}.mp4"`);
        res.sendFile(file, callback);
      } else res.download(file, `slow-view-tv-${job.id}.mp4`, callback);
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint não encontrado.')));
  if (hasFrontend) {
    app.use(express.static(distDir, { index: false }));
    app.get(/.*/, (_req, res) => res.sendFile(join(distDir, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Os dados excedem o limite de 16 MB. A rota pode conter até 100.000 pontos de GPS.' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'JSON inválido. Verifique o formato dos dados enviados.' });
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('Erro interno do servidor:', error.message);
    res.status(status).json({ error: status === 500 ? 'O servidor não conseguiu concluir a operação.' : error.message });
  });
  const server = createServer(app);
  try {
    await new Promise((resolveListening, reject) => { server.once('error', reject); server.listen(port, host, resolveListening); });
  } catch (error) { db.close(); throw error; }
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  allowedOrigins.add(baseUrl);
  if (!appOriginSetting && hasFrontend) {
    appOrigin = baseUrl;
    allowedOrigins.add(appOrigin);
  }
  queue = createQueue({ db, dataDir, appOrigin, workerToken, render: options.render,
    chromiumExecutable: options.chromiumExecutable,
    noSandbox: options.noSandbox ?? process.env.CHROMIUM_NO_SANDBOX === '1',
    gpuMode: options.gpuMode ?? process.env.CHROMIUM_GPU_MODE ?? 'software',
    gpuBackend: options.gpuBackend ?? process.env.CHROMIUM_GPU_BACKEND ?? 'auto',
  });
  return {
    app, server, db, dataDir, baseUrl, appOrigin,
    async close() {
      if (closed) return;
      closed = true;
      await queue.close();
      await railwayRouter.railwayService.close();
      await new Promise((done) => server.close(done));
      db.close();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = await startServer();
  console.log(`Slow View TV API em ${service.baseUrl}; renderizador usa ${service.appOrigin}`);
  const shutdown = () => service.close().then(() => process.exit(0)).catch(() => process.exit(1));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
