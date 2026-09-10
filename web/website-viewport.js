import { attachment } from './layout.js';

export const WEBSITE_CELL_LIMIT = 200000;

// The engine centers its input, while our logo sits above the composition's
// center to leave room for the tagline. Cover both canvas edges from the logo,
// retaining native cell size. A small overscan absorbs engine anchor rounding.
export function websiteViewport(layout, bitmap) {
  const cellW = 5.1 * layout.logoScale, cellH = 5 * layout.logoScale;
  const logoX = attachment(layout, 0).x, logoY = layout.top;
  const side = Math.ceil(Math.max(logoX, layout.width - logoX - bitmap.width * cellW) / cellW);
  const vertical = Math.ceil(Math.max(logoY, layout.height - logoY - bitmap.height * cellH) / cellH);
  const columns = bitmap.width + 2 * side + 2, rows = bitmap.height + 2 * vertical + 2;
  if (!Number.isSafeInteger(columns * rows) || columns * rows > WEBSITE_CELL_LIMIT) {
    throw Error('Canvas-sized animation exceeds the 200,000-cell simulation budget. Try a less extreme canvas aspect ratio or a shorter domain suffix.');
  }
  return { columns, rows, cellW, cellH, logoX, logoY };
}
export function viewportBounds(viewport, offset, frame) {
  const x = viewport.logoX - offset.x * viewport.cellW;
  const y = viewport.logoY - offset.y * viewport.cellH;
  return { x, y, width: frame.width * viewport.cellW, height: frame.height * viewport.cellH };
}
