import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { request as httpRequest } from 'node:http';
import { startServer } from '../server/index.mjs';

const password = 'Senha de teste com 24 letras!';
const sessionHeaders = (session) => ({ Authorization: `Bearer ${session.token}` });

async function setup(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'slowvista-auth-'));
  let service = await startServer({ dataDir, port: 0, distDir: null, enableWorker: false, adminToken: '', dashboardPassword: '', ...options });
  const services = [service];
  t.after(async () => { for (const entry of services) await entry.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${service.baseUrl}${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let result = text;
    try { result = JSON.parse(text); } catch {}
    return { status: response.status, body: result, headers: response.headers };
  }
  return {
    api, dataDir, get service() { return service; },
    async reopen(overrides = {}) {
      await service.close();
      service = await startServer({ dataDir, port: 0, distDir: null, enableWorker: false, adminToken: '', dashboardPassword: '', ...options, ...overrides });
      services.push(service);
      return service;
    },
  };
}

test('first setup requires direct trusted localhost, stores hashes, and survives restart with its session', async (t) => {
  const env = await setup(t, { corsOrigins: 'https://panel.example', allowLocalSetup: true });
  const { api } = env;
  assert.deepEqual((await api('/api/auth/status')).body, { configured: false, authenticated: false, setupAllowed: true, mode: 'setup' });
  assert.equal((await api('/api/routes')).status, 401);
  assert.equal((await api('/api/plans')).status, 401);
  assert.equal((await api('/api/health')).body.authRequired, true);
  assert.equal((await api('/api/auth/setup', { method: 'POST', body: { password } })).status, 403);
  assert.equal((await api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: 'https://panel.example' } })).status, 403);
  assert.equal((await api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const publicHost = await new Promise((resolve, reject) => {
    const request = httpRequest(`${env.service.baseUrl}/api/auth/setup`, { method: 'POST', headers: { Host: 'public.example', Origin: env.service.baseUrl, 'Content-Type': 'application/json' } }, (response) => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
    request.end(JSON.stringify({ password }));
  });
  assert.equal(publicHost, 403);
  for (const headers of [
    { Forwarded: 'for=203.0.113.5' },
    { 'X-Forwarded-For': '127.0.0.1' }, { 'X-Forwarded-Host': 'localhost' }, { 'X-Forwarded-Proto': 'https' },
  ]) {
    assert.equal((await api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: env.service.baseUrl, ...headers } })).status, 403);
  }
  const initial = await api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: env.service.baseUrl } });
  assert.equal(initial.status, 201);
  assert.match(initial.body.token, /^[0-9a-f]{64}$/);
  assert.ok(Date.parse(initial.body.expiresAt) > Date.now() + 11 * 60 * 60 * 1000);
  const storedPassword = env.service.db.prepare('SELECT * FROM dashboard_auth').get();
  const storedSession = env.service.db.prepare('SELECT * FROM dashboard_sessions').get();
  assert.match(storedPassword.password_hash, /^scrypt\$/);
  assert.ok(!JSON.stringify(storedPassword).includes(password));
  assert.match(storedSession.token_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(storedSession.token_hash, initial.body.token);
  assert.ok(!JSON.stringify(storedSession).includes(initial.body.token));
  assert.equal((await api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: env.service.baseUrl } })).status, 409);
  assert.deepEqual((await api('/api/auth/status', { headers: sessionHeaders(initial.body) })).body, { configured: true, authenticated: true, setupAllowed: false, mode: 'password' });
  await env.reopen();
  assert.equal((await api('/api/routes', { headers: sessionHeaders(initial.body) })).status, 200);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { password } })).status, 200);
});

