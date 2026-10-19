import { createHash } from 'node:crypto';

// Read bounded public metadata without starting a torrent client. Keep the raw
// info bytes for its hash; decoding/re-encoding can change that identifier.
export function inspectTorrent(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 500000) throw new Error('Metadados fora do limite.');
  let position = 0, infoBytes;
  function read(depth = 0) {
    if (depth > 20 || position >= bytes.length) throw new Error('Torrent inválido.');
    const marker = String.fromCharCode(bytes[position]);
    if (marker === 'i') {
      const end = bytes.indexOf(101, ++position);
      const text = bytes.toString('ascii', position, end);
      if (end < position || text === '-0' || !/^-?(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('Número inválido.');
      position = end + 1; return Number(text);
    }
    if (marker === 'l' || marker === 'd') {
      position++;
      const value = marker === 'l' ? [] : Object.create(null);
      while (bytes[position] !== 101) {
        if (marker === 'l') value.push(read(depth + 1));
        else {
          const keyBytes = read(depth + 1);
          if (!Buffer.isBuffer(keyBytes)) throw new Error('Chave inválida.');
          const key = keyBytes.toString('utf8'), start = position;
          if (Object.hasOwn(value, key)) throw new Error('Chave duplicada.');
          value[key] = read(depth + 1);
          if (depth === 0 && key === 'info') infoBytes = bytes.subarray(start, position);
        }
        if (position >= bytes.length) throw new Error('Torrent incompleto.');
      }
      position++; return value;
    }
    const colon = bytes.indexOf(58, position), text = bytes.toString('ascii', position, colon);
    if (colon < position || !/^(0|[1-9]\d*)$/.test(text)) throw new Error('Texto inválido.');
    const length = Number(text), start = colon + 1;
    if (!Number.isSafeInteger(length) || start + length > bytes.length) throw new Error('Texto incompleto.');
    position = start + length; return bytes.subarray(start, position);
  }
  const root = read(), info = root?.info;
  if (position !== bytes.length || !infoBytes || !info || !Number.isSafeInteger(info.length) || info.length <= 0 || !Number.isSafeInteger(info['piece length']) || info['piece length'] <= 0 || !Buffer.isBuffer(info.pieces) || !Buffer.isBuffer(info.name)) throw new Error('Esperado um torrent de arquivo único.');
  if (info.pieces.length !== Math.ceil(info.length / info['piece length']) * 20) throw new Error('Lista de partes inconsistente.');
  return { filename: info.name.toString('utf8'), bytes: info.length, pieceLength: info['piece length'], privateTorrent: info.private === 1,
    infoHash: createHash('sha1').update(infoBytes).digest('hex'), metadataSha256: createHash('sha256').update(bytes).digest('hex'),
    piecesSha256: createHash('sha256').update(info.pieces).digest('hex') };
}

export function sameTorrentContent(first, second) {
  return first.bytes === second.bytes && first.pieceLength === second.pieceLength && first.piecesSha256 === second.piecesSha256;
}
