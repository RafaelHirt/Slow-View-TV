import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export async function probeGraphics({ chromiumExecutable, noSandbox = false, gpuMode = 'native' } = {}) {
  if (!['native', 'software'].includes(gpuMode)) throw new Error('CHROMIUM_GPU_MODE deve ser native ou software.');
  if (typeof noSandbox !== 'boolean') throw new Error('noSandbox deve ser uma opção booleana explícita.');
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: chromiumExecutable || process.env.CHROMIUM_EXECUTABLE || chromium.executablePath(),
      headless: true,
      chromiumSandbox: !noSandbox,
      args: ['--disable-dev-shm-usage', ...(gpuMode === 'software'
        ? ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] : [])],
      timeout: 30000,
    });
    const context = await browser.newContext({ offline: true, viewport: { width: 64, height: 64 } });
    // The probe uses local HTML only. Block network requests independently of
    // the offline setting; no remote page, account, model or dataset is needed.
    await context.route('**/*', (route) => route.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><title>Local WebGL2 probe</title></head><body><canvas id="probe" width="16" height="16"></canvas></body></html>');
    const graphics = await page.evaluate(() => {
      const canvas = document.getElementById('probe');
      const gl = canvas.getContext('webgl2');
      if (!gl || gl.isContextLost()) return { webglAvailable: false, renderer: null, vendor: null };
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      const vendor = gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
      return { webglAvailable: true, renderer: typeof renderer === 'string' ? renderer : null, vendor: typeof vendor === 'string' ? vendor : null };
    });
    const identity = [graphics.renderer, graphics.vendor].filter(Boolean).join(' ');
    const software = /swiftshader|llvmpipe|softpipe|lavapipe|swrast|software|basic render driver/i.test(identity);
    const knownHardware = /\b(nvidia|geforce|quadro|tesla|radeon|amd|intel|iris|apple|adreno|mali|powervr|videocore|tegra)\b/i.test(identity);
    // Generic or hidden driver identities are inconclusive. In particular, the
    // requested mode alone must never be reported as observed GPU hardware.
    const softwareRenderer = !graphics.webglAvailable ? null : software ? true : knownHardware ? false : null;
    return {
      ...graphics, softwareRenderer,
      nvidiaRenderer: graphics.webglAvailable && !software && /\bnvidia\b/i.test(identity),
      mode: gpuMode,
      note: 'O encoder atual é libx264 na CPU. Identificar NVIDIA no WebGL não comprova desempenho de renderização nem codificação por GPU.',
    };
  } finally { await browser?.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--require-nvidia')) {
    console.error(JSON.stringify({ error: 'Argumento inválido. Use somente --require-nvidia, quando necessário.' }));
    process.exitCode = 1;
    return;
  }
  try {
    const report = await probeGraphics({
      chromiumExecutable: process.env.CHROMIUM_EXECUTABLE,
      noSandbox: process.env.CHROMIUM_NO_SANDBOX === '1',
      gpuMode: process.env.CHROMIUM_GPU_MODE || 'native',
    });
    console.log(JSON.stringify(report, null, 2));
    if (args.includes('--require-nvidia') && !report.nvidiaRenderer) process.exitCode = 2;
  } catch (error) {
    // Browser launch errors can include a verbose process environment or
    // command transcript. Keep CLI output limited to a safe diagnostic.
    const invalidMode = !['native', 'software'].includes(process.env.CHROMIUM_GPU_MODE || 'native');
    console.error(JSON.stringify({ error: invalidMode
      ? 'CHROMIUM_GPU_MODE deve ser native ou software.'
      : 'Não foi possível verificar o WebGL2 no Chromium. Confira CHROMIUM_EXECUTABLE, as dependências do navegador e o sandbox. O sandbox permanece ativo; CHROMIUM_NO_SANDBOX=1 exige uma decisão explícita para um ambiente isolado.',
      code: invalidMode ? 'invalid_gpu_mode' : 'graphics_probe_failed',
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
