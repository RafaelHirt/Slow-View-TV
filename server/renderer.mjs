import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { VIDEO_FORMATS } from './validation.mjs';
import { buildChromiumArgs } from './chromium-options.mjs';

function ensureNotAborted(signal) {
  if (signal.aborted) throw new Error('Renderização cancelada.');
}

function bounded(promise, milliseconds, description) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(description)), milliseconds); }),
  ]).finally(() => clearTimeout(timeout));
}

export async function renderVideo({ job, journeySeconds = job.outputSeconds, outputPath, appOrigin, workerToken, signal, onProgress, chromiumExecutable, noSandbox = false, gpuMode = 'software', gpuBackend = 'auto' }) {
  const format = VIDEO_FORMATS[job.resolution ?? '720p'];
  if (!format || (job.width !== undefined && job.width !== format.width) || (job.height !== undefined && job.height !== format.height) || (job.fps !== undefined && job.fps !== format.fps)) {
    throw new Error('As dimensões da exportação não correspondem à resolução selecionada.');
  }
  const browserArgs = buildChromiumArgs({ gpuMode, gpuBackend });
  const { width, height, fps } = format;
  const origin = new URL(appOrigin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || !['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('APP_ORIGIN deve apontar para o aplicativo nesta máquina (localhost).');
  }
  ensureNotAborted(signal);
  let browser, encoder;
  let stderr = '';
  const abort = () => {
    encoder?.kill('SIGTERM');
    browser?.close().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    browser = await chromium.launch({
      executablePath: chromiumExecutable || process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
      headless: true,
      chromiumSandbox: !noSandbox,
      // Share graphics options with the standalone GPU probe.
      // Requesting native hardware does not establish its actual availability.
      args: browserArgs,
    });
    ensureNotAborted(signal);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    // Send the internal credential only to this local application, never to third-party hosts.
    await context.route('**/*', async (request) => {
      const target = new URL(request.request().url());
      if (target.protocol === 'data:' || target.protocol === 'blob:') return request.continue();
      if (target.origin !== origin.origin) return request.abort('blockedbyclient');
      return request.continue({ headers: { ...request.request().headers(), 'x-slowvista-worker': workerToken } });
    });
    const page = await context.newPage();
    await page.goto(new URL(`/render?job=${encodeURIComponent(job.id)}`, origin).href, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.slowvistaRenderer?.ready === true, undefined, { timeout: 60000 });
    const stage = page.locator('#render-stage');
    await stage.waitFor({ state: 'visible', timeout: 10000 });
    const bounds = await stage.boundingBox();
    if (!bounds || Math.round(bounds.width) !== width || Math.round(bounds.height) !== height) throw new Error(`A cena de exportação deve medir ${width} × ${height} pixels.`);
    const canvasSize = await stage.locator('canvas').first().evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
    if (canvasSize.width !== width || canvasSize.height !== height) throw new Error(`O cenário precisa ser renderizado nativamente em ${width} × ${height} pixels; ampliar um canvas menor não é permitido.`);
    ensureNotAborted(signal);
    encoder = spawn(process.env.FFMPEG_EXECUTABLE || 'ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png',
      '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264',
      '-preset', 'veryfast', '-crf', '22', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', outputPath,
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    const exitResult = new Promise((resolve) => {
      encoder.once('error', (error) => resolve({ code: -1, error }));
      encoder.once('close', (code) => resolve({ code }));
    });
    encoder.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-3000); });
    // Callback errors below handle broken pipes; keep the stream's error event handled too.
    encoder.stdin.on('error', () => {});
    const frameCount = Math.ceil(job.outputSeconds * fps);
    let lastReported = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      ensureNotAborted(signal);
      const progress = frameCount <= 1 ? 0 : Math.min(1, frame / (frameCount - 1) * job.outputSeconds / journeySeconds);
      await bounded(page.evaluate((p) => window.slowvistaRenderer.setProgress(p), progress), 30000, 'A cena parou de responder durante a exportação.');
      const screenshot = await stage.screenshot({ type: 'png', animations: 'disabled', timeout: 30000 });
      ensureNotAborted(signal);
      await new Promise((resolve, reject) => encoder.stdin.write(screenshot, (error) => error ? reject(error) : resolve()));
      const now = Date.now();
      if (now - lastReported > 700 || frame + 1 === frameCount) {
        onProgress(Math.min(0.99, (frame + 1) / frameCount));
        lastReported = now;
      }
    }
    encoder.stdin.end();
    const result = await bounded(exitResult, 120000, 'O FFmpeg demorou demais para finalizar o vídeo.');
    ensureNotAborted(signal);
    if (result.error) throw new Error(`Não foi possível executar o FFmpeg: ${result.error.message}`);
    if (result.code !== 0) throw new Error(`O FFmpeg não conseguiu criar o MP4. ${stderr}`);
  } finally {
    signal.removeEventListener('abort', abort);
    if (encoder && encoder.exitCode === null) {
      encoder.kill('SIGTERM');
      await Promise.race([once(encoder, 'close').catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
      if (encoder.exitCode === null) encoder.kill('SIGKILL');
    }
    await browser?.close().catch(() => {});
  }
}
