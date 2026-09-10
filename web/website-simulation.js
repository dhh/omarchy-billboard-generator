import initialize, { Session } from '../assets/website-etch/ttfx.js';
import { websiteViewport, viewportBounds, WEBSITE_CELL_LIMIT } from './website-viewport.js';

const STEP_LIMIT = 100000, LAST_EFFECT_FRAME = 119;
async function loadBitmap() {
  const response = await fetch('/assets/website-etch/bitmap.json');
  if (!response.ok) throw Error('Cannot load the pinned website wordmark bitmap.');
  return response.json();
}
function input(bitmap) {
  return bitmap.rows.map(row => row.replaceAll('0', ' ').replaceAll('1', '█')).join('\n');
}
function readFrame(session) {
  const width = session.width(), height = session.height(), n = width * height;
  if (n > WEBSITE_CELL_LIMIT) throw Error('Website animation exceeded the cell budget.');
  const symbols = new Uint32Array(n), fg = new Uint32Array(n), bg = new Uint32Array(n), flags = new Uint8Array(n);
  session.fill(symbols, fg, bg, flags);
  return { width, height, symbols, fg, flags };
}
function probe(make) {
  const session = make();
  try {
    for (let steps = 1; steps <= STEP_LIMIT; steps++) {
      if (!session.step()) return { steps, final: readFrame(session) };
    }
    throw Error('Website animation did not finish within its step budget.');
  } finally { session.free(); }
}
function offset(bitmap, frame) {
  const row = bitmap.rows.findIndex(line => line.includes('1'));
  const col = bitmap.rows[row].indexOf('1'), at = frame.symbols.indexOf(0x2588);
  if (at < 0) throw Error('Website animation finished without a wordmark.');
  return { x: at % frame.width - col, y: Math.floor(at / frame.width) - row };
}
function capture(make, total) {
  const session = make(), frames = []; let steps = 0;
  try {
    for (let index = 0; index <= LAST_EFFECT_FRAME; index++) {
      const target = Math.max(1, Math.floor(total * index / LAST_EFFECT_FRAME));
      while (steps < target) { session.step(); steps++; }
      frames.push(readFrame(session));
    }
    return frames;
  } finally { session.free(); }
}
export async function websiteSimulation(animation, theme, layout) {
  const bitmap = await loadBitmap(), text = input(bitmap), viewport = websiteViewport(layout, bitmap);
  const { columns, rows } = viewport;
  await initialize({ module_or_path: '/assets/website-etch/all.wasm' });
  // The homepage supplies lit, hover and crest. Campaign palettes use their
  // corresponding first three bands when paired with a website animation.
  const palette = theme.gradient.slice(0, 3).reverse().map(b => b.color).join(',');
  const make = () => new Session(text, animation.id, columns, rows, 42, animation.stepsPerSecond, palette, null);
  const result = probe(make);
  const settledOffset = offset(bitmap, result.final);
  return { bitmap, offset: settledOffset, totalSteps: result.steps, frames: capture(make, result.steps),
    viewport: { ...viewport, bounds: viewportBounds(viewport, settledOffset, result.final) } };
}
