import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-planning-'));
const service = await startServer({ port: 0, dataDir, enableWorker: false, authDisabled: true });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', chromiumSandbox: process.env.CHROMIUM_NO_SANDBOX !== '1', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(service.baseUrl);
  await page.getByRole('button', { name: /Minhas rotas/ }).click();
  await page.getByRole('button', { name: 'Planejar rota', exact: true }).click();
  await page.getByLabel('Origem', { exact: true }).fill('Viena');
  await page.getByLabel('Destino', { exact: true }).fill('Praga');
  await page.getByRole('button', { name: 'Guardar planejamento' }).click();
  await page.getByRole('heading', { name: 'Viena → Praga', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Minhas rotas/ }).click();
  await page.getByRole('heading', { name: 'Viena → Praga', exact: true }).waitFor();
  const plans = await (await fetch(`${service.baseUrl}/api/plans`)).json();
  assert.equal(plans.plans[0].origin, 'Viena');
  assert.equal(plans.plans[0].destination, 'Praga');
  assert.equal(plans.plans[0].transport, 'train');
  const routes = await (await fetch(`${service.baseUrl}/api/routes`)).json();
  assert.deepEqual(routes.routes, [], 'Planejar uma viagem não pode inventar um traçado.');
  await mkdir(resolve('test-results'), { recursive: true });
  await page.screenshot({ path: resolve('test-results/05-viena-praga.png'), fullPage: true });
  await page.getByRole('button', { name: 'Adicionar percurso GPX' }).click();
  assert.equal(await page.getByLabel('Nome da rota', { exact: true }).inputValue(), 'Viena → Praga');
  assert.equal(await page.locator('#transport').inputValue(), 'train');
  assert.equal(await page.getByRole('button', { name: 'Salvar minha rota' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve('test-results/06-planejamento-mobile.png'), fullPage: true });
  console.log('✓ Viena → Praga: planejamento salvo, recuperado, sem geometria inventada, importação pré-preenchida e layout mobile');
} finally {
  await browser?.close();
  await service.close();
  await rm(dataDir, { recursive: true, force: true });
}
