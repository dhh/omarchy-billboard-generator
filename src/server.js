import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

async function serveAsset(base, path, types, res) {
  if (!/^\/(web|assets)\//.test(path) || path.includes('\0')) { res.writeHead(403).end(); return; }
  const file = await realpath(resolve(base, '.' + path));
  if (!['web', 'assets'].some(dir => file.startsWith(resolve(base, dir) + sep))) { res.writeHead(403).end(); return; }
  const bytes = await readFile(file);
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes);
}
export async function serveRenderer(root, config) {
  const base = await realpath(root);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain' };
  let host;
  const server = createServer(async (req, res) => {
    try {
      // The config carries the output path and palette, so a page on another origin rebound to loopback gets nothing.
      if (req.headers.host !== host) { res.writeHead(403).end(); return; }
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (path === '/config.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(config)); return; }
      await serveAsset(base, path, types, res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  host = `127.0.0.1:${server.address().port}`;
  return { url: `http://${host}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
