// Fence sketcher server — serves fence-fable.html and stores named drawing backups.
// Bound to loopback; exposed via `tailscale serve --https=4646 localhost:4647`.
//   GET  /                 -> the app
//   GET  /backups          -> [{name, mtime}] newest first
//   GET  /backups/<name>   -> backup JSON
//   PUT  /backups/<name>   -> save backup (body must be JSON, <= 2 MB; same name overwrites)
//   POST /backups/<name>   -> create backup; fails if the name already exists
//   DELETE /backups/<name> -> remove backup
//   PATCH  /backups/<name> -> rename; body {"name":"new-name"}
//   GET/POST/PUT/DELETE /shares/<name> -> manage its public read-only snapshot
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = process.env.FENCE_DATA_DIR || DIR;
const BK  = path.join(DATA_DIR, 'backups');
const SH  = path.join(DATA_DIR, 'shares');
const SH_INDEX = path.join(SH, 'index.json');
const APP = path.join(DIR, 'fence-fable.html');
const SHARE_API = String(process.env.FENCE_SHARE_API_URL || '').replace(/\/+$/, '');
const SHARE_ADMIN_TOKEN = String(process.env.FENCE_SHARE_ADMIN_TOKEN || '');
const NAME_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const PORT = +(process.env.FENCE_PORT || 4647);
fs.mkdirSync(BK, { recursive: true });
fs.mkdirSync(SH, { recursive: true });

