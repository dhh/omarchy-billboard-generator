import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const git = args => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
git(['diff', '--exit-code', 'HEAD']);
const metadata = JSON.parse(git(['show', 'HEAD:package.json']));
const version = `v${metadata.version}`;
if (!/^v\d+\.\d+\.\d+$/.test(version)) throw Error('Set a stable package version before building a release.');
const head = git(['rev-parse', 'HEAD']).toString().trim();
const tagged = git(['rev-parse', `refs/tags/${version}^{commit}`]).toString().trim();
if (head !== tagged) throw Error('The release tag must point to the committed source being built.');
execFileSync(process.execPath, ['scripts/audit-public.mjs'], { stdio: 'inherit' });
const directory = join('.cache/releases', version); await mkdir(directory, { recursive: true });
const archive = 'omarchy-billboard-generator.tar.gz';
git(['archive', '--format=tar.gz', '--prefix=omarchy-billboard-generator/', `--output=${join(directory, archive)}`, 'HEAD']);
await writeFile(join(directory, 'installer.mjs'), git(['show', 'HEAD:scripts/install.mjs']));
const sums = [];
for (const name of [archive, 'installer.mjs']) {
  const bytes = await readFile(join(directory, name));
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
await writeFile(join(directory, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`Release assets prepared in ${directory}. Publish them together on the matching immutable ${version} tag.`);
