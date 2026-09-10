import { startDesktopTheme } from './desktop-theme.js';
const $ = id => document.getElementById(id);
let stopDesktopTheme = () => {};
let catalog, token, previewId, previewWindow, previewWarnings = [], currentFrame = 295;
let requestVersion = 0, previewAbort, debounce, playing = false, animation, epoch, resumeAfterRefresh = false;
let busy = false, syncing = false, importing = false, closed = false, currentJob, automaticFilename = 'omarchy-org-en.mp4', previewDimensions;

function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
function showWarnings(messages) {
  const unique = [...new Set(messages)]; $('warning-list').replaceChildren();
  for (const text of unique) { const li = document.createElement('li'); li.textContent = text; $('warning-list').append(li); }
  $('warnings').hidden = !unique.length;
}
function requestOptions(body, signal) {
  const headers = token ? { 'X-Billboard-Token': token } : {};
  if (body === undefined) return { method: 'GET', credentials: 'same-origin', signal, headers };
  return { method: 'POST', credentials: 'same-origin', signal, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
async function api(path, { body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, requestOptions(body, signal));
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw Error('Cannot reach the local app. Restart it if its window or server was closed.');
  }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function disableControls(selector, disabled) {
  for (const element of document.querySelectorAll(selector)) element.disabled = disabled;
}
function playbackUnavailable() { return !previewId || syncing || importing || closed; }
function controls() {
  const locked = busy || syncing || importing || closed;
  disableControls('#settings, #output-settings, #sync', locked);
  $('export').disabled = !previewId || locked;
  disableControls('#play, #restart, #scrubber, [data-frame]', playbackUnavailable());
}
function selections() {
  return { theme: $('theme').value, animation: $('animation').value, background: $('background').value, language: $('language').value, tld: $('tld').value, width: $('width').value, height: $('height').value };
}
function drawPalette(theme) {
  $('palette').replaceChildren();
  if (!theme) return;
  const background = { theme: theme.background, black: '#000000', white: '#ffffff' }[$('background').value];
  const colors = [['Background', background], ...theme.gradient.map(b => ['Brand band', b.color])];
  for (const [label, color] of colors) {
    const swatch = document.createElement('span'); swatch.style.backgroundColor = color; swatch.title = `${label}: ${color}`; $('palette').append(swatch);
  }
}
function paletteAndCopy() {
  const theme = catalog.themes.find(t => t.id === $('theme').value);
  const locale = catalog.languages.find(l => l.id === $('language').value);
  drawPalette(theme);
  $('tagline-copy').textContent = locale?.tagline ?? ''; $('tagline-copy').dir = locale?.direction ?? 'ltr';
}
function themeOption(t) {
  const origin = { campaign: ' · Campaign', custom: ' · Custom' }[t.origin] ?? '';
  return new Option(`${t.name}${origin}${t.light ? ' · Light' : ''}`, t.id);
}
function populateCatalog(previous) {
  $('language').replaceChildren(); $('theme').replaceChildren();
  const languages = [...catalog.languages].sort((a, b) => a.id === 'en' ? -1 : b.id === 'en' ? 1 : a.englishName.localeCompare(b.englishName, 'en'));
  for (const l of languages) $('language').append(new Option(`${l.englishName} · ${l.id}`, l.id));
  for (const t of catalog.themes) $('theme').append(themeOption(t));
  $('language').value = catalog.languages.some(l => l.id === previous.language) ? previous.language : 'en';
  $('theme').value = catalog.themes.some(t => t.id === previous.theme) ? previous.theme : catalog.themes[0].id;
}
function populateAnimations() {
  const previous = $('animation').value || 'laseretch-campaign';
  $('animation').replaceChildren(...catalog.animations.map(a => new Option(a.name, a.id)));
  $('animation').value = catalog.animations.some(a => a.id === previous) ? previous : 'laseretch-campaign';
}
async function loadCatalog() {
  const previous = { language: $('language').value || 'en', theme: $('theme').value || 'astral' };
  catalog = await api('/api/catalog'); token = catalog.token;
  populateCatalog(previous); populateAnimations();
  $('output-directory').textContent = `Saved in ${catalog.outputDirectory}`;
  $('source').textContent = `WEBSITE SNAPSHOT / ${catalog.commit.slice(0, 12)}`;
  paletteAndCopy();
}
function phase(frame) { return frame < 125 ? 'Animation' : frame < 175 ? 'Typing tagline' : frame < 238 ? 'Tagline hold' : frame < 263 ? 'Domain reveal' : 'Domain hold'; }
function seek(frame) {
  currentFrame = Math.max(0, Math.min(374, Math.round(frame)));
  if (previewWindow?.ready) previewWindow.renderFrame(currentFrame, false);
  $('scrubber').value = String(currentFrame); $('time').textContent = `${(currentFrame === 374 ? 15 : currentFrame / 25).toFixed(2)} / 15.00 s`;
  $('frame-number').textContent = `FRAME ${currentFrame} / 374`; $('phase').textContent = phase(currentFrame);
}
function stop(clearResume = true) {
  if (clearResume) resumeAfterRefresh = false;
  playing = false; cancelAnimationFrame(animation); $('play').textContent = 'Play'; $('play').setAttribute('aria-pressed', 'false');
}
function suspendForRefresh() {
  resumeAfterRefresh ||= playing;
  stop(false);
}
function startPlayback() {
  resumeAfterRefresh = false;
  playing = true; epoch = performance.now() - currentFrame * 40;
  $('play').textContent = 'Pause'; $('play').setAttribute('aria-pressed', 'true'); animation = requestAnimationFrame(tick);
}
function tick(time) {
  if (!playing) return;
  const elapsedFrames = (time - epoch) / 40;
  try { seek(Math.max(currentFrame, Math.floor(elapsedFrames))); } catch (error) { stop(); showError(error.message); return; }
  // The final encoded frame starts at 14.96 s and remains visible until 15 s.
  if (elapsedFrames >= 375) stop(); else animation = requestAnimationFrame(tick);
}
function navigateTimeline(frame) {
  const wasPlaying = playing;
  stop(); seek(frame);
  if (wasPlaying) startPlayback();
}
function play() {
  if (!previewId) return;
  if (playing) { stop(); return; }
  if (currentFrame >= 263) seek(0);
  startPlayback();
}
function fitPreview() {
  const iframe = $('preview-mount').querySelector('iframe');
  if (!iframe || !previewDimensions) return;
  const box = $('preview-mount').getBoundingClientRect();
  const scale = Math.min(box.width / previewDimensions.width, box.height / previewDimensions.height);
  iframe.style.width = `${previewDimensions.width * scale}px`;
  iframe.style.height = `${previewDimensions.height * scale}px`;
}
new ResizeObserver(fitPreview).observe($('preview-mount'));
const currentRequest = version => version === requestVersion && !closed;
function beginPreview() {
  ++requestVersion; previewAbort?.abort(); previewAbort = new AbortController();
  suspendForRefresh(); previewId = undefined; previewWindow = undefined; controls(); showError('');
  $('loading').hidden = false; $('loading-text').textContent = 'Preparing native effects…';
  return requestVersion;
}
function mountPreview(data) {
  previewWarnings = data.warnings; showWarnings(previewWarnings);
  $('canvas-size').textContent = `${data.options.width} × ${data.options.height}`;
  automaticFilename = `omarchy-${data.options.tld.slice(1).toLowerCase().replaceAll('.', '-')}-${data.options.language.toLowerCase()}.mp4`;
  if ($('autoname').checked) $('filename').value = automaticFilename;
  const iframe = document.createElement('iframe'); iframe.title = 'Animated billboard preview'; iframe.tabIndex = -1; iframe.src = data.url;
  previewDimensions = data.options;
  $('preview-mount').replaceChildren(iframe); fitPreview();
  return iframe;
}
function readyWindow(iframe) {
  const win = iframe.contentWindow;
  if (win?.renderError) throw Error(win.renderError);
  return win?.ready ? win : null;
}
async function waitForPreview(iframe, version) {
  const deadline = performance.now() + 60000;
  while (currentRequest(version)) {
    const win = readyWindow(iframe);
    if (win) return win;
    if (performance.now() > deadline) throw Error('Preview took too long. Check browser/font availability or try a smaller canvas.');
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return null;
}
function activatePreview(win, data) {
  previewWindow = win; previewId = data.id; seek(currentFrame);
  showWarnings([...previewWarnings, ...win.layout.warnings]);
  $('preview-detail').textContent = `Preview fitted to window. Export: ${data.options.width} × ${data.options.height} at 25 fps.`;
  $('loading').hidden = true; controls();
  if (resumeAfterRefresh) startPlayback();
}
function previewFailure(error, version) {
  if (error.name === 'AbortError' || !currentRequest(version)) return;
  $('loading').hidden = true; showError(error.message); controls();
}
async function refreshPreview() {
  const version = beginPreview();
  try {
    const data = await api('/api/preview', { body: selections(), signal: previewAbort.signal });
    if (!currentRequest(version)) return;
    const win = await waitForPreview(mountPreview(data), version);
    if (win && currentRequest(version)) activatePreview(win, data);
  } catch (error) { previewFailure(error, version); }
}
function queuePreview() {
  if (closed) return;
  ++requestVersion; previewAbort?.abort(); suspendForRefresh(); previewId = undefined; controls();
  paletteAndCopy(); clearTimeout(debounce); debounce = setTimeout(refreshPreview, 300);
}
function displayJob(job) {
  currentJob = job; $('job-panel').hidden = false; $('job-name').textContent = job.filename;
  const labels = { running: 'EXPORTING', cancelling: 'CANCELLING', completed: 'EXPORT READY', failed: 'EXPORT FAILED', cancelled: 'EXPORT CANCELLED' };
  $('job-status').textContent = labels[job.status]; $('job-status').style.color = job.status === 'completed' ? 'var(--accent)' : job.status === 'failed' ? 'var(--red)' : 'var(--muted)';
  $('progress').value = job.percent; $('job-message').textContent = job.message;
  $('cancel').hidden = !['running', 'cancelling'].includes(job.status); $('cancel').disabled = job.status === 'cancelling';
  $('result-actions').hidden = job.status !== 'completed';
  if (job.warnings.length) showWarnings([...previewWarnings, ...job.warnings]);
}
async function pollJob(id) {
  try {
    while (!closed) {
      const job = await api(`/api/jobs/${id}`); displayJob(job);
      if (!['running', 'cancelling'].includes(job.status)) { busy = false; controls(); return; }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  } catch (error) { if (!closed) { busy = false; controls(); showError(error.message); } }
}
function selectImportedTheme(theme) {
  if (!catalog.themes.some(t => t.id === theme.id)) {
    catalog.themes.push(theme); $('theme').append(themeOption(theme));
  }
  $('theme').value = theme.id; queuePreview();
}
async function importSelectedTheme(file) {
  if (!file) return;
  importing = true; controls(); showError('');
  try {
    if (file.size > catalog.themeFileLimit) throw Error('Theme file exceeds the 16 KiB limit.');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    const data = await api('/api/themes', { body: { content } });
    if (!closed) selectImportedTheme(data.theme);
  } catch (error) { showError(error.message); }
  finally { importing = false; $('theme-file').value = ''; controls(); }
}
$('import-theme').addEventListener('click', () => $('theme-file').click());
$('theme-file').addEventListener('change', event => { void importSelectedTheme(event.target.files[0]); });
function restartChangedAnimation(id) {
  if (id !== 'animation') return;
  if (playing || resumeAfterRefresh) seek(0);
}
$('settings').addEventListener('input', event => {
  if (event.target.id === 'theme-file') return;
  restartChangedAnimation(event.target.id);
  if (event.target.id === 'preset' && $('preset').value !== 'custom') {
    const [width, height] = $('preset').value.split('x'); $('width').value = width; $('height').value = height;
  }
  $('dimensions').hidden = $('preset').value !== 'custom';
  queuePreview();
});
$('autoname').addEventListener('change', () => {
  $('filename').readOnly = $('autoname').checked;
  if ($('autoname').checked) $('filename').value = automaticFilename;
});
$('form').addEventListener('submit', async event => {
  event.preventDefault(); if (!previewId || busy || syncing) return;
  busy = true; stop(); controls(); showError('');
  try {
    const job = await api('/api/jobs', { body: { previewId, filename: $('filename').value, force: $('force').checked, autoPlay: $('auto-play').checked } });
    displayJob(job); void pollJob(job.id);
  } catch (error) { busy = false; controls(); showError(error.message); }
});
$('play').addEventListener('click', play);
$('restart').addEventListener('click', () => navigateTimeline(0));
$('scrubber').addEventListener('input', () => navigateTimeline(Number($('scrubber').value)));
for (const button of document.querySelectorAll('[data-frame]')) button.addEventListener('click', () => navigateTimeline(Number(button.dataset.frame)));
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.target.closest('input,select,button,textarea')) { event.preventDefault(); play(); }
});
$('cancel').addEventListener('click', async () => {
  if (!currentJob) return; $('cancel').disabled = true;
  try { displayJob(await api(`/api/jobs/${currentJob.id}/cancel`, { body: {} })); } catch (error) { showError(error.message); }
});
$('open-player').addEventListener('click', async () => { try { await api(`/api/jobs/${currentJob.id}/open`, { body: {} }); } catch (error) { showError(error.message); } });
$('open-folder').addEventListener('click', async () => { try { await api('/api/open-folder', { body: {} }); } catch (error) { showError(error.message); } });
function resumeAfterSync() {
  if (!closed && previewId && resumeAfterRefresh) startPlayback();
}
$('sync').addEventListener('click', async () => {
  if (busy || syncing) return;
  syncing = true; suspendForRefresh(); controls(); showError(''); $('sync').textContent = 'Syncing…';
  try { await api('/api/sync', { body: {} }); await loadCatalog(); queuePreview(); }
  catch (error) { showError(error.message); }
  finally {
    syncing = false; $('sync').textContent = 'Sync website data'; controls();
    resumeAfterSync();
  }
});
window.addEventListener('pagehide', () => {
  closed = true; stopDesktopTheme(); ++requestVersion; previewAbort?.abort(); stop(); clearTimeout(debounce);
});
window.addEventListener('beforeunload', event => {
  if (busy && !closed) { event.preventDefault(); event.returnValue = ''; }
});
controls();
try {
  await loadCatalog(); stopDesktopTheme = await startDesktopTheme(api);
  if (closed) stopDesktopTheme(); else await refreshPreview();
}
catch (error) { $('loading').hidden = true; showError(error.message); }
