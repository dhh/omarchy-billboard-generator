import { spawn } from 'node:child_process';

function probeFailure(failure, stderr) { return Error(`ffprobe failed: ${failure?.message ?? failure ?? stderr}`, { cause: failure }); }
function probeOutput(path, ffprobe, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stderr = '', failure, killTimer;
    const stop = reason => {
      failure ??= reason; child.kill('SIGTERM');
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 3000); killTimer.unref();
    };
    const abort = () => stop(signal.reason ?? Error('Video verification cancelled.'));
    const timer = setTimeout(() => stop(Error('Video verification timed out.')), timeoutMs); timer.unref();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => {
      if (output.length <= 4 * 1024 * 1024) output += data;
      if (output.length > 4 * 1024 * 1024) stop(Error('ffprobe returned too much output.'));
    });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-16000); });
    child.on('error', error => { failure ??= error; });
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(probeFailure(failure, stderr));
      else resolve(output);
    });
  });
}
function validStream(video) {
  const expected = { codec_name: 'h264', pix_fmt: 'yuv420p', sample_aspect_ratio: '1:1', avg_frame_rate: '25/1' };
  return Object.entries(expected).every(([key, value]) => video[key] === value) && Number(video.nb_read_frames) === 375;
}
function validateVideo(data) {
  if (data.streams.length !== 1 || !validStream(data.streams[0]) || Math.abs(Number(data.format.duration) - 15) > .001) throw Error('Encoded video failed format validation.');
  return data;
}
export async function verifyVideo(path, ffprobe, { signal, timeoutMs = 120000 } = {}) {
  signal?.throwIfAborted();
  return validateVideo(JSON.parse(await probeOutput(path, ffprobe, signal, timeoutMs)));
}
