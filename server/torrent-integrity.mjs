import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectTorrent } from './torrent-metadata.mjs';
import { HttpError } from './validation.mjs';

// Verify against the ORIGINAL torrent, irrespective of how another swarm split
// the same media. The caller must authenticate these metadata before using them.
// Keep memory bounded; never load the multi-GB video into a Buffer.
export async function verifyTorrentFile(path, torrentBytes, { signal, onProgress = () => {} } = {}) {
  signal?.throwIfAborted();
  const reference = inspectTorrent(torrentBytes, { includePieces: true });
  if ((await stat(path)).size !== reference.bytes) throw new HttpError(502, 'O tamanho do arquivo recebido difere da referência oficial. O vídeo não foi liberado na biblioteca.');
  let verified = 0, pieceIndex = 0, inPiece = 0, lastPublished = Date.now();
  let hash = createHash('sha1');
  const fileHash = createHash('sha256');
  onProgress({ verified: 0, total: reference.bytes });
  for await (const chunk of createReadStream(path, { highWaterMark: 262144, ...(signal ? { signal } : {}) })) {
    signal?.throwIfAborted(); fileHash.update(chunk);
    let offset = 0;
    while (offset < chunk.length) {
      if (pieceIndex >= reference.pieceHashes.length / 20) throw new HttpError(502, 'O arquivo recebido excede o tamanho oficial. O vídeo não foi liberado na biblioteca.');
      const length = Math.min(reference.pieceLength, reference.bytes - pieceIndex * reference.pieceLength);
      const count = Math.min(length - inPiece, chunk.length - offset);
      hash.update(chunk.subarray(offset, offset + count)); inPiece += count; offset += count;
      if (inPiece === length) {
        const expected = reference.pieceHashes.subarray(pieceIndex * 20, (pieceIndex + 1) * 20);
        if (!hash.digest().equals(expected)) throw new HttpError(502, `A parte ${pieceIndex + 1} do arquivo recebido não coincide com a referência oficial NRK. O vídeo não foi liberado na biblioteca; os dados recebidos foram preservados.`);
        verified += length; pieceIndex++; inPiece = 0; hash = createHash('sha1');
        if (verified === reference.bytes || Date.now() - lastPublished >= 250) {
          onProgress({ verified, total: reference.bytes }); lastPublished = Date.now();
        }
      }
    }
  }
  signal?.throwIfAborted();
  if (verified !== reference.bytes || inPiece) throw new HttpError(502, 'A conferência oficial encontrou um arquivo incompleto. O vídeo não foi liberado na biblioteca.');
  return { bytes: verified, pieces: pieceIndex, fileSha256: fileHash.digest('hex') };
}
