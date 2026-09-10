export const sourceFiles = ['src/**/*.js', 'app/**/*.js', 'web/**/*.js', 'scripts/**/*.mjs', 'bin/omarchy-billboard', 'bin/omarchy-billboard-app'];
// Preserved campaign algorithms. All other functions must remain at or below 6.
export const complexityExceptions = [
  { file: 'web/glyph-piles.js', name: 'createGlyphPiles', max: 18 },
  { file: 'web/independent-sparks.js', name: 'createIndependentSparks', max: 14 },
  { file: 'web/independent-sparks.js', name: 'drawGlyph', max: 7 },
];
export default [
  { files: sourceFiles, linterOptions: { noInlineConfig: true }, rules: { complexity: ['error', { max: 6, variant: 'classic' }] } },
  { files: ['web/glyph-piles.js'], rules: { complexity: ['error', { max: 18, variant: 'classic' }] } },
  { files: ['web/independent-sparks.js'], rules: { complexity: ['error', { max: 14, variant: 'classic' }] } },
];
