import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root, executable, verifyVideo } from '../src/render.js';

const base = join(root, '.cache/cli'); await mkdir(base, { recursive: true });
const cwd = await mkdtemp(join(base, 'run-')), cli = join(root, 'bin/omarchy-billboard');
const settings = { cwd, encoding: 'utf8', timeout: 120000 };
const run = args => execFileSync(cli, args, settings);
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const ffprobe = await executable(process.env.BILLBOARD_FFPROBE, ['ffprobe'], 'ffprobe');
const ffmpeg = await executable(process.env.BILLBOARD_FFMPEG, ['ffmpeg'], 'ffmpeg');
assert.match(run(['--help']), /--animation ID/);
for (const [command, count] of [['--list-animations', 38], ['--list-themes', 24], ['--list-languages', 31]]) {
  assert.equal(run([command]).trim().split('\n').length, count, command);
}
const invalid = spawnSync(cli, ['--animation', 'not-real'], settings);
assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Unknown animation.*--list-animations/);

const output = join(cwd, 'website export.mp4');
const args = ['--animation', 'synthgrid', '--theme', 'astral', '--language', 'da', '--tld', '.dk',
  '--background', 'black', '--resolution', '1920x1080', '--output', 'website export.mp4'];
const log = run(args), website = await verifyVideo(output, ffprobe);
const metadata = JSON.parse(website.format.tags.comment);
assert.equal(metadata.animation, 'synthgrid'); assert.equal(metadata.theme, 'astral');
assert.ok(metadata.animationViewport.bounds.x <= 0 && metadata.animationViewport.bounds.y <= 0);
assert.ok(metadata.animationViewport.bounds.x + metadata.animationViewport.bounds.width >= 1920);
assert.ok(metadata.animationViewport.bounds.y + metadata.animationViewport.bounds.height >= 1080);
assert.equal(metadata.language, 'da'); assert.equal(metadata.tld, '.DK');
assert.equal(metadata.backgroundColor, '#000000'); assert.deepEqual(metadata.seeds, [42]);
assert.ok(metadata.animationProvenance.commit); assert.match(metadata.tagline, /fra DHH$/);
assert.equal(website.streams[0].width, 1920); assert.equal(website.streams[0].height, 1080);
execFileSync(ffmpeg, ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], settings);
const original = await digest(output), rejected = spawnSync(cli, args, settings);
assert.equal(rejected.status, 1); assert.match(rejected.stderr, /--force/);
assert.equal(await digest(output), original);

// Check actual shell entry point, defaults and explicit replacement, not just renderVideo().
const replacement = run(['--force', '--output', 'website export.mp4']);
const campaign = await verifyVideo(output, ffprobe), campaignMetadata = JSON.parse(campaign.format.tags.comment);
assert.equal(campaignMetadata.theme, 'astral');
assert.equal(campaignMetadata.animation, 'laseretch-campaign'); assert.deepEqual(campaignMetadata.seeds, [42, 137]);
assert.equal(campaign.streams[0].width, 900); assert.equal(campaign.streams[0].height, 240);
assert.notEqual(await digest(output), original);
execFileSync(ffmpeg, ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], settings);
const themeText = await readFile(join(root, 'examples/aurora.json'), 'utf8');
await writeFile(join(cwd, 'my theme.json'), themeText);
const customLog = run(['--theme-file', 'my theme.json', '--animation', 'fireworks', '--background', 'black',
  '--resolution', '641x361', '--output', 'custom.mp4']);
const custom = await verifyVideo(join(cwd, 'custom.mp4'), ffprobe), customMetadata = JSON.parse(custom.format.tags.comment);
assert.equal(customMetadata.themeOrigin, 'custom'); assert.deepEqual(customMetadata.customTheme, JSON.parse(themeText));
assert.equal(customMetadata.backgroundColor, '#000000'); assert.equal(customMetadata.animation, 'fireworks');
assert.match(customMetadata.themeProvenance.sha256, /^[a-f\d]{64}$/);
assert.equal(custom.streams[0].width, 642); assert.equal(custom.streams[0].height, 362);
assert.ok(!JSON.stringify(customMetadata).includes('my theme.json'));
assert.equal(await readFile(join(cwd, 'my theme.json'), 'utf8'), themeText);
execFileSync(ffmpeg, ['-v', 'error', '-xerror', '-i', join(cwd, 'custom.mp4'), '-f', 'null', '-'], settings);
await writeFile(join(cwd, 'broken.json'), '{}'); const customHash = await digest(join(cwd, 'custom.mp4'));
const badTheme = spawnSync(cli, ['--theme-file', 'broken.json', '--force', '--output', 'custom.mp4'], settings);
assert.equal(badTheme.status, 1); assert.match(badTheme.stderr, /Invalid theme file/);
assert.equal(await digest(join(cwd, 'custom.mp4')), customHash);
await writeFile(join(cwd, 'cli.log'), log + replacement + customLog);
await writeFile(join(base, 'report.json'), JSON.stringify({ cwd, website: metadata, campaign: campaignMetadata, custom: customMetadata,
  checks: ['executable entry point from another working directory', 'help and catalogs', 'invalid animation rejection',
    'website animation in Full HD', 'localized attribution and metadata', 'no-clobber', 'force replacement', 'campaign defaults', 'full video decoding', 'read-only custom theme files', 'custom palette metadata', 'invalid theme preserves output'] }, null, 2) + '\n');
console.log(`CLI checks passed. Report: ${join(base, 'report.json')}`);
