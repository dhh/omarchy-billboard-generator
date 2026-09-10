import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';

export const THEME_FILE_LIMIT = 16384;
const fail = message => { throw Error(`Invalid theme file: ${message}`); };
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label} contains an unknown field.`);
}
function color(value, label) {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) fail(`${label} must be a #RRGGBB color.`);
  return value.toLowerCase();
}
function themeName(value) {
  if (typeof value !== 'string') fail('name must be text.');
  const name = value.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) fail('name must contain 1 to 80 characters without control characters.');
  return name;
}
function band(value, index) {
  const label = `gradient[${index}]`;
  object(value, ['color', 'from', 'to'], label);
  if (![value.from, value.to].every(Number.isFinite)) fail(`${label} boundaries must be numbers.`);
  if (value.from < 0 || value.to > 100 || value.from >= value.to) fail(`${label} must satisfy 0 <= from < to <= 100.`);
  return { color: color(value.color, `${label}.color`), from: value.from, to: value.to };
}
function gradient(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) fail('gradient must contain 1 to 32 bands.');
  const bands = value.map(band);
  if (bands[0].from !== 0 || bands.at(-1).to !== 100) fail('gradient must start at 0 and end at 100.');
  checkContinuity(bands);
  return bands;
}
function checkContinuity(bands) {
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].from !== bands[i - 1].to) fail('gradient bands must be ordered and contiguous, without gaps or overlaps.');
  }
}
export function normalizeCustomTheme(value) {
  object(value, ['schemaVersion', 'name', 'light', 'background', 'brand', 'cursor', 'gradient'], 'theme');
  if (value.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (typeof value.light !== 'boolean') fail('light must be true or false.');
  return { schemaVersion: 1, name: themeName(value.name), light: value.light,
    background: color(value.background, 'background'), brand: color(value.brand, 'brand'), cursor: color(value.cursor, 'cursor'),
    gradient: gradient(value.gradient) };
}
export function customThemePalette(value) {
  const document = normalizeCustomTheme(value);
  const sha256 = createHash('sha256').update(JSON.stringify(document)).digest('hex');
  const { schemaVersion, ...colors } = document;
  return { id: `custom:${sha256}`, ...colors, origin: 'custom', provenance: { type: 'custom-theme', schemaVersion, sha256 } };
}
export function parseThemeText(text) {
  if (typeof text !== 'string') fail('expected JSON text.');
  if (Buffer.byteLength(text, 'utf8') > THEME_FILE_LIMIT) fail('file exceeds the 16 KiB limit.');
  let document;
  try { document = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { fail('expected valid JSON, without comments or trailing commas.'); }
  return normalizeCustomTheme(document);
}
async function readBounded(handle) {
  const buffer = Buffer.alloc(THEME_FILE_LIMIT + 1); let size = 0;
  while (size < buffer.length) {
    const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
    if (!bytesRead) break;
    size += bytesRead;
  }
  if (size > THEME_FILE_LIMIT) fail('file exceeds the 16 KiB limit.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)); }
  catch { fail('file must be UTF-8 JSON.'); }
}
export async function loadThemeFile(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail('supply a regular JSON file.');
    if (stat.size > THEME_FILE_LIMIT) fail('file exceeds the 16 KiB limit.');
    return parseThemeText(await readBounded(handle));
  } finally { await handle.close(); }
}
function attachTheme(options, value) {
  const customTheme = normalizeCustomTheme(value), palette = customThemePalette(customTheme);
  if (options.theme && options.theme !== palette.id) throw Error('Choose either a built-in theme or a custom theme file, not both.');
  return { ...options, theme: palette.id, customTheme };
}
export async function resolveThemeOptions(options) {
  if (options.themeFile !== undefined) {
    if (options.customTheme !== undefined) throw Error('Supply only one custom theme source.');
    const { themeFile, ...remaining } = options;
    return attachTheme(remaining, await loadThemeFile(themeFile));
  }
  if (options.customTheme !== undefined) return attachTheme(options, options.customTheme);
  return options;
}
export function selectedTheme(options, snapshotThemes) {
  if (options.customTheme !== undefined) {
    const theme = customThemePalette(options.customTheme);
    if (options.theme !== theme.id) throw Error('Custom theme ID does not match its palette.');
    return theme;
  }
  const theme = snapshotThemes.find(t => t.id === options.theme);
  if (!theme) throw Error('Theme must exist in the available website or campaign palettes.');
  return theme;
}
