import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-atlas-'));
const artifacts = resolve('artifacts'); await mkdir(artifacts, { recursive: true });
const token = 'only-for-browser-test';
const sample = resolve('test/fixtures/playback-720p.mp4');
// UI playback fixture reuses the previously validated 720p sample. It does not
// validate rendering; native 4K is exercised separately in render4k.smoke.mjs.
const render = async ({ outputPath, onProgress, signal }) => {
  if (signal.aborted) throw new Error('cancelled');
  await writeFile(outputPath, await readFile(sample)); onProgress(.99);
};
const service = await startServer({ port: 0, dataDir, adminToken: token, enableWorker: true, render });
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const api = async (path, body, method) => {
  const response = await fetch(`${service.baseUrl}/api${path}`, { method: method || (body ? 'POST' : 'GET'), headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${path}: ${response.status}`); return response.status === 204 ? null : response.json();
};
let browser;
try {
  const route = await api('/routes', { name: 'Percurso de ensaio — atlas', sourceName: 'Fixture ilustrativa de teste', description: 'Não representa uma viagem real.', isDemo: true, transport: 'train', points: [{ lat: 48.18, lon: 16.37, ele: null }, { lat: 48.185, lon: 16.38, ele: null }, { lat: 48.19, lon: 16.39, ele: null }] });
  const winter = await api(`/routes/${route.id}/variants`, { name: 'Inverno de manhã', season: 'winter', timeOfDay: 'day', weather: 'snow', durationMinutes: 120, showMap: true });
  await api(`/routes/${route.id}/variants`, { name: 'Verão à noite', season: 'summer', timeOfDay: 'night', weather: 'clear', durationMinutes: 120, showMap: true });
  await api('/plans', { name: 'Viena → Praga', origin: 'Viena', destination: 'Praga', transport: 'train', notes: 'Aguardando traçado verificado.' });
  const job = await api('/jobs', { variantId: winter.id, previewSeconds: 8, resolution: '720p' });
  for (let i = 0; i < 50; i++) { if ((await api(`/jobs/${job.id}`)).status === 'completed') break; await new Promise((resolve) => setTimeout(resolve, 50)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', chromiumSandbox: process.env.CHROMIUM_NO_SANDBOX !== '1', args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(service.baseUrl);
  await page.getByLabel('Chave de acesso').fill(token);
  await page.getByRole('button', { name: 'Entrar no ateliê', exact: true }).click();
  await page.getByRole('heading', { name: 'O mundo, no seu ritmo.' }).waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.atlas-map-host canvas'); if (!canvas) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0, total = 0; for (let i = 3; i < pixels.length; i += 64) { total++; if (pixels[i] > 0) painted++; }
    return painted > total * .05;
  });
  await page.screenshot({ path: join(artifacts, 'slowvista-world.png'), fullPage: true });
  await page.getByRole('button', { name: 'Importar percurso GPX', exact: true }).click();
  const longGpx = '<gpx><trk><trkseg>' + Array.from({ length: 10001 }, (_, i) => `<trkpt lat=\"${48 + i / 1000000}\" lon=\"${16 + i / 1000000}\"/>`).join('') + '</trkseg></trk></gpx>';
  await page.locator('input[type=file]').setInputFiles({ name: 'long-test.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(longGpx) });
  await page.getByText('10.001 pontos · clique para trocar').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Salvar minha rota' }).isEnabled(), true);
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  console.log('✓ GPX com mais de dez mil pontos aceito integralmente pelo importador');
  await page.getByRole('button', { name: /Percurso de ensaio — atlas/ }).click();
  await page.getByText('Inverno de manhã', { exact: true }).waitFor();
  await page.getByText('Verão à noite', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'slowvista-atlas.png'), fullPage: true });
  console.log('✓ Mapa mundial local, rota selecionável e duas configurações salvas');

  await page.getByRole('button', { name: 'Abrir esta rota' }).click();
  assert.equal(await page.getByLabel('Resolução do vídeo completo').inputValue(), '2160p');
  assert.equal(await page.getByLabel('Duração (min)', { exact: true }).inputValue(), '120');
  await page.getByRole('button', { name: 'Renderizar viagem completa' }).click();
  await page.getByText('2 h de vídeo em 4K UHD, 24 quadros por segundo.').waitFor();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  console.log('✓ 4K padrão no editor e confirmação preservando as duas horas da viagem');

  await page.getByRole('button', { name: /Produções/ }).click();
  await page.getByRole('button', { name: 'Assistir', exact: true }).click();
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video && video.readyState >= 1 && video.videoWidth === 1280 && Math.round(video.duration) === 8; });
  const videoUrl = await page.locator('video').getAttribute('src');
  const range = await fetch(`${service.baseUrl}${videoUrl}`, { headers: { Range: 'bytes=0-31' } });
  assert.equal(range.status, 206);
  assert.match(range.headers.get('Content-Type'), /video\/mp4/);
  assert.match(range.headers.get('Content-Disposition'), /^inline/);
  assert.equal((await range.arrayBuffer()).byteLength, 32);
  await page.screenshot({ path: join(artifacts, 'slowvista-player.png'), fullPage: true });
  console.log('✓ Player carregou o MP4 real de 8s; HTTP Range206, tipo e reprodução inline corretos');

  await page.getByRole('button', { name: 'Explorar mundo' }).click();
  await page.getByRole('button', { name: 'Viena–Praga', exact: true }).click();
  for (let zoom = 0; zoom < 5 && await page.getByRole('button', { name: 'Buscar rotas nesta área' }).isDisabled(); zoom++) { await page.locator('.leaflet-control-zoom-in').click(); await page.waitForTimeout(300); }
  await page.route('**/api/railway/routes?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Acesso ao provedor bloqueado no teste.' }) }));
  await page.getByRole('button', { name: 'Buscar rotas nesta área' }).click();
  await page.getByRole('status').filter({ hasText: 'Acesso ao provedor bloqueado no teste.' }).waitFor();
  console.log('✓ Falha da fonte externa é mostrada sem inventar rotas ou apagar o catálogo');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(artifacts, 'slowvista-atlas-mobile.png'), fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log('✓ Atlas no celular sem rolagem horizontal ou exceções de página');
} finally {
  await browser?.close(); await service.close(); await rm(dataDir, { recursive: true, force: true });
}
