const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø' };
function decodeText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (!entity.startsWith('#')) return entities[entity] || whole;
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}
const plainText = value => decodeText(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const relevant = value => /flam|myrdal/i.test(value.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

function magnetHash(uri) {
  const xt = new URL(uri).searchParams.getAll('xt').find(value => /^urn:btih:/i.test(value));
  const hash = xt?.slice(9);
  if (/^[0-9a-f]{40}$/i.test(hash || '')) return hash.toLowerCase();
  if (!/^[a-z2-7]{32}$/i.test(hash || '')) return null;
  let value = 0, bits = 0; const bytes = [];
  for (const char of hash.toUpperCase()) {
    value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); value &= (1 << bits) - 1; }
  }
  return Buffer.from(bytes).toString('hex');
}

// Discovery is separate from metadata verification. A page response, a link or
// a magnet does not establish that the film is downloadable or licensed.
export function inspectNrkMirrorIndex(html, page) {
  const base = new URL(page), torrents = new Map(), magnets = new Map(), relatedLinks = new Map();
  let linkCount = 0;
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attribute = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/i);
    if (!attribute) continue;
    linkCount++;
    const label = plainText(match[2]).slice(0, 180), href = decodeText(attribute[1] || attribute[2] || attribute[3]);
    // Nearby text helps when a link is labelled simply "torrent" or its path is
    // a numeric attachment id. A content hash still decides file equivalence.
    const context = plainText(html.slice(Math.max(0, match.index - 300), match.index + match[0].length + 100));
    let url, path;
    try { url = new URL(href, base); path = decodeURIComponent(url.pathname); } catch { continue; }
    const matchesJourney = relevant(`${label} ${path} ${url.searchParams.get('dn') || ''} ${context}`);
    if (url.protocol === 'magnet:') {
      const infoHash = magnetHash(url.href);
      if (infoHash && !magnets.has(infoHash)) magnets.set(infoHash, { label: label || url.searchParams.get('dn')?.slice(0, 180) || 'Magnet', infoHash, matchesJourney, magnet: `magnet:?xt=urn:btih:${infoHash}` });
      continue;
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) continue;
    // Queries are not printed: source pages may contain temporary download keys.
    const queryLooksLikeTorrent = [...url.searchParams.values()].some(value => /\.torrent$/i.test(value));
    url.search = ''; url.hash = '';
    const item = { label, url: url.href, matchesJourney };
    if (/\.torrent$/i.test(path)) {
      const fetchUrl = new URL(url); fetchUrl.protocol = 'https:';
      torrents.set(url.href, { ...item, fetchUrl: fetchUrl.href, canInspect: [base.hostname, 'trainfulness.nytsoi.net'].includes(fetchUrl.hostname) });
    } else if (matchesJourney || /torrent|download/i.test(label) || queryLooksLikeTorrent) relatedLinks.set(url.href, { ...item, requiresReview: true });
  }
  const ordered = values => [...values].sort((a, b) => Number(b.matchesJourney) - Number(a.matchesJourney));
  return { pageTitle: plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '').slice(0, 200),
    pageExcerpt: plainText(html).slice(0, 1200), linkCount,
    torrentLinks: ordered(torrents.values()).slice(0, 30), torrentLinkCount: torrents.size,
    magnetLinks: ordered(magnets.values()).slice(0, 12), magnetLinkCount: magnets.size,
    relatedLinks: ordered(relatedLinks.values()).slice(0, 15) };
}
