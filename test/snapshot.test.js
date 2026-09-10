import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSnapshot, validateSnapshot, extractSnapshot, syncSnapshot, atomicSnapshot, INITIAL_COMMIT, TAGLINE } from '../src/snapshot.js';

const fixture = {
  'src/lib/site-themes.ts': "export const SITE_THEMES: SiteTheme[] = [\n  { id: 'test', name: 'Test', light: true },\n]",
  'src/styles.css': "[data-theme='test'] { --t-bg: #ffffff; --t-brand: #111111; --t-field-crest: #222222; --t-field-dim: #aaaaaa; }",
  'src/lib/brand-downloads.ts': "const colors = ['crest', 'dim'].map((band) => style.getPropertyValue(`--t-field-${band}`).trim(), )\nconst boundaries = [0, 26.316, 100]",
  'src/i18n/locales.json': JSON.stringify({ en: { name: 'English' }, da: { name: 'Dansk' } }),
  'src/i18n/messages/en.json': '{}',
  'src/i18n/messages/da.json': JSON.stringify({ [TAGLINE]: 'Smukt, sjovt Linux med agenter', by: 'fra' }),
};

test('bundled snapshot preserves upstream copy, light flags and unequal bands', async () => {
  const s = await loadSnapshot();
  assert.equal(s.commit, INITIAL_COMMIT);
  assert.equal(s.themes.length, 22);
  assert.equal(s.languages.length, 31);
  assert.equal(s.languages.find(l => l.id === 'en').tagline, `${TAGLINE} by DHH`);
  assert.equal(s.languages.find(l => l.id === 'da').tagline, 'Smukt, sjovt Linux med agenter fra DHH');
  assert.equal(s.languages.find(l => l.id === 'zh-CN').attribution, '由 DHH 亲自打造');
  assert.equal(s.languages.find(l => l.id === 'ar').attribution, 'من إعداد DHH');
  assert.equal(s.languages.find(l => l.id === 'ar').direction, 'rtl');
  assert.equal(s.themes.find(t => t.id === 'white').light, true);
  const h = s.themes.find(t => t.id === 'hackerman');
  assert.equal(h.background, '#0b0c16');
  assert.equal(h.brand, '#82fb9c');
  assert.deepEqual(h.gradient.map(b => b.from), [0, 26.316, 36.842, 57.895, 73.684]);
  assert.deepEqual(h.gradient.map(b => b.color), ['#d0fdd9', '#a8fcba', '#82fb9c', '#539e65', '#2b5037']);
});

test('adapter reads data without executing TypeScript and rejects schema drift', async () => {
  const s = await extractSnapshot(INITIAL_COMMIT, async p => fixture[p]);
  assert.equal(s.languages[0].tagline, `${TAGLINE} by DHH`);
  for (const [path, replacement, diagnostic] of [
    ['src/lib/site-themes.ts', fixture['src/lib/site-themes.ts'].replace("light: true", 'light: compute()'), /schema/],
    ['src/styles.css', fixture['src/styles.css'].replace('#ffffff', 'var(--other)'), /color/],
    ['src/i18n/messages/da.json', '{}', /Missing website tagline/],
    ['src/i18n/messages/da.json', JSON.stringify({ [TAGLINE]: 'Headline' }), /Missing website attribution/],
    ['src/lib/brand-downloads.ts', fixture['src/lib/brand-downloads.ts'].replace('26.316', '101'), /gradient/i],
  ]) await assert.rejects(extractSnapshot(INITIAL_COMMIT, async p => p === path ? replacement : fixture[p]), diagnostic);
});

test('sync pins every source to one resolved commit and replaces atomically', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'billboard-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'snapshot.json');
  await atomicSnapshot(path, await loadSnapshot());
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('/commits/master')) return new Response(JSON.stringify({ sha: INITIAL_COMMIT }));
    const prefix = `https://raw.githubusercontent.com/omacom/omarchy-site/${INITIAL_COMMIT}/`;
    assert.ok(url.startsWith(prefix));
    return new Response(fixture[url.slice(prefix.length)]);
  };
  await syncSnapshot(path, { fetcher });
  assert.equal(calls.filter(u => u.includes('/commits/master')).length, 1);
  assert.equal((await loadSnapshot(path)).themes[0].id, 'test');
  const before = await readFile(path);
  await assert.rejects(syncSnapshot(path, { fetcher: async () => new Response('Unavailable', { status: 503 }) }), /503/);
  await assert.rejects(syncSnapshot(path, { revision: INITIAL_COMMIT, fetcher: async () => new Response('schema changed') }), /schema/);
  await assert.rejects(syncSnapshot(path, { fetcher: async url => {
    const response = await fetcher(url);
    return new Response((await response.text()).replaceAll("'test'", "'astral'"));
  } }), /conflicts/);
  assert.deepEqual(await readFile(path), before);
  assert.deepEqual(await readdir(directory), ['snapshot.json']);
});

test('legacy pinned snapshots gain verified attribution in memory without changing cached files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'snapshot-migration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const snapshot = await loadSnapshot(), legacy = structuredClone(snapshot);
  legacy.schemaVersion = 1;
  legacy.languages = legacy.languages.map(({ headline, attribution, ...locale }) => ({ ...locale, tagline: headline }));
  const path = join(directory, 'old.json'), original = JSON.stringify(legacy);
  await writeFile(path, original);
  assert.deepEqual((await loadSnapshot(path)).languages, snapshot.languages);
  assert.equal(await readFile(path, 'utf8'), original);
  legacy.commit = 'a'.repeat(40); await writeFile(path, JSON.stringify(legacy));
  await assert.rejects(loadSnapshot(path), /Legacy snapshot lacks attribution/);
});

test('snapshot validation rejects corrupt data', async () => {
  const s = await loadSnapshot();
  s.themes[0].gradient[1].from = 0;
  assert.throws(() => validateSnapshot(s), /gradient/);
  const duplicate = await loadSnapshot();
  duplicate.languages.push(duplicate.languages[0]);
  assert.throws(() => validateSnapshot(duplicate), /Duplicate/);
});
