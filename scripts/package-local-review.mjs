import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || join(root, 'artifacts', 'avaliacao-local'));
const source = await readFile(join(root, 'scripts', 'local-review.ps1'), 'utf8');
const code = source.replace(/^\s*param\([\s\S]*?\);\s*/, '').trim().split(/\r?\n/).map(line => line.trim()).join(' ');
const defaults = '$InputPath = $null; $FFmpegPath = $null; $Start = 600.0; $Duration = 45.0; $NoOpen = $false; ';
// Literal -Command avoids requiring an unsigned .ps1 to run on the user's PC.
if (/["%\r\n]/.test(code) || code.includes('#')) throw new Error('Launcher needs CMD-safe literal PowerShell.');
const command = `powershell.exe -NoLogo -NoProfile -STA -Command "& { ${defaults}${code} }"`;
if (command.length > 7800) throw new Error('Launcher exceeds the CMD command-line limit.');
await mkdir(output, { recursive: true });
await writeFile(join(output, '1-separar-trecho.cmd'), [
  '@echo off', 'setlocal DisableDelayedExpansion', 'title Slow View TV - Avaliacao do original',
  command, 'set "result=%errorlevel%"', 'echo.',
  'echo Pode fechar esta janela depois de conferir a mensagem acima.', 'pause', 'exit /b %result%', '',
].join('\r\n'), 'ascii');
await writeFile(join(output, 'local-review.ps1'), '\uFEFF' + source);
await writeFile(join(output, 'LEIA-ME.txt'), await readFile(join(root, 'docs', 'local-review.md')));
console.log(output);
