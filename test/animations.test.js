import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { animations, animationById } from '../src/animations.js';
import { parseOptions } from '../src/options.js';
import { loadSnapshot } from '../src/snapshot.js';
import { buildWordmark } from '../src/wordmark.js';
import { weightOf } from '../web/etch-cells.js';

test('all 37 website animations and the campaign variant are explicit, independent options', async () => {
  const snapshot = await loadSnapshot();
  assert.equal(animations.length, 38); assert.equal(new Set(animations.map(a => a.id)).size, 38);
  assert.equal(animationById().name, 'laseretch - campaign');
  for (const a of animations) assert.equal(parseOptions(['--animation', a.id], snapshot).animation, a.id);
  assert.equal(parseOptions(['--animation', 'LASERETCH'], snapshot).theme, 'astral');
  assert.throws(() => animationById('random'), /Unknown animation/);
  assert.throws(() => animationById('../all.wasm'), /Unknown animation/);
  assert.throws(() => animationById(null), /must be text/);
  assert.throws(() => parseOptions(['--list-animations', '--theme', 'white'], snapshot), /cannot be combined/);
  assert.throws(() => parseOptions(['--list-animations', '--list-themes'], snapshot), /one command/);
  const listed = spawnSync(process.execPath, ['bin/omarchy-billboard', '--list-animations'], { encoding: 'utf8' });
  assert.equal(listed.status, 0); assert.equal(listed.stdout.trim().split('\n').length, 38);
  assert.match(listed.stdout, /laseretch-campaign\tlaseretch - campaign\tcampaign/);
  assert.match(listed.stdout, /laseretch\tlaseretch\twebsite/);
});

test('pinned website animation assets match provenance and bitmap matches official geometry', async () => {
  const root = new URL('../assets/website-etch/', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('provenance.json', root)));
  for (const file of provenance.files) {
    const hash = createHash('sha256').update(await readFile(new URL(file.file, root))).digest('hex');
    assert.equal(hash, file.sha256, file.file);
  }
  const bitmap = JSON.parse(await readFile(new URL('bitmap.json', root))), { base } = await buildWordmark('.ORG');
  assert.equal(bitmap.rows.length, bitmap.height);
  for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
    const px = (x + .5) * 5.1, py = (y + .5) * 5;
    const occupied = base.some(r => px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height);
    assert.equal(bitmap.rows[y][x] === '1', occupied, `Bitmap ${x},${y}`);
  }
  assert.equal(weightOf('.'.codePointAt(0)), .12); assert.equal(weightOf('@'.codePointAt(0)), .7);
});
