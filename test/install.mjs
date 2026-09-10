import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm, cp, chmod, readdir, readlink, symlink, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { installationPaths, installRelease, uninstall, extractRelease, downloadRelease, parseArguments } from '../scripts/install.mjs';

const base = resolve('.cache/install'); await mkdir(base, { recursive: true });
const home = await mkdtemp(join(base, "managed user space's-"));
const paths = installationPaths(home, join(home, 'data'), join(home, 'cache'));
const command = join(paths.bin, 'omarchy-billboard');
async function fixture(version, work) {
  const source = join(work, 'omarchy-billboard-generator');
  for (const folder of ['bin', 'app', 'scripts']) await mkdir(join(source, folder), { recursive: true });
  const metadata = { name: 'omarchy-billboard-generator', version: version.slice(1), type: 'module' };
  await writeFile(join(source, 'package.json'), JSON.stringify(metadata));
  await writeFile(join(source, 'package-lock.json'), JSON.stringify({ ...metadata, lockfileVersion: 3, packages: { '': metadata } }));
  for (const name of ['omarchy-billboard', 'omarchy-billboard-app']) await writeFile(join(source, 'bin', name), `console.log('Fixture ${version}');\n`);
  await cp('scripts/install.mjs', join(source, 'scripts/install.mjs'));
  await writeFile(join(source, 'app/icon.svg'), '<svg/>');
  return source;
}
const manifest = async () => JSON.parse(await readFile(paths.manifest, 'utf8'));
try {
  assert.deepEqual(parseArguments(['update']), { command: 'update' });
  assert.deepEqual(parseArguments(['update', '--version', 'v1.0.0']), { command: 'update', version: 'v1.0.0' });
  assert.deepEqual(parseArguments(['--version', 'v1.0.0']), { command: 'install', version: 'v1.0.0' });
  for (const args of [['uninstall', 'extra'], ['--version', '../escape'], ['unknown']]) assert.throws(() => parseArguments(args), /Usage/);
  await mkdir(paths.bin, { recursive: true }); await writeFile(command, 'unrelated command');
  await assert.rejects(installRelease(paths, 'v1.0.0', fixture), /unrelated/);
  assert.equal(await readFile(command, 'utf8'), 'unrelated command'); await rm(command);
  await mkdir(paths.applications, { recursive: true }); await chmod(paths.applications, 0o500);
  try {
    await assert.rejects(installRelease(paths, 'v1.0.0', fixture));
    await assert.rejects(access(command), { code: 'ENOENT' });
    await assert.rejects(access(paths.manifest), { code: 'ENOENT' });
  } finally { await chmod(paths.applications, 0o700); }
  await installRelease(paths, 'v1.0.0', fixture);
  assert.match(execFileSync(command, { encoding: 'utf8' }), /Fixture v1.0.0/);
  assert.match(execFileSync(join(paths.bin, 'omarchy-billboard-manage'), ['--help'], { encoding: 'utf8' }), /update/);
  const first = await manifest(), firstTarget = await readlink(join(paths.directory, 'current'));
  await installRelease(paths, 'v1.0.0', async () => { throw Error('Same-version update must not download'); }, true);
  assert.deepEqual(await manifest(), first);
  const backup = join(paths.directory, 'manifest-backup.json');
  try {
    await assert.rejects(installRelease(paths, 'v1.1.0', async (version, work) => {
      const source = await fixture(version, work);
      await rename(paths.manifest, backup); await mkdir(paths.manifest);
      return source;
    }));
    assert.equal(await readlink(join(paths.directory, 'current')), firstTarget);
    assert.match(execFileSync(command, { encoding: 'utf8' }), /Fixture v1.0.0/);
    assert.deepEqual(await readdir(join(paths.directory, 'releases')), first.releases);
  } finally { await rm(paths.manifest, { recursive: true, force: true }); await rename(backup, paths.manifest); }
  const obsolete = join(paths.bin, 'omarchy-billboard-old');
  await writeFile(obsolete, 'old launcher');
  const withObsolete = { ...first, entries: [...first.entries, { path: obsolete, content: 'old launcher', mode: 0o755 }] };
  await writeFile(paths.manifest, JSON.stringify(withObsolete));
  await writeFile(join(paths.directory, 'upstream.json'), 'user data');
  await writeFile(join(home, 'video.mp4'), 'user video');
  await assert.rejects(installRelease(paths, 'v1.1.0', async () => { throw Error('Download failed'); }), /Download failed/);
  assert.deepEqual(await manifest(), withObsolete); assert.equal(await readlink(join(paths.directory, 'current')), firstTarget);
  const originalPath = process.env.PATH;
  const fakeBin = join(home, 'fake-bin'); await mkdir(fakeBin);
  await writeFile(join(fakeBin, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  process.env.PATH = fakeBin;
  try { await assert.rejects(installRelease(paths, 'v1.1.0', fixture)); }
  finally { process.env.PATH = originalPath; }
  assert.deepEqual(await manifest(), withObsolete);
  await installRelease(paths, 'v1.1.0', fixture);
  await assert.rejects(access(obsolete), { code: 'ENOENT' });
  assert.match(execFileSync(command, { encoding: 'utf8' }), /Fixture v1.1.0/);
  assert.equal((await manifest()).releases.length, 2);
  await access(join(paths.directory, firstTarget, 'package.json'));
  await mkdir(join(paths.directory, '.installer-lock'));
  await assert.rejects(installRelease(paths, 'v1.1.0', fixture), /Another installation/);
  await rm(join(paths.directory, '.installer-lock'), { recursive: true });
  await writeFile(command, 'user modification');
  await assert.rejects(installRelease(paths, 'v1.1.0', fixture), /modified/);
  await rm(join(paths.directory, 'current'));
  await symlink(home, join(paths.directory, 'current'));
  await assert.rejects(installRelease(paths, 'v1.1.0', fixture), /Uninstall remains available/);
  await uninstall(paths);
  assert.equal(await readFile(command, 'utf8'), 'user modification');
  assert.equal(await readFile(join(paths.directory, 'upstream.json'), 'utf8'), 'user data');
  assert.equal(await readFile(join(home, 'video.mp4'), 'utf8'), 'user video');
  assert.deepEqual(await readdir(join(paths.directory, 'releases')), []);
  await uninstall(paths);
  const archives = join(home, 'archives'); await mkdir(archives);
  const source = await fixture('v1.0.0', archives);
  const archive = join(home, 'fixture.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', archives, 'omarchy-billboard-generator']);
  const extract = join(home, 'extract'); await mkdir(extract);
  assert.equal(extractRelease(archive, extract), join(extract, 'omarchy-billboard-generator/'));
  const archiveBytes = await readFile(archive), hash = createHash('sha256').update(archiveBytes).digest('hex');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => new Response(url.endsWith('SHA256SUMS') ? `${hash}  omarchy-billboard-generator.tar.gz\n` : archiveBytes);
    assert.equal(await downloadRelease('v1.0.0', extract), join(extract, 'omarchy-billboard-generator/'));
    globalThis.fetch = async url => new Response(url.endsWith('SHA256SUMS') ? `${hash}  omarchy-billboard-generator.tar.gz\n` : 'corrupted');
    await assert.rejects(downloadRelease('v1.0.0', extract), /checksum mismatch/);
  } finally { globalThis.fetch = originalFetch; }
  execFileSync('tar', ['-czf', archive, '--transform=s,^omarchy-billboard-generator,omarchy-billboard-generator/..,', '-C', archives, 'omarchy-billboard-generator']);
  assert.throws(() => extractRelease(archive, extract), /traversal/);
  await symlink('/etc/passwd', join(source, 'unsafe'));
  execFileSync('tar', ['-czf', archive, '-C', archives, 'omarchy-billboard-generator']);
  assert.throws(() => extractRelease(archive, extract), /links or special/);
  console.log('Managed installer tests passed: installation, command quoting, upgrades, rollback, locks, archive validation and safe uninstall.');
} finally { await rm(home, { recursive: true, force: true }); }
