import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { root, verifyVideo, openRenderer } from '../src/render.js';
import { checkPublication } from '../src/output.js';
import { runAppExport } from '../src/app-jobs.js';
import { loadSnapshot } from '../src/snapshot.js';
import { renderTheme } from '../src/render-config.js';
import { backgroundWarnings, contrastRatio } from '../web/contrast.js';

async function directory(t) {
  const base = join(root, '.cache/review-tests'); await mkdir(base, { recursive: true });
  const path = await mkdtemp(join(base, 'run-'));
  t.after(() => rm(path, { recursive: true, force: true })); return path;
}

test('hard-link capability is checked without exposing partial output or modifying an existing destination', async t => {
  const dir = await directory(t), output = join(dir, 'keep.mp4');
  await writeFile(output, 'sentinel');
  await checkPublication(output);
  for (const code of ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV']) {
    await assert.rejects(checkPublication(output, { createLink: async () => { throw Object.assign(Error('unsupported'), { code }); } }), /atomic no-clobber.*--force/);
  }
  assert.equal(await readFile(output, 'utf8'), 'sentinel');
  assert.deepEqual(await readdir(dir), ['keep.mp4']);
});

test('background contrast warnings report a numeric ratio without changing artwork or blocking rendering', async () => {
  const snapshot = await loadSnapshot();
  const options = { theme: 'hackerman', background: 'white' };
  assert.match(backgroundWarnings({ ...options, theme: renderTheme(options, snapshot) }).join('\n'), /Low tagline contrast: 1\.\d+:1/);
  assert.deepEqual(backgroundWarnings({ background: 'black', theme: renderTheme({ ...options, background: 'black' }, snapshot) }), []);
  assert.deepEqual(backgroundWarnings({ background: 'white', theme: { background: '#ffffff', brand: '#000000' } }), []);
  assert.deepEqual(backgroundWarnings({ background: 'theme', theme: renderTheme({ ...options, background: 'theme' }, snapshot) }), []);
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
});

test('abort and final cleanup await the same in-flight browser close', { timeout: 20000 }, async () => {
  const controller = new AbortController();
  const renderer = await openRenderer({ theme: 'hackerman', language: 'en', tld: '.ORG', width: 160, height: 80 }, await loadSnapshot(), { signal: controller.signal });
  const context = renderer.page.context(), originalClose = context.close.bind(context);
  let release, calls = 0, finished = false;
  const gate = new Promise(resolve => { release = resolve; });
  context.close = async () => { if (++calls > 1) return; await gate; await originalClose(); };
  controller.abort(Error('Cancellation test'));
  const firstClose = renderer.close();
  const closing = firstClose.then(() => { finished = true; });
  try {
    assert.equal(renderer.close(), firstClose, 'Repeated cleanup calls must share the full cleanup promise.');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(calls, 1); assert.equal(finished, false, 'Profile cleanup must wait for the first close to complete.');
  } finally { release(); await closing; }
});

test('worker cancellation interrupts a verifier ignoring SIGTERM and cleans its temporary MP4', { timeout: 30000 }, async t => {
  const dir = await directory(t), marker = join(dir, 'probe-ready'), probe = join(dir, 'ffprobe-stuck');
  await writeFile(probe, `#!${process.execPath}\nimport fs from 'node:fs';\nprocess.on('SIGTERM', () => {});\nfs.writeFileSync(${JSON.stringify(marker)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`, { mode: 0o700 });
  const previous = process.env.BILLBOARD_FFPROBE; process.env.BILLBOARD_FFPROBE = probe;
  const controller = new AbortController(); let ready = false, pid;
  const output = join(dir, 'keep.mp4'); await writeFile(output, 'sentinel');
  try {
    const job = runAppExport({ theme: 'hackerman', language: 'en', tld: '.ORG', width: 160, height: 80, output, force: true }, await loadSnapshot(), { signal: controller.signal, progress: () => {}, warn: () => {} });
    job.catch(() => {});
    for (let i = 0; i < 600; i++) {
      try { pid = Number(await readFile(marker, 'utf8')); if (pid > 0) { ready = true; break; } } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await Promise.race([new Promise(resolve => setTimeout(resolve, 20)), job.then(() => { throw Error('Export completed before verification was interrupted.'); })]);
    }
    const start = Date.now(); controller.abort(Error('Cancel during verification'));
    await assert.rejects(job, /cancel/i);
    assert.ok(ready, 'Cancellation must occur after the verifier starts.');
    assert.ok(Date.now() - start < 10000, 'Verification must not wait for the worker SIGKILL deadline.');
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(await readFile(output, 'utf8'), 'sentinel');
    assert.ok(!(await readdir(dir)).some(name => name.startsWith('.billboard-')));
    const aborted = new AbortController(); aborted.abort(Error('Already cancelled'));
    await assert.rejects(verifyVideo(output, probe, { signal: aborted.signal }), /Already cancelled/);
  } finally {
    controller.abort();
    if (previous === undefined) delete process.env.BILLBOARD_FFPROBE; else process.env.BILLBOARD_FFPROBE = previous;
  }
});
