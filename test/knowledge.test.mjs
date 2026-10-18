import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createKnowledgeRouter } from '../server/knowledge.mjs';
import { HttpError } from '../server/validation.mjs';

async function mount(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/knowledge', createKnowledgeRouter({ db }));
  app.use((error, _req, res, _next) => res.status(error instanceof HttpError ? error.status : error instanceof SyntaxError && error.status === 400 ? 400 : 500).json({ error: error.message }));
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/api/knowledge`;
  return {
    read: () => fetch(url),
    write: (body) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('project decisions persist across SQLite reopen without changing curated sources', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'slowvista-knowledge-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let db = new DatabaseSync(join(dir, 'knowledge.sqlite'));
  let service = await mount(db);
  try {
    const initial = await (await service.read()).json();
    assert.match(initial.projectNotes, /Viena → Praga/);
    assert.equal(initial.sources.find((source) => source.id === 'landcover').status, 'pending');
    assert.equal(initial.sources.find((source) => source.id === 'engine').status, 'pending');
    assert.ok(initial.sources.every((source) => source.links.every((link) => new URL(link.url).protocol === 'https:')));
    const projectNotes = 'Viena → Praga\nInverno, noite e neve.\nPreservar as paradas e a duração completa.\n';
    const result = await service.write({ projectNotes });
    assert.equal(result.status, 200);
    const saved = await result.json();
    assert.equal(saved.projectNotes, projectNotes);
    assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
    assert.deepEqual(saved.sources, initial.sources);
    await service.close(); db.close();
    db = new DatabaseSync(join(dir, 'knowledge.sqlite'));
    service = await mount(db);
    const reopened = await (await service.read()).json();
    assert.equal(reopened.projectNotes, projectNotes);
    assert.equal(reopened.updatedAt, saved.updatedAt);
    assert.deepEqual(reopened.sources, initial.sources);
  } finally { await service.close(); db.close(); }
});

test('invalid updates cannot erase decisions or alter the source library', async () => {
  const db = new DatabaseSync(':memory:');
  const service = await mount(db);
  try {
    await service.write({ projectNotes: 'Decisão preservada' });
    for (const body of [null, [], {}, { projectNotes: 42 }, { projectNotes: null }, { projectNotes: 'x'.repeat(20001) }, { projectNotes: 'Outro texto', sources: [] }]) {
      assert.equal((await service.write(body)).status, 400);
      assert.equal((await (await service.read()).json()).projectNotes, 'Decisão preservada');
    }
    const maxLength = '🌿'.repeat(10000);
    assert.equal((await service.write({ projectNotes: maxLength })).status, 200);
    assert.equal((await (await service.read()).json()).projectNotes, maxLength);
    assert.equal((await service.write({ projectNotes: '' })).status, 200);
    assert.equal((await (await service.read()).json()).projectNotes, '');
  } finally { await service.close(); db.close(); }
});
