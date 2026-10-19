import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rename, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetch as proxyFetch, ProxyAgent } from 'undici';
import { HttpError } from './validation.mjs';
import { probeMedia } from './footage-media.mjs';

// Only this reviewed, single-file torrent is accepted. No user-supplied torrent,
// URL, path, tracker or command can be passed to the downloader.
export const FLAMSBANEN = Object.freeze({
  id: 'flamsbanen', title: 'Flåmsbanen · Myrdal → Flåm · NRK',
  filename: 'flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4', bytes: 3763728590,
  torrentUrl: 'https://nrkbeta.no/torrent/Flamsbanen.hele.turen.1920x1080.h264.NRK.torrent',
  torrentSha256: '31c95678c89a16bd1d65abfe73a14f93193038aeb2c007a432db00e01b758475',
  infoHash: '218fafb2d888ad44e217f13e96c722bf4fd83920',
  sourceUrl: 'https://nrkbeta.no/2010/09/03/last-ned-flaamsbana-i-2d-og-3d/',
  license: 'cc-by-sa-3.0-no', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/no/',
  attribution: '“Flåmsbanen” – NRK · http://nrkbeta.no/ · http://nrkbeta.no/bergensbanen',
  licenseNotes: 'CC BY-SA 3.0 Noruega. Publicação NRK consultada em 19/10/2026. Creditar NRK, manter links clicáveis na descrição, indicar alterações e compartilhar adaptações sob a mesma licença. A publicação menciona nrkbeta.no e nrkbeta.no/bergensbanen; ambos preservados nos créditos. Modelo do trem, duração e som ainda dependem da conferência do arquivo.',
  rightsConfirmed: true,
});

export function parseAriaProgress(line) {
  const match = line.match(/(\d+)B\/(\d+)B\((\d+)%\)/);
  if (!match) return null;
  return { completed: Number(match[1]), total: Number(match[2]) };
}

export async function downloadNrkTorrent({ directory, signal, onProgress, fetchImpl, binary = 'aria2c' }) {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = !fetchImpl && proxy ? new ProxyAgent(proxy) : null;
  try {
    let response;
    try {
      response = await (fetchImpl || proxyFetch)(FLAMSBANEN.torrentUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), redirect: 'error',
        ...(dispatcher ? { dispatcher } : {}),
      });
    } catch { throw new HttpError(502, 'Não foi possível obter o torrent oficial da NRK. A transferência pode ser tentada novamente.'); }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new HttpError(502, 'A NRK não disponibilizou o torrent oficial neste momento.'); }
    const chunks = []; let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 500000) { await reader.cancel(); throw new HttpError(502, 'O torrent oficial excedeu o tamanho esperado.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (createHash('sha256').update(bytes).digest('hex') !== FLAMSBANEN.torrentSha256) throw new HttpError(502, 'O torrent oficial mudou. A fonte precisa ser conferida antes de baixar.');
    signal.throwIfAborted();
    const torrent = join(directory, 'source.torrent');
    await writeFile(torrent, bytes, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      const child = spawn(binary, [
        '--no-conf=true', '--enable-color=false', '--human-readable=false', '--summary-interval=2',
        '--console-log-level=warn', '--download-result=hide', '--file-allocation=none',
        '--continue=true', '--check-integrity=true', '--auto-file-renaming=false',
        '--seed-time=0', '--bt-stop-timeout=180', '--stop=3600', '--bt-max-peers=30',
        '--max-overall-download-limit=20M', '--max-overall-upload-limit=512K', '--disk-cache=8M',
        `--dir=${directory}`, torrent,
      ], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
      let buffer = '', killTimer, spawnError;
      const abort = () => { child.kill('SIGINT'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split(/[\r\n]/); buffer = lines.pop().slice(-4000);
        for (const line of lines) { const progress = parseAriaProgress(line); if (progress) onProgress(progress); }
      });
      // Never return peer addresses, system paths or arbitrary subprocess logs.
      child.stderr.resume();
      child.once('error', error => { spawnError = error; });
      child.once('close', code => {
        signal.removeEventListener('abort', abort); clearTimeout(killTimer);
        if (signal.aborted) reject(signal.reason);
        else if (spawnError?.code === 'ENOENT') reject(new HttpError(503, 'Instale aria2 no RunPod para baixar a viagem.'));
        else if (code !== 0) reject(new HttpError(502, 'O torrent não concluiu a transferência. Pode não haver fontes ativas; os dados parciais foram preservados para retomar.'));
        else resolve();
      });
    });
    // A stopped torrent can leave a full-sized sparse file. Length alone is not
    // proof of completion: aria2 must also have removed its resume control file.
    const path = join(directory, FLAMSBANEN.filename);
    const pending = await stat(`${path}.aria2`).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (pending || (await stat(path)).size !== FLAMSBANEN.bytes) throw new HttpError(502, 'O download ainda está incompleto. Retome a transferência para conferir todas as partes.');
    return path;
  } finally { await dispatcher?.close(); }
}

