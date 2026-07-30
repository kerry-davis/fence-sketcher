import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import worker from '../share-worker.mjs';

class MemoryKV {
  values = new Map();
  options = new Map();
  async get(key, type) {
    const value = this.values.get(key);
    return type === 'json' && value ? JSON.parse(value) : value || null;
  }
  async put(key, value, options) {
    this.values.set(key, value);
    this.options.set(key, options);
  }
  async delete(key) { this.values.delete(key); }
}

const snapshot = {
  v: 2,
  unit: 'm',
  polys: [{ pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], closed: false }],
  builds: [],
  mat: { style: 'rail', spacing: 2.4, rails: 2 },
  snapGrid: true,
  snapBld: true,
  view: { x: -2, y: -2, s: 24 },
};

function fixture() {
  const SHARES = new MemoryKV();
  const assetPaths = [];
  const env = {
    SHARES,
    SHARE_ADMIN_TOKEN: 'a-secure-admin-token-that-is-long-enough',
    PUBLIC_ORIGIN: 'https://fences.example',
    ASSETS: {
      fetch: async request => {
        assetPaths.push(new URL(request.url).pathname);
        return new Response('<!doctype html><title>Fence</title>', {
          headers: { 'content-type': 'text/html' },
        });
      },
    },
  };
  const call = (path, options = {}) => worker.fetch(
    new Request(`https://worker.example${path}`, options), env);
  const admin = (path, options = {}) => call(path, {
    ...options,
    headers: {
      authorization: `Bearer ${env.SHARE_ADMIN_TOKEN}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  return { env, SHARES, call, admin, assetPaths };
}

test('admin authentication conceals management routes', async () => {
  const { call } = fixture();
  const response = await call('/api/admin/shares', {
    method: 'POST',
    body: JSON.stringify({ title: 'Back fence', snapshot, expiresIn: 604800 }),
  });
  assert.equal(response.status, 404);
});

test('share lifecycle creates, reads, updates, and revokes a snapshot', async () => {
  const { admin, call, SHARES } = fixture();
  let response = await admin('/api/admin/shares', {
    method: 'POST',
    body: JSON.stringify({ title: 'Back fence', snapshot, expiresIn: 604800 }),
  });
  assert.equal(response.status, 200);
  const created = await response.json();
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.url, `https://fences.example/share/${created.token}`);
  assert.deepEqual(SHARES.options.get(`share:${created.token}`), { expirationTtl: 604800 });

  response = await call(`/api/shares/${created.token}`);
  assert.equal(response.status, 200);
  let shared = await response.json();
  assert.equal(shared.title, 'Back fence');
  assert.equal(shared.snapshot.snapGrid, undefined);
  assert.equal(shared.snapshot.polys[0].pts[1].x, 2);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

  const changed = structuredClone(snapshot);
  changed.polys[0].pts[1].x = 3;
  response = await admin(`/api/admin/shares/${created.token}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Back fence', snapshot: changed, expiresIn: 0 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(SHARES.options.get(`share:${created.token}`), {});

  shared = await (await call(`/api/shares/${created.token}`)).json();
  assert.equal(shared.snapshot.polys[0].pts[1].x, 3);
  assert.equal(shared.expiresAt, null);

  response = await admin(`/api/admin/shares/${created.token}`, {
    method:'PATCH',
    body:JSON.stringify({title:'Rear fence'}),
  });
  assert.equal(response.status, 200);
  shared = await (await call(`/api/shares/${created.token}`)).json();
  assert.equal(shared.title, 'Rear fence');

  response = await admin(`/api/admin/shares/${created.token}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.equal((await call(`/api/shares/${created.token}`)).status, 404);
});

test('viewer route serves hardened HTML and no other files', async () => {
  const { call, assetPaths } = fixture();
  const token = 'A'.repeat(43);
  const response = await call(`/share/${token}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(assetPaths, ['/']);
  assert.equal((await call('/backups')).status, 404);
});

test('invalid snapshots and unsupported expiry are rejected', async () => {
  const { admin } = fixture();
  let response = await admin('/api/admin/shares', {
    method: 'POST',
    body: JSON.stringify({ title: 'Back fence', snapshot: {}, expiresIn: 604800 }),
  });
  assert.equal(response.status, 400);
  response = await admin('/api/admin/shares', {
    method: 'POST',
    body: JSON.stringify({ title: 'Back fence', snapshot, expiresIn: 123 }),
  });
  assert.equal(response.status, 400);
});

const listen = server => new Promise(resolve =>
  server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const freePort = async () => {
  const server = net.createServer(), port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
};

test('private server proxies share management and backup deletion revokes the link', async t => {
  const fixtureValue = fixture();
  const publicServer = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const response = await worker.fetch(new Request(
      `http://127.0.0.1:${publicServer.address().port}${req.url}`, {
        method:req.method,
        headers:req.headers,
        body:['GET','HEAD'].includes(req.method) ? undefined : body,
      }), fixtureValue.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  const publicPort = await listen(publicServer);
  const privatePort = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fence-share-test-'));
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const app = spawn(process.execPath, ['serve-fence.mjs'], {
    cwd:root,
    env:{
      ...process.env,
      FENCE_PORT:String(privatePort),
      FENCE_DATA_DIR:dataDir,
      FENCE_SHARE_API_URL:`http://127.0.0.1:${publicPort}`,
      FENCE_SHARE_ADMIN_TOKEN:fixtureValue.env.SHARE_ADMIN_TOKEN,
    },
    stdio:['ignore','pipe','pipe'],
  });
  t.after(async () => {
    app.kill('SIGTERM');
    await new Promise(resolve => publicServer.close(resolve));
    fs.rmSync(dataDir, {recursive:true, force:true});
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('private server did not start')), 3000);
    app.stdout.on('data', data => {
      if (String(data).includes(`:${privatePort}`)){ clearTimeout(timer); resolve(); }
    });
    app.once('exit', code => reject(new Error(`private server exited ${code}`)));
  });
  const request = (route, options={}) =>
    fetch(`http://127.0.0.1:${privatePort}${route}`, options);

  let response = await request('/backups/Back-fence', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(snapshot),
  });
  assert.equal(response.status, 200);
  response = await request('/shares/Back-fence', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({snapshot, expiresIn:604800}),
  });
  assert.equal(response.status, 200);
  const shared = await response.json();
  assert.match(shared.url, /\/share\/[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(shared).includes(fixtureValue.env.SHARE_ADMIN_TOKEN), false);

  response = await request('/backups/Back-fence', {
    method:'PATCH',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Rear-fence'}),
  });
  assert.equal(response.status, 200);
  const token = shared.url.split('/').pop();
  const renamed = await (await fixtureValue.call(`/api/shares/${token}`)).json();
  assert.equal(renamed.title, 'Rear-fence');

  response = await request('/backups/Rear-fence', {method:'DELETE'});
  assert.equal(response.status, 200);
  assert.equal((await fixtureValue.call(`/api/shares/${token}`)).status, 404);
});
