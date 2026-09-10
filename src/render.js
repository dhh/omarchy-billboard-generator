import { access, rm, link, rename, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderTheme } from './render-config.js';
import { resolveThemeOptions } from './custom-theme.js';
import { combinationWarnings } from './support.js';
import { checkPublication } from './output.js';
import { executable } from './runtime-paths.js';
import { openRenderer } from './browser-renderer.js';
import { createEncoder, encodeFrames } from './encoder.js';
import { verifyVideo } from './video-verification.js';
export { root, executable } from './runtime-paths.js';
export { openRenderer } from './browser-renderer.js';
export { verifyVideo } from './video-verification.js';
export { checkFonts } from './fonts.js';

function encodedSize(options) { return { width: options.width + options.width % 2, height: options.height + options.height % 2 }; }
function reportWarnings(messages, warn) { for (const message of messages) warn(`Warning: ${message}`); }
async function checkOutput(output, force) {
  try {
    await lstat(output);
    if (!force) throw Error(`Output already exists: ${output}. Use --force to replace it.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await access(dirname(output), constants.W_OK).catch(() => { throw Error(`Output directory is missing or not writable: ${dirname(output)}`); });
}
async function prepareOutput(options, signal) {
  const output = resolve(options.output);
  await checkOutput(output, options.force);
  const ffmpeg = await executable(process.env.BILLBOARD_FFMPEG, ['ffmpeg'], 'ffmpeg');
  const ffprobe = await executable(process.env.BILLBOARD_FFPROBE, ['ffprobe'], 'ffprobe');
  signal?.throwIfAborted();
  if (!options.force) await checkPublication(output);
  return { output, ffmpeg, ffprobe, temporary: join(dirname(output), `.billboard-${randomUUID()}.tmp.mp4`) };
}
function videoMetadata(options, snapshot, palette, renderer) {
  const size = encodedSize(options);
  return JSON.stringify({ generator: 'omarchy-billboard-generator', revision: snapshot.commit,
    snapshotSchema: snapshot.schemaVersion, tagline: snapshot.languages.find(l => l.id === options.language).tagline,
    theme: options.theme, customTheme: options.customTheme, themeOrigin: palette.origin, themeProvenance: palette.provenance, background: options.background ?? 'theme', backgroundColor: palette.background,
    language: options.language, tld: options.tld, resolution: `${options.width}x${options.height}`, encodedResolution: `${size.width}x${size.height}`,
    animation: renderer.layout.settings.animation, animationProvenance: renderer.layout.animationProvenance, animationViewport: renderer.layout.animationViewport,
    seeds: renderer.layout.seeds, browser: renderer.browserVersion });
}
function encoderArgs(background, metadata, temporary) {
  return ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'image2pipe', '-framerate', '25', '-vcodec', 'png', '-i', 'pipe:0',
    '-vf', `pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=${background.replace('#', '0x')},setsar=1`,
    '-c:v', 'libx264', '-threads', '4', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '25', '-frames:v', '375', '-an',
    '-metadata', `comment=${metadata}`, '-movflags', '+faststart', '-f', 'mp4', temporary];
}
async function verifyDimensions(options, prepared, signal) {
  const { width, height } = encodedSize(options);
  const timeoutMs = Math.max(120000, Math.ceil(width * height / (3840 * 2160)) * 120000);
  const verified = await verifyVideo(prepared.temporary, prepared.ffprobe, { signal, timeoutMs: Math.min(timeoutMs, 2147483647) });
  if (verified.streams[0].width !== width || verified.streams[0].height !== height) throw Error('Encoded dimensions do not match requested resolution.');
  return verified;
}
async function publish(temporary, output, force) {
  // Hard links provide atomic no-clobber publication on the same filesystem.
  if (force) await rename(temporary, output);
  else { await link(temporary, output); await rm(temporary); }
}
async function encode(options, snapshot, prepared, resources, hooks) {
  const { signal, progress, warn } = hooks;
  signal?.throwIfAborted();
  const renderer = await openRenderer(options, snapshot, { signal }); resources.renderer = renderer;
  progress(`Animation: ${renderer.layout.settings.animation}`);
  reportWarnings(renderer.layout.warnings, warn);
  const palette = renderTheme(options, snapshot), metadata = videoMetadata(options, snapshot, palette, renderer);
  progress(`Rendering ${options.width}x${options.height}, ${options.theme}, ${options.language}, OMARCHY${options.tld}\nUpstream: ${snapshot.repository}@${snapshot.commit}`);
  resources.encoder = createEncoder(prepared.ffmpeg, encoderArgs(palette.background, metadata, prepared.temporary));
  await encodeFrames(renderer, resources.encoder, signal, progress);
  signal?.throwIfAborted();
  progress('Verifying encoded video…');
  const verified = await verifyDimensions(options, prepared, signal);
  signal?.throwIfAborted();
  await publish(prepared.temporary, prepared.output, options.force);
  progress(`Saved ${prepared.output} (15 seconds, 375 frames, H.264/yuv420p, no audio).`);
  return { output: prepared.output, layout: renderer.layout, verified };
}
async function cleanup(resources, temporary) {
  await resources.encoder?.close();
  try { await resources.renderer?.close(); } finally { await rm(temporary, { force: true }); }
}
export async function renderVideo(options, snapshot, { signal, progress = console.log, warn = console.warn } = {}) {
  options = await resolveThemeOptions(options);
  reportWarnings(combinationWarnings(options), warn);
  const prepared = await prepareOutput(options, signal), resources = {};
  const abort = () => resources.encoder?.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try { return await encode(options, snapshot, prepared, resources, { signal, progress, warn }); }
  finally { signal?.removeEventListener('abort', abort); await cleanup(resources, prepared.temporary); }
}
