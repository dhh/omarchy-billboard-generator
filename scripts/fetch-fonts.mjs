// Maintainer-only asset acquisition. Rendering never downloads fonts.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifestURL = new URL('assets/fonts/provenance.json', root);
const records = JSON.parse(await readFile(manifestURL, 'utf8'));
const repository = 'google/fonts', commit = '334b789e33413f3aba4264d9aa6c97f7b94c5a2f';
const families = ['NotoSans', 'NotoSansSC', 'NotoSansKR', 'NotoSansDevanagari', 'NotoSansBengali', 'NotoSansSinhala', 'NotoSansTamil', 'NotoSansThai'];
for (const family of families) {
  const folder = `ofl/${family.toLowerCase()}`;
  for (const [file, candidates] of [
    [`assets/fonts/${family}.ttf`, [`${folder}/${family}[wdth,wght].ttf`, `${folder}/${family}[wght].ttf`]],
    [`assets/fonts/${family.toLowerCase()}-OFL.txt`, [`${folder}/OFL.txt`]],
  ]) {
    if (records.some(r => r.file === file)) continue;
    let record;
    for (const path of candidates) {
      const response = await fetch(`https://raw.githubusercontent.com/${repository}/${commit}/${path}`, { signal: AbortSignal.timeout(60000) });
      if (response.status === 404) continue;
      if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(new URL(file, root), bytes);
      record = { file, repository, commit, path, sha256: createHash('sha256').update(bytes).digest('hex') };
      break;
    }
    if (!record) throw Error(`No pinned upstream asset found for ${file}.`);
    records.push(record);
    await writeFile(manifestURL, JSON.stringify(records, null, 2) + '\n');
    console.log(`Fetched ${file} at ${commit}`);
  }
}
