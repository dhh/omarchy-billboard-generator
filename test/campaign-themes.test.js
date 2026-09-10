import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { availableThemes } from '../src/themes.js';
import { loadSnapshot, validateSnapshot } from '../src/snapshot.js';
import { parseOptions } from '../src/options.js';
import { prepareRenderConfig } from '../src/render-config.js';

const snapshot = await loadSnapshot();
test('campaign palettes preserve original colors, stops and provenance without contaminating website data', async () => {
  const before = structuredClone(snapshot), themes = availableThemes(snapshot);
  assert.equal(themes.length, snapshot.themes.length + 2);
  validateSnapshot({ ...snapshot, themes });
  const astral = themes.find(theme => theme.id === 'astral'), danish = themes.find(theme => theme.id === 'danish-dynamite');
  assert.equal(astral.name, 'Astral'); assert.equal(danish.name, 'Danish Dynamite');
  assert.deepEqual(astral.gradient.map(b => b.color), ['#ffffff', '#d9f4ff', '#9beaff', '#5de0ff', '#3edbff', '#00d1ff', '#1e9cde', '#3082d0', '#544eb4', '#781a98']);
  assert.deepEqual(astral.gradient.map(b => b.from), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(danish.gradient.map(b => b.color), ['#fefefe', '#f68586', '#ec0518', '#a9011c', '#630217']);
  assert.ok(Math.abs(danish.gradient[1].from - 25.71428571428571) < 1e-10);
  assert.ok(Math.abs(danish.gradient[4].from - 81.19047619047619) < 1e-10);
  for (const theme of [astral, danish]) {
    assert.equal(theme.background, '#000000'); assert.equal(theme.origin, 'campaign');
    assert.equal(theme.provenance.sha256, '55f2af668864c5fa36f6fd5eace0ee61f5f0abdf93ab3145a625a7c134a091b4');
    const options = parseOptions(['--theme', theme.id, '--background', 'white'], snapshot);
    assert.equal(options.language, 'en'); assert.equal(options.tld, '.ORG');
    const config = await prepareRenderConfig(options, snapshot);
    assert.equal(config.theme.background, '#ffffff'); assert.deepEqual(config.theme.gradient, theme.gradient);
    assert.equal(config.theme.cursor, theme.cursor); assert.equal(config.locale.tagline, snapshot.languages.find(l => l.id === 'en').tagline);
  }
  assert.equal(astral.brand, '#89b4fa'); assert.equal(astral.cursor, '#7dcfff');
  assert.equal(danish.brand, '#ffffff'); assert.equal(danish.cursor, '#f68586');
  assert.deepEqual(snapshot, before);
  const updated = structuredClone(snapshot); updated.commit = 'a'.repeat(40);
  assert.deepEqual(availableThemes(updated).filter(t => t.origin === 'campaign'), [astral, danish]);
  assert.throws(() => availableThemes({ ...snapshot, themes: [...snapshot.themes, { id: 'astral' }] }), /conflicts/);
});

test('CLI lists campaign themes separately from website themes', () => {
  const result = spawnSync(process.execPath, ['bin/omarchy-billboard', '--list-themes'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /astral\tAstral\t.*\tcampaign/);
  assert.match(result.stdout, /danish-dynamite\tDanish Dynamite\t.*\tcampaign/);
  assert.match(result.stdout, /hackerman\tHackerman\t.*\twebsite/);
});
