import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildWordmark, fontGlyph } from '../src/wordmark.js';
import { createSimulation } from '../web/simulation.js';
import { createIndependentSparks } from '../web/independent-sparks.js';
import { attachment } from '../web/layout.js';
import { checkFonts } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';
import { combinationWarnings } from '../src/support.js';

test('official geometry is invariant and suffixes retain block anatomy', async () => {
  const marks = await Promise.all(['.DK', '.ORG', '.COM', '.DE', '.DEV', '.CO.UK', '.123', '.XN--FIQS8S', '.ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(buildWordmark));
  for (const mark of marks) {
    assert.equal(mark.base.length, 211);
    assert.deepEqual(mark.base, marks[0].base);
    assert.equal(mark.baseWidth, 413.1);
    assert.equal(mark.height, 95);
    assert.ok(mark.suffix.every(r => r.x > mark.baseWidth && r.y >= 0 && r.y + r.height <= mark.height));
    assert.ok(mark.glyphs.every(g => !g.rows || g.rows.length === 9));
  }
  assert.equal(marks[0].fullWidth, 561);
  assert.ok(marks[1].fullWidth > marks[0].fullWidth);
  assert.ok(marks[2].fullWidth > marks[1].fullWidth);
  const font = await readFile(new URL('../assets/Delta-Corps-Priest-1.flf', import.meta.url), 'utf8');
  assert.equal(fontGlyph(font, 'D')[0].trim(), '███████▄');
  assert.ok(fontGlyph(font, 'K').some(r => r.includes('▐')));
  await assert.rejects(buildWordmark('.<svg>'), /Invalid/);
});

test('centered expansion is integer-pixel, monotonic, fixed-size and bounded', () => {
  const layout = { width: 900, baseWidth: 600, tailWidth: 240 };
  assert.deepEqual(attachment(layout, 9.5), { x: 150, reveal: 0 });
  assert.deepEqual(attachment(layout, 10.5), { x: 30, reveal: 240 });
  let previous = attachment(layout, 0);
  for (let i = 0; i < 375; i++) {
    const a = attachment(layout, i / 25);
    assert.ok(Number.isInteger(a.x) && Number.isInteger(a.reveal));
    assert.ok(a.x <= previous.x && a.reveal >= previous.reveal);
    assert.ok(Math.abs(a.x + (layout.baseWidth + a.reveal) / 2 - 450) <= 1);
    previous = a;
  }
});

test('native reference simulation and irregular pile regression', async () => {
  const sim = await createSimulation(async path => new Response(await readFile(new URL('..' + path, import.meta.url))));
  assert.equal(sim.padX, 21); assert.equal(sim.padTop, 5);
  const baseWidth = 413.1 / 561 * 840, cellW = baseWidth / 81, cellH = 144 / 9.5;
  const originX = Math.round((900 - baseWidth) / 2) - sim.padX * cellW;
  const sparks = createIndependentSparks(sim.primary.frames, sim.secondary.frames, 121, 20, cellW, cellH, originX, 22 - cellH / 2 - sim.padTop * cellH, { width: 900, height: 240 });
  const m = sparks.metadata;
  assert.ok(m.differentAirborneFrames >= 100);
  assert.ok(m.groundEvents.every(e => e.extendedFrames === e.nativeFrames * 4));
  assert.equal(m.piles.landings, 772);
  assert.equal(m.piles.stackedLandings, 660);
  assert.equal(m.piles.lastVisibleFrame, 161);
  assert.ok(Math.abs(m.piles.peakStackRise - 29.9) < .15);
  assert.deepEqual(m.piles.settleTickFrames, [2, 5]);
});

test('all upstream locales have real glyph coverage; valid choices have no coverage warnings', async () => {
  const snapshot = await loadSnapshot();
  for (const locale of snapshot.languages) await checkFonts(locale);
  await assert.rejects(checkFonts({ id: 'en', tagline: '🦄' }), /lack/);
  const options = { language: 'ur', theme: 'catppuccin', tld: '.XYZ', width: 600, height: 900 };
  assert.doesNotMatch(combinationWarnings(options).join(' '), /untested/i);
});
