import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { installationPaths, installRelease, extractRelease } from '../scripts/install.mjs';

const base = resolve('.cache/release-install-tests'); await mkdir(base, { recursive: true });
const work = await mkdtemp(join(base, 'release-')), home = join(work, "user space's-home");
const paths = installationPaths(home, join(home, 'data'), join(home, 'cache'));
const original = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME };
const env = { ...process.env, HOME: home, XDG_DATA_HOME: join(home, 'data'), XDG_CACHE_HOME: join(home, 'cache') };
delete env.BILLBOARD_DATA_DIR; delete env.BILLBOARD_CACHE_DIR;
let app, closed;
try {
  const archive = join(work, 'release.tar.gz');
  execFileSync('git', ['archive', '--format=tar.gz', '--prefix=omarchy-billboard-generator/', `--output=${archive}`, 'HEAD']);
  const metadata = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json']));
  Object.assign(process.env, { HOME: home, XDG_DATA_HOME: env.XDG_DATA_HOME, XDG_CACHE_HOME: env.XDG_CACHE_HOME });
  await installRelease(paths, `v${metadata.version}`, async (_version, destination) => extractRelease(archive, destination));
  const cli = join(paths.bin, 'omarchy-billboard'), manager = join(paths.bin, 'omarchy-billboard-manage');
  assert.match(execFileSync(manager, ['--help'], { env, encoding: 'utf8' }), /update/);
  const output = join(home, 'default.mp4');
  execFileSync(cli, ['--resolution', '320x96', '--output', output], { env, timeout: 90000, stdio: 'pipe' });
  const probe = JSON.parse(execFileSync(process.env.BILLBOARD_FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', output]));
  const settings = JSON.parse(probe.format.tags.comment);
  assert.equal(settings.theme, 'astral'); assert.equal(settings.animation, 'laseretch-campaign');
  execFileSync(process.env.BILLBOARD_FFMPEG || 'ffmpeg', ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], { timeout: 30000 });
  app = spawn(join(paths.bin, 'omarchy-billboard-app'), ['--no-window'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  closed = new Promise(resolve => app.once('close', resolve));
  let stdout = '', stderr = ''; app.stdout.on('data', bytes => { stdout += bytes; }); app.stderr.on('data', bytes => { stderr += bytes; });
  for (let i = 0; i < 100 && !stdout.includes('Local app:'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(stdout.includes('Local app:'), `Installed app did not start: ${stderr}`);
  app.kill('SIGTERM'); assert.equal(await closed, 0, stderr); app = null;
  execFileSync(manager, ['uninstall'], { env, encoding: 'utf8' });
  await access(output); await assert.rejects(access(cli), { code: 'ENOENT' });
  assert.ok((await readFile(output)).length > 0);
  console.log('Committed release archive installed without a checkout, rendered and decoded Astral/campaign defaults, started the app, and uninstalled while preserving the video.');
} finally {
  if (app) { app.kill('SIGTERM'); await closed; }
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(work, { recursive: true, force: true });
}
