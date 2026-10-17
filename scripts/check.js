/** Revisión de sintaxis de todos los archivos JavaScript (servidor, scripts, interfaz y pruebas). */
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

async function files(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) list.push(...await files(path));
    else if (entry.name.endsWith('.js')) list.push(path);
  }
  return list;
}

let failures = 0;
const paths = (await Promise.all(['src', 'scripts', 'public', 'tests'].map(files))).flat();
for (const path of paths) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures++;
    console.error(result.stderr);
  }
}
console.log(`${paths.length} archivos JavaScript revisados; ${failures} errores de sintaxis.`);
process.exitCode = failures ? 1 : 0;
