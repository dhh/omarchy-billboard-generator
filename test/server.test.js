import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { serveRenderer } from '../src/server.js';

function statusWithHost(url, host) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { Host: host } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
}

test('loopback server decodes names, restricts roots, rejects symlink escape and missing files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'server-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'web')); await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'web/a b.js'), 'export const ok = true;');
  await writeFile(join(root, 'secret.txt'), 'not public');
  await symlink(join(root, 'secret.txt'), join(root, 'web/escape.txt'));
  const server = await serveRenderer(root, { tagline: '<not markup>' });
  t.after(server.close);
  assert.ok(server.url.startsWith('http://127.0.0.1:'));
  const file = await fetch(server.url + '/web/a%20b.js');
  assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), 'text/javascript');
  assert.equal((await fetch(server.url + '/web/missing.js')).status, 404);
  assert.equal((await fetch(server.url + '/web/escape.txt')).status, 403);
  assert.equal((await fetch(server.url + '/secret.txt')).status, 403);
  assert.equal((await fetch(server.url + '/web/%2e%2e%2fsecret.txt')).status, 403);
  assert.equal((await fetch(server.url + '/web/%FF')).status, 404);
  assert.equal((await fetch(server.url + '/config.json', { method: 'POST' })).status, 405);
  assert.deepEqual(await (await fetch(server.url + '/config.json')).json(), { tagline: '<not markup>' });
  assert.equal(await statusWithHost(server.url + '/config.json', 'attacker.example'), 403);
  assert.equal(await statusWithHost(server.url + '/config.json', new URL(server.url).host), 200);
});