export async function createNrkIngest({ db, directory, newAsset, getAsset, publishAsset, options = {} }) {
  const enabled = options.enabled ?? process.env.MEDIA_NRK_DOWNLOADS === '1';
  const available = enabled && (Boolean(options.downloadImpl) || spawnSync('aria2c', ['--version'], { timeout: 5000, stdio: 'ignore' }).status === 0);
  const download = options.downloadImpl || downloadNrkTorrent;
  const freeBytes = options.freeBytes || (async path => { const fs = await statfs(path); return fs.bavail * fs.bsize; });
  const staging = join(directory, 'nrk', FLAMSBANEN.id);
  db.exec(`CREATE TABLE IF NOT EXISTS footage_downloads (
    source_id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, status TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL
  );
  UPDATE footage_downloads SET status='paused',error='O servidor reiniciou. Retome para conferir e continuar o download.' WHERE status IN ('downloading','verifying');`);
  let active = null, closed = false;
  const row = () => db.prepare('SELECT * FROM footage_downloads WHERE source_id=?').get(FLAMSBANEN.id);
  const update = (status, error = null) => db.prepare('UPDATE footage_downloads SET status=?,error=?,updated_at=? WHERE source_id=?').run(status, error, new Date().toISOString(), FLAMSBANEN.id);
  function snapshot() {
    const current = row(), asset = current ? getAsset(current.asset_id) : null;
    return { enabled, available, source: { id: FLAMSBANEN.id, title: FLAMSBANEN.title, bytes: FLAMSBANEN.bytes, licenseUrl: FLAMSBANEN.licenseUrl },
      download: current ? { status: current.status, completed: current.completed, total: FLAMSBANEN.bytes, error: current.error,
        assetId: asset?.id || null, ...(current.status === 'ready' && asset ? { asset } : {}) } : null };
  }
  return {
    snapshot,
    async start(id) {
      if (id !== FLAMSBANEN.id) throw new HttpError(404, 'Viagem não disponível para importação.');
      if (closed || !available) throw new HttpError(503, 'A importação NRK precisa ser ativada no RunPod com aria2 instalado. Consulte o guia de atualização.');
      if (active || row()?.status === 'ready') return snapshot();
      // Claim the slot before any asynchronous work; repeated clicks must not
      // create two jobs, even while checking disk capacity.
      const controller = new AbortController();
      active = { controller, task: null };
      try {
        await mkdir(staging, { recursive: true, mode: 0o700 });
        const registeredPath = row() ? join(directory, `${row().asset_id}.mp4`) : null;
        const recovered = registeredPath ? await stat(registeredPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; }) : null;
        const partial = recovered?.size === FLAMSBANEN.bytes ? recovered : await stat(join(staging, FLAMSBANEN.filename)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        // Sparse partial files are charged by allocated blocks, not file length.
        const allocated = Math.min(FLAMSBANEN.bytes, (partial?.blocks || 0) * 512);
        if (await freeBytes(staging) < FLAMSBANEN.bytes - allocated + 2 * 1024 ** 3) throw new HttpError(507, 'Reserve cerca de 6 GB livres no volume para a viagem e a primeira amostra.');
        controller.signal.throwIfAborted();
        let current = row();
        if (!current || !getAsset(current.asset_id)) {
          const asset = newAsset(FLAMSBANEN, 'importing');
          db.prepare('INSERT OR REPLACE INTO footage_downloads(source_id,asset_id,status,updated_at) VALUES(?,?,?,?)').run(FLAMSBANEN.id, asset.id, 'downloading', new Date().toISOString());
          current = row();
        } else db.prepare("UPDATE footage_assets SET status='importing',error=NULL WHERE id=?").run(current.asset_id);
        update('downloading');
        const assetId = current.asset_id;
        active.task = Promise.resolve().then(async () => {
          const finalPath = join(directory, `${assetId}.mp4`);
          // If a restart happened after rename but before the DB update, finish
          // registration from that verified file without downloading it again.
          const existing = await stat(finalPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
          const sourcePath = existing?.size === FLAMSBANEN.bytes ? finalPath : await download({ directory: staging, signal: controller.signal,
            onProgress: progress => {
              if (Number.isSafeInteger(progress.completed) && progress.completed >= 0 && progress.completed <= FLAMSBANEN.bytes && progress.total === FLAMSBANEN.bytes) db.prepare('UPDATE footage_downloads SET completed=? WHERE source_id=?').run(progress.completed, FLAMSBANEN.id);
            } });
          controller.signal.throwIfAborted(); update('verifying');
          const details = await stat(sourcePath);
          if (details.size !== FLAMSBANEN.bytes) throw new HttpError(502, 'O tamanho do vídeo recebido não corresponde ao arquivo oficial.');
          const probe = await probeMedia(sourcePath, { signal: controller.signal });
          if (probe.kind !== 'video' || probe.width !== 1920 || probe.height !== 1080) throw new HttpError(502, 'A filmagem recebida não corresponde à versão 2D Full HD selecionada.');
          controller.signal.throwIfAborted();
          if (sourcePath !== finalPath) await rename(sourcePath, finalPath);
          publishAsset(assetId, `${assetId}.mp4`, probe, details.size);
          db.prepare('UPDATE footage_downloads SET completed=? WHERE source_id=?').run(details.size, FLAMSBANEN.id); update('ready');
        }).catch(error => {
          const message = controller.signal.aborted ? 'Download pausado. As partes recebidas foram preservadas.' : error instanceof HttpError ? error.message : 'Não foi possível preparar a viagem. Confira o armazenamento e tente retomar.';
          update(controller.signal.aborted ? 'paused' : 'failed', message);
          db.prepare("UPDATE footage_assets SET status='failed',error=? WHERE id=?").run(message, assetId);
        }).finally(() => { active = null; });
        return snapshot();
      } catch (error) { active = null; throw error; }
    },
    async pause(id) {
      if (id !== FLAMSBANEN.id) throw new HttpError(404, 'Viagem não encontrada.');
      if (active) { active.controller.abort(); await active.task; }
      return snapshot();
    },
    forgetAsset(id) { if (row()?.asset_id === id) db.prepare('DELETE FROM footage_downloads WHERE source_id=?').run(FLAMSBANEN.id); },
    async close() { closed = true; if (active) { active.controller.abort(); await active.task; } },
  };
}
