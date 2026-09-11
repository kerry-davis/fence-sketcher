import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const listen = server => new Promise(resolve =>
  server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const freePort = async () => {
  const server = net.createServer(), port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
};

test('backup server bounds and validates writes without damaging the previous drawing', async t => {
  const privatePort = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fence-backup-test-'));
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const app = spawn(process.execPath, ['serve-fence.mjs'], {
    cwd:root,
    env:{...process.env, FENCE_PORT:String(privatePort), FENCE_DATA_DIR:dataDir},
    stdio:['ignore','pipe','pipe'],
  });
  t.after(async () => {
    if (app.exitCode == null){
      app.kill('SIGTERM');
      await new Promise(resolve => app.once('exit', resolve));
    }
    fs.rmSync(dataDir, {recursive:true, force:true});
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('private server did not start')), 3000);
    app.stdout.on('data', data => {
      if (String(data).includes(`:${privatePort}`)){ clearTimeout(timer); resolve(); }
    });
    app.once('exit', code => reject(new Error(`private server exited ${code}`)));
  });

  const request = (options={}) =>
    fetch(`http://127.0.0.1:${privatePort}/backups/reliable`, options);
  const original = {v:2, unit:'m', polys:[], builds:[], mat:{style:'paling'}};
  let response = await request({
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(original),
  });
  assert.equal(response.status, 200);

  response = await request({method:'PUT', body:'{"broken"'});
  assert.equal(response.status, 400);
  assert.deepEqual(await (await request()).json(), original,
                   'invalid input leaves the existing backup intact');

  response = await request({method:'PUT', body:JSON.stringify({data:'x'.repeat(2_000_000)})});
  assert.equal(response.status, 413);
  assert.deepEqual(await (await request()).json(), original,
                   'oversized input leaves the existing backup intact');

  const changed = {...original, unit:'ft'};
  response = await request({method:'PUT', body:JSON.stringify(changed)});
  assert.equal(response.status, 200);
  assert.deepEqual(await (await request()).json(), changed);
  const files = fs.readdirSync(path.join(dataDir, 'backups'));
  assert.deepEqual(files, ['reliable.json'], 'temporary files are cleaned after replacement');
  assert.equal(fs.statSync(path.join(dataDir, 'backups', 'reliable.json')).mode & 0o777, 0o600);
});

test('backup replacement is staged and renamed atomically', () => {
  const server = fs.readFileSync(new URL('../serve-fence.mjs', import.meta.url), 'utf8');
  assert.match(server, /function writeJsonAtomic\(/);
  assert.match(server, /fs\.writeFileSync\(temp,[\s\S]*?fs\.renameSync\(temp, file\)/);
});
