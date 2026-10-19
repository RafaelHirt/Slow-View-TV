import { access, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';
import { buildChromiumArgs } from '../server/chromium-options.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const within = (parent, child) => { const rel = relative(parent, child); return !rel || (!rel.startsWith('..') && !isAbsolute(rel)); };

export function resolveRunpodConfig(env, { nodeVersion = process.versions.node, uid = process.getuid?.(), chromiumPath = chromium.executablePath() } = {}) {
  if (Number(nodeVersion.split('.')[0]) < 24) throw new Error('O piloto requer Node.js 24 ou superior.');
  if (uid === 0) throw new Error('Use npm run start:runpod para executar como o usuário sem privilégios criado pelo instalador.');
  const password = env.DASHBOARD_PASSWORD;
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Configure DASHBOARD_PASSWORD como Secret do Pod, com 12 a 256 caracteres.');
  // The selected RunPod template's Nginx owns public HTTP port 3001 and
  // forwards it to the application on port 3000.
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser uma porta entre 1 e 65535.');
  const dataDir = env.SLOWVISTA_DATA_DIR || '/workspace/slow-view-tv-data';
  if (!isAbsolute(dataDir) || within(root, resolve(dataDir)) || ['/', '/workspace', '/tmp'].includes(resolve(dataDir))) throw new Error('Use um diretório absoluto de dados separado do checkout.');
  const corsOrigins = env.CORS_ORIGINS || 'https://slow-view-tv.netlify.app';
  for (const origin of corsOrigins.split(',')) {
    let url;
    try { url = new URL(origin.trim()); } catch { throw new Error('CORS_ORIGINS deve conter origens HTTPS exatas, separadas por vírgula.'); }
    if (url.protocol !== 'https:' || url.origin !== origin.trim()) throw new Error('CORS_ORIGINS deve conter origens HTTPS exatas, sem caminhos ou barra final.');
  }
  const gpuMode = env.CHROMIUM_GPU_MODE || 'native';
  const gpuBackend = env.CHROMIUM_GPU_BACKEND || 'auto';
  buildChromiumArgs({ gpuMode, gpuBackend });
  if (env.CHROMIUM_NO_SANDBOX && !['0', '1'].includes(env.CHROMIUM_NO_SANDBOX)) throw new Error('CHROMIUM_NO_SANDBOX deve ser 0 ou 1 quando definido explicitamente.');
  return {
    dataDir: resolve(dataDir), port, host: '0.0.0.0', appOrigin: `http://127.0.0.1:${port}`,
    corsOrigins, dashboardPassword: password, adminToken: '',
    chromiumExecutable: env.CHROMIUM_EXECUTABLE || chromiumPath,
    ffmpegExecutable: env.FFMPEG_EXECUTABLE || 'ffmpeg',
    noSandbox: env.CHROMIUM_NO_SANDBOX === '1', gpuMode, gpuBackend,
    // Rollback journal avoids WAL's shared-memory requirement on a network
    // volume. One process holds the database lock. The actual RunPod mount's
    // locking and crash behavior must still be verified before real data use.
    sqliteJournalMode: 'DELETE', sqliteLockingMode: 'EXCLUSIVE',
  };
}

export async function startRunpod(env = process.env, { footageOnly = false } = {}) {
  const config = resolveRunpodConfig(footageOnly ? { ...env, CHROMIUM_GPU_MODE: 'software', CHROMIUM_GPU_BACKEND: 'auto', CHROMIUM_NO_SANDBOX: '0' } : env);
  await access(resolve(root, 'dist/index.html'), constants.R_OK);
  if (!footageOnly) await access(config.chromiumExecutable, constants.X_OK);
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  await access(config.dataDir, constants.R_OK | constants.W_OK);
  const ffmpeg = spawnSync(config.ffmpegExecutable, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] });
  if (ffmpeg.status !== 0 || !/\blibx264\b/.test(ffmpeg.stdout || '')) throw new Error('FFmpeg com encoder libx264 não está disponível. Execute a preparação do Pod.');
  if (footageOnly) {
    const ffprobe = spawnSync(env.FFPROBE_EXECUTABLE || 'ffprobe', ['-version'], { timeout: 15000, stdio: 'ignore' });
    if (ffprobe.status !== 0) throw new Error('FFprobe não está disponível. Instale o pacote FFmpeg no servidor.');
  }
  await checkStorageLocking(config.dataDir);
  // The renderer uses this process variable when spawning the encoder.
  process.env.FFMPEG_EXECUTABLE = config.ffmpegExecutable;
  return startServer({ ...config, ...(footageOnly ? { enableWorker: false } : {}) });
}

export async function checkStorageLocking(dataDir) {
  const file = resolve(dataDir, `.lock-check-${randomUUID()}.sqlite`);
  let probe;
  try {
    probe = new DatabaseSync(file);
    probe.exec('PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; CREATE TABLE probe(value INTEGER); INSERT INTO probe VALUES (1);');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import {DatabaseSync} from 'node:sqlite';
      const db = new DatabaseSync(process.argv[1]);
      try { db.exec('INSERT INTO probe VALUES (2)'); process.exitCode=3; }
      catch(error) { process.exitCode=error.errcode===5 ? 0 : 4; }
      finally { db.close(); }
    `, file], { timeout: 5000, stdio: 'ignore' });
    if (child.status !== 0) throw new Error('O teste de exclusão entre processos falhou neste volume. A API não será iniciada; use armazenamento adequado para o banco.');
  } finally {
    probe?.close();
    await rm(file, { force: true }); await rm(`${file}-journal`, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const service = await startRunpod();
    console.log(`Slow View TV iniciado na porta interna ${service.server.address().port}. Neste piloto, o Nginx encaminha o HTTP Service da porta 3001 para a aplicação na porta 3000. Use o endereço HTTPS do serviço 3001 para configurar a Netlify.`);
    let stopping = false;
    const shutdown = () => { if (stopping) return; stopping = true; service.close().then(() => process.exit(0)).catch(() => process.exit(1)); };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  } catch (error) {
    // Avoid browser/child-process diagnostics that might contain environment values.
    console.error(`Não foi possível iniciar o piloto: ${error.message}`);
    process.exitCode = 1;
  }
}
