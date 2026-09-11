import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../src/snapshot.js';
import { testedThemes } from '../src/support.js';
import { backgroundWarnings } from '../web/contrast.js';

function luminance(hex) {
  return hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('previously tested pinned palettes have readable tagline contrast, including White', async () => {
  for (const theme of (await loadSnapshot()).themes.filter(t => testedThemes.has(t.id))) {
    assert.ok(contrast(theme.background, theme.brand) >= 4.5, `${theme.id} tagline contrast`);
    // Decorative lower logo bands are intentionally dimmer than the tagline.
    assert.ok(theme.gradient.every(b => contrast(theme.background, b.color) > 1.6), `${theme.id} decorative band contrast`);
  }
});

test('low tagline contrast warns on the theme background as well as the overrides', () => {
  const theme = { background: '#101010', brand: '#181818' };
  assert.match(backgroundWarnings({ background: 'theme', theme })[0], /Low tagline contrast: 1\.\d\d:1 against the theme background/);
  assert.match(backgroundWarnings({ theme })[0], /against the theme background/);
  assert.match(backgroundWarnings({ background: 'black', theme })[0], /against the black background/);
  assert.deepEqual(backgroundWarnings({ background: 'theme', theme: { background: '#101010', brand: '#f0f0f0' } }), []);
});
