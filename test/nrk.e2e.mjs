import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, mkdir, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';
import { FLAMSBANEN } from '../server/nrk-ingest.mjs';

// Isolated technical media and injected transfer: no real NRK download, peer
// connection, user catalogue, GPU, paid service or public deployment is used.
const execute = promisify(execFile), directory = await mkdtemp(join(tmpdir(), 'slowview-nrk-browser-'));
const artifacts = resolve('artifacts'); await mkdir(artifacts, { recursive: true });
const fixture = join(directory, 'technical-fixture-not-real-nrk.mp4');
await execute('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=darkseagreen:s=1920x1080:r=25:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', fixture]);
let attempts = 0, finishVerification;
const service = await startServer({ port: 0, dataDir: join(directory, 'data'), dashboardPassword: 'senha-tecnica-isolada-do-navegador', enableWorker: false,
  nrkIngest: { enabled: true, freeBytes: async () => 12 * 1024 ** 3, downloadImpl: async ({ directory: staging, signal, onProgress, onDiagnostic, onVerification }) => {
    attempts++; const path = join(staging, FLAMSBANEN.filename);
    if (attempts === 1) {
      await writeFile(path, 'isolated technical partial file'); onProgress({ completed: 1000000000, total: FLAMSBANEN.bytes });
      onDiagnostic({ exitCode: null, signal: null, elapsedSeconds: 2, completed: 1000000000, maxConnections: 2, maxSeeders: null, trackerFailures: 0, errorCodes: [], reason: null,
        source: 'nytsoi', contentVerified: false, privateTorrent: false, resumeRechecked: true, verification: 'pending' });
      await new Promise((_, reject) => { const abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
    } else {
      await copyFile(fixture, path); await truncate(path, FLAMSBANEN.bytes);
      onProgress({ completed: FLAMSBANEN.bytes, total: FLAMSBANEN.bytes }); onVerification();
      const diagnostic = { exitCode: 0, signal: null, elapsedSeconds: 4, completed: FLAMSBANEN.bytes, maxConnections: 2, maxSeeders: null, trackerFailures: 0, errorCodes: [], reason: null,
        source: 'nytsoi', contentVerified: false, privateTorrent: false, verification: 'checking', verifiedBytes: FLAMSBANEN.bytes / 2, verificationTotal: FLAMSBANEN.bytes };
      onDiagnostic(diagnostic);
      await new Promise((resolve, reject) => {
        finishVerification = resolve;
        const abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      });
      onDiagnostic({ ...diagnostic, verification: 'passed', verifiedBytes: FLAMSBANEN.bytes, contentVerified: true });
      return path;
    }
  } } });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', chromiumSandbox: process.env.CHROMIUM_NO_SANDBOX !== '1', args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.baseUrl);
  await page.getByLabel('Senha', { exact: true }).fill('senha-tecnica-isolada-do-navegador');
  await page.getByRole('button', { name: 'Entrar no ateliê' }).click();
  await page.getByRole('button', { name: 'Trem', exact: true }).click();
  const card = page.getByRole('article', { name: 'Flåmsbanen', exact: true });
  await card.getByRole('button', { name: 'Baixar viagem no RunPod' }).click();
  await card.getByText(/26% · 1,00 de 3,76 GB/).waitFor();
  await card.getByText('Diagnóstico da tentativa', { exact: true }).click();
  await card.getByText('Maior número de conexões', { exact: true }).locator('..').getByText('2', { exact: true }).waitFor();
  await card.getByText('Espelho Nytsoi · torrent selecionado', { exact: true }).waitFor();
  await card.getByText('Torrent público · permite descoberta DHT', { exact: true }).waitFor();
  assert.equal(attempts, 1);
  await page.screenshot({ path: join(artifacts, 'nrk-download-technical-test.png'), fullPage: true });
  await card.getByRole('button', { name: 'Pausar download' }).click();
  await card.getByText('Pausado', { exact: true }).waitFor();
  await card.getByRole('button', { name: 'Retomar download no RunPod' }).click();
  await card.getByText('Conferindo com a referência NRK · 50%', { exact: true }).waitFor();
  assert.equal(Number(await card.getByRole('progressbar', { name: 'Conferência com a referência NRK' }).getAttribute('value')), FLAMSBANEN.bytes / 2);
  assert.equal(await card.getByRole('button', { name: 'Abrir viagem e preparar amostra' }).count(), 0);
  finishVerification();
  await card.getByRole('button', { name: 'Abrir viagem e preparar amostra' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await card.getByRole('button', { name: 'Abrir viagem e preparar amostra' }).click();
  await page.getByRole('heading', { name: 'Escolha o que fica.' }).waitFor();
  await page.getByText('CC BY-SA 3.0 Noruega · Licença conferida', { exact: true }).waitFor();
  assert.equal(Number(await page.getByLabel('Fim (segundos)').inputValue()), 6);
  await page.getByLabel('Fim (segundos)').fill('4');
  await page.getByRole('button', { name: 'Exportar trecho em MP4' }).click();
  await page.getByText('Pronto para assistir', { exact: true }).waitFor({ timeout: 60000 });
  const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar créditos' }).click();
  const credits = await readFile(await (await waiting).path(), 'utf8');
  assert.ok(credits.includes(FLAMSBANEN.licenseUrl)); assert.ok(credits.includes(FLAMSBANEN.attribution)); assert.match(credits, /Alterações por Slow View TV/);
  assert.deepEqual(errors, []);
  console.log('✓ NRK UI: login, transferência simulada, pausa/retomada, progresso de conferência oficial antes da biblioteca, editor, exportação e créditos CC BY-SA; mobile sem overflow. Não comprova peers ou download NRK real.');
} finally { await browser?.close(); await service.close(); await rm(directory, { recursive: true, force: true }); }