test('password sessions expire, reject unknown tokens, and logout revokes only the current session', async (t) => {
  let now = Date.now();
  const { api, service } = await setup(t, { dashboardPassword: password, authNow: () => now });
  assert.deepEqual((await api('/api/auth/status')).body, { configured: true, authenticated: false, setupAllowed: false, mode: 'password' });
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { password: 'incorreta' } })).status, 401);
  const first = (await api('/api/auth/login', { method: 'POST', body: { password } })).body;
  assert.equal((await api('/api/routes', { headers: { Authorization: 'Bearer unknown-token' } })).status, 401);
  assert.equal((await api('/api/routes', { headers: sessionHeaders(first) })).status, 200);
  now += 12 * 60 * 60 * 1000 + 1;
  assert.equal((await api('/api/routes', { headers: sessionHeaders(first) })).status, 401);
  assert.equal((await api('/api/auth/status', { headers: sessionHeaders(first) })).body.authenticated, false);
  assert.equal(service.db.prepare('SELECT count(*) AS count FROM dashboard_sessions').get().count, 0);
  const second = (await api('/api/auth/login', { method: 'POST', body: { password } })).body;
  const third = (await api('/api/auth/login', { method: 'POST', body: { password } })).body;
  assert.equal((await api('/api/auth/logout', { method: 'POST', headers: sessionHeaders(second) })).status, 204);
  assert.equal((await api('/api/routes', { headers: sessionHeaders(second) })).status, 401);
  assert.equal((await api('/api/routes', { headers: sessionHeaders(third) })).status, 200);
});

test('login and setup have a peer-based rate limit that ignores spoofed forwarding headers', async (t) => {
  let now = Date.now();
  const { api } = await setup(t, { dashboardPassword: password, authNow: () => now });
  for (let index = 0; index < 5; index += 1) assert.equal((await api('/api/auth/login', { method: 'POST', body: { password: 'senha incorreta' } })).status, 401);
  const blocked = await api('/api/auth/login', { method: 'POST', body: { password }, headers: { 'X-Forwarded-For': '198.51.100.5' } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
  now += 15 * 60 * 1000 + 1;
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { password } })).status, 200);
  const setupEnv = await setup(t, { authNow: () => now, allowLocalSetup: true });
  for (let index = 0; index < 5; index += 1) assert.equal((await setupEnv.api('/api/auth/setup', { method: 'POST', body: { password: 'curta' }, headers: { Origin: setupEnv.service.baseUrl } })).status, 400);
  assert.equal((await setupEnv.api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: setupEnv.service.baseUrl } })).status, 429);
  now += 15 * 60 * 1000 + 1;
  assert.equal((await setupEnv.api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: setupEnv.service.baseUrl } })).status, 201);
});

test('legacy ADMIN_TOKEN supports login sessions without persisting the raw token', async (t) => {
  const legacyToken = 'test-only-legacy-administrator';
  const env = await setup(t, { adminToken: legacyToken });
  assert.equal((await env.api('/api/auth/status')).body.mode, 'token');
  assert.equal((await env.api('/api/routes', { headers: { Authorization: `Bearer ${legacyToken}` } })).status, 200);
  const login = await env.api('/api/auth/login', { method: 'POST', body: { token: legacyToken } });
  assert.equal(login.status, 200);
  assert.notEqual(login.body.token, legacyToken);
  assert.ok(!JSON.stringify(env.service.db.prepare('SELECT * FROM dashboard_sessions').all()).includes(legacyToken));
  await env.reopen();
  assert.equal((await env.api('/api/routes', { headers: sessionHeaders(login.body) })).status, 200);
  assert.equal((await env.api('/api/auth/logout', { method: 'POST', headers: sessionHeaders(login.body) })).status, 204);
  assert.equal((await env.api('/api/routes', { headers: sessionHeaders(login.body) })).status, 401);
});

test('changing the private deployment password revokes existing sessions and persists the new hash', async (t) => {
  const env = await setup(t, { dashboardPassword: password });
  const oldSession = (await env.api('/api/auth/login', { method: 'POST', body: { password } })).body;
  const replacement = 'Outra senha privada para teste!';
  await env.reopen({ dashboardPassword: replacement });
  assert.equal((await env.api('/api/routes', { headers: sessionHeaders(oldSession) })).status, 401);
  assert.equal((await env.api('/api/auth/login', { method: 'POST', body: { password } })).status, 401);
  assert.equal((await env.api('/api/auth/login', { method: 'POST', body: { password: replacement } })).status, 200);
  await env.reopen({ dashboardPassword: '' });
  assert.equal((await env.api('/api/auth/login', { method: 'POST', body: { password: replacement } })).status, 200);
  assert.ok(!JSON.stringify(env.service.db.prepare('SELECT * FROM dashboard_auth').all()).includes(replacement));
});

