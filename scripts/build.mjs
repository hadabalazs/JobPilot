/** Validate the static app and package a Netlify manual-deploy ZIP. No npm dependencies. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../app/config.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'dist'));
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'jobpilot-build-'));
const runtime = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', '_headers', 'sw.js', 'app', 'vendor', 'tests/fixtures/cv_master.sample.json'];
for (const item of runtime) {
  await fs.mkdir(path.dirname(path.join(stage, item)), { recursive: true });
  await fs.cp(path.join(root, item), path.join(stage, item), { recursive: true });
}
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
const files = await walk(stage);
for (const file of files.filter(f => f.endsWith('.js'))) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status) throw new Error(syntax.stderr);
  const text = await fs.readFile(file, 'utf8');
  for (const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) await fs.access(path.resolve(path.dirname(file), match[1]));
  }
  if (/sk-proj-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}/.test(text)) throw new Error('Possible secret in release file: ' + path.relative(stage, file));
}
const sw = await fs.readFile(path.join(stage, 'sw.js'), 'utf8');
const shell = vm.runInNewContext(sw + '\nSHELL', { self: { addEventListener() {} } });
for (const item of shell) await fs.access(path.join(stage, item));
if (!sw.includes('jobpilot-v' + APP_VERSION)) throw new Error('Service worker version mismatch');
await fs.mkdir(output, { recursive: true });
const archive = path.join(output, `jobpilot-dist-v${APP_VERSION}.zip`);
try { await fs.access(archive); throw new Error('Release already exists; use a new version or output directory.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const zip = spawnSync('zip', ['-qr', archive, ...runtime], { cwd: stage, encoding: 'utf8' });
if (zip.status) throw new Error(zip.stderr);
const check = spawnSync('unzip', ['-t', archive], { encoding: 'utf8' });
if (check.status) throw new Error(check.stdout);
await fs.cp(stage,path.join(output,'site'),{recursive:true});
console.log(`Validated ${files.length} runtime files and ${shell.length} offline assets.\nRelease: ${archive}\nStatic staging directory: ${stage}`);
