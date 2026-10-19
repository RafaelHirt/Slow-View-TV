import { lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Check real I/O as the runtime user. Some network mounts expose fixed owner
// and mode metadata, so chown or access(W_OK) alone cannot establish usability.
export async function checkRunpodDirectories(directories) {
  for (const directory of directories) {
    let temporary;
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('não é um diretório regular');
      temporary = await mkdtemp(join(directory, '.slowview-access-'));
      const initial = join(temporary, 'initial');
      const renamed = join(temporary, 'renamed');
      await writeFile(initial, 'slowview-storage-check', { flag: 'wx', mode: 0o600 });
      await rename(initial, renamed);
      if (await readFile(renamed, 'utf8') !== 'slowview-storage-check') throw new Error('leitura inconsistente');
      await rm(renamed);
    } catch (error) {
      throw new Error(`Sem acesso de leitura/escrita em ${directory}: ${error.code || error.message}`, { cause: error });
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.getuid?.() === 0) throw new Error('Execute a verificação como o usuário slowview, não como root.');
    if (process.argv.length < 3) throw new Error('Informe os diretórios a verificar.');
    await checkRunpodDirectories(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
