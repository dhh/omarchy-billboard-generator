import { readFile, writeFile, mkdir, lstat, unlink, link, mkdtemp, rm, rename, symlink, readlink, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repository = 'llstrk/omarchy-billboard-generator';
const archiveName = 'omarchy-billboard-generator.tar.gz';
const prefix = 'omarchy-billboard-generator/';
const versionPattern = /^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
const releasePattern = /^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?-[a-f0-9]{12}$/;
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const desktopQuote = value => '"' + value.replaceAll('\\', '\\\\\\\\').replace(/["`$]/g, c => '\\\\' + c).replaceAll('%', '%%') + '"';
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

export function installationPaths(home = homedir(), data = process.env.XDG_DATA_HOME, cache = process.env.XDG_CACHE_HOME) {
  const dataHome = data || join(home, '.local/share');
  const directory = resolve(dataHome, 'omarchy-billboard-generator');
  return { directory, bin: join(home, '.local/bin'), applications: resolve(dataHome, 'applications'),
    cache: resolve(cache || join(home, '.cache'), 'omarchy-billboard-generator'), manifest: join(directory, 'installation.json') };
}
async function text(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > 65536) throw Error(`Not a regular installation file: ${path}`);
    return await readFile(path, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function linkTarget(path) {
  try { return await readlink(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function installationPlan(paths) {
  const current = join(paths.directory, 'current');
  if (/[\r\n]/.test(Object.values(paths).join('') + process.execPath)) throw Error('Installation paths cannot contain newlines.');
  const commands = ['omarchy-billboard', 'omarchy-billboard-app'];
  const entries = commands.map(name => ({ path: join(paths.bin, name), mode: 0o755, target: join(current, 'bin', name) }));
  entries.push({ path: join(paths.bin, 'omarchy-billboard-manage'), mode: 0o755, target: join(current, 'scripts/install.mjs') });
  for (const entry of entries) entry.content = launcher(entry.target);
  const appId = 'chrome-127.0.0.1__omarchy-billboard-Default';
  entries.push({ path: join(paths.applications, `${appId}.desktop`), mode: 0o644,
    content: `[Desktop Entry]\nVersion=1.0\nType=Application\nName=Omarchy Billboard Generator\nComment=Create animated Omarchy domain videos locally\nExec=${desktopQuote(join(paths.bin, 'omarchy-billboard-app'))}\nIcon=${join(current, 'app/icon.svg').replaceAll('\\', '\\\\')}\nTerminal=false\nCategories=AudioVideo;Video;\nStartupWMClass=${appId}\n` });
  return entries;
}
function launcher(target) {
  return `#!/bin/sh\nexport NODE_USE_ENV_PROXY="\${NODE_USE_ENV_PROXY:-1}"\nif [ -x ${quote(process.execPath)} ]; then\n  exec ${quote(process.execPath)} ${quote(target)} "$@"\nfi\nexec node ${quote(target)} "$@"\n`;
}
async function previousInstall(paths, entries) {
  const content = await text(paths.manifest);
  if (!content) return { schemaVersion: 2, entries: [], releases: [], current: null };
  const previous = JSON.parse(content);
  if (previous.schemaVersion !== 2) throw Error('An older checkout-based installation exists. Run its ./install.sh --uninstall first; exports are retained.');
  validatePrevious(previous, paths);
  return previous;
}
function validatePrevious(previous, paths) {
  if (!Array.isArray(previous.entries) || !Array.isArray(previous.releases)) throw Error('Invalid installation manifest.');
  validateEntries(previous.entries, paths);
  for (const name of previous.releases) if (!releasePattern.test(name)) throw Error('Invalid registered release directory.');
  if (!previous.releases.includes(previous.current)) throw Error('Invalid current release.');
}
function validateEntries(previous, paths) {
  for (const entry of previous) {
    if (typeof entry.path !== 'string' || typeof entry.content !== 'string') throw Error('Invalid installation entry.');
    if (!ownedLocation(entry.path, paths)) throw Error('Installation locations changed or manifest is invalid.');
  }
}
function ownedLocation(path, paths) {
  if (dirname(path) === paths.bin) return /^omarchy-billboard(?:-[a-z0-9-]+)?$/.test(basename(path));
  return dirname(path) === paths.applications && /^(?:omarchy-billboard|chrome-127\.0\.0\.1_.*omarchy-billboard).*\.desktop$/.test(basename(path));
}
async function preflight(entries, previous) {
  for (const entry of entries) {
    const existing = await text(entry.path), owned = previous.entries.find(item => item.path === entry.path);
    if (existing !== null && existing !== owned?.content) throw Error(`Refusing to replace an unrelated or modified file: ${entry.path}`);
  }
}
async function withLock(paths, operation) {
  await mkdir(paths.directory, { recursive: true });
  const lock = join(paths.directory, '.installer-lock');
  try { await mkdir(lock); }
  catch (error) { if (error.code === 'EEXIST') throw Error(`Another installation may be running. If it was interrupted, inspect and remove ${lock} before retrying.`); throw error; }
  try { return await operation(); } finally { await rm(lock, { recursive: true, force: true }); }
}
async function download(url, limit, timeout = 120000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'omarchy-billboard-installer' } });
  if (!response.ok) throw Error(`Download failed (${response.status}): ${url}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error('Release download exceeds the size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function releaseVersion(requested) {
  if (requested) return requested;
  const release = JSON.parse(await download(`https://api.github.com/repos/${repository}/releases/latest`, 1048576));
  if (!versionPattern.test(release.tag_name)) throw Error('Latest release has an unsupported version tag.');
  return release.tag_name;
}
export async function downloadRelease(version, work) {
  const base = `https://github.com/${repository}/releases/download/${version}`;
  const sums = (await download(`${base}/SHA256SUMS`, 16384)).toString('utf8');
  const checksum = sums.split('\n').find(line => line.endsWith(`  ${archiveName}`))?.split(' ')[0];
  if (!/^[a-f0-9]{64}$/.test(checksum || '')) throw Error('Missing release archive checksum.');
  const bytes = await download(`${base}/${archiveName}`, 100 * 1024 * 1024, 600000);
  if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw Error('Release checksum mismatch. Nothing was installed.');
  const archive = join(work, archiveName); await writeFile(archive, bytes);
  return extractRelease(archive, work);
}
export function extractRelease(archive, work) {
  const names = run('tar', ['-tzf', archive], { encoding: 'utf8', stdio: 'pipe', maxBuffer: 1048576 }).trim().split('\n');
  for (const name of names) validateArchiveName(name);
  const details = run('tar', ['-tvzf', archive], { encoding: 'utf8', stdio: 'pipe', maxBuffer: 1048576 }).trim().split('\n');
  let size = 0;
  for (const line of details) size += archiveEntrySize(line);
  if (size > 256 * 1024 * 1024) throw Error('Expanded release exceeds the size limit.');
  run('tar', ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', work]);
  return join(work, prefix);
}
function validateArchiveName(name) {
  if (!name.startsWith(prefix) || !/^[a-zA-Z0-9._/-]+$/.test(name)) throw Error('Unsafe release archive path.');
  if (name.split('/').includes('..')) throw Error('Unsafe release archive traversal.');
}
function archiveEntrySize(line) {
  if (!/^[-d]/.test(line)) throw Error('Release archives must not contain links or special files.');
  const size = Number(line.trim().split(/\s+/)[2]);
  if (!Number.isSafeInteger(size) || size < 0) throw Error('Invalid archive entry size.');
  return size;
}
async function stageRelease(paths, version, acquire) {
  const releases = join(paths.directory, 'releases'); await mkdir(releases, { recursive: true });
  const name = `${version}-${randomBytes(6).toString('hex')}`, destination = join(releases, name);
  const work = await mkdtemp(join(releases, '.download-'));
  try {
    const source = await acquire(version, work);
    const metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    if (`v${metadata.version}` !== version || metadata.name !== 'omarchy-billboard-generator') throw Error('Release package identity mismatch.');
    run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--cache', join(paths.cache, 'npm')], { cwd: source });
    run(process.execPath, [join(source, 'bin/omarchy-billboard'), '--help'], { stdio: 'pipe' });
    await rename(source, destination);
    return name;
  } finally { await cleanupTemporary(work); }
}
async function switchCurrent(paths, target) {
  const temporary = join(paths.directory, `.current-${randomBytes(6).toString('hex')}`);
  try { await symlink(target, temporary); await rename(temporary, join(paths.directory, 'current')); }
  finally { await cleanupTemporary(temporary); }
}
async function cleanupTemporary(path) {
  try { await rm(path, { recursive: true, force: true }); }
  catch (error) { console.warn(`Could not remove installer temporary path ${path}: ${error.message}`); }
}
async function saveManifest(paths, state) {
  const directory = await mkdtemp(join(paths.directory, '.install-'));
  try {
    const temporary = join(directory, 'installation.json');
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, paths.manifest);
  } finally { await cleanupTemporary(directory); }
}
async function atomicEntry(path, content, mode, exclusive = false) {
  const directory = await mkdtemp(join(dirname(path), '.billboard-entry-'));
  try {
    const temporary = join(directory, 'entry');
    await writeFile(temporary, content, { mode });
    if (exclusive) await link(temporary, path); else await rename(temporary, path);
  } finally { await cleanupTemporary(directory); }
}
async function writeEntries(entries, changes, previous) {
  for (const entry of entries) {
    await mkdir(dirname(entry.path), { recursive: true });
    const existing = await text(entry.path);
    const owned = previous.entries.find(item => item.path === entry.path);
    if (existing !== null && existing !== owned?.content) throw Error(`Refusing to replace a file changed during installation: ${entry.path}`);
    await atomicEntry(entry.path, entry.content, entry.mode, existing === null);
    changes.push({ ...entry, existing });
  }
}
async function rollback(paths, changes, previousTarget) {
  for (const entry of changes.reverse()) {
    if (await text(entry.path) !== entry.content) continue;
    if (entry.existing === null) await unlink(entry.path); else await atomicEntry(entry.path, entry.existing, entry.mode);
  }
  if (previousTarget) await switchCurrent(paths, previousTarget);
  else await rm(join(paths.directory, 'current'), { force: true });
}
async function retireEntries(entries, previous, changes) {
  for (const old of previous.entries) {
    if (entries.some(entry => entry.path === old.path)) continue;
    if (await text(old.path) !== old.content) continue;
    await unlink(old.path);
    changes.push({ ...old, mode: old.mode || 0o755, existing: old.content, content: null });
  }
}
async function activate(paths, entries, previous, name, version) {
  const changes = [], oldTarget = await linkTarget(join(paths.directory, 'current'));
  const expected = previous.current ? `releases/${previous.current}` : null;
  if (oldTarget !== expected) throw Error(currentRecovery(expected));
  try {
    await writeEntries(entries, changes, previous);
    await retireEntries(entries, previous, changes);
    await switchCurrent(paths, `releases/${name}`);
    await saveManifest(paths, { schemaVersion: 2, entries, releases: [...previous.releases, name], current: name, version });
  } catch (error) { await rollback(paths, changes, oldTarget); throw error; }
}
async function checkedPrevious(paths, entries) {
  const previous = await previousInstall(paths, entries);
  const expected = previous.current ? `releases/${previous.current}` : null;
  if (await linkTarget(join(paths.directory, 'current')) !== expected) throw Error(currentRecovery(expected));
  return previous;
}
function currentRecovery(expected) {
  const action = expected ? `Restore current to point to ${expected}` : 'Remove the unexpected current link';
  return `Current installation link differs from its manifest, possibly after an interrupted update. Close the app and ${action.toLowerCase()} before retrying. Uninstall remains available.`;
}
export async function installRelease(paths, version, acquire = downloadRelease, skipCurrent = false) {
  if (!versionPattern.test(version)) throw Error('Use a release version such as v0.1.0.');
  return withLock(paths, async () => {
    const entries = installationPlan(paths), previous = await checkedPrevious(paths, entries);
    await preflight(entries, previous);
    if (skipCurrent && previous.version === version) { console.log(`Already on ${version}.`); return; }
    const name = await stageRelease(paths, version, acquire);
    try { await activate(paths, entries, previous, name, version); }
    catch (error) { await rm(join(paths.directory, 'releases', name), { recursive: true, force: true }); throw error; }
    console.log(`Installed ${version}. Launch Omarchy Billboard Generator or run omarchy-billboard-app.\nCommands: ${paths.bin}\nUpdate: omarchy-billboard-manage update\nUninstall: omarchy-billboard-manage uninstall\nNo checkout is required. Add the command directory to PATH if your shell does not already include it.`);
  });
}
export async function uninstall(paths) {
  return withLock(paths, async () => {
    const previous = await previousInstall(paths, installationPlan(paths));
    for (const entry of previous.entries) {
      if (await text(entry.path) === entry.content) await unlink(entry.path);
      else console.log(`Keeping missing or modified file: ${entry.path}`);
    }
    await removeCurrentLink(paths);
    for (const name of previous.releases) await rm(join(paths.directory, 'releases', name), { recursive: true, force: true });
    await rm(paths.manifest, { force: true });
    console.log('Uninstalled the application and owned launchers. Exported videos, user data and caches were retained.');
  });
}
async function removeCurrentLink(paths) {
  const path = join(paths.directory, 'current');
  try {
    if ((await lstat(path)).isSymbolicLink()) await unlink(path);
    else console.log(`Keeping modified non-link path: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function parseArguments(args) {
  const command = args[0] || 'install';
  if (['--help', '-h'].includes(command)) return { command: 'help' };
  if (['uninstall', '--uninstall'].includes(command) && args.length === 1) return { command: 'uninstall' };
  return installArguments(command, args);
}
function installArguments(command, args) {
  const named = ['install', 'update'].includes(command);
  return { ...parseVersionArguments(named ? args.slice(1) : args), command: named ? command : 'install' };
}
function parseVersionArguments(remaining) {
  if (!remaining.length) return { command: 'install' };
  if (remaining.length === 2 && remaining[0] === '--version' && versionPattern.test(remaining[1])) return { command: 'install', version: remaining[1] };
  throw Error('Usage: installer [install|update|uninstall] [--version vX.Y.Z]');
}
function dependencies() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer is required.');
  for (const name of ['npm', 'tar', 'chromium', 'ffmpeg', 'ffprobe']) {
    try { run(name, ['--version'], { stdio: 'pipe' }); }
    catch { if (['ffmpeg', 'ffprobe'].includes(name)) { run(name, ['-version'], { stdio: 'pipe' }); continue; } throw Error(`Missing ${name}. On Omarchy: omarchy pkg add nodejs npm curl tar chromium ffmpeg`); }
  }
}
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === 'help') { console.log('Usage: installer [install|update|uninstall] [--version vX.Y.Z]\nInstalls a verified release in your user data directory. Close the app before updating or uninstalling.'); return; }
  if (process.getuid?.() === 0) throw Error('Run the installer as your normal user, not root.');
  if (options.command === 'uninstall') return uninstall(installationPaths());
  dependencies();
  await installRelease(installationPaths(), await releaseVersion(options.version), downloadRelease, options.command === 'update' && !options.version);
}
async function isEntryPoint() {
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === await realpath(process.argv[1]); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
if (await isEntryPoint()) {
  try { await main(); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
}
