import { createServer } from 'node:http';
import { realpath, mkdir, lstat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { root as projectRoot } from './render.js';
import { videosDirectory } from './user-directories.js';
import { prepareRenderConfig } from './render-config.js';
import { loadSnapshot, syncSnapshot } from './snapshot.js';
import { parseOptions } from './options.js';
import { combinationWarnings } from './support.js';
import { runAppExport } from './app-jobs.js';
import { createDesktopThemeReader } from './desktop-theme.js';
import { availableThemes } from './themes.js';
import { animations } from './animations.js';
import { parseThemeText, customThemePalette, THEME_FILE_LIMIT } from './custom-theme.js';
import { APP_PATH, inside, httpError as error, send, sendError, secureResponse, authenticate, serveAppAsset, jsonBody, fields, emptyBody } from './app-http.js';
export { APP_PATH } from './app-http.js';

function textOptions(body) {
  const args = [];
  for (const key of ['theme', 'animation', 'background', 'language', 'tld']) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string') throw error(400, `${key} must be text.`);
    args.push(`--${key}`, body[key]);
  }
  return args;
}
function previewOptions(body, snapshot, customThemes) {
  fields(body, ['theme', 'animation', 'background', 'language', 'tld', 'width', 'height']);
  const width = body.width ?? 900, height = body.height ?? 240;
  if (![width, height].every(v => ['number', 'string'].includes(typeof v))) throw error(400, 'Dimensions must be numbers.');
  const custom = customThemes.get(body.theme);
  const values = custom ? { ...body, theme: undefined } : body;
  const options = parseOptions([...textOptions(values), '--resolution', `${width}x${height}`], snapshot);
  return custom ? { ...options, theme: custom.palette.id, customTheme: custom.document } : options;
}
function safeFilename(value) {
  return basename(value) === value && !/[\\\u0000-\u001f\u007f]/.test(value) && !value.startsWith('.') && /\.mp4$/i.test(value);
}
function outputName(value) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 200 || !safeFilename(value)) {
    throw error(400, 'Choose an MP4 filename, not a path. Exports stay in the configured output folder.');
  }
  return value;
}
export async function openDesktopPath(path) {
  await new Promise((resolve, reject) => {
    const child = spawn('xdg-open', [path], { stdio: 'ignore' });
    child.once('error', () => reject(Error('Could not launch xdg-open. Open the output folder manually.')));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function initialData(snapshot, cacheFile) {
  if (snapshot) return snapshot;
  try { return await loadSnapshot(cacheFile); }
  catch (e) { if (e.code !== 'ENOENT') throw e; return loadSnapshot(); }
}
async function outputRoot(directory) {
  const requested = resolve(directory ?? await videosDirectory());
  await mkdir(requested, { recursive: true });
  return realpath(requested);
}
function publicJob(job) {
  const { id, filename, status, percent, message, warnings, settings, startedAt, finishedAt } = job;
  return { id, filename, status, percent, message, warnings, settings, startedAt, finishedAt };
}
function trimHistory(map, limit) { while (map.size > limit) map.delete(map.keys().next().value); }
function booleanField(body, key, label) {
  if (body[key] !== undefined && typeof body[key] !== 'boolean') throw error(400, `${label} must be a boolean.`);
}
async function checkOverwrite(path, filename, force) {
  if (force) return;
  try {
    await lstat(path);
    throw error(409, `File already exists: ${filename}. Enable Overwrite or choose another filename.`);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const uiMessage = e => e.message.replace(/Use --force\b/g, 'Enable Overwrite').replace(/use --force\b/g, 'enable Overwrite');
function jobCallbacks(job) {
  return {
    signal: job.controller.signal,
    progress: text => { job.message = text; const frame = /^Frame (\d+)\/375$/.exec(text); if (frame) job.percent = Math.floor(Number(frame[1]) / 375 * 98); },
    warn: text => { const warning = text.replace(/^Warning: /, ''); if (!job.warnings.includes(warning)) job.warnings.push(warning); },
  };
}

export async function startAppServer(options = {}) {
  const defaults = { render: runAppExport, openPath: openDesktopPath, onShutdown: () => {}, sync: syncSnapshot };
  const overrides = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
  const { render, openPath, onShutdown, sync } = { ...defaults, ...overrides };
  const readDesktopTheme = createDesktopThemeReader(options.desktopThemeDirectories);
  const root = await realpath(projectRoot), cacheFile = join(root, '.cache/upstream.json');
  let snapshot = await initialData(options.snapshot, cacheFile);
  const output = await outputRoot(options.outputDirectory);
  const token = randomBytes(32).toString('hex'), cookieName = `billboard_${token.slice(0, 12)}`;
  const session = { token, cookieName, origin: undefined };
  const previews = new Map(), jobs = new Map(), customThemes = new Map(), lifecycle = new AbortController();
  let activeJob, syncing = false, closing = false, closePromise;

  function requireOpen() { if (closing) throw error(503, 'The app is shutting down.'); }
  function requireIdle(message) { if (activeJob || syncing) throw error(409, message); }
  function findPreview(id, message) {
    const preview = previews.get(id);
    if (!preview) throw error(409, message);
    return preview;
  }
  async function openExport(job) {
    const file = await realpath(job.output);
    if (!inside(output, file)) throw error(403, 'Export path escapes the output folder.');
    if (closing) throw Error('The app is closing.');
    await openPath(file);
  }
  async function finishExport(job, result, autoPlay) {
    if (result.output !== job.output) throw Error('Renderer returned an unexpected output path.');
    job.message = 'Export complete';
    if (autoPlay && !closing && !job.controller.signal.aborted) await autoOpen(job);
    job.status = 'completed'; job.percent = 100;
  }
  async function autoOpen(job) {
    try { await openExport(job); }
    catch (e) {
      job.message = 'Export complete. Auto play could not open the player. Try Open in player.';
      job.warnings.push(`Could not open the player: ${uiMessage(e)}`);
    }
  }
  function runJob(job, preview, body) {
    job.done = Promise.resolve()
      .then(() => render({ ...preview.options, output: job.output, force: body.force ?? false }, preview.snapshot, jobCallbacks(job)))
      .then(result => finishExport(job, result, body.autoPlay))
      .catch(e => { job.status = job.controller.signal.aborted ? 'cancelled' : 'failed'; job.message = uiMessage(e); })
      .finally(() => { job.finishedAt = Date.now(); if (activeJob === job) activeJob = undefined; });
  }
  async function createJob(req, res) {
    requireIdle('Wait for the current export or sync to finish.');
    const body = await jsonBody(req); fields(body, ['previewId', 'filename', 'force', 'autoPlay']);
    const preview = findPreview(body.previewId, 'Create a current preview before exporting.');
    booleanField(body, 'force', 'Overwrite'); booleanField(body, 'autoPlay', 'Auto play');
    const filename = outputName(body.filename), id = randomUUID();
    await checkOverwrite(join(output, filename), filename, body.force);
    // Request parsing and filesystem checks yield, so recheck lifetime and ownership.
    requireOpen(); requireIdle('Another export is already starting.');
    const job = { id, filename, output: join(output, filename), status: 'running', percent: 0, message: 'Preparing renderer',
      warnings: combinationWarnings(preview.options), settings: { ...preview.options, revision: preview.snapshot.commit }, startedAt: Date.now(), controller: new AbortController() };
    jobs.set(id, job); activeJob = job; trimHistory(jobs, 20);
    runJob(job, preview, body); send(res, 202, publicJob(job));
  }
  async function createPreview(req, res) {
    if (syncing) throw error(409, 'Website data is being updated.');
    const options = previewOptions(await jsonBody(req), snapshot, customThemes), selectedSnapshot = snapshot;
    const config = await prepareRenderConfig(options, selectedSnapshot), id = randomUUID();
    requireOpen();
    previews.set(id, { options, config, snapshot: selectedSnapshot }); trimHistory(previews, 4);
    send(res, 200, { id, url: `/web/index.html?preview=${id}`, options, warnings: combinationWarnings(options) });
  }
  async function importTheme(req, res) {
    const body = await jsonBody(req); fields(body, ['content']);
    const document = parseThemeText(body.content), palette = customThemePalette(document);
    requireOpen();
    if (!customThemes.has(palette.id) && customThemes.size >= 32) throw error(409, 'At most 32 custom themes can be imported per app session.');
    customThemes.set(palette.id, { document, palette });
    send(res, 200, { theme: palette });
  }
  function catalog(req, res) {
    const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none', languageDisplay: 'standard' });
    send(res, 200, { token, repository: snapshot.repository, commit: snapshot.commit, outputDirectory: output,
      languages: snapshot.languages.map(l => ({ ...l, englishName: names.of(l.id) ?? l.name })), themes: [...availableThemes(snapshot), ...Array.from(customThemes.values(), item => item.palette)], animations, themeFileLimit: THEME_FILE_LIMIT });
  }
  async function desktopTheme(req, res, path) {
    const theme = await readDesktopTheme();
    if (!path.endsWith('.css')) { send(res, 200, theme); return; }
    const variables = Object.entries(theme.variables).map(([key, value]) => `${key}:${value};`).join('');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }).end(`:root{color-scheme:${theme.mode};${variables}}`);
  }
  async function openFolder(req, res) {
    await emptyBody(req);
    if (await realpath(output) !== output) throw error(403, 'Output folder has changed.');
    await openPath(output); send(res, 200, { ok: true });
  }
  async function synchronize(req, res) {
    await emptyBody(req); requireIdle('Wait for the current export or sync to finish.');
    syncing = true;
    try { snapshot = await sync(cacheFile, { signal: lifecycle.signal }); previews.clear(); send(res, 200, { commit: snapshot.commit }); }
    finally { syncing = false; }
  }
  async function shutdown(req, res) {
    await emptyBody(req); send(res, 200, { ok: true }); setImmediate(onShutdown);
  }
  async function cancelJob(req, res, job) {
    await emptyBody(req);
    if (job.status === 'running') { job.status = 'cancelling'; job.message = 'Cancelling export'; job.controller.abort(Error('Export cancelled.')); }
    send(res, 200, publicJob(job));
  }
  async function openJob(req, res, job) {
    await emptyBody(req);
    if (job.status !== 'completed') throw error(409, 'This export is not ready.');
    await openExport(job); send(res, 200, { ok: true });
  }
  const jobRoutes = new Map([
    ['GET/', (req, res, job) => send(res, 200, publicJob(job))], ['POST/cancel', cancelJob], ['POST/open', openJob],
  ]);
  async function jobRequest(req, res, path, match) {
    const job = jobs.get(match[1]); if (!job) throw error(404, 'Unknown export.');
    const handler = jobRoutes.get(`${req.method}/${match[2] ?? ''}`);
    if (handler) return handler(req, res, job);
    return serveAppAsset(req, res, path, root);
  }
  function previewConfig(res, id) {
    const preview = previews.get(id);
    if (!preview) throw error(404, 'Preview expired. Refresh the preview.');
    send(res, 200, preview.config);
  }
  const routes = new Map([
    ['GET /api/catalog', catalog], ['GET /api/desktop-theme', desktopTheme], ['GET /api/desktop-theme.css', desktopTheme],
    ['POST /api/preview', createPreview], ['POST /api/jobs', createJob], ['POST /api/themes', importTheme],
    ['GET /api/jobs', (req, res) => send(res, 200, { jobs: [...jobs.values()].map(publicJob).reverse() })],
    ['POST /api/open-folder', openFolder], ['POST /api/sync', synchronize], ['POST /api/shutdown', shutdown],
  ]);
  async function dispatch(req, res, path) {
    const handler = routes.get(`${req.method} ${path}`);
    if (handler) return handler(req, res, path);
    const previewMatch = /^\/api\/previews\/([a-f0-9-]{36})\/config$/.exec(path);
    if (req.method === 'GET' && previewMatch) return previewConfig(res, previewMatch[1]);
    const jobMatch = /^\/api\/jobs\/([a-f0-9-]{36})(?:\/(cancel|open))?$/.exec(path);
    if (jobMatch) return jobRequest(req, res, path, jobMatch);
    return serveAppAsset(req, res, path, root);
  }
  const server = createServer(async (req, res) => {
    secureResponse(res);
    try {
      requireOpen();
      const path = authenticate(req, res, session);
      if (path !== null) await dispatch(req, res, path);
    } catch (e) { sendError(res, e); }
  });
  server.requestTimeout = 15000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  session.origin = `http://127.0.0.1:${server.address().port}`;
  function close() {
    closePromise ??= (async () => {
      closing = true; lifecycle.abort();
      activeJob?.controller.abort(Error('App closed. Export cancelled.'));
      await activeJob?.done;
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    })();
    return closePromise;
  }
  return { url: session.origin, launchUrl: `${session.origin}${APP_PATH}?token=${token}`, close };
}
