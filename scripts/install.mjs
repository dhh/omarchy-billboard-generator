import { readFile, writeFile, mkdir, lstat, unlink, chmod, mkdtemp, rm, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { root } from '../src/runtime-paths.js';

const home = homedir();
const data = resolve(process.env.XDG_DATA_HOME || join(home, '.local/share'));
const bin = join(home, '.local/bin');
const manifest = join(data, 'omarchy-billboard-generator/installation.json');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const desktopQuote = value => '"' + value.replaceAll('\\', '\\\\\\\\').replace(/["`$]/g, c => '\\\\' + c).replaceAll('%', '%%') + '"';

async function text(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > 65536) throw Error(`Not a regular installation file: ${path}`);
    return await readFile(path, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function previousInstall() {
  const content = await text(manifest);
  if (!content) return { root, entries: [] };
  const previous = JSON.parse(content);
  if (previous.root !== root) throw Error('Another checkout is installed. Uninstall it from that checkout first.');
  return previous;
}
function plan() {
  if (/[\r\n]/.test(root + bin + data + process.execPath)) throw Error('Installation paths cannot contain newlines.');
  const entries = ['omarchy-billboard', 'omarchy-billboard-app'].map(name => ({
    path: join(bin, name), mode: 0o755,
    content: `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(root, 'bin', name))} "$@"\n`,
  }));
  const appId = 'chrome-127.0.0.1__omarchy-billboard-Default';
  entries.push({ path: join(data, 'applications', `${appId}.desktop`), mode: 0o644,
    content: `[Desktop Entry]\nVersion=1.0\nType=Application\nName=Omarchy Billboard Generator\nComment=Create animated Omarchy domain videos locally\nExec=${desktopQuote(join(bin, 'omarchy-billboard-app'))}\nIcon=${join(root, 'app/icon.svg')}\nTerminal=false\nCategories=AudioVideo;Video;\nStartupWMClass=${appId}\n`,
  });
  return entries;
}
async function preflight(entries, previous) {
  for (const entry of entries) {
    const existing = await text(entry.path);
    const owned = previous.entries.find(item => item.path === entry.path);
    if (existing !== null && existing !== owned?.content) throw Error(`Refusing to replace an unrelated or modified file: ${entry.path}`);
  }
}
async function install(entries, previous) {
  await preflight(entries, previous);
  await mkdir(dirname(manifest), { recursive: true });
  const changes = [];
  try {
    for (const entry of entries) {
      await mkdir(dirname(entry.path), { recursive: true });
      const existing = await text(entry.path);
      await writeFile(entry.path, entry.content, { mode: entry.mode, flag: existing === null ? 'wx' : 'w' });
      changes.push({ ...entry, existing });
      await chmod(entry.path, entry.mode);
    }
    await saveManifest(entries);
  } catch (error) { await rollback(changes); throw error; }
  console.log(`Installed CLI commands in ${bin} and the Omarchy Billboard Generator app launcher.\nKeep this checkout in place. Run ./install.sh again after updating the checkout or Node.js.\nIf the commands are not found, add ${bin} to PATH. No shell configuration was modified.`);
}
async function saveManifest(entries) {
  const directory = await mkdtemp(join(dirname(manifest), '.install-'));
  const temporary = join(directory, 'installation.json');
  try {
    await writeFile(temporary, JSON.stringify({ root, entries }, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, manifest);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function rollback(changes) {
  for (const entry of changes.reverse()) {
    if (await text(entry.path) !== entry.content) continue;
    if (entry.existing === null) await unlink(entry.path);
    else await writeFile(entry.path, entry.existing);
  }
}
async function uninstall(entries, previous) {
  for (const entry of previous.entries) {
    if (!entries.some(item => item.path === entry.path)) throw Error('Installation locations changed. Restore HOME and XDG_DATA_HOME before uninstalling.');
    if (await text(entry.path) !== entry.content) { console.log(`Keeping missing or modified file: ${entry.path}`); continue; }
    await unlink(entry.path);
  }
  if (await text(manifest) !== null) await unlink(manifest);
  console.log('Uninstalled CLI commands and app launcher. The checkout, caches and exported videos were retained.');
}
function argumentsForInstall() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--uninstall')) throw Error('Usage: node scripts/install.mjs [--uninstall]');
  return args;
}
async function main() {
  const args = argumentsForInstall();
  if (process.getuid?.() === 0) throw Error('Run the installer as your normal user, not root.');
  const entries = plan(), previous = await previousInstall();
  if (args[0] === '--uninstall') await uninstall(entries, previous);
  else await install(entries, previous);
}
try { await main(); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
