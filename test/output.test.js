import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderVideo, executable } from '../src/render.js';
import { loadSnapshot } from '../src/snapshot.js';

test('dependency and output failures are actionable and leave existing data untouched', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'output-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const snapshot = await loadSnapshot();
  const options = { theme: 'hackerman', language: 'en', tld: '.ORG', width: 900, height: 240, output: join(directory, 'exists.mp4') };
  await writeFile(options.output, 'sentinel');
  await assert.rejects(renderVideo(options, snapshot), /already exists/);
  assert.equal(await readFile(options.output, 'utf8'), 'sentinel');
  await assert.rejects(renderVideo({ ...options, output: join(directory, 'missing/out.mp4') }, snapshot), /missing or not writable/);
  for (const name of ['ffmpeg', 'ffprobe', 'Chromium']) await assert.rejects(executable(join(directory, 'missing-executable'), [], name), new RegExp(`${name} was not found`));
  const locked = join(directory, 'locked'); await mkdir(locked); await chmod(locked, 0o555);
  try {
    if (process.getuid?.() !== 0) await assert.rejects(renderVideo({ ...options, output: join(locked, 'out.mp4') }, snapshot), /not writable/);
  } finally { await chmod(locked, 0o755); }
});
