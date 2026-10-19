import { spawn } from 'node:child_process';
import { HttpError } from './validation.mjs';

export const FOOTAGE_FORMATS = Object.freeze({ '720p': [1280, 720], '1080p': [1920, 1080], '2160p': [3840, 2160] });
export const FOOTAGE_LICENSES = ['own', 'cc0', 'pexels', 'pixabay', 'permission'];

export function mediaText(value, name, max = 240, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${name}: preencha até ${max} caracteres.`);
  return value.trim();
}

export function publicPage(value, optional = false) {
  if (optional && !value) return '';
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Informe um endereço HTTPS válido para a fonte.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) throw new HttpError(400, 'A fonte deve ser um endereço HTTPS sem credenciais.');
  return url.href;
}

export function validateMediaMetadata(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Informe os dados do material.');
  if (!FOOTAGE_LICENSES.includes(body.license)) throw new HttpError(400, 'Escolha a origem e a licença do material.');
  if (typeof body.rightsConfirmed !== 'boolean') throw new HttpError(400, 'Confirme se a licença já foi conferida.');
  return {
    title: mediaText(body.title, 'Nome'), license: body.license,
    sourceUrl: publicPage(body.sourceUrl, body.license === 'own'),
    attribution: mediaText(body.attribution, 'Autor e créditos', 1000, true),
    licenseNotes: mediaText(body.licenseNotes, 'Observações da licença', 2000, true),
    rightsConfirmed: body.rightsConfirmed,
  };
}

function runCapture(binary, args, { timeout = 20000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '', stderr = '', failed = false;
    const timer = setTimeout(() => { failed = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 512000) { failed = true; child.kill('SIGKILL'); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 && !failed ? resolve({ stdout, stderr }) : reject(new Error('O utilitário de mídia não conseguiu processar o arquivo.')); });
  });
}

export function looksLikeMedia(bytes) {
  return bytes.length >= 12 && (bytes.toString('ascii', 4, 8) === 'ftyp'
    || bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    || (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE')
    || bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

export async function probeMedia(path, { ffprobe = process.env.FFPROBE_EXECUTABLE || 'ffprobe', signal } = {}) {
  let raw;
  try { raw = JSON.parse((await runCapture(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', path], { signal })).stdout); }
  catch { throw new HttpError(400, 'Não foi possível ler o arquivo. Use MP4, WebM, MP3 ou WAV válido.'); }
  if (!/\b(mov|mp4|matroska|webm|mp3|wav)\b/.test(raw.format?.format_name || '')) throw new HttpError(400, 'Este formato ainda não é suportado. Use MP4, WebM, MP3 ou WAV.');
  const video = raw.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const audio = raw.streams?.find(stream => stream.codec_type === 'audio');
  const duration = Number(raw.format?.duration || video?.duration || audio?.duration);
  if ((!video && !audio) || !Number.isFinite(duration) || duration < 1 || duration > 43200) throw new HttpError(400, 'O material deve ter duração conhecida entre 1 segundo e 12 horas.');
  if (video && (!Number.isFinite(video.width) || !Number.isFinite(video.height) || video.width > 8192 || video.height > 8192)) throw new HttpError(400, 'As dimensões do vídeo excedem o limite desta edição.');
  if (video && ['smpte2084', 'arib-std-b67'].includes(video.color_transfer)) throw new HttpError(400, 'Este arquivo é HDR. Prepare uma versão SDR para manter as cores nesta edição.');
  const [rateNumerator, rateDenominator = '1'] = String(video?.avg_frame_rate || '0/1').split('/');
  const rate = Number(rateNumerator) / Number(rateDenominator);
  return { kind: video ? 'video' : 'audio', duration, width: video?.width || 0, height: video?.height || 0,
    frameRate: Number.isFinite(rate) && rate > 0 ? rate : 0, hasAudio: Boolean(audio) };
}

export function validateFootageEdit(body, video, ambient) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Informe a edição.');
  if (!video || video.status !== 'ready' || video.kind !== 'video') throw new HttpError(400, 'Escolha uma filmagem pronta na biblioteca.');
  if (!video.rightsConfirmed) throw new HttpError(400, 'Confira a licença da filmagem antes de exportar.');
  const start = body.start, end = body.end;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > video.duration + 0.01 || end - start < 3 || end - start > 3600) throw new HttpError(400, 'Escolha um trecho válido de 3 segundos a 1 hora, dentro da filmagem.');
  const dimensions = FOOTAGE_FORMATS[body.resolution];
  if (!dimensions) throw new HttpError(400, 'Escolha 720p, 1080p ou 2160p.');
  if (Math.min(dimensions[0] / video.width, dimensions[1] / video.height) > 1.001) throw new HttpError(400, 'A filmagem é menor que a resolução escolhida. Use uma resolução menor para preservar a imagem.');
  if (!['original', 'ambient', 'silent'].includes(body.audioMode)) throw new HttpError(400, 'Escolha o áudio original, uma faixa ambiente ou silêncio.');
  if (body.audioMode === 'ambient' && (!ambient || ambient.status !== 'ready' || !ambient.hasAudio || !ambient.rightsConfirmed)) throw new HttpError(400, 'Escolha uma faixa de áudio pronta e com licença conferida.');
  const duration = Math.round((end - start) * 1000) / 1000;
  return { title: mediaText(body.title, 'Nome da edição'), assetId: video.id, ambientId: body.audioMode === 'ambient' ? ambient.id : null,
    start, end, duration, resolution: body.resolution, width: dimensions[0], height: dimensions[1], audioMode: body.audioMode,
    frameRate: video.frameRate || 0, hasAudio: body.audioMode === 'ambient' || (body.audioMode === 'original' && video.hasAudio) };
}

export async function editFootage({ edit, videoPath, ambientPath, outputPath, signal, onProgress = () => {}, ffmpeg = process.env.FFMPEG_EXECUTABLE || 'ffmpeg' }) {
  signal?.throwIfAborted();
  const fade = Math.min(1.5, edit.duration / 3), fadeOut = Math.max(0, edit.duration - fade);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-filter_threads', '2', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-ss', String(edit.start), '-t', String(edit.duration), '-i', videoPath];
  if (edit.audioMode === 'ambient') args.push('-stream_loop', '-1', '-protocol_whitelist', 'file,pipe', '-i', ambientPath);
  // Keep source timestamps, including 25/50 fps and variable frame rates. Forcing
  // every journey to 30 fps duplicates/drops frames and changes the movement.
  args.push('-map', '0:v:0', '-vf', `scale=${edit.width}:${edit.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${edit.width}:${edit.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fade=t=in:st=0:d=${fade},fade=t=out:st=${fadeOut}:d=${fade}`, '-fps_mode', 'passthrough');
  if (edit.hasAudio) args.push('-map', edit.audioMode === 'ambient' ? '1:a:0' : '0:a:0', '-af', `loudnorm=I=-22:TP=-2:LRA=7:linear=false,aresample=48000,afade=t=in:st=0:d=${fade},afade=t=out:st=${fadeOut}:d=${fade}`, '-c:a', 'aac', '-b:a', '160k', '-ac', '2');
  else args.push('-an');
  args.push('-t', String(edit.duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', outputPath);
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let buffered = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), Math.min(21600000, Math.max(180000, edit.duration * 6000)));
    child.stdout.on('data', chunk => {
      buffered += chunk;
      const lines = buffered.split('\n'); buffered = lines.pop() || '';
      for (const line of lines) if (line.startsWith('out_time_us=')) { const seconds = Number(line.slice(12)) / 1e6; if (Number.isFinite(seconds)) onProgress(Math.max(0, Math.min(.99, seconds / edit.duration))); }
    });
    // Drain diagnostics without returning source paths or credentials in errors.
    child.stderr.resume();
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); if (signal?.aborted) reject(new Error('Edição cancelada.')); else code === 0 ? resolve() : reject(new Error('Não foi possível editar o vídeo. Confira o arquivo e a instalação do FFmpeg.')); });
  });
}
