import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const base = resolve('.cache/install'); await mkdir(base, { recursive: true });
const home = await mkdtemp(join(base, "user space's-"));
const env = { ...process.env, HOME: home, XDG_DATA_HOME: join(home, 'data space') };
const invoke = args => spawnSync(process.execPath, ['scripts/install.mjs', ...args], { env, encoding: 'utf8' });
const command = join(home, '.local/bin/omarchy-billboard');
try {
  await mkdir(join(home, '.local/bin'), { recursive: true }); await writeFile(command, 'unrelated command');
  let result = invoke([]); assert.notEqual(result.status, 0); assert.match(result.stderr, /unrelated/);
  assert.equal(await readFile(command, 'utf8'), 'unrelated command');
  await assert.rejects(access(join(home, '.local/bin/omarchy-billboard-app')));
  await rm(command);
  const applications = join(env.XDG_DATA_HOME, 'applications');
  await mkdir(applications, { recursive: true }); await chmod(applications, 0o500);
  try {
    result = invoke([]); assert.notEqual(result.status, 0);
    await assert.rejects(access(command), { code: 'ENOENT' });
    await assert.rejects(access(join(home, '.local/bin/omarchy-billboard-app')), { code: 'ENOENT' });
  } finally { await chmod(applications, 0o700); }
  result = invoke([]); assert.equal(result.status, 0, result.stderr);
  assert.match(execFileSync(command, ['--help'], { env, encoding: 'utf8' }), /--theme astral/);
  const manifest = JSON.parse(await readFile(join(env.XDG_DATA_HOME, 'omarchy-billboard-generator/installation.json'), 'utf8'));
  assert.equal(manifest.entries.length, 3);
  const desktop = manifest.entries.find(entry => entry.path.endsWith('.desktop'));
  assert.match(await readFile(desktop.path, 'utf8'), /StartupWMClass=chrome-127\.0\.0\.1__omarchy-billboard-Default/);
  assert.equal(invoke([]).status, 0, 'Reinstall should be idempotent.');
  await writeFile(command, 'modified by user');
  result = invoke([]); assert.notEqual(result.status, 0); assert.match(result.stderr, /modified/);
  result = invoke(['--uninstall']); assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(command, 'utf8'), 'modified by user');
  await assert.rejects(access(desktop.path));
  await assert.rejects(access(join(home, '.local/bin/omarchy-billboard-app')));
  assert.equal(invoke(['--uninstall']).status, 0);
  assert.notEqual(invoke(['--invalid']).status, 0);
  console.log('Installer checks passed: isolated user paths, quoting, CLI startup, launcher, reinstall, no-clobber and safe uninstall.');
} finally { await rm(home, { recursive: true, force: true }); }
