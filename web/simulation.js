import { a as loadRuntime } from '../assets/runtime/assets/playback.js';

const columns = 121, rows = 20, logoColumns = 81, logoRows = 10;
async function asset(fetchSource, path, message) {
  const response = await fetchSource(path);
  if (!response.ok) throw Error(message);
  return response;
}
function countSteps(session) {
  let totalSteps = 0;
  try {
    while (true) {
      const alive = session.step(); totalSteps++;
      if (!alive) return totalSteps;
      if (totalSteps > 30000) throw Error('Laser simulation step budget exceeded.');
    }
  } finally { session.free(); }
}
function readFrame(session) {
  const w = session.width(), h = session.height();
  if (w !== columns || h !== rows) throw Error('Unexpected native simulation dimensions.');
  const n = w * h, symbols = new Uint32Array(n), fg = new Uint32Array(n), bg = new Uint32Array(n), flags = new Uint8Array(n);
  session.fill(symbols, fg, bg, flags);
  return { symbols, fg, bg, flags };
}
function capture(make, seed) {
  const totalSteps = countSteps(make(seed));
  const session = make(seed), frames = []; let steps = 0;
  try {
    for (let index = 0; index <= 125; index++) {
      const target = Math.max(1, Math.floor(totalSteps * index / 125));
      while (steps < target) { session.step(); steps++; }
      frames.push(readFrame(session));
    }
  } finally { session.free(); }
  return { frames, totalSteps };
}
function matchesLogo(logoLines, final, px, py) {
  for (let r = 0; r < logoRows; r++) for (let c = 0; c < logoColumns; c++) {
    if (logoLines[r][c] !== 32 && final.symbols[(r + py) * columns + c + px] !== logoLines[r][c]) return false;
  }
  return true;
}
function settledOffset(logoLines, final) {
  for (let py = 0; py <= rows - logoRows; py++) for (let px = 0; px <= columns - logoColumns; px++) {
    if (matchesLogo(logoLines, final, px, py)) return { padX: px, padTop: py };
  }
  throw Error('Cannot locate settled logo inside native effect grid.');
}
export async function createSimulation(fetchSource = fetch) {
  const response = await asset(fetchSource, '/assets/runtime/logo.txt', 'Cannot load ASCII logo input.');
  const text = await response.text();
  const wasm = await asset(fetchSource, '/assets/runtime/laseretch.wasm', 'Cannot load laseretch WASM.');
  const runtime = await loadRuntime(await wasm.arrayBuffer());
  const make = seed => new runtime.Session(text, 'laseretch', columns, rows, seed, 240);
  const primary = capture(make, 42), secondary = capture(make, 137), final = primary.frames.at(-1);
  const logoLines = text.trimEnd().split('\n').map(line => [...line.padEnd(logoColumns, ' ')].map(c => c.codePointAt(0)));
  const { padX, padTop } = settledOffset(logoLines, final);
  const targets = new Uint32Array(columns * rows).fill(32);
  for (let r = 0; r < logoRows; r++) for (let c = 0; c < logoColumns; c++) targets[(r + padTop) * columns + c + padX] = logoLines[r][c];
  return { primary, secondary, final, targets, columns, rows, padX, padTop };
}
