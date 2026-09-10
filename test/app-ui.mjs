import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { startAppServer } from '../src/app-server.js';
import { loadSnapshot } from '../src/snapshot.js';
import { root, executable, openRenderer, verifyVideo } from '../src/render.js';

const base = join(root, '.cache/app-ui'); await mkdir(base, { recursive: true });
const work = await mkdtemp(join(base, 'session-')), outputDirectory = join(work, 'output'); await mkdir(outputDirectory);
const desktop = join(work, 'desktop'); await mkdir(join(desktop, 'theme'), { recursive: true });
const darkDesktop = 'mode = "dark"\nbackground = "#1a1b26"\nforeground = "#a9b1d6"\naccent = "#7aa2f7"\n';
await writeFile(join(desktop, 'theme/colors.toml'), darkDesktop); await writeFile(join(desktop, 'theme.name'), 'tokyo-night');
const snapshot = await loadSnapshot(), opened = [];
const app = await startAppServer({ snapshot, outputDirectory, desktopThemeDirectories: [desktop], openPath: async path => { opened.push(path); }, sync: async () => snapshot });
const previousTmp = process.env.TMPDIR; process.env.TMPDIR = join(root, '.cache');
let context, page;
const report = { checks: [], outputDirectory };
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
try {
  context = await chromium.launchPersistentContext(join(work, 'profile'), {
    executablePath: await executable(process.env.BILLBOARD_CHROMIUM, ['chromium', 'chromium-browser', 'google-chrome'], 'Chromium'),
    headless: true, viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US', timezoneId: 'UTC',
    acceptDownloads: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], handleSIGINT: false, handleSIGTERM: false,
    env: { ...process.env, HOME: work, XDG_CONFIG_HOME: join(work, 'config'), XDG_CACHE_HOME: join(work, 'cache') },
  });
  await context.route('**/*', route => route.request().url().startsWith(app.url + '/') ? route.continue() : route.abort());
  page = context.pages()[0]; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.launchUrl);
  await page.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 60000 });
  assert.equal(await page.locator('#language option').count(), 31);
  assert.equal(await page.locator('#theme option').count(), 24);
  assert.equal(await page.locator('#animation option').count(), 38);
  assert.equal(await page.locator('#animation').inputValue(), 'laseretch-campaign');
  assert.equal(await page.locator('#theme').inputValue(), 'astral');
  await page.screenshot({ path: join(base, 'default-astral.png'), fullPage: true });
  await page.locator('#theme').selectOption('hackerman');
  await page.waitForFunction(() => !document.getElementById('export').disabled && document.querySelector('#preview-mount iframe')?.contentWindow.layout?.settings.theme === 'hackerman');
  assert.match(await page.locator('#animation').textContent(), /laseretch - campaign/);
  assert.ok((await page.locator('#animation').boundingBox()).y > (await page.locator('#theme').boundingBox()).y);
  assert.match(await page.locator('#theme').textContent(), /Astral · Campaign/);
  assert.match(await page.locator('#theme').textContent(), /Danish Dynamite · Campaign/);
  assert.match(await page.locator('#language').textContent(), /Danish/);
  assert.ok(!page.url().includes('token='));
  assert.equal(await page.locator('#quit, #desktop-theme, #domain-note, #play-export, #back-preview, video').count(), 0);
  assert.equal(await page.locator('label:has(#force)').innerText(), 'Overwrite');
  assert.ok(!await page.locator('#auto-play').isChecked());
  const overwriteToggle = await page.locator('label:has(#force)').boundingBox();
  const autoPlayToggle = await page.locator('label:has(#auto-play)').boundingBox();
  assert.ok(autoPlayToggle.x > overwriteToggle.x && Math.abs(autoPlayToggle.y - overwriteToggle.y) < 2);
  assert.ok(await page.locator('#autoname').isChecked());
  assert.equal(await page.locator('#filename').evaluate(el => el.readOnly), true);
  assert.equal(await page.locator('#filename').inputValue(), 'omarchy-org-en.mp4');
  const filenameLabel = await page.locator('label[for="filename"]').boundingBox();
  const autonameLabel = await page.locator('.filename-heading .check').boundingBox();
  const exportLegend = await page.locator('#output-settings legend').boundingBox();
  assert.ok(autonameLabel.x > filenameLabel.x && Math.abs((autonameLabel.y + autonameLabel.height / 2) - (filenameLabel.y + filenameLabel.height / 2)) < 2);
  assert.equal(await page.locator('.filename-heading .check').innerText(), 'Auto');
  assert.ok(filenameLabel.y - exportLegend.y - exportLegend.height <= 24, 'Export heading must not have extra blank padding.');
  assert.match(await page.locator('#tagline-copy').textContent(), /by DHH$/);
  await page.locator('#autoname').uncheck(); await page.locator('#filename').fill('custom.mp4');
  await page.locator('#tld').fill('.dk');
  await page.waitForFunction(() => !document.getElementById('export').disabled);
  assert.equal(await page.locator('#filename').inputValue(), 'custom.mp4');
  await page.locator('#autoname').check();
  assert.equal(await page.locator('#filename').inputValue(), 'omarchy-dk-en.mp4');
  await page.locator('#tld').fill('.org');
  await page.waitForFunction(() => !document.getElementById('export').disabled);
  assert.equal(await page.locator('#filename').inputValue(), 'omarchy-org-en.mp4');
  report.checks.push('Auto is aligned beside Filename with compact Export spacing; automatic/manual naming toggles work.');
  assert.ok(await page.locator('#dimensions').isHidden());
  await page.locator('#preset').selectOption('custom'); assert.ok(await page.locator('#dimensions').isVisible());
  await page.locator('#width').fill('900');
  assert.equal(await page.locator('#preset').inputValue(), 'custom');
  assert.ok(await page.locator('#height').isVisible());
  await page.locator('#preset').selectOption('900x480');
  assert.ok(await page.locator('#dimensions').isHidden());
  assert.equal(await page.locator('#height').inputValue(), '480');
  await page.locator('#preset').selectOption('900x240');
  report.checks.push('Width/Height are visible only in Custom mode, which stays selected while editing even when dimensions match a preset.');
  await page.locator('#sync').click();
  await page.waitForFunction(() => !document.getElementById('export').disabled && document.getElementById('sync').textContent === 'Sync website data');
  const frameBox = await page.locator('#preview-mount iframe').boundingBox();
  assert.ok(Math.abs(frameBox.width / frameBox.height - 900 / 240) < .01, 'Preview iframe must match canvas aspect without extra letterboxing.');
  await page.screenshot({ path: join(base, 'window.png'), fullPage: true });
  const preview = page.frames().find(frame => frame.url().includes('/web/index.html'));
  const previewPNG = Buffer.from(await preview.evaluate(() => window.renderFrame(70)), 'base64');
  const renderer = await openRenderer({ theme: 'hackerman', language: 'en', tld: '.ORG', width: 900, height: 240 }, snapshot);
  try { assert.equal(hash(previewPNG), hash(await renderer.frame(70))); }
  finally { await renderer.close(); }
  report.checks.push('Desktop preview pixels match the CLI renderer at identical settings; explicit sync refreshes the preview.');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(26, 27, 38)');
  const previewUrl = preview.url();
  await rename(join(desktop, 'theme'), join(desktop, 'previous')); await mkdir(join(desktop, 'theme'));
  await writeFile(join(desktop, 'theme/colors.toml'), 'mode = "light"\nbackground = "#ffffff"\nforeground = "#222222"\naccent = "#2244aa"\n');
  await writeFile(join(desktop, 'theme.name'), 'white-fixture');
  await page.waitForFunction(() => document.documentElement.dataset.desktopTheme === 'white-fixture');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('#theme').inputValue(), 'hackerman');
  assert.equal(preview.url(), previewUrl);
  assert.equal(hash(Buffer.from(await preview.evaluate(() => window.renderFrame(70)), 'base64')), hash(previewPNG));
  await page.locator('[data-frame="263"]').click(); await page.waitForTimeout(250);
  await page.screenshot({ path: join(base, 'interface-light.png'), fullPage: true });
  await writeFile(join(desktop, 'theme/colors.toml'), darkDesktop); await writeFile(join(desktop, 'theme.name'), 'tokyo-night');
  await page.waitForFunction(() => document.documentElement.dataset.desktopTheme === 'tokyo-night');
  report.checks.push('Interface follows dark/light desktop palette swaps without reloading or changing billboard selection or pixels.');
  await page.locator('#play').click();
  await page.waitForFunction(() => Number(document.getElementById('scrubber').value) < 125);
  await page.locator('#play').click();
  await page.locator('#scrubber').evaluate(el => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.match(await page.locator('#frame-number').textContent(), /FRAME 40/);
  await page.locator('#play').click(); await page.waitForFunction(() => Number(document.getElementById('scrubber').value) > 45); await page.locator('#play').click();
  report.checks.push('Timeline scrubbing and real-time playback work.');
  const timelineActions = [
    [0, () => page.locator('#restart').click()],
    [86, () => page.locator('#scrubber').evaluate(el => {
      for (const frame of [120, 30, 86]) { el.value = String(frame); el.dispatchEvent(new Event('input', { bubbles: true })); }
    })],
    ...[0, 125, 238, 263].map(frame => [frame, () => page.locator(`[data-frame="${frame}"]`).click()]),
  ];
  for (const playing of [false, true]) {
    if (playing) await page.locator('#play').click();
    for (const [target, action] of timelineActions) {
      await action();
      assert.equal(await page.locator('#play').getAttribute('aria-pressed'), String(playing));
      const frame = Number(await page.locator('#scrubber').inputValue());
      if (playing) {
        assert.ok(frame >= target && frame < target + 20, 'Navigation must start playback from the selected position, including Hold.');
        await page.waitForFunction(previous => Number(document.getElementById('scrubber').value) > previous, frame);
      } else {
        await page.waitForTimeout(80); assert.equal(Number(await page.locator('#scrubber').inputValue()), target);
      }
    }
  }
  await page.locator('#scrubber').evaluate(el => { el.value = '370'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-pressed') === 'false');
  assert.equal(await page.locator('#scrubber').inputValue(), '374');
  assert.equal(await page.locator('#time').textContent(), '15.00 / 15.00 s');
  assert.match(await page.locator('#frame-number').textContent(), /FRAME 374 \/ 374/);
  report.checks.push('Restart, repeated scrubbing and all four chapter buttons preserve playing/paused state; completed playback displays 15.00 s while rendering frame 374.');
  for (const [background, rgb] of [['white', [255, 255, 255]], ['theme', [11, 12, 22]], ['black', [0, 0, 0]]]) {
    await page.locator('#background').selectOption(background);
    await page.waitForFunction(value => {
      const frame = document.querySelector('#preview-mount iframe');
      return !document.getElementById('export').disabled && frame?.contentWindow.layout?.settings.background === value;
    }, background);
    assert.doesNotMatch(await page.locator('#warning-list').textContent(), /Background overridden/);
    if (background === 'black') assert.ok(await page.locator('#warnings').isHidden());
    const frame = page.frames().find(frame => frame.url().includes('/web/index.html'));
    assert.deepEqual(await frame.evaluate(() => {
      window.renderFrame(295, false);
      return [...document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1, 1).data].slice(0, 3);
    }), rgb);
    const cli = await openRenderer({ theme: 'hackerman', background, language: 'en', tld: '.ORG', width: 900, height: 240 }, snapshot);
    try { assert.equal(hash(Buffer.from(await frame.evaluate(() => window.renderFrame(70)), 'base64')), hash(await cli.frame(70))); }
    finally { await cli.close(); }
  }
  report.checks.push('Theme, white and black backgrounds have exact preview pixels and match CLI frames.');
  for (const [theme, bands, cursor] of [['astral', 10, [125, 207, 255]], ['danish-dynamite', 5, [246, 133, 134]]]) {
    await page.locator('#theme').selectOption(theme);
    await page.waitForFunction(id => !document.getElementById('export').disabled && document.querySelector('#preview-mount iframe')?.contentWindow.layout?.settings.theme === id, theme);
    assert.equal(await page.locator('#palette span').count(), bands + 1);
    const frame = page.frames().find(frame => frame.url().includes('/web/index.html'));
    const actualCursor = await frame.evaluate(() => {
      window.renderFrame(175, false);
      const layout = window.layout, line = layout.lines.at(-1);
      const x = Math.round((layout.width + line.width) / 2 + layout.cursorGap) + Math.floor(layout.cursorWidth / 2);
      const y = Math.ceil(line.y - layout.ascent) + 1;
      return [...document.querySelector('canvas').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
    });
    assert.deepEqual(actualCursor, cursor);
    const cli = await openRenderer({ theme, background: 'black', language: 'en', tld: '.ORG', width: 900, height: 240 }, snapshot);
    try { assert.equal(hash(Buffer.from(await frame.evaluate(() => window.renderFrame(70)), 'base64')), hash(await cli.frame(70))); }
    finally { await cli.close(); }
  }
  await page.locator('#theme').selectOption('hackerman');
  await page.waitForFunction(() => !document.getElementById('export').disabled && document.querySelector('#preview-mount iframe')?.contentWindow.layout?.settings.theme === 'hackerman');
  report.checks.push('Both campaign themes are selectable, retain original cursor colors and match CLI pixels.');
  const waitPlaying = () => page.waitForFunction(() => !document.getElementById('export').disabled && document.getElementById('play').getAttribute('aria-pressed') === 'true');
  await page.locator('#scrubber').evaluate(el => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#play').click();
  for (const change of [
    () => page.locator('#background').selectOption('white'),
    () => page.locator('#theme').selectOption('astral'),
    () => page.locator('#language').selectOption('da'),
    () => page.locator('#tld').fill('.dk'),
    () => page.locator('#preset').selectOption('900x480'),
    async () => { await page.locator('#preset').selectOption('custom'); await page.locator('#width').fill('920'); await page.locator('#height').fill('300'); },
    async () => {
      await page.locator('#theme').selectOption('hackerman'); await page.locator('#language').selectOption('en');
      await page.locator('#tld').fill('.org'); await page.locator('#preset').selectOption('900x240'); await page.locator('#background').selectOption('black');
    },
    () => page.locator('#sync').click(),
  ]) {
    const before = Number(await page.locator('#scrubber').inputValue());
    await change(); await waitPlaying();
    const resumed = Number(await page.locator('#scrubber').inputValue()); assert.ok(resumed >= before, 'Edits must not rewind playback.');
    await page.waitForFunction(frame => Number(document.getElementById('scrubber').value) > frame, resumed);
  }
  await page.locator('#preset').selectOption('custom'); await page.locator('#width').fill('0');
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('positive safe integers'));
  await page.locator('#width').fill('900'); await waitPlaying();
  await page.locator('#scrubber').evaluate(el => { el.value = '250'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => Number(document.getElementById('scrubber').value) >= 270);
  await page.locator('#background').selectOption('white'); await waitPlaying();
  assert.ok(Number(await page.locator('#scrubber').inputValue()) >= 270, 'Resuming an edit during the final hold must not restart at zero.');
  await page.locator('#play').click(); const pausedFrame = await page.locator('#scrubber').inputValue();
  await page.locator('#background').selectOption('black');
  await page.waitForFunction(() => !document.getElementById('export').disabled);
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#scrubber').inputValue(), pausedFrame);
  report.checks.push('Playing previews resume at the same position after setting edits, rapid edits, sync and corrected invalid input; paused previews stay paused.');
  const waitAnimation = id => page.waitForFunction(value => !document.getElementById('export').disabled && document.querySelector('#preview-mount iframe')?.contentWindow.layout?.settings.animation === value, id);
  await page.locator('#animation').selectOption('laseretch'); await waitAnimation('laseretch');
  assert.equal(await page.locator('#scrubber').inputValue(), pausedFrame);
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  await page.locator('#play').click();
  await page.locator('#scrubber').evaluate(el => { el.value = '270'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#animation').selectOption('beams'); await waitAnimation('beams'); await waitPlaying();
  assert.ok(Number(await page.locator('#scrubber').inputValue()) < 30, 'Changing a playing animation must restart from zero.');
  await page.locator('#scrubber').evaluate(el => { el.value = '270'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#animation').selectOption('matrix'); await page.locator('#animation').selectOption('laseretch');
  await waitAnimation('laseretch'); await waitPlaying();
  assert.ok(Number(await page.locator('#scrubber').inputValue()) < 30, 'Rapid animation changes must retain the pending restart.');
  await page.locator('#play').click();
  await page.locator('#scrubber').evaluate(el => { el.value = '70'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#animation').selectOption('beams'); await waitAnimation('beams');
  assert.equal(await page.locator('#scrubber').inputValue(), '70');
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  await page.locator('#animation').selectOption('laseretch'); await waitAnimation('laseretch');
  await page.locator('#sync').click(); await waitAnimation('laseretch');
  assert.equal(await page.locator('#animation').inputValue(), 'laseretch');
  const websitePreview = page.frames().find(frame => frame.url().includes('/web/index.html'));
  const websiteCLI = await openRenderer({ theme: 'hackerman', background: 'black', animation: 'laseretch', language: 'en', tld: '.ORG', width: 900, height: 240 }, snapshot);
  try { assert.equal(hash(Buffer.from(await websitePreview.evaluate(() => window.renderFrame(70)), 'base64')), hash(await websiteCLI.frame(70))); }
  finally { await websiteCLI.close(); }
  await page.screenshot({ path: join(base, 'website-animation.png'), fullPage: true });
  report.checks.push('Animation selection survives sync, matches CLI pixels, restarts playing previews including rapid changes, and preserves paused frames.');
  const originalTheme = await page.locator('#theme').inputValue(), originalPreview = websitePreview.url();
  await page.locator('#theme-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('Invalid theme file'));
  assert.equal(await page.locator('#theme').inputValue(), originalTheme);
  assert.equal(page.frames().find(frame => frame.url().includes('/web/index.html')).url(), originalPreview);
  assert.ok(!await page.locator('#export').isDisabled());
  await page.locator('#theme-file').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(16385, 32) });
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('16 KiB'));
  assert.equal(await page.locator('#theme').inputValue(), originalTheme);
  const themeFile = join(root, 'examples/aurora.json'), customDocument = JSON.parse(await readFile(themeFile, 'utf8'));
  const chooserPromise = page.waitForEvent('filechooser'); await page.locator('#import-theme').click();
  await (await chooserPromise).setFiles(themeFile);
  const waitCustom = () => page.waitForFunction(() => !document.getElementById('export').disabled && document.querySelector('#preview-mount iframe')?.contentWindow.layout?.settings.themeOrigin === 'custom');
  await waitCustom(); const customId = await page.locator('#theme').inputValue();
  assert.match(await page.locator('#theme option:checked').innerText(), /Aurora · Custom/);
  assert.equal(await page.locator('#scrubber').inputValue(), '70');
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  await page.locator('#play').click();
  await page.locator('#scrubber').evaluate(el => { el.value = '200'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#theme-file').setInputFiles(themeFile); await waitCustom(); await waitPlaying();
  assert.ok(Number(await page.locator('#scrubber').inputValue()) >= 200, 'Theme imports must not rewind playback.');
  await page.locator('#play').click();
  await page.locator('#scrubber').evaluate(el => { el.value = '70'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#sync').click(); await waitCustom();
  assert.equal(await page.locator('#theme').inputValue(), customId);
  assert.equal(await page.locator('#theme option').count(), 25, 'Repeated imports must not duplicate options.');
  const customPreview = page.frames().find(frame => frame.url().includes('/web/index.html'));
  const customCLI = await openRenderer({ themeFile, background: 'black', animation: 'laseretch', language: 'en', tld: '.ORG', width: 900, height: 240 }, snapshot);
  try { assert.equal(hash(Buffer.from(await customPreview.evaluate(() => window.renderFrame(70)), 'base64')), hash(await customCLI.frame(70))); }
  finally { await customCLI.close(); }
  await page.screenshot({ path: join(base, 'custom-theme.png'), fullPage: true });
  report.checks.push('Custom JSON imports validate safely, retain previous previews on errors, deduplicate, survive sync, preserve playback and match CLI pixels.');
  await page.locator('#width').fill('0');
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('positive safe integers'));
  assert.ok(await page.locator('#export').isDisabled());
  await page.locator('#width').fill('641'); await page.locator('#height').fill('361');
  await page.locator('#tld').fill('.dev');
  await page.waitForFunction(() => !document.getElementById('export').disabled && document.getElementById('canvas-size').textContent.includes('641'));
  assert.doesNotMatch(await page.locator('#warnings').textContent(), /untested/i);
  await page.locator('#autoname').uncheck(); await page.locator('#filename').fill('app-export.mp4'); await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('job-status').textContent === 'EXPORT READY', null, { timeout: 120000 });
  const output = join(outputDirectory, 'app-export.mp4');
  const ffprobe = await executable(process.env.BILLBOARD_FFPROBE, ['ffprobe'], 'ffprobe');
  const verified = await verifyVideo(output, ffprobe);
  assert.equal(verified.streams[0].width, 642); assert.equal(verified.streams[0].height, 362);
  assert.equal(JSON.parse(verified.format.tags.comment).background, 'black');
  assert.equal(JSON.parse(verified.format.tags.comment).backgroundColor, '#000000');
  assert.equal(JSON.parse(verified.format.tags.comment).animation, 'laseretch');
  assert.equal(JSON.parse(verified.format.tags.comment).themeOrigin, 'custom');
  assert.deepEqual(JSON.parse(verified.format.tags.comment).customTheme, customDocument);
  await page.screenshot({ path: join(base, 'export-ready.png'), fullPage: true });
  const ffmpeg = await executable(process.env.BILLBOARD_FFMPEG, ['ffmpeg'], 'ffmpeg');
  const padding = execFileSync(ffmpeg, ['-v', 'error', '-ss', '12', '-i', output, '-vf', 'format=rgb24,crop=1:1:iw-1:ih-1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  assert.equal(padding.length, 3);
  assert.ok(padding.every(channel => channel <= 3), 'Odd-size MP4 padding must use the overridden black background.');
  assert.deepEqual(opened, [], 'Auto play is off by default.');
  await page.locator('#open-player').click(); await page.locator('#open-folder').click();
  await page.waitForTimeout(100); assert.deepEqual(opened, [output, outputDirectory]);
  report.checks.push('UI export produces a verified MP4 with decoded black padding; only external-player and output-folder actions are available.');
  const before = await readFile(output);
  await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('already exists'));
  assert.match(await page.locator('#error').textContent(), /Enable Overwrite or choose another filename/);
  assert.doesNotMatch(await page.locator('#error').textContent(), /--force/);
  assert.equal(await page.locator('#job-status').textContent(), 'EXPORT READY');
  assert.deepEqual(await readFile(output), before);
  await page.locator('#force').check(); await page.locator('#auto-play').check(); await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('job-status').textContent === 'EXPORTING');
  await page.waitForFunction(() => document.getElementById('job-status').textContent === 'EXPORT READY', null, { timeout: 120000 });
  assert.deepEqual(opened, [output, outputDirectory, output], 'Auto play opens a successful export once.');
  report.checks.push('Existing files are rejected before export with GUI guidance; Overwrite and default-off Auto play work.');
  await page.locator('#preset').selectOption('1920x1080');
  await page.waitForFunction(() => !document.getElementById('export').disabled && document.getElementById('canvas-size').textContent.includes('1920'));
  await page.locator('#filename').fill('cancelled.mp4'); await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('job-message').textContent.includes('Frame '), null, { timeout: 60000 });
  await page.locator('#cancel').click();
  await page.waitForFunction(() => document.getElementById('job-status').textContent === 'EXPORT CANCELLED', null, { timeout: 30000 });
  assert.ok(!(await readdir(outputDirectory)).includes('cancelled.mp4'));
  assert.equal(opened.length, 3, 'Cancelled exports must not open the player.');
  assert.ok(!(await readdir(outputDirectory)).some(file => file.startsWith('.billboard-')));
  report.checks.push('Cancelling a real export removes its temporary file and restores the UI.');
  await page.locator('#background').selectOption('theme');
  await page.locator('#language').selectOption('ar'); await page.locator('#theme').selectOption('white');
  await page.locator('#preset').selectOption('1080x1920');
  await page.waitForFunction(() => !document.getElementById('export').disabled && document.getElementById('canvas-size').textContent.includes('1080'));
  await page.locator('[data-frame="263"]').click();
  await page.screenshot({ path: join(base, 'arabic-portrait.png'), fullPage: true });
  await page.setViewportSize({ width: 640, height: 960 }); await page.screenshot({ path: join(base, 'narrow-window.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  report.checks.push('Responsive layout has no horizontal overflow; no uncaught page errors.');
  await page.locator('#filename').fill('closed-with-app.mp4'); await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('job-message').textContent.includes('Frame '), null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), false);
  await page.close(); await app.close();
  assert.ok(!(await readdir(outputDirectory)).includes('closed-with-app.mp4'));
  assert.ok(!(await readdir(outputDirectory)).some(file => file.startsWith('.billboard-')));
  report.checks.push('App shutdown aborts a real worker export and removes temporary output.');
  await writeFile(join(base, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Desktop app checks passed. Screenshots and report: ${base}`);
} catch (error) {
  await page?.screenshot({ path: join(base, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await app.close(); await context?.close();
  if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp;
  for (const name of ['profile', 'cache', 'config', '.pki']) await rm(join(work, name), { recursive: true, force: true });
}
