import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkRunpodDirectories } from '../scripts/runpod-storage-check.mjs';

test('volume preflight preserves existing files and permissions and leaves no probe files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'slowview-access-'));
  const directories = ['repo', 'data', 'browser', 'cache'].map(name => join(root, name));
  try {
    for (const directory of directories) {
      await mkdir(directory);
      await chmod(directory, 0o777);
      await writeFile(join(directory, 'existing'), 'preserve');
    }
    await checkRunpodDirectories(directories);
    for (const directory of directories) {
      assert.deepEqual(await readdir(directory), ['existing']);
      assert.equal(await readFile(join(directory, 'existing'), 'utf8'), 'preserve');
      assert.equal((await lstat(directory)).mode & 0o777, 0o777);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('volume preflight rejects a symlink without writing to its target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'slowview-access-'));
  const target = join(root, 'target');
  const link = join(root, 'link');
  try {
    await mkdir(target);
    await symlink(target, link);
    await assert.rejects(checkRunpodDirectories([link]), /não é um diretório regular/);
    assert.deepEqual(await readdir(target), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('volume preflight fails when the runtime user cannot write', { skip: process.getuid?.() === 0 ? 'requires an unprivileged runtime user' : false }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'slowview-access-'));
  try {
    await chmod(root, 0o500);
    await assert.rejects(checkRunpodDirectories([root]), /EACCES/);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await chmod(root, 0o700);
    await rm(root, { recursive: true, force: true });
  }
});
