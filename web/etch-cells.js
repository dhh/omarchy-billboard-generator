// Cell shapes and ink weights adapted from the pinned website's etch.ts.
const tl = [0, 0, .5, .5], tr = [.5, 0, .5, .5], bl = [0, .5, .5, .5], br = [.5, .5, .5, .5];
const parts = {
  0x2580: [[0, 0, 1, .5]], 0x2590: [[.5, 0, .5, 1]],
  0x2591: [tl], 0x2592: [tl, br], 0x2593: [tl, br, tr],
  0x2594: [[0, 0, 1, 1 / 8]], 0x2595: [[7 / 8, 0, 1 / 8, 1]],
  0x2596: [bl], 0x2597: [br], 0x2598: [tl], 0x2599: [tl, bl, br],
  0x259a: [tl, br], 0x259b: [tl, tr, bl], 0x259c: [tl, tr, br],
  0x259d: [tr], 0x259e: [tr, bl], 0x259f: [tr, bl, br],
};
for (let n = 1; n <= 7; n++) {
  parts[0x2580 + n] = [[0, 1 - n / 8, 1, n / 8]];
  parts[0x2588 + n] = [[0, 0, 1 - n / 8, 1]];
}
const lines = new Map([
  ...[0x2f, 0x2571].map(s => [s, [0, 1, 1, 0]]),
  ...[0x5c, 0x2572].map(s => [s, [0, 0, 1, 1]]),
  ...[0x7c, 0x2502, 0x2503].map(s => [s, [.5, 0, .5, 1]]),
  ...[0x2d, 0x2500, 0x2501, 0x5f].map(s => [s, [0, .5, 1, .5]]),
]);
export function weightOf(symbol) {
  const char = String.fromCodePoint(symbol);
  if (".,'`\u00b7".includes(char)) return .12;
  if (':;^~"'.includes(char)) return .2;
  if ('*+=<>()[]{}!?i l1'.includes(char)) return .35;
  if ('#@%&$MW'.includes(char)) return .7;
  return .5;
}
function drawParts(ctx, rectangles, box) {
  const { left, top, cellW, cellH } = box;
  for (const [px, py, pw, ph] of rectangles) {
    const x = Math.round(left + px * cellW), y = Math.round(top + py * cellH);
    ctx.fillRect(x, y, Math.max(1, Math.round(left + (px + pw) * cellW) - x), Math.max(1, Math.round(top + (py + ph) * cellH) - y));
  }
}
function drawLine(ctx, line, box) {
  const { x, y, width, height, cellW } = box, [x1, y1, x2, y2] = line;
  ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, Math.round(cellW / 5)); ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x + x1 * width, y + y1 * height); ctx.lineTo(x + x2 * width, y + y2 * height); ctx.stroke();
}
function markTop(symbol, size, box) {
  if ([0x2c, 0x2e, 0x5f].includes(symbol)) return box.y + box.height - size;
  if ([0x27, 0x60, 0x22].includes(symbol)) return box.y;
  return box.y + Math.round((box.height - size) / 2);
}
export function drawCell(ctx, symbol, box) {
  if (symbol === 0x2588) { ctx.fillRect(box.x, box.y, box.width, box.height); return; }
  if (parts[symbol]) { drawParts(ctx, parts[symbol], box); return; }
  if (lines.has(symbol)) { drawLine(ctx, lines.get(symbol), box); return; }
  const size = Math.max(1, Math.round(box.width * Math.sqrt(weightOf(symbol))));
  ctx.fillRect(box.x + Math.round((box.width - size) / 2), markTop(symbol, size, box), size, size);
}
const luma = rgb => (((rgb >> 16) & 255) * 299 + ((rgb >> 8) & 255) * 587 + (rgb & 255) * 114) / 255000;
export function themeInk(theme) {
  const ramp = [...theme.gradient].reverse().map(b => ({ color: b.color, light: luma(parseInt(b.color.slice(1), 16)) })).sort((a, b) => a.light - b.light);
  const cache = new Map();
  return packed => {
    if (cache.has(packed)) return cache.get(packed);
    const light = luma(packed); let best = ramp[0];
    for (const ink of ramp) if (Math.abs(ink.light - light) < Math.abs(best.light - light)) best = ink;
    cache.set(packed, best.color); return best.color;
  };
}
