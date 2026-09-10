import { readFile } from 'node:fs/promises';
import { create } from 'fontkit';

const scripts = {
  ja: ['Noto Sans JP', 'NotoSansJP.ttf'], 'zh-CN': ['Noto Sans SC', 'NotoSansSC.ttf'],
  ko: ['Noto Sans KR', 'NotoSansKR.ttf'], ar: ['Noto Sans Arabic', 'NotoSansArabic.ttf'], ur: ['Noto Sans Arabic', 'NotoSansArabic.ttf'],
  hi: ['Noto Sans Devanagari', 'NotoSansDevanagari.ttf'], bn: ['Noto Sans Bengali', 'NotoSansBengali.ttf'],
  si: ['Noto Sans Sinhala', 'NotoSansSinhala.ttf'], ta: ['Noto Sans Tamil', 'NotoSansTamil.ttf'], th: ['Noto Sans Thai', 'NotoSansThai.ttf'],
};
const fonts = new Map();
async function load(name) {
  if (!fonts.has(name)) {
    let bytes;
    try { bytes = await readFile(new URL(`../assets/fonts/${name}`, import.meta.url)); }
    catch { throw Error(`Required bundled font is missing: assets/fonts/${name}. Restore the project assets.`); }
    fonts.set(name, create(bytes));
  }
  return fonts.get(name);
}
const visible = text => [...text].filter(c => !/[\s\p{Cf}]/u.test(c));

async function checkSparkFonts() {
  for (const name of ['JetBrainsMono-Regular.woff2', 'JetBrainsMono-Bold.woff2']) {
    const font = await load(name);
    if (visible("*.,'`+^·").some(c => !font.hasGlyphForCodePoint(c.codePointAt(0)))) throw Error(`Spark glyphs are missing from ${name}.`);
  }
}
function lineHeight(locale) { return locale.direction === 'rtl' || ['hi', 'bn', 'si', 'ta', 'th'].includes(locale.id) ? 1.65 : 1.35; }
export async function checkFonts(locale) {
  await checkSparkFonts();
  const candidates = scripts[locale.id] ? [scripts[locale.id]] : [
    ['JetBrains Mono', 'JetBrainsMono-Bold.woff2'], ['Noto Sans', 'NotoSans.ttf'],
  ];
  let missing;
  for (const [family, file] of candidates) {
    const font = await load(file);
    missing = visible(locale.tagline).filter(c => !font.hasGlyphForCodePoint(c.codePointAt(0)));
    if (!missing.length) return { family, file, lineHeight: lineHeight(locale) };
  }
  throw Error(`Bundled fonts lack ${[...new Set(missing)].map(c => `${JSON.stringify(c)} (U+${c.codePointAt(0).toString(16).toUpperCase()})`).join(', ')} for ${locale.id}. A font covering this text is required; no missing-glyph boxes will be silently rendered.`);
}
