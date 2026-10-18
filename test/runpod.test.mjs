import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRunpodConfig, checkStorageLocking } from '../scripts/runpod-start.mjs';
import { openDatabase } from '../server/database.mjs';

const env = { DASHBOARD_PASSWORD: 'Senha somente para o teste local' };
const runtime = { uid: 1000, nodeVersion: '24.19.0', chromiumPath: '/tmp/test-browser' };

test('RunPod requires a private password, non-root user, explicit origins and a separate data directory', () => {
  const config = resolveRunpodConfig(env, runtime);
  assert.equal(config.port, 3001); assert.equal(config.host, '0.0.0.0');
  assert.equal(config.corsOrigins, 'https://slow-view-tv.netlify.app');
  assert.equal(config.appOrigin, 'http://127.0.0.1:3001');
  assert.equal(config.noSandbox, false); assert.equal(config.gpuMode, 'native');
  assert.equal(config.sqliteJournalMode, 'DELETE'); assert.equal(config.sqliteLockingMode, 'EXCLUSIVE');
  assert.equal(config.chromiumExecutable, runtime.chromiumPath);
  for (const patch of [{ DASHBOARD_PASSWORD: '' }, { DASHBOARD_PASSWORD: 'short' }, { PORT: '0' }, { PORT: '3001/path' },
    { SLOWVISTA_DATA_DIR: '.' }, { SLOWVISTA_DATA_DIR: '/' }, { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'http://example.com' }, { CORS_ORIGINS: 'https://example.com/path' },
    { CHROMIUM_GPU_MODE: 'cuda' }, { CHROMIUM_NO_SANDBOX: 'maybe' }]) {
    assert.throws(() => resolveRunpodConfig({ ...env, ...patch }, runtime));
  }
  assert.throws(() => resolveRunpodConfig(env, { ...runtime, uid: 0 }), /sem privilégios/);
  assert.throws(() => resolveRunpodConfig(env, { ...runtime, nodeVersion: '22.9.0' }), /24/);
});

test('pilot rollback journal persists data and rejects a second connection while exclusively locked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'slowview-db-'));
  let db;
  try {
    db = openDatabase(dir, { journalMode: 'DELETE', lockingMode: 'EXCLUSIVE' });
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    db.exec("INSERT INTO route_plans VALUES ('test', 'Viena → Praga', 'Viena', 'Praga', 'train', '', '2026-10-18')");
    assert.throws(() => openDatabase(dir, { journalMode: 'DELETE', lockingMode: 'EXCLUSIVE' }), /locked/);
    db.close(); db = null;
    db = openDatabase(dir, { journalMode: 'DELETE', lockingMode: 'EXCLUSIVE' });
    assert.equal(db.prepare('SELECT origin FROM route_plans').get().origin, 'Viena');
    assert.throws(() => openDatabase(dir, { journalMode: 'DELETE; DROP TABLE routes', lockingMode: 'NORMAL' }), /journal/);
  } finally { db?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('storage probe verifies interprocess locking and removes its temporary database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'slowview-lock-'));
  try { await checkStorageLocking(dir); assert.deepEqual(await readdir(dir), []); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
