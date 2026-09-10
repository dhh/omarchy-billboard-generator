import { parseArgs } from 'node:util';
import { normalizeSuffix } from './suffix.js';
import { availableThemes } from './themes.js';
import { animationById } from './animations.js';

const argumentOptions = {
  help: { type: 'boolean', short: 'h' },
  'list-themes': { type: 'boolean' }, 'list-languages': { type: 'boolean' }, 'list-animations': { type: 'boolean' },
  animation: { type: 'string' }, 'theme-file': { type: 'string' },
  tld: { type: 'string' }, language: { type: 'string' }, theme: { type: 'string' },
  background: { type: 'string' }, resolution: { type: 'string' }, output: { type: 'string' }, force: { type: 'boolean' }, revision: { type: 'string' },
};
function commandName(values, positionals) {
  const actions = ['themes', 'languages', 'animations'].filter(name => values[`list-${name}`]);
  actions.push(...positionals);
  const validPositionals = positionals.every(value => value === 'sync');
  if (!validPositionals || actions.length > 1) throw Error('Use one command: sync, --list-themes, --list-languages, --list-animations, or render options.');
  return actions[0] ?? 'render';
}
function validateCommand(command, values) {
  const renderKeys = ['tld', 'language', 'theme', 'theme-file', 'animation', 'background', 'resolution', 'output', 'force'];
  if (command !== 'render' && renderKeys.some(k => k in values)) throw Error('Render options cannot be combined with list or sync commands.');
  if (command !== 'sync' && values.revision) throw Error('--revision is only valid with sync.');
}
function languageId(requested, snapshot) {
  const locale = snapshot.languages.find(l => l.id.toLowerCase() === requested.toLowerCase());
  if (!locale) throw Error(`Unknown language: ${requested}. Use --list-languages.`);
  return locale.id;
}
function themeId(requested, snapshot) {
  const theme = requested.toLowerCase();
  if (!availableThemes(snapshot).some(t => t.id === theme)) throw Error(`Unknown theme: ${theme}. Use --list-themes.`);
  return theme;
}
function themeSelection(values, snapshot) {
  if ('theme-file' in values) {
    if ('theme' in values) throw Error('Choose either --theme or --theme-file, not both.');
    const themeFile = values['theme-file'];
    if (!themeFile.trim() || themeFile.includes('\0')) throw Error('--theme-file requires a JSON file path.');
    return { themeFile };
  }
  return { theme: themeId(values.theme ?? 'astral', snapshot) };
}
function backgroundId(value) {
  const background = value.toLowerCase();
  if (!['theme', 'black', 'white'].includes(background)) throw Error('Background must be theme, black or white.');
  return background;
}
function dimensions(resolution) {
  if (!/^\d+x\d+$/.test(resolution)) throw Error('Resolution must use WIDTHxHEIGHT, for example 900x240.');
  const [width, height] = resolution.split('x').map(Number);
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('Resolution dimensions must be positive safe integers.');
  return { width, height };
}
function outputPath(output) {
  if (!output.toLowerCase().endsWith('.mp4') || output.includes('\0')) throw Error('Output must be an MP4 file path.');
  return output;
}
function renderOptions(values, snapshot) {
  const defaults = { tld: '.org', language: 'en', background: 'theme', resolution: '900x240', output: 'omarchy.mp4', force: false };
  const selected = { ...defaults, ...values };
  return {
    command: 'render', tld: normalizeSuffix(selected.tld), language: languageId(selected.language, snapshot),
    ...themeSelection(values, snapshot), animation: animationById(selected.animation).id, background: backgroundId(selected.background),
    ...dimensions(selected.resolution), output: outputPath(selected.output), force: selected.force,
  };
}
export function parseOptions(args, snapshot) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: argumentOptions });
  if (values.help) return { command: 'help' };
  const command = commandName(values, positionals);
  validateCommand(command, values);
  if (command !== 'render') return { command, revision: values.revision };
  return renderOptions(values, snapshot);
}
