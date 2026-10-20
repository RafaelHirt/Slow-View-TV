import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetch as proxyFetch, ProxyAgent } from 'undici';
import { HttpError } from './validation.mjs';
import { probeMedia } from './footage-media.mjs';
import { inspectTorrent, sameTorrentContent } from './torrent-metadata.mjs';

// Only this reviewed, single-file content is accepted. No user-supplied torrent,
// URL, path, tracker or command can be passed to the downloader.
export const FLAMSBANEN = Object.freeze({
  id: 'flamsbanen', title: 'Flåmsbanen · Myrdal → Flåm · NRK',
  filename: 'flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4', bytes: 3763728590,
  torrentUrl: 'https://nrkbeta.no/torrent/Flamsbanen.hele.turen.1920x1080.h264.NRK.torrent',
  torrentSha256: '31c95678c89a16bd1d65abfe73a14f93193038aeb2c007a432db00e01b758475',
  infoHash: '218fafb2d888ad44e217f13e96c722bf4fd83920',
  pieceLength: 262144, piecesSha256: 'd2ef10b5c5c66468c716b00e0c9c056be3971f517b789626de2e33caa8f67326',
  mirrorUrl: 'https://trainfulness.nytsoi.net/torrents/flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4.torrent',
  sourceUrl: 'https://nrkbeta.no/2010/09/03/last-ned-flaamsbana-i-2d-og-3d/',
  license: 'cc-by-sa-3.0-no', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/no/',
  attribution: '“Flåmsbanen” – NRK · http://nrkbeta.no/ · http://nrkbeta.no/bergensbanen',
  licenseNotes: 'CC BY-SA 3.0 Noruega. Publicação NRK consultada em 19/10/2026. Creditar NRK, manter links clicáveis na descrição, indicar alterações e compartilhar adaptações sob a mesma licença. A publicação menciona nrkbeta.no e nrkbeta.no/bergensbanen; ambos preservados nos créditos. Modelo do trem, duração e som ainda dependem da conferência do arquivo.',
  rightsConfirmed: true,
});

export function parseAriaProgress(line) {
  const match = line.match(/(\d+)B\/(\d+)B\s*\((\d+)%\)/);
  if (!match) return null;
  return { completed: Number(match[1]), total: Number(match[2]) };
}

export const ariaDownloadArgs = (directory, torrent) => [
  '--no-conf=true', '--enable-color=false', '--human-readable=false', '--summary-interval=2',
  '--console-log-level=warn', '--download-result=hide', '--file-allocation=none',
  '--continue=true', '--check-integrity=true', '--allow-overwrite=true', '--auto-file-renaming=false',
  '--seed-time=0', '--bt-stop-timeout=180', '--stop=3600', '--bt-max-peers=30',
  '--max-overall-download-limit=20M', '--max-overall-upload-limit=512K', '--disk-cache=8M',
  `--dir=${directory}`, torrent,
];

function ariaFailure(diagnostic) {
  const code = diagnostic.exitCode;
  if (code === 9) return ['storage', 'O aria2 informou falta de espaço no volume. Libere espaço antes de retomar; as partes recebidas foram preservadas.'];
  if ([13, 14, 15, 16, 17, 18].includes(code)) return ['storage', 'O aria2 não conseguiu abrir, criar ou gravar o arquivo no volume. Confira o acesso ao armazenamento; nenhum arquivo foi apagado.'];
  if (code === 28) return ['invalid_options', 'O aria2 rejeitou as opções de execução. Confira a versão e a instalação do programa no servidor.'];
  if ([25, 26].includes(code)) return ['metadata', 'O aria2 não conseguiu interpretar os metadados do torrent. A fonte e o programa precisam ser conferidos.'];
  if (code === 19) return ['network', 'O aria2 informou uma falha de resolução de endereço (DNS). Confira a conexão do servidor.'];
  if (diagnostic.signal) return ['interrupted', `O processo de download foi encerrado (${diagnostic.signal}). As partes recebidas foram preservadas.`];
  if (diagnostic.elapsedSeconds >= 170 && diagnostic.completed === 0) return ['no_transfer', `A tentativa terminou após ${diagnostic.elapsedSeconds}s sem registrar dados recebidos. Não foi possível confirmar se a fonte está indisponível ou se a conexão falhou. Confira a fonte utilizada e as conexões no diagnóstico.`];
  if ([2, 5, 6].includes(code)) return ['network', 'O aria2 encerrou a tentativa por tempo de espera, conexão ou velocidade insuficiente. A causa exata precisa ser conferida no diagnóstico.'];
  if (code === 7) return ['incomplete', 'A transferência ficou incompleta. Confira as conexões e as falhas registradas no diagnóstico antes de retomar.'];
  return ['unknown', 'O aria2 encerrou a transferência sem concluir o arquivo. O diagnóstico registra o código de saída; isso não confirma ausência de fontes.'];
}

