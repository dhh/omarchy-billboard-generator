import { buildWordmark } from './wordmark.js';
import { checkFonts } from './fonts.js';
import { availableThemes } from './themes.js';
import { animationById } from './animations.js';
import { resolveThemeOptions, selectedTheme } from './custom-theme.js';

export function renderTheme(options, snapshot) {
  const theme = selectedTheme(options, availableThemes(snapshot));
  const background = options.background ?? 'theme';
  if (!['theme', 'black', 'white'].includes(background)) throw Error('Background must be theme, black or white.');
  if (background === 'theme') return theme;
  return { ...theme, background: background === 'black' ? '#000000' : '#ffffff', light: background === 'white' };
}

// Both the desktop preview and the encoder consume this exact configuration.
export async function prepareRenderConfig(options, snapshot) {
  options = await resolveThemeOptions(options);
  const locale = snapshot.languages.find(l => l.id === options.language);
  const theme = renderTheme(options, snapshot);
  if (!locale || !theme) throw Error('Language and theme must exist in the available catalog.');
  const font = await checkFonts(locale);
  return { ...options, animation: animationById(options.animation), locale, theme, font, commit: snapshot.commit, wordmark: await buildWordmark(options.tld) };
}
