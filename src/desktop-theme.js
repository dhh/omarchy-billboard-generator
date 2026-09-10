import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { contrastRatio } from '../web/contrast.js';

export function themeDirectories(env = process.env, home = homedir()) {
  return [...new Set([
    join(env.XDG_STATE_HOME || join(home, '.local/state'), 'omarchy/current'),
    join(home, '.local/state/omarchy/current'),
    join(env.XDG_CONFIG_HOME || join(home, '.config'), 'omarchy/current'),
  ])];
}

// Read palette data only, never execute or expose desktop configuration files.
async function smallFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 65536) throw Error('Invalid theme file.');
    const buffer = Buffer.alloc(65537);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 65536) throw Error('Theme file is too large.');
    return buffer.toString('utf8', 0, bytesRead);
  } finally { await file.close(); }
}

export function parseDesktopColors(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break; // Only the flat Omarchy palette, not TOML tables.
    const match = /^\s*([a-z][a-z0-9_]*)\s*=\s*(["'])(#[\da-fA-F]{6}|dark|light)\2\s*(?:#.*)?$/.exec(line);
    if (match) values[match[1]] = match[3].toLowerCase();
  }
  requirePaletteColors(values);
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => key === 'mode' ? ['light', 'dark'].includes(value) : /^#[\da-f]{6}$/.test(value)));
}
function requirePaletteColors(values) {
  for (const key of ['background', 'foreground', 'accent']) {
    if (!/^#[\da-f]{6}$/.test(values[key] ?? '')) throw Error(`Missing desktop theme color: ${key}`);
  }
}
const mix = (a, b, weight) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - weight) + parseInt(b.slice(i, i + 2), 16) * weight).toString(16).padStart(2, '0')).join('');
const inkOn = color => contrastRatio(color, '#000000') >= contrastRatio(color, '#ffffff') ? '#000000' : '#ffffff';
function readable(color, background) {
  const target = inkOn(background);
  for (let step = 0; step <= 10; step++) {
    const candidate = mix(color, target, step / 10);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return target;
}
function statusColors(colors) {
  return { yellow: colors.yellow ?? colors.color3 ?? colors.accent, red: colors.red ?? colors.color1 ?? colors.accent };
}
async function desktopName(directory) {
  try {
    const text = (await smallFile(join(directory, 'theme.name'))).trim();
    if (text && text.length <= 100 && !/[\u0000-\u001f\u007f]/.test(text)) return text;
  } catch { /* A palette may exist before the name is replaced. */ }
  return 'Omarchy';
}
const desktopMode = colors => colors.mode ?? (inkOn(colors.background) === '#ffffff' ? 'dark' : 'light');
export function desktopVariables(colors) {
  const bg = colors.background, fg = colors.foreground, accent = colors.accent;
  const { yellow, red } = statusColors(colors);
  const warning = mix(bg, yellow, .08), error = mix(bg, red, .08);
  return {
    '--bg': bg, '--ink': fg, '--panel': colors.lighter_background ?? mix(bg, fg, .04), '--input': bg,
    '--controls': mix(bg, fg, .025), '--line': mix(bg, fg, .25), '--muted': readable(mix(bg, fg, .65), bg),
    '--accent': accent, '--accent-text': readable(accent, bg), '--on-accent': inkOn(accent),
    '--hover': mix(bg, fg, .1), '--hover-line': mix(bg, fg, .5), '--accent-hover': mix(accent, inkOn(accent), .12),
    '--stage': colors.dark_background ?? mix(bg, inkOn(bg) === '#ffffff' ? '#000000' : '#ffffff', .12),
    '--grid': mix(bg, fg, .045), '--loading': bg + 'ee',
    '--warning-bg': warning, '--warning-line': mix(bg, yellow, .4), '--amber': readable(yellow, warning),
    '--error-bg': error, '--error-line': mix(bg, red, .4), '--red': readable(red, error),
  };
}

export function createDesktopThemeReader(directories = themeDirectories()) {
  let last = { source: 'fallback', name: 'Default', mode: 'dark', variables: {} };
  return async () => {
    for (const directory of directories) {
      try {
        const colors = parseDesktopColors(await smallFile(join(directory, 'theme/colors.toml')));
        last = { source: 'omarchy', name: await desktopName(directory), mode: desktopMode(colors), variables: desktopVariables(colors) };
        return last;
      } catch {
        // Keep the last valid palette through directory swaps or incomplete writes.
        if (last.source === 'omarchy') return last;
      }
    }
    return last;
  };
}
