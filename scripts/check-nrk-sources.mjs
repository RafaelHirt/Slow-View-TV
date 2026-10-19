import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fetch, ProxyAgent } from 'undici';
import { FLAMSBANEN } from '../server/nrk-ingest.mjs';
import { inspectTorrent, sameTorrentContent } from '../server/torrent-metadata.mjs';

// Metadata only. Does not start P2P, download video, access the DB/password,
// modify the catalogue, change torrent flags, or approve a mirror automatically.
const mirrorPage = 'https://blog.nytsoi.net/nrk-torrents';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxy ? new ProxyAgent(proxy) : null;
async function get(url) {
  const original = new URL(url), signal = AbortSignal.timeout(20000); let current = original;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await fetch(current.href, { signal, redirect: 'manual', ...(dispatcher ? { dispatcher } : {}) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('Redirecionamento sem destino.');
      const next = new URL(location, current);
      if (next.protocol !== 'https:' || next.hostname !== original.hostname || next.username || next.password || next.port) throw new Error('Redirecionamento requer revisão.');
      current = next; continue;
    }
    if (!response.ok) { await response.body?.cancel(); const error = new Error('HTTP'); error.status = response.status; throw error; }
    let size = 0; const chunks = [];
    for await (const chunk of response.body) { size += chunk.length; if (size > 500000) throw new Error('Limite de metadados.'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('Limite de redirecionamentos.');
}
const failure = error => ({ available: false, ...(Number.isInteger(error.status) ? { httpStatus: error.status } : {}), error: 'Não foi possível consultar esta fonte. Isso não comprova que o vídeo deixou de existir.' });
const report = { checkedAt: new Date().toISOString(), official: null, mirror: null, tracker: null };
try {
  let official;
  try {
    const cached = join(process.env.SLOWVISTA_DATA_DIR || '/workspace/slow-view-tv-data', 'footage/nrk/flamsbanen/source.torrent');
    let bytes;
    try { if ((await stat(cached)).size > 500000) throw new Error('Metadados fora do limite.'); bytes = await readFile(cached); }
    catch { bytes = await get(FLAMSBANEN.torrentUrl); }
    official = inspectTorrent(bytes);
    if (official.metadataSha256 !== FLAMSBANEN.torrentSha256 || official.infoHash !== FLAMSBANEN.infoHash) throw new Error('Torrent oficial diferente do conferido.');
    report.official = { available: true, ...official };
  } catch (error) { report.official = failure(error); }
  const [mirror, tracker] = await Promise.allSettled([
    (async () => {
      const html = (await get(mirrorPage)).toString('utf8'), links = new Set();
      for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
        let url, path;
        try { url = new URL(match[1].replace(/&amp;/g, '&'), mirrorPage); path = decodeURIComponent(url.pathname); } catch { continue; }
        if (url.protocol !== 'https:' || url.hostname !== 'blog.nytsoi.net' || url.username || url.password || url.port || !/\.torrent$/i.test(path) || !/fl[aå]m/i.test(path)) continue;
        url.search = ''; url.hash = ''; links.add(url.href);
      }
      const candidates = await Promise.all([...links].slice(0, 4).map(async url => {
        try { const info = inspectTorrent(await get(url)); return { url, ...info, contentMatchesOfficial: official ? sameTorrentContent(official, info) : null }; }
        catch (error) { return { url, ...failure(error) }; }
      }));
      return { available: true, page: mirrorPage, candidates, note: 'Espelho citado por um leitor na publicação NRK de 2018; não é um servidor oficial nem uma fonte já aprovada. A comparação de hashes verifica o mesmo arquivo, não peers ativos.' };
    })(),
    (async () => {
      const response = await fetch('http://tracker.torrent.nrkbeta.no/announce', { signal: AbortSignal.timeout(15000), redirect: 'error', ...(dispatcher ? { dispatcher } : {}) });
      await response.body?.cancel();
      return { httpResponseReceived: true, httpStatus: response.status, note: 'Consulta sem anúncio de torrent. A resposta pode vir de um proxy; não verifica peers, seeders ou disponibilidade do vídeo.' };
    })(),
  ]);
  report.mirror = mirror.status === 'fulfilled' ? mirror.value : failure(mirror.reason);
  report.tracker = tracker.status === 'fulfilled' ? tracker.value : { httpResponseReceived: false, note: 'Não foi possível receber resposta HTTP nesta consulta. A causa exata não foi confirmada.' };
  console.log(JSON.stringify(report, null, 2));
} finally { await dispatcher?.close(); }
