import { Router } from 'express';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from './validation.mjs';
import { validateMediaMetadata, validateFootageEdit, looksLikeMedia, probeMedia, editFootage } from './footage-media.mjs';
import { createFootageSources, trustedMediaUrl } from './footage-sources.mjs';

export async function createFootageService({ db, dataDir, maxUploadBytes = Number(process.env.MEDIA_MAX_UPLOAD_MB || 512) * 1024 * 1024, sources: sourceOptions, enableWorker = true } = {}) {
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1024 || maxUploadBytes > 10 * 1024 ** 3) throw new Error('MEDIA_MAX_UPLOAD_MB deve estar entre 1 e 10240.');
  const directory = join(dataDir, 'footage');
  await mkdir(directory, { recursive: true });
  db.exec(`CREATE TABLE IF NOT EXISTS footage_assets (
    id TEXT PRIMARY KEY, metadata TEXT NOT NULL, status TEXT NOT NULL, file_name TEXT, probe TEXT,
    bytes INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS footage_exports (
    id TEXT PRIMARY KEY, settings TEXT NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
    file_name TEXT, error TEXT, created_at TEXT NOT NULL
  );
  UPDATE footage_assets SET status='failed', error='O envio foi interrompido. Importe o arquivo novamente.' WHERE status IN ('uploading','importing');
  UPDATE footage_exports SET status='failed', error='A edição foi interrompida. Inicie uma nova exportação.' WHERE status IN ('queued','editing');`);
  const signingKey = randomBytes(32), sources = createFootageSources(sourceOptions);
  const transfers = new Map();
  let closed = false, running = null;
  const router = Router();
  const assetRow = id => typeof id === 'string' ? db.prepare('SELECT * FROM footage_assets WHERE id=?').get(id) : undefined;
  const exportRow = id => db.prepare('SELECT * FROM footage_exports WHERE id=?').get(id);
  const required = (row, message) => { if (!row) throw new HttpError(404, message); return row; };
  const sign = (path, duration = 0) => {
    const expires = Math.floor(Date.now() / 1000) + Math.min(46800, Math.max(3600, Math.ceil(duration) + 3600));
    return `${path}?expires=${expires}&signature=${createHmac('sha256', signingKey).update(`${path}:${expires}`).digest('hex')}`;
  };
  function assetResponse(row) {
    if (!row) return null;
    const probe = row.probe ? JSON.parse(row.probe) : {};
    return { id: row.id, ...JSON.parse(row.metadata), ...probe, status: row.status, bytes: row.bytes, error: row.error, createdAt: row.created_at,
      ...(row.status === 'ready' ? { fileUrl: sign(`/api/footage/assets/${row.id}/file`, probe.duration) } : {}) };
  }
  function exportResponse(row) {
    const edit = JSON.parse(row.settings);
    return { id: row.id, ...edit, status: row.status, progress: row.progress, error: row.error, createdAt: row.created_at,
      ...(row.status === 'completed' ? { fileUrl: sign(`/api/footage/exports/${row.id}/file`, edit.duration) } : {}) };
  }
  function newAsset(body, status) {
    const metadata = validateMediaMetadata(body), id = randomUUID();
    db.prepare('INSERT INTO footage_assets(id,metadata,status,created_at) VALUES(?,?,?,?)').run(id, JSON.stringify(metadata), status, new Date().toISOString());
    return assetRow(id);
  }
  async function receive(row, input, signal, length) {
    const partial = join(directory, `${row.id}.upload`);
    if (Number(length) > maxUploadBytes) throw new HttpError(413, `O arquivo excede o limite de ${Math.floor(maxUploadBytes / 1024 ** 2)} MB.`);
    let size = 0, header = Buffer.alloc(0);
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > maxUploadBytes) return callback(new HttpError(413, 'O arquivo excede o limite de envio do servidor.'));
      if (header.length < 32) header = Buffer.concat([header, chunk.subarray(0, 32 - header.length)]);
      callback(null, chunk);
    } });
    try {
      await pipeline(input, limit, createWriteStream(partial, { flags: 'wx', mode: 0o600 }), { signal });
      if (!looksLikeMedia(header)) throw new HttpError(400, 'O arquivo não é uma mídia suportada. Use MP4, WebM, MP3 ou WAV.');
      const probe = await probeMedia(partial, { signal });
      signal.throwIfAborted();
      const extension = header.toString('ascii', 4, 8) === 'ftyp' ? 'mp4' : header[0] === 0x1a ? 'webm' : header.toString('ascii', 0, 4) === 'RIFF' ? 'wav' : 'mp3';
      const filename = `${row.id}.${extension}`;
      await rename(partial, join(directory, filename));
      db.prepare("UPDATE footage_assets SET status='ready',file_name=?,probe=?,bytes=?,error=NULL WHERE id=?").run(filename, JSON.stringify(probe), size, row.id);
    } finally { await rm(partial, { force: true }); }
  }
  const errorText = error => error instanceof HttpError ? error.message : 'A importação foi interrompida. Confira a conexão e envie o arquivo novamente.';
  function failAsset(id, error) { db.prepare("UPDATE footage_assets SET status='failed',error=? WHERE id=?").run(errorText(error), id); }
  function transfer(id, operation) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    const task = Promise.resolve().then(() => operation(controller.signal)).catch(error => failAsset(id, error)).finally(() => { clearTimeout(timeout); transfers.delete(id); });
    transfers.set(id, { controller, task });
    return task;
  }
  async function work() {
    while (!closed) {
      const row = db.prepare("SELECT * FROM footage_exports WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").get();
      if (!row) break;
      const controller = new AbortController(); running.controller = controller; running.id = row.id;
      const edit = JSON.parse(row.settings), video = assetRow(edit.assetId), ambient = edit.ambientId ? assetRow(edit.ambientId) : null;
      const partial = join(directory, `${row.id}.part.mp4`);
      const filename = `${row.id}.mp4`, finalPath = join(directory, filename);
      db.prepare("UPDATE footage_exports SET status='editing' WHERE id=?").run(row.id);
      try {
        await editFootage({ edit, videoPath: join(directory, video.file_name), ambientPath: ambient ? join(directory, ambient.file_name) : undefined,
          outputPath: partial, signal: controller.signal, onProgress: progress => db.prepare("UPDATE footage_exports SET progress=? WHERE id=? AND status='editing'").run(progress, row.id) });
        controller.signal.throwIfAborted();
        await rename(partial, finalPath);
        controller.signal.throwIfAborted();
        db.prepare("UPDATE footage_exports SET status='completed',progress=1,file_name=? WHERE id=? AND status='editing'").run(filename, row.id);
      } catch (error) {
        if (exportRow(row.id).status !== 'cancelled') db.prepare("UPDATE footage_exports SET status='failed',error=? WHERE id=?").run(controller.signal.aborted ? 'A edição foi interrompida.' : 'Não foi possível editar este material. Confira o arquivo e o FFmpeg no servidor.', row.id);
        await rm(finalPath, { force: true });
      } finally { await rm(partial, { force: true }); }
    }
  }
  function kick() {
    if (running || closed || !enableWorker) return;
    running = { task: null, controller: null, id: null };
    running.task = Promise.resolve().then(work).catch(() => {
      db.prepare("UPDATE footage_exports SET status='failed',error='O processamento foi interrompido. Verifique o armazenamento do servidor.' WHERE status IN ('queued','editing')").run();
    }).finally(() => { running = null; });
  }
  function noTransferCapacity() { if (closed || transfers.size >= 2) throw new HttpError(429, 'Aguarde o envio atual terminar antes de importar outro arquivo.'); }
  router.get('/config', (_req, res) => res.json({ pexelsSearch: sources.configured, maxUploadBytes }));
  router.get('/search', async (req, res) => res.json({ videos: await sources.search(req.query.q) }));
  router.get('/assets', (_req, res) => res.json({ assets: db.prepare('SELECT * FROM footage_assets ORDER BY created_at DESC,rowid DESC').all().map(assetResponse) }));
  router.post('/assets', (req, res) => res.status(201).json(assetResponse(newAsset(req.body, 'uploading'))));
  router.put('/assets/:id', (req, res) => {
    required(assetRow(req.params.id), 'Material não encontrado.');
    const metadata = validateMediaMetadata(req.body);
    db.prepare('UPDATE footage_assets SET metadata=? WHERE id=?').run(JSON.stringify(metadata), req.params.id);
    res.json(assetResponse(assetRow(req.params.id)));
  });
  router.put('/assets/:id/content', async (req, res) => {
    const row = required(assetRow(req.params.id), 'Material não encontrado.');
    if (row.status !== 'uploading' || transfers.has(row.id)) throw new HttpError(409, 'Este envio já foi iniciado. Importe como um novo material.');
    noTransferCapacity();
    if (!req.is('application/octet-stream')) throw new HttpError(415, 'Envie o arquivo como application/octet-stream.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    const onAborted = () => controller.abort(); req.once('aborted', onAborted);
    const task = receive(row, req, controller.signal, req.get('content-length'));
    transfers.set(row.id, { controller, task: task.catch(() => {}) });
    try { await task; res.json(assetResponse(assetRow(row.id))); }
    catch (error) { failAsset(row.id, error); throw error instanceof HttpError ? error : new HttpError(400, errorText(error)); }
    finally { transfers.delete(row.id); clearTimeout(timeout); req.off('aborted', onAborted); }
  });
  router.post('/import', (req, res) => {
    noTransferCapacity(); const url = trustedMediaUrl(req.body?.fileUrl);
    const row = newAsset(req.body, 'importing');
    transfer(row.id, async signal => {
      const response = await sources.download(url, signal);
      if (Number(response.headers.get('content-length')) > maxUploadBytes) {
        await response.body.cancel();
        throw new HttpError(413, 'O arquivo da fonte excede o limite de importação do servidor.');
      }
      try { await receive(row, Readable.fromWeb(response.body), signal, response.headers.get('content-length')); }
      finally { if (!response.body.locked) await response.body.cancel().catch(() => {}); }
    });
    res.status(202).json(assetResponse(row));
  });
  router.delete('/assets/:id', async (req, res) => {
    const row = required(assetRow(req.params.id), 'Material não encontrado.');
    if (transfers.has(row.id)) throw new HttpError(409, 'Aguarde a importação terminar.');
    const used = db.prepare('SELECT settings FROM footage_exports').all().some(item => { const edit = JSON.parse(item.settings); return edit.assetId === row.id || edit.ambientId === row.id; });
    if (used) throw new HttpError(409, 'Este material faz parte de uma edição e deve ser preservado.');
    if (row.file_name) await rm(join(directory, row.file_name), { force: true });
    db.prepare('DELETE FROM footage_assets WHERE id=?').run(row.id); res.sendStatus(204);
  });
  router.get('/exports', (_req, res) => res.json({ exports: db.prepare('SELECT * FROM footage_exports ORDER BY created_at DESC,rowid DESC').all().map(exportResponse) }));
  router.post('/exports', (req, res) => {
    const video = assetResponse(assetRow(req.body?.assetId)), ambient = assetResponse(assetRow(req.body?.ambientId));
    const edit = validateFootageEdit(req.body, video, ambient);
    const credits = item => ({ title: item.title, sourceUrl: item.sourceUrl, license: item.license, attribution: item.attribution, licenseNotes: item.licenseNotes });
    edit.sources = [credits(video), ...(ambient && edit.audioMode === 'ambient' ? [credits(ambient)] : [])];
    const settings = JSON.stringify(edit);
    const duplicate = db.prepare("SELECT * FROM footage_exports WHERE settings=? AND status IN ('queued','editing') LIMIT 1").get(settings);
    if (duplicate) return res.status(202).json(exportResponse(duplicate));
    if (db.prepare("SELECT count(*) AS count FROM footage_exports WHERE status IN ('queued','editing')").get().count >= 10) throw new HttpError(429, 'A fila tem 10 edições. Aguarde uma delas terminar.');
    const id = randomUUID();
    db.prepare("INSERT INTO footage_exports(id,settings,status,created_at) VALUES(?,?,'queued',?)").run(id, settings, new Date().toISOString());
    res.status(202).json(exportResponse(exportRow(id))); kick();
  });
  router.post('/exports/:id/cancel', (req, res) => {
    const row = required(exportRow(req.params.id), 'Edição não encontrada.');
    if (!['queued', 'editing'].includes(row.status)) throw new HttpError(409, 'Esta edição já terminou.');
    db.prepare("UPDATE footage_exports SET status='cancelled',error=NULL WHERE id=?").run(row.id);
    if (running?.id === row.id) running.controller.abort();
    res.json(exportResponse(exportRow(row.id)));
  });
  async function sendMedia(req, res, next, type) {
    try {
      const row = required(type === 'assets' ? assetRow(req.params.id) : exportRow(req.params.id), 'Material não encontrado.');
      if (row.status !== (type === 'assets' ? 'ready' : 'completed') || !row.file_name) throw new HttpError(409, 'O arquivo ainda não está pronto.');
      const file = join(directory, row.file_name);
      try { await stat(file); } catch { throw new HttpError(404, 'O arquivo não está mais disponível no armazenamento.'); }
      const callback = error => { if (error && !res.headersSent) next(error); };
      if (req.query.download === '1') res.download(file, `slow-view-tv-${row.file_name}`, callback);
      else { res.type(row.file_name.split('.').pop()); res.set('Content-Disposition', `inline; filename="${row.file_name}"`); res.sendFile(file, callback); }
    } catch (error) { next(error); }
  }
  router.get('/assets/:id/file', (req, res, next) => sendMedia(req, res, next, 'assets'));
  router.get('/exports/:id/file', (req, res, next) => sendMedia(req, res, next, 'exports'));
  return {
    router,
    validDownload(req) {
      if (!['GET', 'HEAD'].includes(req.method) || !/^\/api\/footage\/(assets|exports)\/[0-9a-f-]+\/file$/.test(req.path)) return false;
      const expires = Number(req.query.expires), signature = req.query.signature;
      if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 46800 || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
      const expected = createHmac('sha256', signingKey).update(`${req.path}:${expires}`).digest();
      return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
    },
    async close() {
      closed = true; for (const item of transfers.values()) item.controller.abort(); running?.controller?.abort();
      await Promise.allSettled([...transfers.values()].map(item => item.task).concat(running?.task || []));
      await sources.close();
    },
  };
}
