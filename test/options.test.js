import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOptions } from '../src/options.js';
import { loadSnapshot } from '../src/snapshot.js';
import { combinationWarnings } from '../src/support.js';

const snapshot = await loadSnapshot();
const parse = args => parseOptions(args, snapshot);
test('defaults are explicit and suffix, language and theme are independent', () => {
  assert.deepEqual(parse([]), { command: 'render', tld: '.ORG', language: 'en', theme: 'astral', animation: 'laseretch-campaign', background: 'theme', width: 900, height: 240, output: 'omarchy.mp4', force: false });
  assert.equal(parse(['--tld', '.dk']).language, 'en');
  assert.equal(parse(['--language', 'da']).tld, '.ORG');
  for (const tld of ['dk', '.org', '.COM', '.de']) assert.equal(parse(['--tld', tld]).tld, '.' + tld.replace(/^\./, '').toUpperCase());
  for (const resolution of ['900x240', '900x480', '1920x1080']) assert.equal(parse(['--resolution', resolution]).height, Number(resolution.split('x')[1]));
});

test('invalid input and mixed commands fail with diagnostics', () => {
  for (const [args, message] of [
    [['--tld', '<svg>'], /Invalid domain suffix/],
    [['--tld', '.bad..label'], /Invalid domain suffix/],
    [['--resolution', '0x240'], /positive safe integers/],
    [['--resolution', '99999999999999999x240'], /positive safe integers/],
    [['--resolution', '900'], /WIDTHxHEIGHT/],
    [['--theme', 'campaign-blue'], /Unknown theme/],
    [['--language', 'xx'], /Unknown language/],
    [['--output', 'out.gif'], /MP4/],
    [['--revision', 'master'], /only valid with sync/],
    [['sync', '--list-themes'], /one command/],
    [['sync', '--output', 'a.mp4'], /cannot be combined/],
    [['--list-languages', '--list-themes'], /one command/],
    [['bogus'], /one command/],
    [['--unknown'], /Unknown option/],
  ]) assert.throws(() => parse(args), message);
});

test('arbitrary valid suffixes and resolutions are accepted without coverage warnings', () => {
  for (const resolution of ['320x96', '720x1280', '600x600', '900x180', '5120x2880', '901x241', '2x2']) {
    const o = parse(['--resolution', resolution, '--tld', '.co.uk', '--language', 'hi', '--theme', 'catppuccin-latte']);
    assert.equal(o.tld, '.CO.UK');
    assert.doesNotMatch(combinationWarnings(o).join(' '), /untested/i);
  }
  assert.equal(parse(['--tld', '.中国']).tld, '.XN--FIQS8S');
  assert.equal(parse(['--tld', '.x']).tld, '.X');
  assert.equal(parse(['--language', 'ES-mx']).language, 'es-MX');
  assert.equal(parse(['--theme', 'Catppuccin']).theme, 'catppuccin');
  assert.equal(parse(['--tld', '.123']).tld, '.123');
  assert.equal(parse(['--tld', '.co.123']).tld, '.CO.123');
  assert.equal(parse(['--tld', '.abcdefghijklmnopqrstuvwxyz']).tld, '.ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  assert.match(combinationWarnings(parse(['--resolution', '901x241'])).join(' '), /padded.*902x242/);
  assert.deepEqual(combinationWarnings(parse([])), []);
  assert.deepEqual(combinationWarnings(parse(['--language', 'ja'])), []);
});

test('language listing identifies languages by English name and retains locale details', () => {
  const result = spawnSync(process.execPath, ['bin/omarchy-billboard', '--list-languages'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split('\n').map(line => line.split('\t'));
  for (const [id, name] of [['en', 'English'], ['da', 'Danish'], ['ja', 'Japanese'], ['ar', 'Arabic'], ['es-MX', 'Spanish (Mexico)']]) {
    const row = rows.find(row => row[0] === id);
    assert.ok(row, `Missing locale: ${id}`);
    assert.equal(row[1], name);
    assert.equal(row[2], snapshot.languages.find(l => l.id === id).direction);
    assert.ok(row[3].length > 0);
    assert.equal(row.length, 4); assert.doesNotMatch(row.join(' '), /untested/i);
  }
});

test('CLI help and missing dependency diagnostics', async t => {
  const cache = await mkdtemp(join(tmpdir(), 'billboard-cli-'));
  t.after(() => rm(cache, { recursive: true, force: true }));
  const help = spawnSync(process.execPath, ['bin/omarchy-billboard', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /One 15-second, 25 fps H.264 MP4/);
  const render = spawnSync(process.execPath, ['bin/omarchy-billboard'], { encoding: 'utf8', env: { ...process.env, BILLBOARD_CHROMIUM: join(cache, 'missing-chromium') } });
  assert.equal(render.status, 1);
  assert.match(render.stderr, /Chromium was not found/);
});
