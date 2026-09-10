import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../src/snapshot.js';
import { testedThemes } from '../src/support.js';

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
