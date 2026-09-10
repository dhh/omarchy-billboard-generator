import { paintFrame } from '../assets/runtime/assets/playback.js';
import { createIndependentSparks } from './independent-sparks.js';
import { createSimulation } from './simulation.js';
import { attachment, effectMapping } from './layout.js';

function removeBlackBackground(nativeCtx, native) {
  const pixels = nativeCtx.getImageData(0, 0, native.width, native.height);
  for (let p = 0; p < pixels.data.length; p += 4) {
    if (pixels.data[p] === 0 && pixels.data[p + 1] === 0 && pixels.data[p + 2] === 0) pixels.data[p + 3] = 0;
  }
  nativeCtx.putImageData(pixels, 0, 0);
}
export async function createCampaignAnimation(config, layout, base, ctx) {
  const { width, height, theme } = config, { cellW, cellH } = layout;
  const sim = await createSimulation(), { columns, rows, padX, padTop, final, targets } = sim;
  const effectX = attachment(layout, 0).x - padX * cellW;
  const { originY: effectY, splitRow, mapY } = effectMapping(layout, padTop, rows);
  const sparks = createIndependentSparks(sim.primary.frames, sim.secondary.frames, columns, rows, cellW, cellH, effectX, effectY,
    { width, height, scale: layout.logoHeight / 144, mapY, floorY: layout.floorY });
  const native = document.createElement('canvas'); native.width = columns * 10; native.height = rows * 20;
  const nativeCtx = native.getContext('2d', { willReadFrequently: true });
  const nativeLayout = { cellWidth: 10, cellHeight: 20, fontSize: 17, cssWidth: native.width, cssHeight: native.height };
  function effectShadow(context) {
    if (theme.light) { context.shadowColor = '#000000'; context.shadowBlur = Math.max(2, layout.unit * 2); }
  }
  function settled(f, i) {
    return targets[i] !== 32 && f.symbols[i] === final.symbols[i] && f.fg[i] === final.fg[i] && f.bg[i] === final.bg[i] && !(f.flags[i] & 32);
  }
  function replaceSettledCells(f, x) {
    for (let i = 0; i < targets.length; i++) {
      if (!settled(f, i)) continue;
      const col = i % columns, row = Math.floor(i / columns), cx = Math.round(effectX + col * cellW), cy = Math.round(effectY + row * cellH);
      const cw = Math.round(effectX + (col + 1) * cellW) - cx, ch = Math.round(effectY + (row + 1) * cellH) - cy;
      ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip(); ctx.fillStyle = theme.background;
      ctx.fillRect(cx, cy, cw, ch); ctx.drawImage(base, x, layout.top); ctx.restore();
    }
  }
  function drawLaser(index, x) {
    const f = sparks.withoutPrimaryFloor(index);
    // Preserve native effect colors; only pure black is transparent.
    paintFrame(nativeCtx, nativeLayout, f.symbols, f.fg, f.bg, f.flags, columns, rows, true);
    removeBlackBackground(nativeCtx, native);
    ctx.save(); effectShadow(ctx); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(native, 0, 0, native.width, splitRow * 20, effectX, effectY, columns * cellW, splitRow * cellH);
    // Move lower rows to the canvas floor without stretching the glyphs.
    for (let row = splitRow; row < rows; row++) {
      ctx.drawImage(native, 0, row * 20, native.width, 20, effectX, mapY(row), columns * cellW, cellH);
    }
    ctx.restore(); replaceSettledCells(f, x);
  }
  return {
    metadata: { seeds: [42, 137], simulationFps: 240, padX, padTop, totalSteps: sim.primary.totalSteps, sparkMetadata: sparks.metadata,
      nativeEffectColors: true, lightEffectTreatment: theme.light ? 'Original colors with dark shadow for contrast' : 'Original colors' },
    draw(index, x) {
      if (index >= 125) ctx.drawImage(base, x, layout.top); else drawLaser(index, x);
      ctx.save(); effectShadow(ctx); sparks.draw(ctx, index); ctx.restore();
    },
  };
}
