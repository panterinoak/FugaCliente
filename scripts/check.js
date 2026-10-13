import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
async function files(dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name); if (e.isDirectory()) list.push(...await files(path)); else if (e.name.endsWith('.js')) list.push(path);
  }
  return list;
}
let failures = 0; const paths = (await Promise.all(['src', 'scripts', 'public', 'tests'].map(files))).flat();
for (const path of paths) { const r = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' }); if (r.status !== 0) { failures++; console.error(r.stderr); } }
console.log(`${paths.length} archivos JavaScript revisados; ${failures} errores de sintaxis.`); process.exitCode = failures ? 1 : 0;
