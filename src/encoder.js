import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Own encoder completion and termination in one place, including early failures.
export function createEncoder(ffmpeg, args) {
  const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '', inputError, timer;
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-16000); });
  child.stdin.on('error', error => { inputError = error; });
  const diagnostic = () => stderr || inputError?.message || 'encoder stopped';
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg failed (${code}): ${diagnostic()}`)));
  });
  completion.catch(() => {});
  function abort() {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM'); timer ??= setTimeout(() => child.kill('SIGKILL'), 3000); timer.unref();
  }
  async function write(frame) {
    if (inputError || child.exitCode !== null) {
      await completion; throw inputError ?? Error('Encoder ended before all frames were submitted.');
    }
    if (!child.stdin.write(frame)) await Promise.race([once(child.stdin, 'drain'), completion.then(() => { throw Error('Encoder closed while receiving frames.'); })]);
  }
  async function close() {
    abort(); await completion.catch(() => {}); clearTimeout(timer);
  }
  return { abort, write, close, finish: async () => { child.stdin.end(); await completion; } };
}
export async function encodeFrames(renderer, encoder, signal, progress) {
  for (let index = 0; index < 375; index++) {
    signal?.throwIfAborted();
    await encoder.write(await renderer.frame(index));
    if (index % 50 === 0) progress(`Frame ${index + 1}/375`);
  }
  await encoder.finish();
}
