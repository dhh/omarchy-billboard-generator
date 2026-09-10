import { chromium } from 'playwright-core';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { root, executable } from './runtime-paths.js';
import { prepareRenderConfig } from './render-config.js';
import { serveRenderer } from './server.js';

async function browserWork() {
  const browserTmp = tmpdir(); await mkdir(browserTmp, { recursive: true });
  if (process.platform === 'linux' && Buffer.byteLength(browserTmp) > 60) throw Error('Temporary directory path is too long for Chromium local UNIX sockets. Set TMPDIR to a shorter writable path.');
  return { browserTmp, work: await mkdtemp(join(browserTmp, 'billboard-')) };
}
function browserOptions(options, browserPath, browserTmp, work) {
  return {
    executablePath: browserPath, headless: true, viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark',
    acceptDownloads: false, serviceWorkers: 'block', ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    env: { ...process.env, TMPDIR: browserTmp, HOME: work, XDG_CACHE_HOME: join(work, 'cache'), XDG_CONFIG_HOME: join(work, 'config') },
    args: ['--disable-breakpad', '--disable-crash-reporter', '--disable-background-networking'],
  };
}
function browserLifetime(work, browserTmp, signal) {
  const previousTmp = process.env.TMPDIR;
  process.env.TMPDIR = browserTmp;
  const state = { context: undefined, server: undefined };
  let contextClosing, closing;
  // Share the first close promise: Playwright returns early on repeated closes.
  const closeContext = () => state.context ? (contextClosing ??= state.context.close()) : Promise.resolve();
  const abort = () => { void closeContext().catch(() => {}); };
  async function cleanFiles() {
    if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp;
    await rm(work, { recursive: true, force: true });
  }
  async function cleanup() {
    signal?.removeEventListener('abort', abort);
    try { await closeContext(); } finally {
      try { await state.server?.close(); } finally { await cleanFiles(); }
    }
  }
  return { state, abort, close: () => closing ??= cleanup() };
}
async function readyPage(context, url, signal, close) {
  await context.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
  const page = context.pages()[0]; let pageError;
  page.on('pageerror', error => { pageError = error; void page.evaluate(message => { window.renderError = message; }, error.message).catch(() => {}); });
  await page.goto(url + '/web/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.ready || window.renderError, null, { timeout: 60000 });
  const error = pageError?.message || await page.evaluate(() => window.renderError);
  if (error) throw Error(`Browser renderer: ${error}`);
  return { page, layout: await page.evaluate(() => window.layout), browserVersion: context.browser()?.version(), close,
    frame: async index => {
      signal?.throwIfAborted();
      if (pageError) throw pageError;
      return Buffer.from(await page.evaluate(i => window.renderFrame(i), index), 'base64');
    },
  };
}
// Shared by encoding, live-preview comparisons and deterministic visual checks.
export async function openRenderer(options, snapshot, { signal } = {}) {
  const config = await prepareRenderConfig(options, snapshot);
  const browserPath = await executable(process.env.BILLBOARD_CHROMIUM, ['chromium', 'chromium-browser', 'google-chrome'], 'Chromium');
  const { work, browserTmp } = await browserWork();
  const lifetime = browserLifetime(work, browserTmp, signal), { state } = lifetime;
  try {
    signal?.throwIfAborted();
    state.server = await serveRenderer(root, config);
    state.context = await chromium.launchPersistentContext(join(work, 'profile'), browserOptions(options, browserPath, browserTmp, work));
    signal?.addEventListener('abort', lifetime.abort, { once: true });
    signal?.throwIfAborted();
    return await readyPage(state.context, state.server.url, signal, lifetime.close);
  } catch (error) { await lifetime.close(); throw error; }
}