export async function runAriaDownload({ directory, torrent, signal, onProgress = () => {}, onDiagnostic = () => {}, binary = 'aria2c', now = Date.now }) {
  signal.throwIfAborted();
  const started = now();
  const diagnostic = { exitCode: null, signal: null, elapsedSeconds: 0, completed: 0, maxConnections: null, maxSeeders: null, trackerFailures: 0, errorCodes: [], reason: null };
  const publish = () => { diagnostic.elapsedSeconds = Math.floor((now() - started) / 1000); onDiagnostic({ ...diagnostic, errorCodes: [...diagnostic.errorCodes] }); };
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ariaDownloadArgs(directory, torrent), { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let killTimer, spawnError;
    const abort = () => { child.kill('SIGINT'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    function inspect(line) {
      const progress = parseAriaProgress(line);
      if (progress) { diagnostic.completed = progress.completed; onProgress(progress); }
      const connections = line.match(/\bCN:(\d+)/), seeders = line.match(/\bSD:(\d+)/);
      if (connections) diagnostic.maxConnections = Math.max(diagnostic.maxConnections || 0, Number(connections[1]));
      if (seeders) diagnostic.maxSeeders = Math.max(diagnostic.maxSeeders || 0, Number(seeders[1]));
      if (/tracker.*(?:fail|error|exception)|(?:fail|error|exception).*tracker/i.test(line)) diagnostic.trackerFailures = Math.min(1000000, diagnostic.trackerFailures + 1);
      for (const match of line.matchAll(/\berrorCode=(\d{1,3})\b/g)) if (!diagnostic.errorCodes.includes(Number(match[1]))) diagnostic.errorCodes.push(Number(match[1]));
      if (progress || connections || seeders || /errorCode=|tracker/i.test(line)) publish();
    }
    // Inspect both streams, but retain only numeric counters/codes. Raw process
    // output can contain peer IPs, paths or proxy credentials and is discarded.
    const buffers = ['', ''];
    [child.stdout, child.stderr].forEach((stream, index) => stream.on('data', chunk => {
      const lines = (buffers[index] + chunk).split(/[\r\n]/); buffers[index] = lines.pop().slice(-4000);
      for (const line of lines) inspect(line);
    }));
    child.once('error', error => { spawnError = error; });
    child.once('close', (code, terminationSignal) => {
      signal.removeEventListener('abort', abort); clearTimeout(killTimer);
      diagnostic.elapsedSeconds = Math.floor((now() - started) / 1000);
      for (const tail of buffers) if (tail) inspect(tail);
      diagnostic.exitCode = Number.isInteger(code) ? code : null;
      diagnostic.signal = typeof terminationSignal === 'string' && /^SIG[A-Z0-9]+$/.test(terminationSignal) ? terminationSignal : null;
      if (signal.aborted) { diagnostic.reason = 'paused'; publish(); reject(signal.reason); return; }
      if (spawnError?.code === 'ENOENT') {
        diagnostic.reason = 'missing_program'; publish();
        const error = new HttpError(503, 'Instale aria2 no RunPod para baixar a viagem.'); error.downloadDiagnostic = { ...diagnostic }; reject(error); return;
      }
      if (code !== 0 || spawnError) {
        const [reason, message] = ariaFailure(diagnostic); diagnostic.reason = reason; publish();
        const error = new HttpError(502, `${message}${diagnostic.exitCode === null ? '' : ` Código de saída: ${diagnostic.exitCode}.`}`);
        error.downloadDiagnostic = { ...diagnostic, errorCodes: [...diagnostic.errorCodes] }; reject(error);
      } else { publish(); resolve({ ...diagnostic }); }
    });
  });
}

export function validateFlamsbanenMirror(bytes, reference = FLAMSBANEN) {
  let info;
  try { info = inspectTorrent(bytes); }
  catch { throw new HttpError(502, 'O espelho não retornou metadados válidos de arquivo único. Nenhuma transferência foi iniciada.'); }
  if (!sameTorrentContent(info, reference) || info.filename !== reference.filename) throw new HttpError(502, 'O espelho não descreve o mesmo vídeo oficial da Flåmsbanen. A transferência foi bloqueada; as partes existentes foram preservadas.');
  if (info.privateTorrent) throw new HttpError(502, 'O torrent do espelho também é privado. Ele precisa ser conferido antes de substituir a fonte anterior.');
  if (info.hasWebSeeds) throw new HttpError(502, 'O espelho contém fontes HTTP adicionais ainda não conferidas. Nenhuma transferência foi iniciada.');
  return info;
}

// A different info hash can describe the same video parts. Preserve the old
// resume control file, then let aria2 recheck the existing media against the
// verified public torrent. Never delete or duplicate the media to change swarm.
export async function stageNrkTorrent({ directory, bytes, info, signal }) {
  signal.throwIfAborted();
  const torrent = join(directory, 'active-source.torrent');
  let previous;
  for (const candidate of [torrent, join(directory, 'source.torrent')]) {
    try { if ((await stat(candidate)).size <= 500000) { previous = inspectTorrent(await readFile(candidate)); break; } }
    catch (error) { if (error.code && error.code !== 'ENOENT') throw error; }
  }
  let resumeRechecked = false;
  if (previous?.infoHash !== info.infoHash) {
    const control = join(directory, `${FLAMSBANEN.filename}.aria2`);
    try { await rename(control, `${control}.preserved-${randomUUID()}`); resumeRechecked = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  signal.throwIfAborted();
  const pending = `${torrent}.next`;
  await writeFile(pending, bytes, { mode: 0o600 }); await rename(pending, torrent);
  return { torrent, resumeRechecked };
}

export async function downloadNrkTorrent({ directory, signal, onProgress, onDiagnostic = () => {}, fetchImpl, binary = 'aria2c', source = 'mirror' }) {
  if (!['mirror', 'official'].includes(source)) throw new HttpError(400, 'Fonte NRK não reconhecida.');
  const mirror = source === 'mirror';
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = !fetchImpl && proxy ? new ProxyAgent(proxy) : null;
  try {
    let response;
    try {
      const original = new URL(mirror ? FLAMSBANEN.mirrorUrl : FLAMSBANEN.torrentUrl);
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
      let current = original;
      for (let redirects = 0; ; redirects++) {
        response = await (fetchImpl || proxyFetch)(current.href, {
          signal: requestSignal, redirect: mirror ? 'manual' : 'error', ...(dispatcher ? { dispatcher } : {}),
        });
        if (!mirror || ![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location || redirects >= 3) throw new Error('Redirecionamento fora do limite.');
        const next = new URL(location, current);
        if (next.protocol !== 'https:' || next.hostname !== original.hostname || next.username || next.password || next.port) throw new Error('Redirecionamento não conferido.');
        current = next;
      }
    } catch { signal.throwIfAborted(); throw new HttpError(502, mirror ? 'Não foi possível consultar o torrent do espelho Nytsoi. Nenhuma transferência foi iniciada; as partes anteriores foram preservadas.' : 'Não foi possível obter o torrent oficial da NRK. A transferência pode ser tentada novamente.'); }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new HttpError(502, mirror ? 'O espelho Nytsoi não disponibilizou os metadados neste momento. Tente retomar mais tarde.' : 'A NRK não disponibilizou o torrent oficial neste momento.'); }
    const chunks = []; let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 500000) { await reader.cancel(); throw new HttpError(502, 'O torrent excedeu o tamanho esperado.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (!mirror && createHash('sha256').update(bytes).digest('hex') !== FLAMSBANEN.torrentSha256) throw new HttpError(502, 'O torrent oficial mudou. A fonte precisa ser conferida antes de baixar.');
    const info = mirror ? validateFlamsbanenMirror(bytes) : inspectTorrent(bytes);
    const { torrent, resumeRechecked } = await stageNrkTorrent({ directory, bytes, info, signal });
    const sourceInfo = { source: mirror ? 'nytsoi' : 'nrk', contentVerified: true, privateTorrent: info.privateTorrent, resumeRechecked };
    await runAriaDownload({ directory, torrent, signal, onProgress,
      onDiagnostic: value => onDiagnostic({ ...value, ...sourceInfo }), binary });
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
  if (!db.prepare('PRAGMA table_info(footage_downloads)').all().some(column => column.name === 'diagnostics')) db.exec('ALTER TABLE footage_downloads ADD COLUMN diagnostics TEXT');
  let active = null, closed = false;
  const row = () => db.prepare('SELECT * FROM footage_downloads WHERE source_id=?').get(FLAMSBANEN.id);
  const update = (status, error = null) => db.prepare('UPDATE footage_downloads SET status=?,error=?,updated_at=? WHERE source_id=?').run(status, error, new Date().toISOString(), FLAMSBANEN.id);
  function snapshot() {
    const current = row(), asset = current ? getAsset(current.asset_id) : null;
    return { enabled, available, source: { id: FLAMSBANEN.id, title: FLAMSBANEN.title, bytes: FLAMSBANEN.bytes, licenseUrl: FLAMSBANEN.licenseUrl },
      download: current ? { status: current.status, completed: current.completed, total: FLAMSBANEN.bytes, error: current.error,
        diagnostics: current.diagnostics ? JSON.parse(current.diagnostics) : null,
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
        db.prepare('UPDATE footage_downloads SET diagnostics=NULL WHERE source_id=?').run(FLAMSBANEN.id);
        const assetId = current.asset_id;
        active.task = Promise.resolve().then(async () => {
          const finalPath = join(directory, `${assetId}.mp4`);
          // If a restart happened after rename but before the DB update, finish
          // registration from that verified file without downloading it again.
          const existing = await stat(finalPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
          const sourcePath = existing?.size === FLAMSBANEN.bytes ? finalPath : await download({ directory: staging, signal: controller.signal,
            onDiagnostic: value => db.prepare('UPDATE footage_downloads SET diagnostics=? WHERE source_id=?').run(JSON.stringify(value), FLAMSBANEN.id),
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
