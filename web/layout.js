export const smootherstep = p => p * p * p * (p * (p * 6 - 15) + 10);
export function attachment(layout, time) {
  const p = smootherstep(Math.max(0, Math.min(1, time - 9.5)));
  return { x: Math.round((layout.width - layout.baseWidth - layout.tailWidth * p) / 2), reveal: Math.round(layout.tailWidth * p) };
}

// Map particle positions to the real canvas floor, not the bottom of the logo group.
// Glyph size stays unchanged, even when the distance to the floor increases.
export function effectMapping(layout, padTop, rows) {
  const originY = layout.top - (padTop + .5) * layout.cellH;
  const splitRow = padTop + 10, splitY = originY + splitRow * layout.cellH;
  const lowerSpacing = (layout.floorY - splitY) / (rows - .5 - splitRow);
  const centerY = row => row <= splitRow ? originY + row * layout.cellH : splitY + (row - splitRow) * lowerSpacing;
  return { originY, splitRow, splitY, mapY: row => centerY(row + .5) - layout.cellH / 2 };
}

function layoutFont(config) {
  return { family: config.font?.family ?? 'JetBrains Mono', lineHeight: config.font?.lineHeight ?? 1.35 };
}
function wrapTagline(ctx, locale, available, reserve) {
  if (ctx.measureText(locale.tagline).width + reserve() <= available) return [locale.tagline];
  let lines = [''];
  const words = [...new Intl.Segmenter(locale.id, { granularity: 'word' }).segment(locale.tagline)].map(s => s.segment);
  const append = token => {
    const i = lines.length - 1, next = lines[i] + token;
    if (ctx.measureText(next).width + reserve() > available && lines[i].trim()) lines.push(token.trimStart());
    else lines[i] = next.trimStart();
  };
  for (const word of words) {
    if (ctx.measureText(word).width + reserve() > available) {
      for (const cluster of new Intl.Segmenter(locale.id, { granularity: 'grapheme' }).segment(word)) append(cluster.segment);
    } else append(word);
  }
  lines = lines.map(line => line.trimEnd()).filter(Boolean);
  return lines.length ? lines : [locale.tagline];
}
// Layout is measured at output resolution. No aspect ratio is an admission gate.
export function calculateLayout(ctx, config) {
  const { width, height, wordmark, locale } = config, warnings = [];
  let unit = Math.min(width / 900, height / 240);
  const padding = Math.round(30 * unit), available = width - padding * 2;
  let logoScale = Math.min(available / wordmark.fullWidth, 144 * unit / wordmark.height, height * .60 / wordmark.height);
  const { family, lineHeight: tallestLineFactor } = layoutFont(config);
  let fontSize = Math.max(.01, Math.round(34 * unit));
  const minFont = Math.max(.01, Math.round(22 * unit));
  const makeFont = () => `700 ${fontSize.toFixed(4)}px "${family}"`;
  ctx.font = makeFont();
  const reserve = () => fontSize * .6 + Math.max(.01, 2 * unit);
  while (fontSize > minFont && ctx.measureText(locale.tagline).width + reserve() > available) {
    fontSize = Math.max(minFont, fontSize - Math.max(1, Math.floor(fontSize / 1000))); ctx.font = makeFont();
  }
  const lines = wrapTagline(ctx, locale, available, reserve);
  function measure() {
    ctx.font = makeFont();
    const metrics = lines.map(line => ctx.measureText(line));
    const ascent = Math.max(...metrics.map(m => m.actualBoundingBoxAscent));
    const descent = Math.max(...metrics.map(m => m.actualBoundingBoxDescent));
    const lineHeight = fontSize * tallestLineFactor;
    const gap = Math.max(16 * unit, 55 * unit - ascent);
    return { metrics, ascent, descent, lineHeight, gap,
      groupHeight: wordmark.height * logoScale + gap + ascent + descent + (lines.length - 1) * lineHeight };
  }
  let measured = measure();
  const fit = Math.min(1, height * .90 / measured.groupHeight,
    available / (Math.max(...measured.metrics.map(m => m.width)) + reserve()));
  if (fit < 1) {
    unit *= fit; logoScale *= fit; fontSize *= fit; measured = measure();
    warnings.push('Composition was reduced to fit this canvas. Inspect text and wordmark legibility.');
  }
  const { metrics, ascent, descent, lineHeight, gap, groupHeight } = measured;
  const logoHeight = wordmark.height * logoScale, baseWidth = wordmark.baseWidth * logoScale, fullWidth = wordmark.fullWidth * logoScale;
  const top = Math.round(Math.max(0, (height - groupHeight) / 2));
  const baseline = top + logoHeight + gap + ascent;
  const cellW = baseWidth / 81, cellH = logoHeight / 9.5;
  // Always anchor deposition near the bottom edge, regardless of composition height.
  const floorY = height - Math.min(height / 2, 6 * unit);
  if (fontSize < 12) warnings.push(`Tagline is only ${fontSize.toFixed(1)} px at this resolution and may be difficult to read.`);
  if (logoHeight < 24) warnings.push(`Wordmark is only ${logoHeight.toFixed(1)} px high; fine block details may disappear.`);
  return { width, height, unit, padding, logoScale, logoHeight, baseWidth, fullWidth, tailWidth: fullWidth - baseWidth,
    top, cellW, cellH, floorY, font: makeFont(), family, fontSize, cursorGap: Math.max(.01, 2 * unit),
    cursorWidth: Math.max(.01, fontSize / 2), ascent, descent, lineHeight, baseline, warnings,
    lines: lines.map((text, i) => ({ text, width: metrics[i].width, y: baseline + i * lineHeight })),
  };
}
