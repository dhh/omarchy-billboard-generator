import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Encoding runs in a separate process so font work and ffprobe cannot block UI requests.
export function runAppExport(options, snapshot, { signal, progress, warn }) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./app-worker.js', import.meta.url)), [], {
      execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let result, failure, stderr = '', timer;
    const cancel = () => {
      if (child.connected) child.send({ type: 'cancel' }, () => {});
      timer ??= setTimeout(() => child.kill('SIGKILL'), 15000);
      timer.unref();
    };
    signal.addEventListener('abort', cancel, { once: true });
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-12000); });
    child.on('message', message => {
      if (message.type === 'progress') progress(message.text);
      else if (message.type === 'warning') warn(message.text);
      else if (message.type === 'complete') result = { output: message.output };
      else if (message.type === 'error' || message.type === 'cancelled') failure = Error(message.message);
    });
    child.on('error', error => { failure = error; });
    child.on('close', () => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (result) resolve(result);
      else reject(failure ?? Error(signal.aborted ? 'Export cancelled.' : `Export worker stopped unexpectedly. ${stderr}`));
    });
    child.send({ type: 'render', options, snapshot }, error => { if (error) failure = error; });
    if (signal.aborted) cancel();
  });
}
