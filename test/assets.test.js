import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('extracted assets and licensed fallback fonts match recorded provenance', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/provenance.json', import.meta.url), 'utf8'));
  const fonts = JSON.parse(await readFile(new URL('../assets/fonts/provenance.json', import.meta.url), 'utf8'));
  for (const entry of [...manifest.files, ...fonts]) {
    assert.ok(/^(assets|web)\//.test(entry.file) && !entry.file.includes('..'));
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.file);
  }
  const logo = await readFile(new URL('../assets/runtime/logo.txt', import.meta.url), 'utf8');
  const lines = logo.trimEnd().split('\n');
  assert.equal(lines.length, 10);
  assert.equal(Math.max(...lines.map(l => [...l].length)), 81);
});
