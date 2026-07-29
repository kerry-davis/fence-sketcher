// Fence sketcher server — serves fence-fable.html and stores named drawing backups.
// Bound to loopback; exposed via `tailscale serve --https=4646 localhost:4647`.
//   GET  /                 -> the app
//   GET  /backups          -> [{name, mtime}] newest first
//   GET  /backups/<name>   -> backup JSON
//   PUT  /backups/<name>   -> save backup (body must be JSON, <= 2 MB; same name overwrites)
//   POST /backups/<name>   -> create backup; fails if the name already exists
//   DELETE /backups/<name> -> remove backup
//   PATCH  /backups/<name> -> rename; body {"name":"new-name"}
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const BK  = path.join(DIR, 'backups');
const APP = path.join(DIR, 'fence-fable.html');
fs.mkdirSync(BK, { recursive: true });

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/fence-fable.html'))
    return send(200, fs.readFileSync(APP), 'text/html; charset=utf-8');

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
      fs.unlinkSync(file);
      return send(200, '{"ok":true}');
    }
    if (req.method === 'PATCH') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 1e4) req.destroy(); });
      req.on('end', () => {
        let to;
        try { to = JSON.parse(body).name; } catch { return send(400, '{"err":"bad body"}'); }
        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(to || '')) return send(400, '{"err":"bad name"}');
        if (!fs.existsSync(file)) return send(404, '{"err":"not found"}');
        if (to !== m[1] && fs.existsSync(path.join(BK, to + '.json')))
          return send(409, '{"err":"exists"}');
        fs.renameSync(file, path.join(BK, to + '.json'));
        send(200, '{"ok":true}');
      });
      return;
    }
  }
  send(404, '{"err":"not found"}');
}).listen(4647, '127.0.0.1', () => console.log('fence server on 127.0.0.1:4647'));
