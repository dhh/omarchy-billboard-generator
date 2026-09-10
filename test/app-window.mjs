// Optional real-window smoke test. This briefly opens and closes the app on Hyprland.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from '../src/render.js';

if (!process.env.WAYLAND_DISPLAY) throw Error('Run this optional test inside an Omarchy/Hyprland graphical session.');
const windows = () => JSON.parse(execFileSync('hyprctl', ['-j', 'clients'], { encoding: 'utf8' }));
const before = new Set(windows().map(c => c.address));
const cache = join(root, '.cache'); await mkdir(join(cache, 'app-ui'), { recursive: true });
const temporary = process.env.BILLBOARD_TEST_TMPDIR || cache; await mkdir(temporary, { recursive: true });
const oldDirectories = new Set(await readdir(temporary));
const child = spawn(process.execPath, ['bin/omarchy-billboard-app'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: temporary, HOME: join(root, '.cache/test-home'), XDG_CONFIG_HOME: join(root, '.cache/test-home/config') } });
let stderr = '', stdout = ''; child.stderr.on('data', data => { stderr += data; });
const exit = new Promise(resolve => child.on('close', resolve));
const timer = setTimeout(() => child.kill('SIGTERM'), 25000);
try {
  const url = await new Promise((resolve, reject) => {
    child.on('error', reject); child.once('close', () => reject(Error(stderr || 'App exited early.')));
    child.stdout.on('data', data => { stdout += data; const match = stdout.match(/Local app: (http:\/\/\S+)/); if (match) resolve(match[1]); });
  });
  let found;
  for (let i = 0; i < 80; i++) {
    found = windows().find(c => !before.has(c.address) && c.title.includes('Omarchy Billboard Generator'));
    if (found) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(found, `Standalone app window did not appear. ${stderr}`);
  assert.equal(found.class, 'chrome-127.0.0.1__omarchy-billboard-Default');
  const sighup = process.argv.includes('--sighup');
  if (sighup) child.kill('SIGHUP');
  else {
  const origin = new URL(url).origin;
  const response = await fetch(url, { redirect: 'manual' }), cookie = response.headers.get('set-cookie').split(';')[0];
  const catalog = await (await fetch(origin + '/api/catalog', { headers: { Cookie: cookie } })).json();
  await fetch(origin + '/api/shutdown', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Billboard-Token': catalog.token, 'Content-Type': 'application/json' }, body: '{}' });
  }
  assert.equal(await exit, 0, stderr);
  const leftover = (await readdir(temporary)).filter(name => !oldDirectories.has(name) && (/^a[A-Za-z0-9]{6}$/.test(name) || /^\.?org\.chromium\./.test(name)));
  assert.deepEqual(leftover, [], 'Standalone window must remove its profile and singleton socket directories.');
  await writeFile(join(cache, 'app-ui/standalone-window.json'), JSON.stringify({ class: found.class, title: found.title, windowAppeared: true, cleanupPassed: true, shutdown: sighup ? 'SIGHUP' : 'API' }, null, 2) + '\n');
  console.log('Standalone Omarchy window launched, matched its desktop entry and closed cleanly.');
} finally {
  clearTimeout(timer);
  if (child.exitCode === null) { child.kill('SIGTERM'); await exit; }
}
