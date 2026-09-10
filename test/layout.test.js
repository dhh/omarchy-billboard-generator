import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLayout, effectMapping } from '../web/layout.js';
import { buildWordmark } from '../src/wordmark.js';

function context() {
  return { font: '', measureText(text) {
    const size = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 34);
    return { width: [...text].length * size * .6, actualBoundingBoxAscent: size * .75, actualBoundingBoxDescent: size * .2 };
  } };
}

test('the floor follows canvas height, including square, portrait and small canvases', async () => {
  const wordmark = await buildWordmark('.CO.UK');
  for (const [width, height] of [[900, 240], [900, 480], [1920, 1080], [720, 1280], [600, 600], [320, 96], [2000, 100], [501, 701], [2, 2]]) {
    const layout = calculateLayout(context(), { width, height, wordmark, locale: { id: 'en', tagline: 'Beautiful, fun & agentic Linux' } });
    assert.equal(layout.floorY, height - Math.min(height / 2, 6 * layout.unit));
    assert.ok(layout.floorY > height * .95 || height < 10);
    const mapping = effectMapping(layout, 5, 20);
    assert.ok(Math.abs(mapping.mapY(19) + layout.cellH / 2 - layout.floorY) < 1e-8, 'Final particle cell center meets the actual floor.');
    assert.ok(Math.abs(mapping.mapY(14) - (mapping.originY + 14 * layout.cellH)) < 1e-8, 'Logo rows must not stretch.');
    assert.ok(layout.fullWidth <= width);
    assert.ok(layout.top >= 0 && layout.baseline + layout.descent <= height + 1);
  }
});

test('long suffixes, small canvases and multiline copy warn rather than enforce layout gates', async () => {
  const layout = calculateLayout(context(), { width: 120, height: 60, wordmark: await buildWordmark('.ABCDEFGHIJKLMNOPQRSTUVWXYZ'), locale: { id: 'en', tagline: 'A very long experimental tagline that needs more room than this small canvas provides' } });
  assert.ok(layout.warnings.length);
  assert.ok(layout.fontSize > 0 && layout.logoHeight > 0);
});
