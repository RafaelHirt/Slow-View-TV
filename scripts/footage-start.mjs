import { startRunpod } from './runpod-start.mjs';

try {
  const service = await startRunpod(process.env, { footageOnly: true });
  console.log(`Slow View TV — filmagens reais: porta interna ${service.server.address().port}. Edição por FFmpeg na CPU, sem renderizador 3D. No template atual, use o HTTP Service 3001.`);
  let stopping = false;
  const shutdown = () => { if (stopping) return; stopping = true; service.close().then(() => process.exit(0)).catch(() => process.exit(1)); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`Não foi possível iniciar o editor: ${error.message}`);
  process.exitCode = 1;
}
