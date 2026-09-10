// Internal regression coverage, not admission rules or user-facing warnings.
export const testedLanguages = new Set(['en', 'da', 'fr', 'is', 'ja', 'ar']);
export const testedThemes = new Set(['hackerman', 'tokyo-night', 'white', 'astral', 'danish-dynamite']);
export function combinationWarnings(options) {
  const warnings = [], resolution = `${options.width}x${options.height}`;
  if (options.tld.includes('XN--')) warnings.push(`Internationalized suffix is rendered in ASCII/Punycode form: ${options.tld}.`);
  if (options.width % 2 || options.height % 2) warnings.push(`H.264/yuv420p needs even dimensions. The ${resolution} canvas will be padded on the right/bottom to ${options.width + options.width % 2}x${options.height + options.height % 2}; it will not be stretched.`);
  return warnings;
}
