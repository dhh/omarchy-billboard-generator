import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from '../src/render.js';
import { startAppServer } from '../src/app-server.js';
import { loadSnapshot } from '../src/snapshot.js';
import { themeDirectories, parseDesktopColors, desktopVariables, createDesktopThemeReader } from '../src/desktop-theme.js';
import { contrastRatio } from '../web/contrast.js';

const dark = 'mode = "dark"\nbackground = "#1a1b26"\nforeground = "#a9b1d6"\naccent = "#7aa2f7"\n';
const light = "mode = 'light'\nbackground = '#ffffff'\nforeground = '#222222'\naccent = '#2244aa' # comment\n";

test('desktop palette adapter supports light/dark colors and safe readable semantic tokens', () => {
  for (const text of [dark, light]) {
    const colors = parseDesktopColors(text), vars = desktopVariables(colors);
    assert.equal(vars['--bg'], colors.background); assert.equal(vars['--accent'], colors.accent);
    assert.ok(Object.values(vars).every(value => /^#[a-f0-9]{6}([a-f0-9]{2})?$/.test(value)));
    assert.ok(contrastRatio(vars['--accent'], vars['--on-accent']) >= 4.5);
    assert.ok(contrastRatio(vars['--amber'], vars['--warning-bg']) >= 4.5);
    assert.ok(contrastRatio(vars['--red'], vars['--error-bg']) >= 4.5);
  }
  assert.throws(() => parseDesktopColors('background = "url(https://example.invalid)"'), /Missing/);
  assert.throws(() => parseDesktopColors('[other]\n' + dark), /Missing/);
  assert.deepEqual(themeDirectories({ XDG_STATE_HOME: '/state', XDG_CONFIG_HOME: '/config' }, '/fixture-home'), ['/state/omarchy/current', '/fixture-home/.local/state/omarchy/current', '/config/omarchy/current']);
});

test('desktop theme JSON and initial CSS require authentication and expose only palette data', async t => {
  const base = join(root, '.cache/desktop-theme-tests'); await mkdir(base, { recursive: true });
  const current = await mkdtemp(join(base, 'api-'));
  await mkdir(join(current, 'theme')); await writeFile(join(current, 'theme/colors.toml'), dark);
  const app = await startAppServer({ snapshot: await loadSnapshot(), outputDirectory: join(current, 'output'), desktopThemeDirectories: [current] });
  t.after(async () => { await app.close(); await rm(current, { recursive: true, force: true }); });
  const bootstrap = await fetch(app.launchUrl, { redirect: 'manual' });
  const headers = { Cookie: bootstrap.headers.get('set-cookie').split(';')[0] };
  for (const path of ['/api/desktop-theme', '/api/desktop-theme.css']) assert.equal((await fetch(app.url + path)).status, 401);
  const data = await (await fetch(app.url + '/api/desktop-theme', { headers })).json();
  assert.equal(data.variables['--bg'], '#1a1b26');
  const response = await fetch(app.url + '/api/desktop-theme.css', { headers });
  assert.match(response.headers.get('content-type'), /text\/css/);
  const css = await response.text(); assert.match(css, /--bg:#1a1b26;/); assert.ok(!css.includes(current));
});

test('desktop palette reader follows directory swaps, retains last good colors and handles missing/oversized data', async t => {
  const base = join(root, '.cache/desktop-theme-tests'); await mkdir(base, { recursive: true });
  const current = await mkdtemp(join(base, 'current-')); t.after(() => rm(current, { recursive: true, force: true }));
  const read = createDesktopThemeReader([current]);
  assert.equal((await read()).source, 'fallback');
  await mkdir(join(current, 'theme')); await writeFile(join(current, 'theme/colors.toml'), dark);
  await writeFile(join(current, 'theme.name'), 'tokyo-night\n');
  const original = await read(); assert.equal(original.variables['--bg'], '#1a1b26');
  await rename(join(current, 'theme'), join(current, 'previous'));
  assert.deepEqual(await read(), original);
  await mkdir(join(current, 'theme')); await writeFile(join(current, 'theme/colors.toml'), 'incomplete');
  assert.deepEqual(await read(), original);
  await writeFile(join(current, 'theme/colors.toml'), light); await writeFile(join(current, 'theme.name'), 'white');
  const updated = await read(); assert.equal(updated.mode, 'light'); assert.equal(updated.variables['--bg'], '#ffffff');
  await writeFile(join(current, 'theme/colors.toml'), 'x'.repeat(65537));
  assert.deepEqual(await read(), updated);
  assert.equal((await createDesktopThemeReader([current])()).source, 'fallback');
});