test('parallel invalid logins reserve attempts before expensive password verification', async (t) => {
  const { api } = await setup(t, { dashboardPassword: password });
  const results = await Promise.all(Array.from({ length: 10 }, () => api('/api/auth/login', { method: 'POST', body: { password: 'senha incorreta' } })));
  assert.equal(results.filter((result) => result.status === 401).length, 5);
  assert.equal(results.filter((result) => result.status === 429).length, 5);
});

test('public binding requires a configured credential and accepts an existing salted password hash', async (t) => {
  const env = await setup(t, { allowLocalSetup: true });
  await assert.rejects(startServer({ dataDir: env.dataDir, port: 0, host: '0.0.0.0', distDir: null, adminToken: '', dashboardPassword: '', enableWorker: false }), /DASHBOARD_PASSWORD/);
  const session = (await env.api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: env.service.baseUrl } })).body;
  await env.reopen({ host: '0.0.0.0' });
  assert.equal((await env.api('/api/routes')).status, 401);
  assert.equal((await env.api('/api/routes', { headers: sessionHeaders(session) })).status, 200);
});

test('default server cannot bootstrap a password over HTTP even with local Host and Origin', async (t) => {
  const env = await setup(t);
  assert.deepEqual((await env.api('/api/auth/status')).body, { configured: false, authenticated: false, setupAllowed: false, mode: 'setup' });
  const response = await env.api('/api/auth/setup', { method: 'POST', body: { password }, headers: { Origin: env.service.baseUrl } });
  assert.equal(response.status, 403);
  assert.equal(env.service.db.prepare('SELECT count(*) AS count FROM dashboard_auth').get().count, 0);
  assert.equal((await env.api('/api/routes')).status, 401);
});

test('password-protected exports retain internal worker access and scoped download links', async (t) => {
  let env;
  const render = async ({ job, workerToken, outputPath }) => {
    const headers = { 'x-slowvista-worker': workerToken };
    assert.equal((await fetch(`${env.service.baseUrl}/api/jobs/${job.id}/scene`, { headers })).status, 200);
    assert.equal((await fetch(`${env.service.baseUrl}/api/routes`, { headers })).status, 401);
    await writeFile(outputPath, 'password-protected-mp4');
  };
  env = await setup(t, { dashboardPassword: password, enableWorker: true, render });
  const session = (await env.api('/api/auth/login', { method: 'POST', body: { password } })).body;
  const headers = sessionHeaders(session);
  const route = (await env.api('/api/routes', { method: 'POST', headers, body: { name: 'Teste', transport: 'train', points: [{ lat: 1, lon: 1 }, { lat: 1, lon: 1.01 }] } })).body;
  const variant = (await env.api(`/api/routes/${route.id}/variants`, { method: 'POST', headers, body: { name: 'Dia', season: 'summer', timeOfDay: 'day', weather: 'clear', durationMinutes: 1 } })).body;
  const queued = (await env.api('/api/jobs', { method: 'POST', headers, body: { variantId: variant.id, previewSeconds: 2 } })).body;
  let completed;
  for (let index = 0; index < 100; index += 1) {
    const job = (await env.api(`/api/jobs/${queued.id}`, { headers })).body;
    if (job.status === 'failed') assert.fail(job.error);
    if (job.status === 'completed') { completed = job; break; }
    await delay(20);
  }
  assert.ok(completed);
  assert.match(completed.downloadUrl, /signature=/);
  assert.ok(!completed.downloadUrl.includes(session.token));
  assert.equal((await env.api(completed.downloadUrl)).body, 'password-protected-mp4');
  assert.equal((await env.api(`/api/jobs/${queued.id}/video`)).status, 401);
});
