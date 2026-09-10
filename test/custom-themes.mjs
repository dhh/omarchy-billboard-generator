import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openRenderer } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';

const snapshot = await loadSnapshot(), theme = snapshot.themes.find(t => t.id === 'hackerman');
const equivalent = { schemaVersion: 1, name: 'Equivalent palette', light: theme.light,
  background: theme.background, brand: theme.brand, cursor: theme.brand, gradient: theme.gradient };
const options = { language: 'en', tld: '.ORG', width: 900, height: 240 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = '.cache/custom-themes'; await mkdir(directory, { recursive: true });
for (const animation of ['laseretch-campaign', 'laseretch']) {
  const original = await openRenderer({ ...options, theme: 'hackerman', animation }, snapshot);
  let custom;
  try {
    custom = await openRenderer({ ...options, customTheme: equivalent, animation }, snapshot);
    for (const index of [70, 140, 295]) assert.equal(hash(await original.frame(index)), hash(await custom.frame(index)), `${animation}: ${index}`);
  } finally { try { await custom?.close(); } finally { await original.close(); } }
}
const example = JSON.parse(await readFile('examples/aurora.json', 'utf8'));
const light = { ...example, name: 'Single-color light', light: true, background: '#ffffff', brand: '#111111', cursor: '#222222',
  gradient: [{ color: '#334455', from: 0, to: 100 }] };
for (const [name, document] of [['aurora', example], ['single-light', light]]) for (const animation of ['laseretch-campaign', 'laseretch']) {
  const renderer = await openRenderer({ ...options, customTheme: document, animation }, snapshot);
  try {
    assert.equal(renderer.layout.settings.themeOrigin, 'custom');
    for (const index of [70, 295]) await writeFile(`${directory}/${name}-${animation}-${index}.png`, await renderer.frame(index));
    assert.deepEqual(renderer.layout.warnings, []);
  } finally { await renderer.close(); }
}
console.log('Custom palettes match built-in pixels; dark/light and single-band themes render with both animation engines.');
