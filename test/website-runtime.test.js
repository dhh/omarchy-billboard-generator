import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import initialize, { Session } from '../assets/website-etch/ttfx.js';
import { animations } from '../src/animations.js';

test('every pinned website effect settles with multi-color and single-color palettes within the step budget', async () => {
  await initialize({ module_or_path: await readFile(new URL('../assets/website-etch/all.wasm', import.meta.url)) });
  const bitmap = JSON.parse(await readFile(new URL('../assets/website-etch/bitmap.json', import.meta.url)));
  const blank = ' '.repeat(93);
  const text = [...Array(4).fill(blank), ...bitmap.rows.map(row => '      ' + row.replaceAll('0', ' ').replaceAll('1', '█') + '      '), ...Array(4).fill(blank)].join('\n');
  for (const palette of ['#82fb9c,#a8fcba,#d0fdd9', '#334455']) for (const animation of animations.filter(a => a.origin === 'website')) {
    const session = new Session(text, animation.id, 93, 27, 42, animation.stepsPerSecond, palette, null);
    try {
      let steps = 1;
      while (session.step()) assert.ok(++steps <= 100000, animation.id);
      const width = session.width(), n = width * session.height(), symbols = new Uint32Array(n), flags = new Uint8Array(n);
      session.fill(symbols, new Uint32Array(n), new Uint32Array(n), flags);
      const first = symbols.indexOf(0x2588), dx = first % width - 17, dy = Math.floor(first / width);
      assert.ok(first >= 0, animation.id);
      for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
        const i = (y + dy) * width + x + dx;
        assert.equal(symbols[i] === 0x2588, bitmap.rows[y][x] === '1', `${animation.id}: ${x},${y}`);
        if (bitmap.rows[y][x] === '1') assert.equal(flags[i] & 32, 0, 'Settled logo must not blink away.');
      }
    } finally { session.free(); }
  }
});
