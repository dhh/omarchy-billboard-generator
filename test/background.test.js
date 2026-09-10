import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../src/snapshot.js';
import { parseOptions } from '../src/options.js';
import { availableThemes } from '../src/themes.js';
import { renderTheme, prepareRenderConfig } from '../src/render-config.js';

const snapshot = await loadSnapshot();
test('background overrides are validated and preserve upstream artwork without mutating the snapshot', async () => {
  const before = structuredClone(snapshot);
  for (const theme of ['hackerman', 'white']) for (const background of ['theme', 'black', 'white']) {
    const options = parseOptions(['--theme', theme, '--background', background], snapshot);
    const original = availableThemes(snapshot).find(t => t.id === theme);
    const effective = renderTheme(options, snapshot);
    assert.deepEqual(effective, { ...original, background: background === 'theme' ? original.background : background === 'black' ? '#000000' : '#ffffff', light: background === 'theme' ? original.light : background === 'white' });
    assert.deepEqual((await prepareRenderConfig(options, snapshot)).theme, effective);
  }
  assert.deepEqual(snapshot, before);
  assert.equal(parseOptions(['--background', 'BLACK'], snapshot).background, 'black');
  assert.throws(() => parseOptions(['--background', 'red'], snapshot), /Background must/);
  assert.throws(() => parseOptions(['sync', '--background', 'black'], snapshot), /Render options/);
  assert.throws(() => renderTheme({ theme: 'hackerman', background: '#000' }, snapshot), /Background must/);
});
