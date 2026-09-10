import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteViewport, viewportBounds } from '../web/website-viewport.js';

const bitmap = { width: 81, height: 19 };
function layout(width, height, scale, top) {
  return { width, height, logoScale: scale, top, baseWidth: 413.1 * scale, tailWidth: 150 * scale };
}
test('website effect viewports cover wide, tall and off-center canvases without scaling cells', () => {
  for (const value of [layout(900, 240, 1.3, 27), layout(1920, 1080, 2.8, 342),
    layout(360, 640, .52, 283), layout(640, 640, .9, 240), layout(2400, 240, 1.3, 27)]) {
    const viewport = websiteViewport(value, bitmap);
    assert.equal(viewport.cellW, 5.1 * value.logoScale); assert.equal(viewport.cellH, 5 * value.logoScale);
    assert.ok(viewport.columns > 93 || viewport.rows > 27);
    // The pinned runtime's centered, unpadded bitmap anchor. Browser tests also
    // verify actual measured offsets and occupied pixels rather than this model.
    const offset = { x: Math.ceil(viewport.columns / 2) - 40, y: Math.floor(viewport.rows / 2) - 10 };
    const bounds = viewportBounds(viewport, offset, { width: viewport.columns, height: viewport.rows });
    assert.ok(bounds.x <= 0 && bounds.y <= 0);
    assert.ok(bounds.x + bounds.width >= value.width && bounds.y + bounds.height >= value.height);
    assert.ok(Math.abs(bounds.x + offset.x * viewport.cellW - viewport.logoX) < 1e-9);
    assert.ok(Math.abs(bounds.y + offset.y * viewport.cellH - value.top) < 1e-9);
  }
});
test('unreasonable simulation grids fail before allocating the runtime session', () => {
  assert.throws(() => websiteViewport(layout(1000000, 240, .01, 0), bitmap), /simulation budget/);
  assert.throws(() => websiteViewport(layout(900, 240, 0, 0), bitmap), /simulation budget/);
});
