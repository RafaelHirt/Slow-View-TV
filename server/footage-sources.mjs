import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { HttpError } from './validation.mjs';

const mediaHosts = new Set(['videos.pexels.com', 'cdn.pixabay.com']);

export function trustedMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Informe o link direto do arquivo de vídeo.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !mediaHosts.has(url.hostname) || url.href.length > 4096) {
    throw new HttpError(400, 'A importação por link aceita arquivos de videos.pexels.com e cdn.pixabay.com. Para outras fontes, envie o arquivo com a licença conferida.');
  }
  url.hash = '';
  return url.href;
}

export function createFootageSources({ fetchImpl, pexelsKey = process.env.PEXELS_API_KEY || '' } = {}) {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = !fetchImpl && proxy ? new ProxyAgent(proxy) : undefined;
  const fetcher = fetchImpl || ((url, options) => undiciFetch(url, { ...options, ...(dispatcher ? { dispatcher } : {}) }));
  return {
    configured: Boolean(pexelsKey),
    async search(query, signal) {
      if (!pexelsKey) throw new HttpError(503, 'A busca integrada requer PEXELS_API_KEY no servidor. Você pode buscar no site da fonte e enviar o arquivo.');
      if (typeof query !== 'string' || !query.trim() || query.length > 100) throw new HttpError(400, 'Digite uma busca de até 100 caracteres.');
      const url = new URL('https://api.pexels.com/videos/search');
      url.searchParams.set('query', query.trim()); url.searchParams.set('per_page', '12'); url.searchParams.set('orientation', 'landscape');
      let response;
      try { response = await fetcher(url.href, { signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(20000)]), headers: { Authorization: pexelsKey }, redirect: 'error' }); }
      catch { throw new HttpError(502, 'Não foi possível consultar o Pexels. Tente novamente ou importe um arquivo.'); }
      if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, 'O Pexels não respondeu à busca. Verifique a chave e o limite de uso no servidor.'); }
      const body = await response.json();
      return (Array.isArray(body.videos) ? body.videos : []).slice(0, 12).flatMap(video => {
        const files = (video.video_files || []).filter(file => file.file_type === 'video/mp4' && file.width >= 1280 && file.height >= 720)
          .sort((a, b) => Math.abs(a.height - 1080) - Math.abs(b.height - 1080));
        const file = files[0];
        if (!file) return [];
        let fileUrl;
        try { fileUrl = trustedMediaUrl(file.link); } catch { return []; }
        // The API supplies discovery metadata; the creator still reviews the source page and license.
        return [{ id: String(video.id), title: `Pexels · ${video.id}`, sourceUrl: video.url, author: video.user?.name || '',
          duration: video.duration, width: file.width, height: file.height, fileUrl }];
      });
    },
    async download(url, signal) {
      let current = trustedMediaUrl(url);
      for (let redirects = 0; redirects <= 4; redirects++) {
        let response;
        try { response = await fetcher(current, { signal, redirect: 'manual', headers: { Accept: 'video/*,application/octet-stream' } }); }
        catch { throw new HttpError(502, 'Não foi possível baixar o arquivo da fonte. Você pode enviá-lo pela biblioteca.'); }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location'); await response.body?.cancel();
          if (!location) break;
          current = trustedMediaUrl(new URL(location, current).href);
          continue;
        }
        if (!response.ok || !response.body) { await response.body?.cancel(); throw new HttpError(502, 'A fonte não disponibilizou o arquivo. Confira o link direto ou envie o arquivo.'); }
        return response;
      }
      throw new HttpError(502, 'O link da fonte redirecionou vezes demais. Envie o arquivo pela biblioteca.');
    },
    async close() { await dispatcher?.close(); },
  };
}
