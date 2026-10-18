import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEO_FORMATS } from './validation.mjs';

export function openDatabase(dataDir, { journalMode = 'WAL', lockingMode = 'NORMAL' } = {}) {
  if (!['WAL', 'DELETE'].includes(journalMode)) throw new Error('O modo de journal SQLite deve ser WAL ou DELETE.');
  if (!['NORMAL', 'EXCLUSIVE'].includes(lockingMode)) throw new Error('O modo de lock SQLite deve ser NORMAL ou EXCLUSIVE.');
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'slowvista.sqlite'));
  try {
    const actual = db.prepare(`PRAGMA journal_mode = ${journalMode}`).get().journal_mode;
    if (actual.toUpperCase() !== journalMode) throw new Error('O volume não aceitou o modo de journal SQLite solicitado.');
    db.exec(`PRAGMA locking_mode = ${lockingMode};`);
    if (lockingMode === 'EXCLUSIVE') db.exec('BEGIN EXCLUSIVE; COMMIT;');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      source_name TEXT NOT NULL, transport TEXT NOT NULL, is_demo INTEGER NOT NULL,
      points TEXT NOT NULL, distance_km REAL NOT NULL, elevation_known INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS route_plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, origin TEXT NOT NULL,
      destination TEXT NOT NULL, transport TEXT NOT NULL, notes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS variants (
      id TEXT PRIMARY KEY, route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      name TEXT NOT NULL, season TEXT NOT NULL, time_of_day TEXT NOT NULL,
      weather TEXT NOT NULL, duration_minutes INTEGER NOT NULL, temperature_c REAL,
      show_map INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
      route_name TEXT NOT NULL, variant_name TEXT NOT NULL,
      status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, error TEXT,
      created_at TEXT NOT NULL, output_seconds REAL NOT NULL, preview INTEGER NOT NULL,
      output_file TEXT, resolution TEXT NOT NULL DEFAULT '720p',
      width INTEGER NOT NULL DEFAULT 1280, height INTEGER NOT NULL DEFAULT 720,
      fps INTEGER NOT NULL DEFAULT 24
    );
    CREATE INDEX IF NOT EXISTS variants_route ON variants(route_id);
    CREATE INDEX IF NOT EXISTS jobs_variant ON jobs(variant_id);
  `);
  // Existing installations may already contain completed 720p videos. Add only
  // missing columns; preserve their files, duration, and previous job metadata.
  const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
  for (const [name, definition] of [
    ['resolution', "TEXT NOT NULL DEFAULT '720p'"],
    ['width', 'INTEGER NOT NULL DEFAULT 1280'],
    ['height', 'INTEGER NOT NULL DEFAULT 720'],
    ['fps', 'INTEGER NOT NULL DEFAULT 24'],
  ]) {
    if (!jobColumns.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
  }
  db.prepare(`UPDATE jobs SET status = 'failed', error = ?, output_file = NULL WHERE status IN ('queued','rendering')`)
    .run('A renderização foi interrompida pela reinicialização do servidor. Gere o vídeo novamente.');
  return db;
  } catch (error) { db.close(); throw error; }
}

export function planFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, origin: row.origin, destination: row.destination,
    transport: row.transport, notes: row.notes, createdAt: row.created_at,
  };
}

export function variantFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, routeId: row.route_id, name: row.name, season: row.season,
    timeOfDay: row.time_of_day, weather: row.weather,
    durationMinutes: row.duration_minutes, temperatureC: row.temperature_c,
    showMap: Boolean(row.show_map), createdAt: row.created_at,
  };
}

export function routeFromRow(db, row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, description: row.description, sourceName: row.source_name,
    transport: row.transport, isDemo: Boolean(row.is_demo), points: JSON.parse(row.points),
    distanceKm: row.distance_km, elevationKnown: Boolean(row.elevation_known), createdAt: row.created_at,
    variants: db.prepare('SELECT * FROM variants WHERE route_id = ? ORDER BY created_at DESC, id DESC').all(row.id).map(variantFromRow),
  };
}

export function jobFromRow(row) {
  if (!row) return null;
  const resolution = row.resolution ?? '720p';
  const format = VIDEO_FORMATS[resolution] ?? VIDEO_FORMATS['720p'];
  return {
    id: row.id, variantId: row.variant_id, routeName: row.route_name, variantName: row.variant_name,
    status: row.status, progress: row.progress, error: row.error, createdAt: row.created_at,
    outputSeconds: row.output_seconds, preview: Boolean(row.preview),
    resolution, width: row.width ?? format.width, height: row.height ?? format.height, fps: row.fps ?? format.fps,
    ...(row.status === 'completed' && row.output_file ? { downloadUrl: `/api/jobs/${row.id}/video` } : {}),
  };
}
