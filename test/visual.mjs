import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openRenderer } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';
import { availableThemes } from '../src/themes.js';

const snapshot = await loadSnapshot(), frames = [17, 40, 70, 100, 120, 125, 140, 160, 175, 237, 250, 263, 295];
const cases = [
  ['hackerman', 'da', '.DK', 900, 240],
  ['white', 'en', '.ORG', 900, 240],
  ['tokyo-night', 'fr', '.COM', 1920, 1080],
  ['hackerman', 'ja', '.DE', 900, 480],
  ['white', 'ar', '.ORG', 900, 240],
  ['tokyo-night', 'fr', '.COM', 900, 240],
  ['hackerman', 'is', '.ORG', 900, 240],
  ['hackerman', 'en', '.ORG', 3840, 2160],
  ['astral', 'da', '.DK', 900, 240],
  ['danish-dynamite', 'da', '.DK', 900, 240],
  ['hackerman', 'zh-CN', '.ORG', 900, 240],
];
const report = { revision: snapshot.commit, cases: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [theme, language, tld, width, height] of cases) {
  const name = `${theme}-${language}-${width}x${height}`, directory = `.cache/visual/${name}`;
  await mkdir(directory, { recursive: true });
  const renderer = await openRenderer({ theme, language, tld, width, height }, snapshot);
  try {
    const { layout } = renderer;
    assert.ok(layout.top >= 0 && layout.top + layout.logoHeight < height);
    assert.ok(layout.lines.every(l => l.width < width - 2 * layout.padding && l.y + layout.descent < height));
    assert.ok(layout.fullWidth <= width - 2 * layout.padding + .01);
    assert.ok(layout.floorY >= layout.lines.at(-1).y + layout.descent + 8 * layout.unit, 'Floor must remain below the tagline.');
    assert.equal(layout.floorY, height - Math.min(height / 2, 6 * layout.unit), 'Floor must track the bottom edge, not the composition.');
    assert.equal(layout.padX, 21); assert.equal(layout.padTop, 5);
    assert.ok(layout.sparkMetadata.differentAirborneFrames >= 100);
    assert.equal(layout.sparkMetadata.piles.lastVisibleFrame, 161);
    const hashes = {};
    for (const index of frames) {
      const bytes = await renderer.frame(index);
      hashes[index] = hash(bytes);
      await writeFile(`${directory}/${index}.png`, bytes);
      if (index === 295 && ['astral', 'danish-dynamite'].includes(theme)) {
        const colors = availableThemes(snapshot).find(t => t.id === theme).gradient.map(b => parseInt(b.color.slice(1), 16));
        const found = await renderer.page.evaluate(colors => {
          const canvas = document.querySelector('canvas'), pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          const wanted = new Set(colors), seen = new Set();
          for (let i = 0; i < pixels.length; i += 4) {
            const color = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
            if (wanted.has(color)) seen.add(color);
          }
          return seen.size;
        }, colors);
        assert.equal(found, colors.length, 'Every original campaign gradient band must be present.');
      }
      if (index === 70) {
        const activePixels = await renderer.page.evaluate(() => {
          const c = document.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let orange = 0, hot = 0, groundOrange = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 160 && d[i + 1] > 40 && d[i + 1] < d[i] * .8 && d[i + 2] < 100) {
              orange++;
              if (Math.floor(i / 4 / c.width) > c.height - 50 * window.layout.unit) groundOrange++;
            }
            if (d[i] > 180 && d[i + 1] > 140 && d[i + 2] < 120) hot++;
          }
          return { orange, hot, groundOrange };
        });
        assert.ok(activePixels.orange > 20, 'Native orange heat/sparks must survive theme application.');
        assert.ok(activePixels.hot > 10, 'Native hot highlights must survive theme application.');
        assert.ok(activePixels.groundOrange > 10, 'Visible native embers must reach the bottom of the canvas.');
      }
    }
    for (const index of [...frames].reverse()) assert.equal(hash(await renderer.frame(index)), hashes[index], `Order-independent frame ${index}: ${name}`);
    const settings = { name, browser: renderer.browserVersion, hashes, layout };
    await writeFile(`${directory}/layout.json`, JSON.stringify(layout, null, 2) + '\n');
    report.cases.push(settings);
    console.log(`Validated frames: ${name}`);
  } finally { await renderer.close(); }
}
// A fresh browser must reproduce the reference frame, not merely a cached canvas.
const first = cases[0], renderer = await openRenderer({ theme: first[0], language: first[1], tld: first[2], width: first[3], height: first[4] }, snapshot);
try { for (const index of frames) assert.equal(hash(await renderer.frame(index)), report.cases[0].hashes[index]); }
finally { await renderer.close(); }
await writeFile('.cache/visual/report.json', JSON.stringify(report, null, 2) + '\n');
// Persist small regression hashes only when deliberately accepting a reviewed render.
if (process.argv.includes('--update')) {
  await mkdir('test/fixtures', { recursive: true });
  await writeFile('test/fixtures/frame-hashes.json', JSON.stringify({ revision: snapshot.commit, browser: report.cases[0].browser, frames: report.cases[0].hashes }, null, 2) + '\n');
} else {
  const expected = JSON.parse(await readFile('test/fixtures/frame-hashes.json', 'utf8'));
  if (expected.browser === report.cases[0].browser && expected.revision === snapshot.commit) assert.deepEqual(report.cases[0].hashes, expected.frames);
  else console.log('Stored pixel baseline uses a different browser or revision. Cross-session determinism passed; review before updating baseline.');
}
console.log('Visual frame checks passed. Inspect .cache/visual for rendered images and the report.');
