import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromiumArgs } from '../server/chromium-options.mjs';

test('software mode stays explicit and native mode enables GPU discovery in headless Chromium', () => {
  const software = buildChromiumArgs();
  const native = buildChromiumArgs({ gpuMode: 'native' });
  assert.ok(software.includes('--use-angle=swiftshader'));
  assert.ok(software.includes('--enable-unsafe-swiftshader'));
  assert.ok(!software.includes('--enable-gpu'));
  assert.ok(native.includes('--enable-gpu'));
  assert.ok(!native.some((argument) => /swiftshader|--use-angle=/.test(argument)));
});

test('Vulkan requests a display-independent ANGLE profile without disabling the browser sandbox', () => {
  const args = buildChromiumArgs({ gpuMode: 'native', gpuBackend: 'vulkan' });
  assert.ok(args.includes('--enable-gpu'));
  assert.ok(args.includes('--use-gl=angle'));
  assert.ok(args.includes('--use-angle=vulkan'));
  assert.ok(args.includes('--enable-features=Vulkan'));
  assert.ok(args.includes('--disable-vulkan-surface'));
  assert.ok(!args.some((argument) => /sandbox|swiftshader|web-security/.test(argument)));
});

test('invalid and contradictory graphics configuration cannot silently fall back to another requested mode', () => {
  for (const options of [
    { gpuMode: 'cuda' }, { gpuMode: '' }, { gpuMode: null },
    { gpuBackend: 'gl-egl' }, { gpuBackend: '--no-sandbox' }, { gpuBackend: null },
    { gpuMode: 'software', gpuBackend: 'vulkan' },
  ]) assert.throws(() => buildChromiumArgs(options), /CHROMIUM_GPU_/);
});
