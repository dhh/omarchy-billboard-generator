import { websiteSimulation } from './website-simulation.js';
import { drawCell, themeInk } from './etch-cells.js';

function cellBox(index, frame, offset, x, layout) {
  const cellW = 5.1 * layout.logoScale, cellH = 5 * layout.logoScale;
  const left = x + (index % frame.width - offset.x) * cellW;
  const top = layout.top + (Math.floor(index / frame.width) - offset.y) * cellH;
  const px = Math.round(left), py = Math.round(top);
  return { left, top, cellW, cellH, x: px, y: py, width: Math.round(left + cellW) - px, height: Math.round(top + cellH) - py };
}
function visible(symbol, flag) { return symbol !== 0 && symbol !== 32 && !(flag & 32); }
function drawFrame(ctx, frame, offset, x, layout, ink) {
  for (let i = 0; i < frame.symbols.length; i++) {
    if (!visible(frame.symbols[i], frame.flags[i])) continue;
    ctx.fillStyle = ink(frame.fg[i] & 0xffffff);
    drawCell(ctx, frame.symbols[i], cellBox(i, frame, offset, x, layout));
  }
}
export async function createWebsiteAnimation(config, layout, base, ctx) {
  const simulation = await websiteSimulation(config.animation, config.theme, layout), ink = themeInk(config.theme);
  return {
    metadata: { seeds: [42], simulationFps: config.animation.stepsPerSecond, totalSteps: simulation.totalSteps,
      animationProvenance: config.animation.provenance, animationViewport: simulation.viewport, nativeEffectColors: false,
      effectTreatment: 'Website bitmap cells and nearest-brightness theme inks', animationDuration: 5, settleMs: 220 },
    draw(index, x) {
      if (index >= 125) { ctx.drawImage(base, x, layout.top); return; }
      drawFrame(ctx, simulation.frames[Math.min(index, 119)], simulation.offset, x, layout, ink);
      if (index > 119) {
        ctx.save(); ctx.globalAlpha = Math.min(1, (index - 119) * 40 / 220);
        ctx.drawImage(base, x, layout.top); ctx.restore();
      }
    },
  };
}
