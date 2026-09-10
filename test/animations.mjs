import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { animations } from '../src/animations.js';
import { openRenderer, renderVideo } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';
import { resolve } from 'node:path';

const snapshot = await loadSnapshot(), directory = resolve('.cache/animations');
await mkdir(directory, { recursive: true });
const defaults = { theme: 'hackerman', language: 'en', tld: '.ORG', width: 900, height: 240 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const campaign = await openRenderer(defaults, snapshot);
let final, campaignOpening;
try { final = hash(await campaign.frame(295)); campaignOpening = hash(await campaign.frame(70)); }
finally { await campaign.close(); }
const report = [], openings = new Set();
for (const animation of animations.filter(a => a.origin === 'website')) {
  const options = { ...defaults, animation: animation.id };
  const renderer = await openRenderer(options, snapshot);
  let opening;
  try {
    assert.equal(renderer.layout.settings.animation, animation.id);
    assert.deepEqual(renderer.layout.seeds, [42]);
    const bounds = renderer.layout.animationViewport.bounds;
    assert.ok(bounds.x <= 0 && bounds.y <= 0);
    assert.ok(bounds.x + bounds.width >= options.width && bounds.y + bounds.height >= options.height);
    assert.equal(renderer.layout.animationProvenance.commit, animation.provenance.commit);
    const frames = {};
    for (const index of [0, 30, 70, 110, 119, 124, 295]) {
      const bytes = await renderer.frame(index); frames[index] = hash(bytes);
      if ([70, 119].includes(index)) await writeFile(`${directory}/${animation.id}-${index}.png`, bytes);
    }
    assert.equal(frames[295], final, `${animation.id}: final artwork changed`);
    assert.equal(hash(await renderer.frame(30)), frames[30], `${animation.id}: reverse seeking`);
    assert.equal(hash(await renderer.frame(70)), frames[70], `${animation.id}: forward seeking`);
    opening = frames[70]; openings.add([frames[30], frames[70], frames[110]].join(':'));
    if (animation.id === 'laseretch') assert.notEqual(opening, campaignOpening);
    report.push({ animation: animation.id, totalSteps: renderer.layout.totalSteps, frames });
  } finally { await renderer.close(); }
  const second = await openRenderer(options, snapshot);
  try { assert.equal(hash(await second.frame(70)), opening, `${animation.id}: fresh-session determinism`); }
  finally { await second.close(); }
  console.log(`Validated animation: ${animation.id}`);
}
assert.ok(openings.size >= 35, 'Effects must not collapse to a shared placeholder animation.');
for (const [animation, theme, language, width, height] of [
  ['laseretch', 'white', 'ar', 900, 240], ['fireworks', 'astral', 'ja', 360, 640],
  ['matrix', 'danish-dynamite', 'en', 641, 361], ['waves', 'hackerman', 'en', 3840, 2160],
]) {
  const renderer = await openRenderer({ ...defaults, animation, theme, language, width, height }, snapshot);
  try {
    await writeFile(`${directory}/${animation}-${theme}-${width}x${height}.png`, await renderer.frame(70));
    assert.ok(await renderer.frame(295));
  } finally { await renderer.close(); }
}
for (const animation of ['laseretch', 'fireworks']) {
  const result = await renderVideo({ ...defaults, animation, width: 641, height: 361,
    output: `${directory}/${animation}.mp4`, force: true }, snapshot, { progress: () => {} });
  const metadata = JSON.parse(result.verified.format.tags.comment);
  assert.equal(metadata.animation, animation); assert.deepEqual(metadata.seeds, [42]);
  assert.ok(metadata.animationViewport.columns > 93);
  assert.equal(metadata.animationProvenance.commit, animations.find(a => a.id === animation).provenance.commit);
}
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log('All website effects are deterministic, seekable and retain the final artwork. Two MP4 exports verified.');
