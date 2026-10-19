import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server/index.mjs';
import { probeMedia } from '../server/footage-media.mjs';

// Explicit, bounded real-source review. Never connects to the user's Pod or
// catalogue, publishes footage, starts a GPU, or calls a paid model/service.
const directory = await mkdtemp(join(tmpdir(), 'slowview-real-review-'));
const output = resolve('artifacts/real-footage-pilot');
const password = randomBytes(24).toString('hex');
const source = {
  title: 'Trem na neve · amostra de Himachal Pradesh', license: 'pexels',
  sourceUrl: 'https://www.pexels.com/video/a-train-travelling-through-the-railroad-in-the-snowy-mountain-of-himachal-in-india-3563086/',
  fileUrl: 'https://videos.pexels.com/video-files/3563086/3563086-hd_1280_720_25fps.mp4',
  attribution: 'shalender kumar / Pexels', rightsConfirmed: true,
  licenseNotes: 'https://www.pexels.com/license/ — fonte e licença consultadas em 19/10/2026. Teste editorial privado; não representa aprovação para monetização ou redistribuição como stock.',
};
let service;
try {
  await mkdir(output, { recursive: true });
  service = await startServer({ port: 0, host: '127.0.0.1', dataDir: directory, distDir: null,
    dashboardPassword: password, enableWorker: false, mediaMaxUploadBytes: 20 * 1024 ** 2 });
  const login = await fetch(`${service.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  async function api(path, body) {
    const response = await fetch(`${service.baseUrl}/api/footage${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `API: HTTP ${response.status}`);
    return result;
  }
  async function waitFor(collection, id, statuses, seconds) {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      const item = (await api(`/${collection}`))[collection].find(value => value.id === id);
      if (['failed', 'cancelled'].includes(item?.status)) throw new Error(item.error || item.status);
      if (statuses.includes(item?.status)) return item;
      await delay(500);
    }
    throw new Error('O teste excedeu seu tempo de espera.');
  }
  async function saveFile(path, name) {
    const response = await fetch(`${service.baseUrl}${path}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    const target = join(output, name); await writeFile(target, bytes);
    return { path: target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  console.log('Importando uma amostra real de cerca de 10 MB em um catálogo temporário…');
  const imported = await api('/import', source);
  const asset = await waitFor('assets', imported.id, ['ready'], 90);
  assert.equal(asset.width, 1280); assert.equal(asset.height, 720); assert.equal(asset.frameRate, 25); assert.equal(asset.hasAudio, true);
  const original = await saveFile(asset.fileUrl, 'original-pexels-3563086.mp4');
  const started = Date.now();
  const created = await api('/exports', { title: 'Trem na neve · teste de 20 segundos', assetId: asset.id,
    start: 2, end: 22, resolution: '720p', audioMode: 'original' });
  const job = await waitFor('exports', created.id, ['completed'], 300);
  const edited = await saveFile(job.fileUrl, 'piloto-trem-neve.mp4');
  const probe = await probeMedia(edited.path);
  assert.ok(Math.abs(probe.duration - 20) < .1); assert.equal(probe.frameRate, 25); assert.equal(probe.hasAudio, true);
  assert.equal(probe.width, 1280); assert.equal(probe.height, 720);
  const report = { checkedAt: new Date().toISOString(), source, original: { ...original, duration: asset.duration },
    edited: { ...edited, ...probe, processingSeconds: Math.round((Date.now() - started) / 100) / 10 },
    modifications: ['Trecho contínuo de 2s a 22s', 'Fades de imagem e áudio de até 1,5s', 'Som original: alvo -22 LUFS, pico -2 dBTP', '25 fps preservados; sem IA ou ampliação'],
    limitations: ['Local informado pela fonte; percurso e trem não identificados', 'Sem mapa, legendas ou aprovação de conforto/áudio', 'Teste em CPU neste ambiente, sem benchmark da GPU RunPod'] };
  await writeFile(join(output, 'relatorio.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'creditos.txt'), `${job.title}\nFilmagem: ${source.attribution}\nFonte: ${source.sourceUrl}\nLicença: https://www.pexels.com/license/\nEdição de teste: Slow View TV\n${report.modifications.join('\n')}\n\n${report.limitations.join('\n')}\n`);
  console.log(`✓ Importação real, áudio original e exportação 20s/720p/25 fps verificados. Arquivos: ${output}`);
} finally {
  await service?.close();
  await rm(directory, { recursive: true, force: true });
}
