import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';

const output = resolve('test-results');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-browser-'));
const token = 'local-e2e-only';
const service = await startServer({ port: 0, dataDir, adminToken: token, noSandbox: process.env.CHROMIUM_NO_SANDBOX === '1' });
let browser;
const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, chromiumSandbox: process.env.CHROMIUM_NO_SANDBOX !== '1', args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(service.baseUrl);
  await page.getByLabel('Chave de acesso').fill(token);
  await page.getByRole('button', { name: 'Entrar no ateliê', exact: true }).click();
  await page.getByRole('button', { name: /Minhas rotas/ }).click();
  await page.getByRole('button', { name: 'Importar minha primeira rota' }).waitFor();
  await page.screenshot({ path: join(output, '01-atelie.png'), fullPage: true });
  console.log('✓ Login e tela inicial');

  // Exercise GPX validation in the actual browser's XML parser before importing a valid track.
  await page.getByRole('button', { name: 'Nova rota', exact: true }).click();
  const file = page.locator('input[type=file]');
  await file.setInputFiles({ name: 'invalido.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<gpx><trk><trkseg><trkpt lat="91" lon="0"/><trkpt lat="0" lon="1"/></trkseg></trk></gpx>') });
  await page.getByRole('alert').filter({ hasText: 'coordenadas ou elevações inválidas' }).waitFor();
  const gpx = await readFile('examples/demonstracao.gpx');
  await file.setInputFiles({ name: 'demonstracao.gpx', mimeType: 'application/gpx+xml', buffer: gpx });
  await page.getByLabel('Nome da rota').fill('Percurso de ensaio');
  await page.getByRole('button', { name: 'Salvar minha rota' }).click();
  await page.getByRole('heading', { name: 'Percurso de ensaio', exact: true }).waitFor();
  await page.locator('.scene-viewport canvas').waitFor();
  await page.getByRole('button', { name: 'Reproduzir prévia' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.scene-loading'));
  console.log('✓ GPX inválido rejeitado e percurso importado');

  await page.getByLabel('Nome da versão').fill('Inverno de manhã');
  await page.getByRole('button', { name: 'Inverno', exact: true }).click();
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByLabel('Duração (min)', { exact: true }).fill('120');
  await page.getByLabel('Temperatura (°C)', { exact: true }).fill('-2');
  await page.getByRole('button', { name: 'Salvar atmosfera', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar como nova versão' }).waitFor();
  await page.getByLabel('Nome da versão').fill('Inverno à noite');
  await page.getByRole('button', { name: 'Noite', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar como nova versão' }).click();
  await page.getByText('Inverno à noite', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Minhas rotas/ }).click();
  await page.getByRole('heading', { name: 'Um caminho. Muitas atmosferas.' }).waitFor();
  await page.getByRole('heading', { name: 'Percurso de ensaio', exact: true }).click();
  await page.getByText('Inverno de manhã', { exact: true }).waitFor();
  await page.getByText('Inverno à noite', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Inverno de manhã/ }).first().click();
  await page.waitForFunction(() => !document.querySelector('.scene-loading'));
  await page.screenshot({ path: join(output, '02-editor.png'), fullPage: true });
  console.log('✓ Duas atmosferas de duas horas salvas e recuperadas após recarga');

  // Seek must visibly update the camera and geographic marker, not just a playhead.
  const before = await page.locator('.scene-viewport canvas').screenshot();
  await page.getByLabel('Posição no percurso').fill('0.6');
  await page.waitForTimeout(200);
  const after = await page.locator('.scene-viewport canvas').screenshot();
  assert.notDeepEqual(before, after, 'A prévia precisa mudar ao percorrer a rota.');
  await page.getByRole('button', { name: 'Gerar teste de 8 segundos' }).click();
  await page.getByRole('heading', { name: 'Suas produções' }).waitFor();
  console.log('• Renderizando MP4 de 8 segundos na cena real…');
  await page.getByRole('button', { name: 'Baixar MP4' }).first().waitFor({ timeout: 360000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar MP4' }).first().click();
  const download = await downloadPromise;
  const video = join(output, 'preview.mp4');
  await download.saveAs(video);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,nb_frames,avg_frame_rate', '-of', 'json', video], { encoding: 'utf8' }));
  assert.equal(Number(probe.format.duration), 8);
  assert.equal(probe.streams[0].codec_name, 'h264');
  assert.equal(probe.streams[0].width, 1280);
  assert.equal(probe.streams[0].height, 720);
  assert.equal(probe.streams[0].nb_frames, '192');
  await writeFile(join(output, 'video-probe.json'), JSON.stringify(probe, null, 2));
  await page.screenshot({ path: join(output, '03-producao.png'), fullPage: true });
  console.log('✓ MP4 baixado e verificado: H.264, 1280×720, 24 fps, 192 quadros, 8 segundos');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(service.baseUrl);
  await phone.getByRole('button', { name: 'Conexão com o ateliê', exact: true }).click();
  await phone.getByLabel('Chave de acesso').fill(token);
  await phone.getByRole('button', { name: 'Entrar no ateliê', exact: true }).click();
  await phone.getByRole('button', { name: /Minhas rotas/ }).click();
  await phone.getByRole('heading', { name: 'Percurso de ensaio', exact: true }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Tela mobile não pode ter rolagem horizontal.');
  await phone.screenshot({ path: join(output, '04-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('✓ Autenticação mobile, layout responsivo e nenhuma exceção de página');
} finally {
  await browser?.close();
  await service.close();
  await rm(dataDir, { recursive: true, force: true });
}
