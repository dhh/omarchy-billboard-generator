import { renderVideo } from './render.js';

const controller = new AbortController();
let started = false;
const send = message => { if (process.connected) process.send(message, () => {}); };
const cancel = () => controller.abort(new Error('Export cancelled.'));
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP', 'disconnect']) process.on(signal, cancel);
process.on('message', message => {
  if (message.type === 'cancel') { cancel(); return; }
  if (message.type !== 'render' || started) return;
  started = true;
  void run(message);
});
async function run(message) {
  try {
    const result = await renderVideo(message.options, message.snapshot, {
      signal: controller.signal,
      progress: text => send({ type: 'progress', text }),
      warn: text => send({ type: 'warning', text }),
    });
    send({ type: 'complete', output: result.output });
  } catch (error) {
    send({ type: controller.signal.aborted ? 'cancelled' : 'error', message: controller.signal.aborted ? 'Export cancelled.' : error.message });
  } finally {
    if (process.connected) process.disconnect();
  }
}
