import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('file menu exposes portable download and restore actions', () => {
  assert.match(html, /id="bkDownload"/);
  assert.match(html, /id="bkRestore"/);
  assert.match(html, /id="bkRestoreInput" type="file" accept="\.json,application\/json"/);
  assert.match(html, /new Blob\(\[JSON\.stringify\(externalFilePayload\(\), null, 2\)/);
  assert.match(html, /openBkDialog\('restore', file\.name\)/);
  assert.match(html, /if \(type === 'restore'\) restoreExternalDrawing\(\);/);
  assert.match(html, /bkServerAvailable = false;/);
});

test('portable restore accepts exported and server backup payloads only', () => {
  const start = html.indexOf('function externalSnapshot(');
  const end = html.indexOf('function setBkStatus', start);
  assert.ok(start >= 0 && end > start);

  const context = { Error, Array };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const direct = {v:2, polys:[], builds:[]};
  const envelope = {format:'fence-sketcher', formatVersion:1, snapshot:direct};
  assert.deepEqual({...context.externalSnapshot(direct)}, direct);
  assert.deepEqual({...context.externalSnapshot(envelope)}, direct);
  assert.throws(
    () => context.externalSnapshot({format:'fence-sketcher', formatVersion:2, snapshot:direct}),
    /version is not supported/,
  );
  assert.throws(() => context.externalSnapshot({v:2, polys:[]}), /valid Fence Sketcher JSON/);
});
