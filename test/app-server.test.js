import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { startAppServer } from '../src/app-server.js';
import { prepareDesktopEntry } from '../src/app-launcher.js';
import { loadSnapshot } from '../src/snapshot.js';
import { root } from '../src/render.js';

async function fixture(t, overrides = {}) {
  const cache = join(root, '.cache/tmp'); await mkdir(cache, { recursive: true });
  const outputDirectory = await mkdtemp(join(cache, 'app-test-'));
  const snapshot = await loadSnapshot();
  const app = await startAppServer({ snapshot, outputDirectory, ...overrides });
  t.after(async () => { await app.close(); await rm(outputDirectory, { recursive: true, force: true }); });
  const bootstrap = await fetch(app.launchUrl, { redirect: 'manual' });
  assert.equal(bootstrap.status, 303);
  assert.match(bootstrap.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  const catalog = await (await fetch(app.url + '/api/catalog', { headers: { Cookie: cookie } })).json();
  const headers = { Cookie: cookie, Origin: app.url, 'X-Billboard-Token': catalog.token, 'Content-Type': 'application/json' };
  const request = (path, body, extra = {}) => fetch(app.url + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { app, outputDirectory, catalog, headers, request };
}
async function waitJob(request, id, status) {
  for (let n = 0; n < 100; n++) {
    const job = await (await request(`/api/jobs/${id}`)).json();
    if (job.status === status) return job;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error(`Job never reached ${status}.`);
}

test('app authentication, origin checks, static containment and bounded requests', async t => {
  const { app, catalog, request, outputDirectory } = await fixture(t);
  assert.equal((await fetch(app.url + '/api/catalog')).status, 401);
  assert.equal((await request('/api/catalog', undefined, { Origin: 'https://example.com' })).status, 403);
  const hostileHost = await new Promise((resolve, reject) => get(app.url + '/api/catalog', { headers: { Host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
  assert.equal(hostileHost, 403);
  assert.equal((await request('/api/preview', {}, { 'X-Billboard-Token': 'wrong' })).status, 403);
  assert.equal((await request('/api/preview', {}, { Origin: '' })).status, 403);
  assert.equal((await request('/api/preview', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request('/api/preview', { oversized: 'x'.repeat(33000) })).status, 413);
  assert.equal((await request('/api/preview', { execute: 'not a command' })).status, 400);
  assert.equal((await request('/package.json')).status, 404);
  assert.equal((await request('/app/%2e%2e%2fsrc/app-server.js')).status, 403);
  await writeFile(join(outputDirectory, 'secret.js'), 'not public');
  const name = `test-${randomUUID()}.js`, link = join(root, 'app', name);
  await symlink(join(outputDirectory, 'secret.js'), link); t.after(() => rm(link, { force: true }));
  assert.equal((await request(`/app/${name}`)).status, 403);
  const index = await request('/'); assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(catalog.languages.find(l => l.id === 'da').englishName, 'Danish');
  assert.equal(catalog.languages.length, 31); assert.equal(catalog.themes.length, 24);
  assert.equal(catalog.animations.length, 38);
  assert.equal(catalog.animations.find(a => a.id === 'laseretch-campaign').name, 'laseretch - campaign');
  assert.equal(catalog.themes.find(theme => theme.id === 'astral').origin, 'campaign');
  assert.equal(catalog.themes.find(theme => theme.id === 'danish-dynamite').name, 'Danish Dynamite');
});

test('custom theme imports are authenticated, bounded, independent of sync and captured by exports', async t => {
  const document = JSON.parse(await readFile(new URL('../examples/aurora.json', import.meta.url)));
  const snapshot = await loadSnapshot(), before = JSON.stringify(snapshot);
  const { request } = await fixture(t, { sync: async () => snapshot, render: async options => {
    assert.deepEqual(options.customTheme, document); assert.equal(options.themeFile, undefined);
    await writeFile(options.output, 'custom export'); return { output: options.output };
  } });
  const content = JSON.stringify(document);
  assert.equal((await request('/api/themes', { content }, { 'X-Billboard-Token': 'wrong' })).status, 403);
  assert.equal((await request('/api/themes', { path: '/etc/passwd' })).status, 400);
  assert.equal((await request('/api/themes', { content: '{}' })).status, 400);
  assert.equal((await request('/api/themes', { content: ' '.repeat(16385) })).status, 400);
  const imported = await request('/api/themes', { content }); assert.equal(imported.status, 200);
  const { theme } = await imported.json(); assert.equal(theme.origin, 'custom');
  assert.equal((await (await request('/api/themes', { content })).json()).theme.id, theme.id);
  const preview = await (await request('/api/preview', { theme: theme.id })).json();
  const config = await (await request(`/api/previews/${preview.id}/config`)).json();
  assert.deepEqual(config.theme.gradient, document.gradient); assert.equal(config.theme.origin, 'custom');
  const changed = { ...document, brand: '#ff0000' };
  const second = await (await request('/api/themes', { content: JSON.stringify(changed) })).json();
  assert.notEqual(second.theme.id, theme.id);
  const job = await (await request('/api/jobs', { previewId: preview.id, filename: 'custom.mp4' })).json();
  const completed = await waitJob(request, job.id, 'completed');
  assert.deepEqual(completed.settings.customTheme, document);
  assert.equal((await request('/api/sync', {})).status, 200);
  const catalog = await (await request('/api/catalog')).json();
  assert.equal(catalog.themes.filter(t => t.origin === 'custom').length, 2);
  assert.equal((await request('/api/preview', { theme: theme.id })).status, 200);
  assert.equal((await request('/api/preview', { themeFile: '/etc/passwd' })).status, 400);
  assert.equal((await request('/api/preview', { customTheme: document })).status, 400);
  assert.equal(JSON.stringify(snapshot), before);
});

test('custom theme session capacity is bounded and duplicate imports do not consume slots', async t => {
  const { request } = await fixture(t);
  const document = JSON.parse(await readFile(new URL('../examples/aurora.json', import.meta.url)));
  for (let i = 0; i < 32; i++) {
    assert.equal((await request('/api/themes', { content: JSON.stringify({ ...document, name: `Theme ${i}` }) })).status, 200);
  }
  assert.equal((await request('/api/themes', { content: JSON.stringify(document) })).status, 409);
  assert.equal((await request('/api/themes', { content: JSON.stringify({ ...document, name: 'Theme 0' }) })).status, 200);
});

test('app previews reuse renderer config and accept untested combinations', async t => {
  const { request } = await fixture(t);
  const response = await request('/api/preview', { tld: '.co.uk', language: 'hi', theme: 'white', animation: 'beams', width: 501, height: 701 });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.options.tld, '.CO.UK'); assert.doesNotMatch(preview.warnings.join(' '), /untested/i);
  const config = await (await request(`/api/previews/${preview.id}/config`)).json();
  assert.equal(config.wordmark.base.length, 211); assert.equal(config.font.family, 'Noto Sans Devanagari');
  assert.equal(config.width, 501); assert.equal(config.height, 701);
  assert.equal(config.animation.id, 'beams'); assert.equal(preview.options.animation, 'beams');
  assert.equal((await request('/api/preview', { animation: 'not-real' })).status, 400);
  assert.equal((await request('/api/preview', { animation: 123 })).status, 400);
  assert.equal((await request('/api/preview', { language: 'missing' })).status, 400);
});

test('app jobs protect output paths, report progress and open only known exports without serving video', async t => {
  let opened;
  const { request, outputDirectory } = await fixture(t, {
    openPath: async path => { opened = path; },
    render: async (options, snapshot, { progress }) => {
      assert.equal(options.animation, 'laseretch');
      progress('Frame 51/375'); await new Promise(resolve => setTimeout(resolve, 100));
      await writeFile(options.output, '0123456789'); return { output: options.output };
    },
  });
  const preview = await (await request('/api/preview', { animation: 'laseretch' })).json();
  for (const filename of ['../escape.mp4', '/escape.mp4', 'nested/escape.mp4', 'file.txt', 'bad\nname.mp4', 'a\\b.mp4']) {
    assert.equal((await request('/api/jobs', { previewId: preview.id, filename })).status, 400);
  }
  assert.equal((await request('/api/jobs', { previewId: preview.id, filename: 'x.mp4', force: 'yes' })).status, 400);
  const started = await request('/api/jobs', { previewId: preview.id, filename: 'safe video.mp4' }); assert.equal(started.status, 202);
  const job = await started.json();
  assert.equal((await request('/api/jobs', { previewId: preview.id, filename: 'second.mp4' })).status, 409);
  const ready = await waitJob(request, job.id, 'completed'); assert.equal(ready.percent, 100);
  assert.equal(ready.videoUrl, undefined); assert.equal(opened, undefined);
  assert.equal(ready.settings.animation, 'laseretch');
  assert.equal((await request(`/api/jobs/${job.id}/video`, undefined, { Range: 'bytes=2-5' })).status, 404);
  assert.equal((await request(`/api/jobs/${job.id}/open`, {})).status, 200); assert.equal(opened, join(outputDirectory, 'safe video.mp4'));
  assert.equal((await request('/api/open-folder', {})).status, 200); assert.equal(opened, outputDirectory);
});

test('existing files get GUI guidance before a job starts; Overwrite and Auto play are explicit', async t => {
  let rendered = 0; const opened = [];
  const { request, outputDirectory } = await fixture(t, {
    openPath: async path => { opened.push(path); },
    render: async options => { rendered++; await writeFile(options.output, 'new video'); return { output: options.output }; },
  });
  const output = join(outputDirectory, 'existing.mp4'); await writeFile(output, 'original');
  const preview = await (await request('/api/preview', {})).json();
  const body = { previewId: preview.id, filename: 'existing.mp4', autoPlay: true };
  assert.equal((await request('/api/jobs', { ...body, autoPlay: 'yes' })).status, 400);
  const rejected = await request('/api/jobs', body); assert.equal(rejected.status, 409);
  const message = (await rejected.json()).error;
  assert.match(message, /Enable Overwrite or choose another filename/); assert.doesNotMatch(message, /--force/);
  assert.equal(rendered, 0); assert.deepEqual(opened, []); assert.equal(await readFile(output, 'utf8'), 'original');
  assert.equal((await (await request('/api/jobs')).json()).jobs.length, 0);
  const job = await (await request('/api/jobs', { ...body, force: true })).json();
  await waitJob(request, job.id, 'completed');
  assert.equal(rendered, 1); assert.deepEqual(opened, [output]);
  await request(`/api/jobs/${job.id}`); assert.deepEqual(opened, [output]);
});

test('Auto play failure keeps the successful export available for a manual retry', async t => {
  let attempts = 0;
  const { request, outputDirectory } = await fixture(t, {
    openPath: async () => { if (++attempts === 1) throw Error('Player unavailable'); },
    render: async options => { await writeFile(options.output, 'video'); return { output: options.output }; },
  });
  const preview = await (await request('/api/preview', {})).json();
  const job = await (await request('/api/jobs', { previewId: preview.id, filename: 'saved.mp4', autoPlay: true })).json();
  const ready = await waitJob(request, job.id, 'completed');
  assert.match(ready.message, /Auto play could not open the player/); assert.match(ready.warnings.join(' '), /Player unavailable/);
  assert.equal(await readFile(join(outputDirectory, 'saved.mp4'), 'utf8'), 'video');
  assert.equal((await request(`/api/jobs/${job.id}/open`, {})).status, 200); assert.equal(attempts, 2);
});

test('render failures retain GUI wording and do not trigger Auto play', async t => {
  let opened = 0;
  const { request } = await fixture(t, {
    openPath: async () => { opened++; },
    render: async () => { throw Error('Output already exists. Use --force to replace it.'); },
  });
  const preview = await (await request('/api/preview', {})).json();
  const job = await (await request('/api/jobs', { previewId: preview.id, filename: 'race.mp4', autoPlay: true })).json();
  const failed = await waitJob(request, job.id, 'failed');
  assert.match(failed.message, /Enable Overwrite/); assert.doesNotMatch(failed.message, /--force/); assert.equal(opened, 0);
});

test('cancel and shutdown abort the export; failed sync preserves current catalog', async t => {
  let aborted = 0, opened = 0;
  const { app, request, catalog } = await fixture(t, {
    openPath: async () => { opened++; },
    sync: async () => { throw Error('Simulated sync failure'); },
    render: async (options, snapshot, { signal }) => new Promise((resolve, reject) => {
      const cancel = () => { aborted++; reject(Error('Export cancelled.')); };
      if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    }),
  });
  assert.equal((await request('/api/sync', {})).status, 400);
  assert.equal((await (await request('/api/catalog')).json()).commit, catalog.commit);
  const preview = await (await request('/api/preview', {})).json();
  const job = await (await request('/api/jobs', { previewId: preview.id, filename: 'cancel.mp4', autoPlay: true })).json();
  assert.equal((await request('/api/sync', {})).status, 409);
  await request(`/api/jobs/${job.id}/cancel`, {}); await waitJob(request, job.id, 'cancelled');
  await request('/api/jobs', { previewId: preview.id, filename: 'close.mp4', autoPlay: true });
  await app.close(); assert.equal(aborted, 2); assert.equal(opened, 0);
});

test('desktop entry is prepared locally and the no-window launcher shuts down cleanly', async () => {
  const path = await prepareDesktopEntry(); assert.ok(path.startsWith(join(root, '.cache/app/')));
  const desktop = await readFile(path, 'utf8');
  assert.match(desktop, /Name=Omarchy Billboard Generator/); assert.match(desktop, /Terminal=false/); assert.match(desktop, /bin\/omarchy-billboard-app/);
  for (const method of ['api', 'SIGHUP']) {
  const child = spawn(process.execPath, ['bin/omarchy-billboard-app', '--no-window'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: join(root, '.cache/test-home'), XDG_CONFIG_HOME: join(root, '.cache/test-home/config') } });
  let text = '', stderr = ''; child.stderr.on('data', data => { stderr += data; });
  const exit = new Promise(resolve => child.once('close', resolve));
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  try {
    const url = await new Promise((resolve, reject) => {
      child.on('error', reject); child.once('close', () => reject(Error(stderr || 'Launcher exited early.')));
      child.stdout.on('data', data => { text += data; const match = text.match(/Local app: (http:\/\/\S+)/); if (match) resolve(match[1]); });
    });
    if (method === 'SIGHUP') { child.kill('SIGHUP'); assert.equal(await exit, 0, stderr); continue; }
    const origin = new URL(url).origin;
    const bootstrap = await fetch(url, { redirect: 'manual' }), cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const catalog = await (await fetch(origin + '/api/catalog', { headers: { Cookie: cookie } })).json();
    assert.equal(catalog.outputDirectory, join(root, '.cache/test-home/Videos'));
    const response = await fetch(origin + '/api/shutdown', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Billboard-Token': catalog.token, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200); assert.equal(await exit, 0, stderr);
  } finally { clearTimeout(timer); if (child.exitCode === null) { child.kill('SIGTERM'); await exit; } }
  }
});
