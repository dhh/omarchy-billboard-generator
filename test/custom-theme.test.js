import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeCustomTheme, parseThemeText, customThemePalette, loadThemeFile, resolveThemeOptions, THEME_FILE_LIMIT } from '../src/custom-theme.js';
import { parseOptions } from '../src/options.js';
import { prepareRenderConfig, renderTheme } from '../src/render-config.js';
import { loadSnapshot } from '../src/snapshot.js';

const document = JSON.parse(await readFile(new URL('../examples/aurora.json', import.meta.url)));
const snapshot = await loadSnapshot();
const clone = () => structuredClone(document);
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'custom-theme-'));
  t.after(() => rm(path, { recursive: true, force: true })); return path;
}

test('custom themes normalize safe colors and produce stable content identities', () => {
  const copy = clone(); copy.background = copy.background.toUpperCase(); copy.name = ' Aurora ';
  assert.deepEqual(normalizeCustomTheme(copy), document);
  assert.deepEqual(parseThemeText('\uFEFF' + JSON.stringify(copy)), document);
  assert.equal(customThemePalette(copy).id, customThemePalette(document).id);
  assert.equal(customThemePalette(copy).origin, 'custom');
  assert.match(customThemePalette(copy).provenance.sha256, /^[a-f\d]{64}$/);
  copy.brand = '#ffffff'; assert.notEqual(customThemePalette(copy).id, customThemePalette(document).id);
  const one = clone(); one.gradient = [{ color: '#abcdef', from: 0, to: 100 }];
  assert.equal(normalizeCustomTheme(one).gradient.length, 1);
});

test('custom theme validation rejects malformed, executable-looking and oversized data', () => {
  for (const value of [null, [], {}, { ...document, schemaVersion: 2 }, { ...document, light: 'false' },
    { ...document, name: '' }, { ...document, name: 'x'.repeat(81) }, { ...document, name: 'bad\nname' },
    { ...document, brand: 'url(https://example.com)' }, { ...document, cursor: '#fff' },
    { ...document, background: '#ffffff; color:red' }, { ...document, gradient: [] },
    { ...document, gradient: Array(33).fill(document.gradient[0]) },
    { ...document, execute: 'never execute' }, { ...document, provenance: { origin: 'website' } },
    JSON.parse('{"__proto__":{},"schemaVersion":1}')]) assert.throws(() => normalizeCustomTheme(value), /Invalid theme file/);
  for (const mutate of [
    d => { d.gradient[0].from = .1; }, d => { d.gradient.at(-1).to = 99; },
    d => { d.gradient[1].from = 24; }, d => { d.gradient[1].from = 26; },
    d => { d.gradient[0].to = 0; }, d => { d.gradient[0].to = '25'; },
    d => { d.gradient[0].to = Infinity; }, d => { d.gradient[0].extra = true; },
    d => { d.gradient[0] = null; },
  ]) { const value = clone(); mutate(value); assert.throws(() => normalizeCustomTheme(value), /Invalid theme file/); }
  for (const text of ['// comment', 'export default {}', '{', JSON.stringify(document) + ' '.repeat(THEME_FILE_LIMIT)]) {
    assert.throws(() => parseThemeText(text), /Invalid theme file/);
  }
  assert.throws(() => parseThemeText(42), /JSON text/);
});

test('theme files are bounded regular UTF-8 files and are never modified', async t => {
  const dir = await directory(t), path = join(dir, 'my theme.json'), bytes = JSON.stringify(document);
  await writeFile(path, bytes); assert.deepEqual(await loadThemeFile(path), document);
  assert.equal(await readFile(path, 'utf8'), bytes);
  await symlink(path, join(dir, 'linked.json')); assert.deepEqual(await loadThemeFile(join(dir, 'linked.json')), document);
  await assert.rejects(loadThemeFile(dir), /regular JSON file/);
  await assert.rejects(loadThemeFile(join(dir, 'missing.json')), /ENOENT/);
  await writeFile(path, Buffer.alloc(THEME_FILE_LIMIT + 1)); await assert.rejects(loadThemeFile(path), /16 KiB/);
  await writeFile(path, Buffer.from([0xff, 0xfe])); await assert.rejects(loadThemeFile(path), /UTF-8/);
  const fifo = join(dir, 'pipe.json'); execFileSync('mkfifo', [fifo]);
  await assert.rejects(loadThemeFile(fifo), /regular JSON file/);
});

test('theme-file selection is exclusive and rendering freezes normalized palette data', async t => {
  const dir = await directory(t), path = join(dir, 'theme.json'); await writeFile(path, JSON.stringify(document));
  const options = parseOptions(['--theme-file', path, '--animation', 'laseretch'], snapshot);
  assert.equal(options.themeFile, path); assert.equal(options.theme, undefined);
  for (const args of [['--theme-file', path, '--theme', 'hackerman'], ['--theme-file', path, '--list-themes'], ['sync', '--theme-file', path], ['--theme-file', '']]) {
    assert.throws(() => parseOptions(args, snapshot));
  }
  const selected = await resolveThemeOptions(options), original = JSON.stringify(selected);
  assert.equal(selected.themeFile, undefined); assert.deepEqual(selected.customTheme, document);
  await writeFile(path, '{}');
  const config = await prepareRenderConfig(selected, snapshot);
  assert.equal(config.theme.origin, 'custom'); assert.equal(config.theme.background, document.background);
  assert.equal(config.themeFile, undefined); assert.equal(config.animation.id, 'laseretch');
  for (const background of ['black', 'white']) {
    const theme = renderTheme({ ...selected, background }, snapshot);
    assert.equal(theme.background, background === 'black' ? '#000000' : '#ffffff');
    assert.equal(theme.light, background === 'white'); assert.deepEqual(theme.gradient, document.gradient);
  }
  assert.equal(JSON.stringify(selected), original);
  await assert.rejects(resolveThemeOptions({ ...selected, theme: 'hackerman' }), /either/);
  await assert.rejects(resolveThemeOptions({ ...selected, themeFile: path }), /one custom theme source/);
  assert.throws(() => renderTheme({ ...selected, theme: 'wrong' }, snapshot), /does not match/);
});
