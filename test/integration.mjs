import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { renderVideo, root, executable } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';

const snapshot = await loadSnapshot();
const base = join(root, '.cache/integration'); await mkdir(base, { recursive: true });
const directory = await mkdtemp(join(base, 'run-'));
const browserWork = join(root, '.cache/tmp'); await mkdir(browserWork, { recursive: true });
const previousWork = new Set(await readdir(browserWork));
const previousCache = new Set(await readdir(join(root, '.cache')));
const ffmpeg = await executable(process.env.BILLBOARD_FFMPEG, ['ffmpeg'], 'ffmpeg');
const cases = [
  ['hackerman', 'da', '.DK', 900, 240],
  ['hackerman', 'ja', '.DE', 900, 480],
  ['tokyo-night', 'fr', '.COM', 1920, 1080],
  ['white', 'ar', '.ORG', 900, 240],
  ['hackerman', 'en', '.ORG', 3840, 2160],
  ['astral', 'da', '.DK', 900, 240],
  ['danish-dynamite', 'da', '.DK', 900, 240],
];
const report = { revision: snapshot.commit, videos: [], checks: [] };
for (const [theme, language, tld, width, height] of cases) {
  const options = { theme, language, tld, width, height, output: join(directory, `${theme}-${language}-${width}x${height}.mp4`), force: false };
  const result = await renderVideo(options, snapshot);
  const decoded = spawnSync(ffmpeg, ['-v', 'error', '-xerror', '-i', options.output, '-f', 'null', '-'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(decoded.status, 0, decoded.stderr);
  const metadata = JSON.parse(result.verified.format.tags.comment);
  assert.equal(metadata.revision, snapshot.commit); assert.equal(metadata.language, language);
  assert.equal(metadata.snapshotSchema, 2); assert.equal(metadata.tagline, snapshot.languages.find(l => l.id === language).tagline);
  assert.match(metadata.tagline, /DHH/);
  if (['astral', 'danish-dynamite'].includes(theme)) {
    assert.equal(metadata.themeOrigin, 'campaign');
    assert.equal(metadata.themeProvenance.sha256, '55f2af668864c5fa36f6fd5eace0ee61f5f0abdf93ab3145a625a7c134a091b4');
    assert.equal(metadata.backgroundColor, '#000000');
  } else assert.equal(metadata.themeOrigin, 'website');
  report.videos.push({ output: options.output, stream: result.verified.streams[0], metadata, fullDecode: true });
  const before = await readFile(options.output);
  await assert.rejects(renderVideo(options, snapshot), /already exists/);
  assert.deepEqual(await readFile(options.output), before);
  if (language === 'da') {
    await writeFile(options.output, 'replace this sentinel');
    await renderVideo({ ...options, force: true }, snapshot, { progress: () => {} });
    assert.ok((await readFile(options.output)).length > 1000);
  }
}
report.checks.push('Successful --force rendering replaces an existing output.');
report.checks.push('All seven videos decode fully; dimensions, 375 frames, 15 seconds, SAR, codec, pixel format, frame rate, metadata and no-clobber verified.');
const options = { theme: 'hackerman', language: 'en', tld: '.ORG', width: 900, height: 240, output: join(directory, 'protected.mp4'), force: true };
await writeFile(options.output, 'sentinel');
const fake = join(directory, 'encoder-fail');
await writeFile(fake, '#!/usr/bin/env node\nprocess.stderr.write("Deliberate test encoder failure\\n"); process.exit(72);\n', { mode: 0o700 });
const previous = process.env.BILLBOARD_FFMPEG;
process.env.BILLBOARD_FFMPEG = fake;
try { await assert.rejects(renderVideo(options, snapshot), /ffmpeg failed|EPIPE|write/); }
finally { if (previous === undefined) delete process.env.BILLBOARD_FFMPEG; else process.env.BILLBOARD_FFMPEG = previous; }
assert.equal(await readFile(options.output, 'utf8'), 'sentinel');
report.checks.push('Early encoder failure with --force retains existing output.');
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const child = spawn(process.execPath, ['bin/omarchy-billboard', '--tld', '.ORG', '--output', options.output, '--force'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '', interrupted = false;
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdout.on('data', bytes => { if (!interrupted && bytes.toString().includes('Frame 51/375')) { interrupted = true; child.kill(signal); } });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  assert.ok(interrupted); assert.equal(code, 130, stderr); assert.match(stderr, new RegExp(`Interrupted by ${signal}`));
  assert.equal(await readFile(options.output, 'utf8'), 'sentinel');
}
// A stuck encoder that ignores SIGTERM must not defeat cancellation while backpressured.
const stuck = join(directory, 'encoder-stuck');
await writeFile(stuck, '#!/usr/bin/env node\nprocess.on("SIGTERM", () => {}); setInterval(() => {}, 1000);\n', { mode: 0o700 });
const controller = new AbortController(); let cancelTimer;
process.env.BILLBOARD_FFMPEG = stuck;
try {
  const started = Date.now();
  await assert.rejects(renderVideo(options, snapshot, { signal: controller.signal, progress: message => {
    if (message === 'Frame 1/375') cancelTimer = setTimeout(() => controller.abort(new Error('Test cancellation')), 300);
  } }));
  assert.ok(controller.signal.aborted);
  assert.ok(Date.now() - started < 15000, 'Stuck encoder cleanup must be bounded.');
} finally {
  clearTimeout(cancelTimer);
  if (previous === undefined) delete process.env.BILLBOARD_FFMPEG; else process.env.BILLBOARD_FFMPEG = previous;
}
assert.equal(await readFile(options.output, 'utf8'), 'sentinel');
assert.ok(!(await readdir(directory)).some(name => name.startsWith('.billboard-')));
assert.deepEqual((await readdir(browserWork)).filter(name => !previousWork.has(name)), []);
assert.deepEqual((await readdir(join(root, '.cache'))).filter(name => !previousCache.has(name) && /^(org\.chromium\.|playwright-)/.test(name)), []);
report.checks.push('SIGINT, SIGTERM and SIGHUP close browser/encoder, remove temporary outputs, return 130 and retain existing output.');
report.checks.push('A backpressured encoder that ignores SIGTERM is force-killed during cancellation; cleanup remains bounded.');
await writeFile(join(base, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Integration checks passed. Report: ${join(base, 'report.json')}`);