function readShareIndex(){
  try {
    const value = JSON.parse(fs.readFileSync(SH_INDEX, 'utf8'));
    return value && typeof value === 'object'
      ? Object.assign(Object.create(null), value) : Object.create(null);
  } catch { return Object.create(null); }
}
function writeShareIndex(value){
  const temp = path.join(SH, 'index.tmp');
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode:0o600 });
  fs.renameSync(temp, SH_INDEX);
}
function listShares(){
  const index = readShareIndex(), now = Date.now();
  let changed = false;
  const list = Object.entries(index).flatMap(([name, value]) => {
    if (value.expiresAt && Date.parse(value.expiresAt) <= now) {
      delete index[name]; changed = true; return [];
    }
    return [{
      name, url:value.url, expiresAt:value.expiresAt, updatedAt:value.updatedAt,
    }];
  }).sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  if (changed) writeShareIndex(index);
  return list;
}
function shareConfigured(){
  try {
    const url = new URL(SHARE_API);
    const safeTransport = url.protocol === 'https:' ||
                          (url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname));
    return safeTransport && SHARE_ADMIN_TOKEN.length >= 32;
  } catch { return false; }
}
function readJsonBody(req, limit=2_100_000){
  return new Promise((resolve, reject) => {
    let body = '', tooLarge = false;
    req.on('data', data => {
      if (tooLarge) return;
      body += data;
      if (body.length > limit){ tooLarge = true; body = ''; }
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('too large'));
      try { resolve(JSON.parse(body)); } catch { reject(new Error('bad body')); }
    });
    req.on('error', reject);
  });
}
async function publicShareRequest(method, token='', body){
  if (!shareConfigured()) throw new Error('not configured');
  const pathName = '/api/admin/shares' + (token ? '/' + encodeURIComponent(token) : '');
  const response = await fetch(SHARE_API + pathName, {
    method,
    headers:{
      authorization:'Bearer ' + SHARE_ADMIN_TOKEN,
      ...(body ? {'content-type':'application/json'} : {}),
    },
    body:body ? JSON.stringify(body) : undefined,
  });
  let value = {};
  try { value = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(value.err || 'share service error');
    error.status = response.status;
    throw error;
  }
  return value;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/fence-fable.html'))
    return send(200, fs.readFileSync(APP), 'text/html; charset=utf-8');

  if (req.method === 'GET' && url.pathname === '/share-config')
    return send(200, JSON.stringify({ configured:shareConfigured() }));

  if (req.method === 'GET' && url.pathname === '/shares') {
    if (!shareConfigured()) return send(503, '{"err":"not configured"}');
    return send(200, JSON.stringify(listShares()));
  }

  const sm = url.pathname.match(/^\/shares\/([a-zA-Z0-9._-]{1,64})$/);
  if (sm) {
    if (!shareConfigured()) return send(503, '{"err":"not configured"}');
    const name = sm[1], index = readShareIndex(), current = index[name];
    if (req.method === 'GET') {
      if (!current) return send(404, '{"err":"not found"}');
      if (current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) {
        delete index[name]; writeShareIndex(index);
        return send(404, '{"err":"not found"}');
      }
      return send(200, JSON.stringify({
        url:current.url, expiresAt:current.expiresAt, updatedAt:current.updatedAt,
      }));
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      if (req.method === 'POST' && current) return send(409, '{"err":"exists"}');
      if (req.method === 'PUT' && !current) return send(404, '{"err":"not found"}');
      let body;
      try { body = await readJsonBody(req); }
      catch(error) { return send(error.message === 'too large' ? 413 : 400, '{"err":"bad body"}'); }
      try {
        const value = await publicShareRequest(req.method,
          req.method === 'PUT' ? current.token : '',
          { title:name, snapshot:body.snapshot, expiresIn:body.expiresIn });
        index[name] = {
          token:value.token, url:value.url, expiresAt:value.expiresAt,
          updatedAt:new Date().toISOString(),
        };
        writeShareIndex(index);
        return send(200, JSON.stringify({
          url:value.url, expiresAt:value.expiresAt, updatedAt:index[name].updatedAt,
        }));
      } catch(error) {
        return send(error.status === 400 || error.status === 413 ? error.status : 502,
                    JSON.stringify({err:'share service unavailable'}));
      }
    }
    if (req.method === 'DELETE') {
      if (!current) return send(404, '{"err":"not found"}');
      try { await publicShareRequest('DELETE', current.token); }
      catch(error) {
        if (error.status !== 404) return send(502, '{"err":"share service unavailable"}');
      }
      delete index[name]; writeShareIndex(index);
      return send(200, '{"ok":true}');
    }
    return send(405, '{"err":"method not allowed"}');
  }

  if (req.method === 'GET' && url.pathname === '/backups') {
    const list = fs.readdirSync(BK).filter(f => f.endsWith('.json'))
      .map(f => ({ name: f.slice(0, -5), mtime: fs.statSync(path.join(BK, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return send(200, JSON.stringify(list));
  }

  // strict name whitelist — no path traversal possible
  const m = url.pathname.match(/^\/backups\/([a-zA-Z0-9._-]{1,64})$/);
  if (m) {
    const file = path.join(BK, m[1] + '.json');
    if (req.method === 'GET') {
      if (!fs.existsSync(file)) return send(404, '{"err":"not found"}');
      return send(200, fs.readFileSync(file));
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 2e6) req.destroy(); });
      req.on('end', () => {
        try { JSON.parse(body); } catch { return send(400, '{"err":"not json"}'); }
        if (req.method === 'POST' && fs.existsSync(file)) return send(409, '{"err":"exists"}');
        fs.writeFileSync(file, body);
        send(200, '{"ok":true}');
      });
      return;
    }
    if (req.method === 'DELETE') {
      if (!fs.existsSync(file)) return send(404, '{"err":"not found"}');
      const index = readShareIndex(), shared = index[m[1]];
      if (shared) {
        if (!shareConfigured()) return send(502, '{"err":"could not revoke share"}');
        try { await publicShareRequest('DELETE', shared.token); }
        catch(error) {
          if (error.status !== 404) return send(502, '{"err":"could not revoke share"}');
        }
        delete index[m[1]]; writeShareIndex(index);
      }
      fs.unlinkSync(file);
      return send(200, '{"ok":true}');
    }
    if (req.method === 'PATCH') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 1e4) req.destroy(); });
      req.on('end', async () => {
        let to;
        try { to = JSON.parse(body).name; } catch { return send(400, '{"err":"bad body"}'); }
        if (!NAME_RE.test(to || '')) return send(400, '{"err":"bad name"}');
        if (!fs.existsSync(file)) return send(404, '{"err":"not found"}');
        if (to !== m[1] && fs.existsSync(path.join(BK, to + '.json')))
          return send(409, '{"err":"exists"}');
        const index = readShareIndex(), shared = index[m[1]];
        if (shared) {
          if (!shareConfigured()) return send(502, '{"err":"could not update share"}');
          try { await publicShareRequest('PATCH', shared.token, {title:to}); }
          catch { return send(502, '{"err":"could not update share"}'); }
        }
        fs.renameSync(file, path.join(BK, to + '.json'));
        if (shared) {
          index[to] = index[m[1]];
          delete index[m[1]];
          writeShareIndex(index);
        }
        send(200, '{"ok":true}');
      });
      return;
    }
  }
  send(404, '{"err":"not found"}');
}).listen(PORT, '127.0.0.1', () => console.log(`fence server on 127.0.0.1:${PORT}`));
