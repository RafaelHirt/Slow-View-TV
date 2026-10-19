import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-access-'));
const artifacts = resolve('artifacts'); await mkdir(artifacts, { recursive: true });
const password = 'senha-exclusiva-do-teste-local';
// HTTP bootstrap is explicitly enabled only for this isolated test.
let service = await startServer({ port: 0, dataDir, enableWorker: false, allowLocalSetup: true });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', chromiumSandbox: process.env.CHROMIUM_NO_SANDBOX !== '1' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${service.baseUrl}/prototype`);
  await page.getByRole('heading', { name: 'Um começo seguro.' }).waitFor();
  assert.equal((await fetch(`${service.baseUrl}/api/plans`)).status, 401);
  await page.getByLabel('Criar senha', { exact: true }).fill(password);
  await page.getByLabel('Confirmar senha', { exact: true }).fill('outra-senha-para-teste');
  await page.getByRole('button', { name: 'Criar senha e entrar' }).click();
  await page.getByRole('alert').filter({ hasText: 'As senhas precisam ser iguais.' }).waitFor();
  await page.getByLabel('Confirmar senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Criar senha e entrar' }).click();
  await page.getByRole('heading', { name: 'O mundo, no seu ritmo.' }).waitFor();
  console.log('✓ Primeiro acesso criou senha, bloqueou APIs e conferiu confirmação');

  await page.getByRole('button', { name: 'Fontes e plano', exact: true }).click();
  await page.getByRole('heading', { name: /fontes/i }).first().waitFor();
  const notes = page.getByLabel('Notas do projeto');
  await notes.fill('Piloto Viena → Praga. Validar estações, pontes e cenário antes da renderização completa.');
  await page.getByRole('button', { name: 'Salvar notas', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /salv/i }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Fontes e plano', exact: true }).click();
  assert.match(await notes.inputValue(), /Validar estações/);
  await page.screenshot({ path: join(artifacts, 'slowvista-sources.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sair do ateliê' }).click();
  await page.getByRole('button', { name: 'Entrar no ateliê' }).waitFor();
  assert.equal((await fetch(`${service.baseUrl}/api/knowledge`)).status, 401);
  await page.getByLabel('Senha', { exact: true }).fill('uma-senha-incorreta');
  await page.getByRole('button', { name: 'Entrar no ateliê' }).click();
  await page.getByRole('alert').filter({ hasText: /inválida/ }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Entrar no ateliê' }).waitFor();
  await page.screenshot({ path: join(artifacts, 'slowvista-login.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(artifacts, 'slowvista-login-mobile.png'), fullPage: true });
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar no ateliê' }).click();
  await page.getByRole('button', { name: 'Fontes e plano', exact: true }).click();
  assert.match(await notes.inputValue(), /Viena → Praga/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(artifacts, 'slowvista-sources-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('✓ Notas persistiram, logout bloqueou dados, senha incorreta falhou, login e mobile funcionaram');

  await service.close();
  service = await startServer({ port: 0, dataDir, enableWorker: false });
  const login = await fetch(`${service.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200);
  const session = await login.json();
  const saved = await (await fetch(`${service.baseUrl}/api/knowledge`, { headers: { Authorization: `Bearer ${session.token}` } })).json();
  assert.match(saved.projectNotes, /Validar estações/);
  console.log('✓ Senha e notas recuperadas após reiniciar o servidor com o mesmo banco');
} finally {
  await browser?.close(); await service.close(); await rm(dataDir, { recursive: true, force: true });
}
