import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { userCacheDirectory } from './user-paths.js';
import { root, executable } from './render.js';
import { startAppServer, APP_PATH } from './app-server.js';

// Chromium app-mode derives its Wayland app ID from the host and URL path.
const windowClass = `chrome-127.0.0.1_${APP_PATH.replaceAll('/', '_')}-Default`;

export async function prepareDesktopEntry() {
  const directory = join(userCacheDirectory(), 'app'); await mkdir(directory, { recursive: true });
  const quote = value => '"' + value.replaceAll('\\', '\\\\\\\\').replace(/["`$]/g, c => '\\\\' + c).replaceAll('%', '%%') + '"';
  const path = join(directory, `${windowClass}.desktop`);
  if (/[\r\n]/.test(root + process.execPath)) throw Error('Desktop entries cannot contain newlines in executable paths.');
  const content = `[Desktop Entry]\nVersion=1.0\nType=Application\nName=Omarchy Billboard Generator\nComment=Create animated Omarchy domain videos locally\nExec=${quote(process.execPath)} ${quote(join(root, 'bin/omarchy-billboard-app'))}\nIcon=${join(root, 'app/icon.svg')}\nTerminal=false\nCategories=AudioVideo;Video;\nStartupWMClass=${windowClass}\n`;
  await writeFile(path, content, { mode: 0o644 });
  return path;
}

async function browserExecutable(noWindow) {
  if (noWindow) return;
  const path = await executable(process.env.BILLBOARD_CHROMIUM, ['chromium', 'chromium-browser', 'google-chrome'], 'Chromium');
  if (!process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) throw Error('No graphical session found. Use --no-window and open its local URL in a browser.');
  return path;
}
async function closeBrowser(state) {
  const { browser, browserClosed, work } = state;
  if (browser && browser.exitCode === null) {
    browser.kill('SIGTERM'); const timer = setTimeout(() => browser.kill('SIGKILL'), 5000); timer.unref();
    await browserClosed; clearTimeout(timer);
  }
  if (work) await rm(work, { recursive: true, force: true });
}
async function openWindow(browserPath, service, stop, state) {
  if (!browserPath) return;
  const cache = tmpdir();
  if (Buffer.byteLength(cache) + 8 > 60) throw Error('Temporary directory path is too long for Chromium UNIX sockets. Set TMPDIR to a shorter writable path.');
  await mkdir(cache, { recursive: true });
  const work = await mkdtemp(join(cache, 'a')); state.work = work;
  const browser = spawn(browserPath, windowArgs(service.launchUrl, work), {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, TMPDIR: work, HOME: work, XDG_CACHE_HOME: join(work, 'cache'), XDG_CONFIG_HOME: join(work, 'config'), XDG_DATA_HOME: join(work, 'data'), XDG_STATE_HOME: join(work, 'state') },
  });
  state.browser = browser;
  let stderr = '';
  browser.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
  browser.on('error', error => { state.launchError = error; stop(); });
  state.browserClosed = new Promise(resolve => browser.on('close', code => {
    if (code && !state.launchError) state.launchError = Error(`Chromium app window stopped (${code}): ${stderr}`);
    resolve(); stop();
  }));
}
function windowArgs(url, work) {
  return [
    `--app=${url}`, `--user-data-dir=${join(work, 'profile')}`, '--class=omarchy-billboard', '--window-size=1280,940',
    '--no-first-run', '--no-default-browser-check', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--password-store=basic',
    '--disable-background-mode', '--disable-background-networking', '--disable-component-update', '--disable-breakpad', '--disable-crash-reporter',
    '--force-color-profile=srgb', '--force-device-scale-factor=1',
    ...(process.env.WAYLAND_DISPLAY ? ['--ozone-platform=wayland'] : []),
  ];
}
export async function launchApp(options = {}) {
  const overrides = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
  const { noWindow, log } = { noWindow: false, log: console.log, ...overrides };
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const stop = () => finish();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.once(signal, stop);
  let service; const state = {};
  try {
    const browserPath = await browserExecutable(noWindow);
    service = await startAppServer({ onShutdown: stop });
    log(`Omarchy Billboard Generator\nLocal app: ${service.launchUrl}\nClosing the app cancels any active export.`);
    await openWindow(browserPath, service, stop, state);
    await finished;
  } finally {
    for (const signal of signals) process.removeListener(signal, stop);
    try { await service?.close(); } finally { await closeBrowser(state); }
  }
  if (state.launchError) throw state.launchError;
}
