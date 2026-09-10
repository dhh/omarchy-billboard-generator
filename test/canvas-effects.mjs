import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openRenderer } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';

const directory = '.cache/canvas-effects'; await mkdir(directory, { recursive: true });
const snapshot = await loadSnapshot(), reports = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [width, height] of [[900, 240], [1920, 1080], [360, 640]]) {
  const options = { width, height, theme: 'hackerman', language: 'en', tld: '.ORG' };
  const renderer = await openRenderer({ ...options, animation: 'synthgrid' }, snapshot);
  let final;
  try {
    const viewport = renderer.layout.animationViewport, bounds = viewport.bounds;
    assert.ok(bounds.x <= 0 && bounds.y <= 0);
    assert.ok(bounds.x + bounds.width >= width && bounds.y + bounds.height >= height);
    assert.equal(viewport.cellW, 5.1 * renderer.layout.logoScale);
    assert.equal(viewport.cellH, 5 * renderer.layout.logoScale);
    const occupied = await renderer.page.evaluate(() => {
      window.renderFrame(50, false);
      const canvas = document.querySelector('canvas'), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const background = window.layout.settings.backgroundColor.match(/[a-f\d]{2}/gi).map(hex => parseInt(hex, 16));
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (background.every((channel, n) => data[i + n] === channel)) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      return { left, top, right, bottom };
    });
    assert.ok(occupied.left <= 1 && occupied.top <= 1, `${width}x${height}: upper/left edges unused`);
    assert.ok(occupied.right >= width - 2 && occupied.bottom >= height - 2, `${width}x${height}: lower/right edges unused`);
    for (const index of [30, 50, 70]) await writeFile(`${directory}/synthgrid-${width}x${height}-${index}.png`, await renderer.frame(index));
    const frame = hash(await renderer.frame(50)); await renderer.frame(10);
    assert.equal(hash(await renderer.frame(50)), frame);
    final = hash(await renderer.frame(295)); reports.push({ width, height, viewport, occupied });
  } finally { await renderer.close(); }
  const campaign = await openRenderer(options, snapshot);
  try { assert.equal(hash(await campaign.frame(295)), final, 'Final wordmark, suffix and tagline must remain unchanged.'); }
  finally { await campaign.close(); }
}
await writeFile(`${directory}/report.json`, JSON.stringify(reports, null, 2) + '\n');
console.log('Synthgrid reaches all four canvas edges in billboard, Full HD and portrait outputs, with unchanged final artwork.');
