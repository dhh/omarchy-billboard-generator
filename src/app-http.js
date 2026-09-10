import { readFile, realpath } from 'node:fs/promises';
import { resolve, join, sep, extname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export const APP_PATH = '/omarchy-billboard';
export const inside = (root, path) => path.startsWith(root + sep);
export const httpError = (status, message) => Object.assign(Error(message), { status });
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const security = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'none'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
};
export const send = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
export function secureResponse(res) {
  for (const [key, value] of Object.entries(security)) res.setHeader(key, value);
}
export function sendError(res, e) {
  if (res.headersSent) { res.destroy(); return; }
  send(res, e.status ?? (['ENOENT', 'ELOOP'].includes(e.code) ? 404 : 400), { error: e.message });
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 32768) { req.resume(); throw httpError(413, 'Request exceeds the 32 KB limit.'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}
function parseBody(text) {
  let body;
  try { body = JSON.parse(text); } catch { throw httpError(400, 'Invalid JSON request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Expected an object.');
  return body;
}
export async function jsonBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw httpError(415, 'Expected a JSON request.');
  return parseBody(await readBody(req));
}
export function fields(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw httpError(400, 'Unknown request field.');
}
export async function emptyBody(req) { fields(await jsonBody(req), []); }
function cookie(req, name) {
  return (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
}
function validateOrigin(req, origin) {
  if (req.headers.host !== new URL(origin).host) throw httpError(403, 'Requests must originate from this local app.');
  if (req.headers.origin && req.headers.origin !== origin) throw httpError(403, 'Requests must originate from this local app.');
}
function validatePost(req, origin, token) {
  if (req.headers.origin !== origin || !equal(req.headers['x-billboard-token'], token)) throw httpError(403, 'Missing app request token or origin.');
}
function bootstrap(req, res, url, session, path) {
  if (req.method !== 'GET') return false;
  if (!['/', APP_PATH].includes(path)) return false;
  if (!equal(url.searchParams.get('token'), session.token)) return false;
  res.writeHead(303, { Location: path, 'Set-Cookie': `${session.cookieName}=${session.token}; Path=/; HttpOnly; SameSite=Strict` }).end();
  return true;
}
export function authenticate(req, res, session) {
  validateOrigin(req, session.origin);
  const url = new URL(req.url, session.origin);
  const path = decodeURIComponent(url.pathname);
  if (bootstrap(req, res, url, session, path)) return null;
  if (!equal(cookie(req, session.cookieName), session.token)) throw httpError(401, 'Open the app using its launch URL.');
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) throw httpError(405, 'Method not allowed.');
  if (req.method === 'POST') validatePost(req, session.origin, session.token);
  return path;
}
function assetRelativePath(path) {
  const relative = ['/', APP_PATH].includes(path) ? '/app/index.html' : path;
  if (!/^\/(app|web|assets)\//.test(relative) || relative.includes('\0') || !types[extname(relative)]) throw httpError(404, 'Not found.');
  return relative;
}
export async function serveAppAsset(req, res, path, root) {
  if (!['GET', 'HEAD'].includes(req.method)) throw httpError(405, 'Method not allowed.');
  const relative = assetRelativePath(path);
  const file = await realpath(resolve(root, '.' + relative));
  if (!['app', 'web', 'assets'].some(dir => inside(join(root, dir), file))) throw httpError(403, 'Asset path is outside the app.');
  const bytes = await readFile(file);
  res.writeHead(200, { 'Content-Type': types[extname(file)] }); res.end(req.method === 'HEAD' ? undefined : bytes);
}
