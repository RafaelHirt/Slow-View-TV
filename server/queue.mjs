import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { jobFromRow } from './database.mjs';
import { renderVideo } from './renderer.mjs';

export function createQueue({ db, dataDir, appOrigin, workerToken, render = renderVideo, chromiumExecutable, noSandbox = false, gpuMode = 'software' }) {
  let running = false;
  let stopped = false;
  let current = null;
  let activePromise = Promise.resolve();
  const outputDir = join(dataDir, 'videos');

  async function drain() {
    if (running || stopped) return;
    running = true;
    try {
      await mkdir(outputDir, { recursive: true });
      while (!stopped) {
        const row = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1").get();
        if (!row) break;
        const controller = new AbortController();
        current = { id: row.id, controller };
        const temporaryPath = join(outputDir, `${row.id}.part.mp4`);
        const finalPath = join(outputDir, `${row.id}.mp4`);
        db.prepare("UPDATE jobs SET status = 'rendering', progress = 0 WHERE id = ? AND status = 'queued'").run(row.id);
        try {
          const variant = db.prepare('SELECT duration_minutes FROM variants WHERE id = ?').get(row.variant_id);
          if (!variant) throw new Error('A variação desta exportação não está mais disponível.');
          await render({ job: jobFromRow(row), outputPath: temporaryPath, appOrigin, workerToken,
            journeySeconds: variant.duration_minutes * 60,
            signal: controller.signal, chromiumExecutable, noSandbox, gpuMode,
            onProgress: (progress) => {
              if (Number.isFinite(progress)) db.prepare("UPDATE jobs SET progress = ? WHERE id = ? AND status = 'rendering'").run(Math.max(0, Math.min(0.99, progress)), row.id);
            },
          });
          if (controller.signal.aborted) throw new Error('Renderização cancelada.');
          await rename(temporaryPath, finalPath);
          if (controller.signal.aborted) throw new Error('Renderização cancelada.');
          db.prepare("UPDATE jobs SET status = 'completed', progress = 1, output_file = ?, error = NULL WHERE id = ? AND status = 'rendering'").run(`${row.id}.mp4`, row.id);
        } catch (error) {
          const status = controller.signal.aborted ? (stopped ? 'failed' : 'cancelled') : 'failed';
          const message = stopped ? 'A renderização foi interrompida pelo encerramento do servidor.'
            : controller.signal.aborted ? 'Renderização cancelada.' : `Falha ao gerar o vídeo. ${error.message || 'Erro inesperado.'}`.slice(0, 1200);
          db.prepare('UPDATE jobs SET status = ?, error = ?, output_file = NULL WHERE id = ?').run(status, message, row.id);
          await rm(temporaryPath, { force: true });
          await rm(finalPath, { force: true });
        } finally {
          current = null;
        }
      }
    } finally { running = false; }
  }
  function kick() {
    if (!stopped && !running) activePromise = drain().catch((error) => {
      db.prepare("UPDATE jobs SET status = 'failed', error = ? WHERE status = 'queued'")
        .run(`Não foi possível preparar a pasta de exportações. ${error.message}`.slice(0, 1200));
    });
    return activePromise;
  }
  return {
    kick,
    cancel(id) {
      const row = db.prepare('SELECT status FROM jobs WHERE id = ?').get(id);
      if (row?.status === 'queued') db.prepare("UPDATE jobs SET status = 'cancelled', error = 'Renderização cancelada.' WHERE id = ?").run(id);
      if (current?.id === id) current.controller.abort();
    },
    async close() {
      stopped = true;
      current?.controller.abort();
      await activePromise;
    },
  };
}
