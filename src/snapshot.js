import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { availableThemes } from './themes.js';

export const REPOSITORY = 'omacom/omarchy-site';
export const INITIAL_COMMIT = '5f908e4a85b8a4594be73db725906cf656660823';
export const TAGLINE = 'Beautiful, fun & agentic Linux';
export const bundledPath = new URL('../data/upstream.json', import.meta.url);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha = value => /^[a-f0-9]{40}$/.test(value);
const color = value => /^#[a-f0-9]{6}$/.test(value);

// Narrow data adapters, never execution of downloaded TypeScript or scripts.
function themeRegistry(registry) {
  const body = registry.match(/export const SITE_THEMES: SiteTheme\[\] = \[([\s\S]*?)\]/)?.[1];
  assert(body, 'Unsupported SITE_THEMES schema.');
  const entry = /\{ id: '([a-z0-9-]+)', name: '([^']+)'(, light: true)? \}/g;
  const themes = [...body.matchAll(entry)].map(([, id, name, light]) => ({ id, name, light: !!light }));
  assert(themes.length && !body.replace(entry, '').replace(/[\s,]/g, ''), 'Unsupported theme entry schema.');
  return themes;
}
function gradientDefinition(brand) {
  const bands = brand.match(/const colors = \[([^\]]+)\]\.map\(\(band\) =>\s*style\.getPropertyValue\(`--t-field-\$\{band\}`\)\.trim\(\),\s*\)/)?.[1];
  assert(bands && /^'\w+'(?:, '\w+')*$/.test(bands), 'Unsupported brand color construction.');
  const bandNames = [...bands.matchAll(/'(\w+)'/g)].map(m => m[1]);
  const boundaries = brand.match(/const boundaries = (\[[\d., ]+\])/)?.[1];
  assert(boundaries, 'Unsupported gradient boundary construction.');
  return { bandNames, stops: JSON.parse(boundaries) };
}
function applyPalette(theme, css, { bandNames, stops }) {
  const blocks = [...css.matchAll(/\[data-theme='([a-z0-9-]+)'\]\s*\{([^{}]*)\}/g)].filter(m => m[1] === theme.id);
  assert(blocks.length === 1, `Expected one palette block for ${theme.id}.`);
  const readColor = name => {
    const values = [...blocks[0][2].matchAll(new RegExp(`--t-${name}:\\s*(#[a-fA-F0-9]{6});`, 'g'))];
    assert(values.length === 1, `Missing or unsupported ${name} color for ${theme.id}.`);
    return values[0][1].toLowerCase();
  };
  theme.background = readColor('bg'); theme.brand = readColor('brand');
  theme.gradient = bandNames.map((name, i) => ({ color: readColor(`field-${name}`), from: stops[i], to: stops[i + 1] }));
  assert(stops.length === bandNames.length + 1, 'Gradient band count mismatch.');
}
function localized(messages, key, id, label) {
  const value = messages[key] ?? (id === 'en' ? key : undefined);
  assert(text(value), `Missing website ${label} for ${id}; no translation fallback is applied.`);
  return value;
}
function languageEntry(id, locale, messages) {
  const headline = localized(messages, TAGLINE, id, 'tagline');
  const attribution = id === 'zh-CN' ? localized(messages, 'By DHH', id, 'attribution') : `${localized(messages, 'by', id, 'attribution')} DHH`;
  return { id, name: locale.name, direction: locale.direction ?? 'ltr', headline, attribution, tagline: `${headline} ${attribution}` };
}
async function extractLanguages(source) {
  const locales = JSON.parse(await source('src/i18n/locales.json')), languages = [];
  for (const [id, locale] of Object.entries(locales)) {
    assert(/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(id) && text(locale.name), `Unsupported locale: ${id}`);
    assert(!locale.direction || ['ltr', 'rtl'].includes(locale.direction), `Unsupported direction: ${id}`);
    languages.push(languageEntry(id, locale, JSON.parse(await source(`src/i18n/messages/${id}.json`))));
  }
  return languages;
}
export async function extractSnapshot(commit, readSource) {
  assert(sha(commit), 'Upstream revision must be a full commit SHA.');
  const sources = {};
  async function source(path) {
    const value = await readSource(path);
    assert(text(value), `Empty upstream source: ${path}`);
    sources[path] = createHash('sha256').update(value).digest('hex');
    return value;
  }
  const themes = themeRegistry(await source('src/lib/site-themes.ts'));
  const css = await source('src/styles.css'), gradient = gradientDefinition(await source('src/lib/brand-downloads.ts'));
  for (const theme of themes) applyPalette(theme, css, gradient);
  const languages = await extractLanguages(source);
  return validateSnapshot({ schemaVersion: 2, repository: REPOSITORY, commit, sources, themes, languages });
}
function validateIdentity(s) {
  assert(s?.schemaVersion === 2 && s.repository === REPOSITORY && sha(s.commit), 'Invalid snapshot identity.');
}
function validateSources(sources) {
  assert(sources && Object.keys(sources).length > 0 && Object.values(sources).every(v => /^[a-f0-9]{64}$/.test(v)), 'Invalid source provenance.');
}
function validateEntries(entries, key) {
  assert(Array.isArray(entries) && entries.length > 0, `Empty snapshot ${key}.`);
  assert(new Set(entries.map(v => v.id)).size === entries.length, `Duplicate ${key} IDs.`);
  assert(entries.every(v => text(v.id) && text(v.name)), `Invalid ${key} entries.`);
}
function validBand(b, i, gradient) {
  return color(b.color) && Number.isFinite(b.from) && Number.isFinite(b.to) && b.from < b.to && (i === 0 || b.from === gradient[i - 1].to);
}
function validateGradient(t) {
  assert(Array.isArray(t.gradient) && t.gradient.length > 0 && t.gradient[0].from === 0 && t.gradient.at(-1).to === 100, `Invalid gradient: ${t.id}`);
  t.gradient.forEach((b, i) => assert(validBand(b, i, t.gradient), `Invalid gradient band: ${t.id}`));
}
function validateTheme(t) {
  assert(typeof t.light === 'boolean' && color(t.background) && color(t.brand), `Invalid palette: ${t.id}`);
  validateGradient(t);
}
function validLanguage(l) {
  return text(l.headline) && text(l.attribution) && l.tagline === `${l.headline} ${l.attribution}` && ['ltr', 'rtl'].includes(l.direction);
}
export function validateSnapshot(s) {
  validateIdentity(s); validateSources(s.sources);
  for (const key of ['themes', 'languages']) validateEntries(s[key], key);
  for (const theme of s.themes) validateTheme(theme);
  assert(s.languages.every(validLanguage), 'Invalid localized tagline or attribution.');
  return s;
}
export async function loadSnapshot(path = bundledPath) {
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  if (snapshot.schemaVersion === 1) {
    const bundled = JSON.parse(await readFile(bundledPath, 'utf8'));
    assert(snapshot.commit === bundled.commit, 'Legacy snapshot lacks attribution. Remove the old cached snapshot and sync again.');
    snapshot.languages = snapshot.languages.map(locale => {
      const original = bundled.languages.find(l => l.id === locale.id && l.headline === locale.tagline);
      assert(original, `Cannot migrate legacy attribution for ${locale.id}. Remove the old cached snapshot and sync again.`);
      return { ...locale, headline: original.headline, attribution: original.attribution, tagline: original.tagline };
    });
    snapshot.schemaVersion = 2;
  }
  return validateSnapshot(snapshot);
}
export async function atomicSnapshot(path, snapshot) {
  validateSnapshot(snapshot);
  const target = path instanceof URL ? (await import('node:url')).fileURLToPath(path) : path;
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
async function resolveRevision(revision, request) {
  assert(revision === 'master' || sha(revision), 'Sync revision must be master or a full commit SHA.');
  const commit = revision === 'master' ? JSON.parse(await request(`https://api.github.com/repos/${REPOSITORY}/commits/master`)).sha : revision;
  assert(sha(commit), 'Upstream returned an invalid commit SHA.');
  return commit;
}
export async function syncSnapshot(path, { revision = 'master', fetcher = fetch, signal } = {}) {
  async function request(url) {
    const response = await fetcher(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), headers: { 'User-Agent': 'omarchy-billboard-generator' } });
    assert(response.ok, `Upstream request failed (${response.status}): ${url}`);
    const value = await response.text();
    assert(Buffer.byteLength(value) <= 2_000_000, `Upstream source exceeds size limit: ${url}`);
    return value;
  }
  const commit = await resolveRevision(revision, request);
  const snapshot = await extractSnapshot(commit, p => request(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${p}`));
  signal?.throwIfAborted();
  availableThemes(snapshot); // Reject local/website ID collisions before replacing usable data.
  await atomicSnapshot(path, snapshot);
  return snapshot;
}
