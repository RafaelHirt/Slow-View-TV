// Headless Chromium needs --enable-gpu to stop forcing software rendering.
// On Linux without X11, an explicit ANGLE Vulkan backend can use the GPU:
// https://github.com/chromium/chromium/blob/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md
// The Vulkan feature/surface options follow the NVIDIA recipe linked there.
// Requested options are not proof that Chromium selected physical hardware.
export function buildChromiumArgs({ gpuMode = 'software', gpuBackend = 'auto' } = {}) {
  if (!['software', 'native'].includes(gpuMode)) throw new Error('CHROMIUM_GPU_MODE deve ser software ou native.');
  if (!['auto', 'vulkan'].includes(gpuBackend)) throw new Error('CHROMIUM_GPU_BACKEND deve ser auto ou vulkan.');
  if (gpuMode === 'software' && gpuBackend !== 'auto') {
    throw new Error('CHROMIUM_GPU_BACKEND=vulkan exige CHROMIUM_GPU_MODE=native.');
  }

  const args = ['--disable-dev-shm-usage'];
  if (gpuMode === 'software') return [...args, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
  args.push('--enable-gpu');
  if (gpuBackend === 'vulkan') {
    args.push('--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface');
  }
  return args;
}
