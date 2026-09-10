import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadSnapshot } from '../src/snapshot.js';
import { openRenderer, verifyVideo, executable, root } from '../src/render.js';

const snapshot = await loadSnapshot();
const base = join(root, '.cache/experimental'); await mkdir(base, { recursive: true });
const directory = await mkdtemp(join(base, 'run-'));
const report = { localeFrames: [], themeFrames: [], videos: [] };
// These smoke tests exercise availability. They do not silently promote every
// combination into the curated visual baseline or turn off its warning.
for (const locale of snapshot.languages) {
  const renderer = await openRenderer({ language: locale.id, theme: 'hackerman', tld: '.DEV', width: 900, height: 480 }, snapshot);
  try {
    await writeFile(join(directory, `${locale.id}-295.png`), await renderer.frame(295));
    assert.ok(renderer.layout.baseline + renderer.layout.descent < 480);
    assert.ok(renderer.layout.floorY > 470);
    report.localeFrames.push({ language: locale.id, font: renderer.layout.family });
  } finally { await renderer.close(); }
}
for (const theme of snapshot.themes) {
  const renderer = await openRenderer({ language: 'en', theme: theme.id, tld: '.CO.UK', width: 600, height: 600 }, snapshot);
  try {
    for (const index of [70, 295]) await writeFile(join(directory, `${theme.id}-${index}.png`), await renderer.frame(index));
    assert.ok(renderer.layout.floorY > 590);
    report.themeFrames.push(theme.id);
  } finally { await renderer.close(); }
}
const ffprobe = await executable(process.env.BILLBOARD_FFPROBE, ['ffprobe'], 'ffprobe');
for (const [language, theme, tld, resolution] of [
  ['hi', 'gruvbox', '.co.uk', '720x1280'],
  ['ko', 'catppuccin-latte', '.中国', '501x501'],
  ['el', 'everforest', '.xyz', '320x96'],
]) {
  const output = join(directory, `${language}-${resolution}.mp4`);
  const child = spawn(process.execPath, ['bin/omarchy-billboard', '--language', language, '--theme', theme, '--tld', tld, '--resolution', resolution, '--output', output], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', data => { stderr += data; }); child.stdout.resume();
  const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  assert.equal(code, 0, stderr);
  assert.doesNotMatch(stderr, /untested/i);
  const video = await verifyVideo(output, ffprobe), [w, h] = resolution.split('x').map(Number);
  assert.equal(video.streams[0].width, w + w % 2); assert.equal(video.streams[0].height, h + h % 2);
  if (w % 2 || h % 2) assert.match(stderr, /padded.*502x502/);
  report.videos.push({ output, warnings: stderr, width: video.streams[0].width, height: video.streams[0].height });
}
await writeFile(join(base, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`All ${report.localeFrames.length} upstream locales and ${report.themeFrames.length} themes rendered. Portrait, odd square and small-resolution CLI videos passed with warnings.\nArtifacts: ${directory}`);
