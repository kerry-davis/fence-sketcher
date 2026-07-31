import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('file menu exposes full portable backup and restore actions', () => {
  assert.match(html, /id="bkDownload"/);
  assert.match(html, /id="bkRestore"/);
  assert.match(html, /Download all files/);
  assert.match(html, /Restore all files/);
  assert.match(html, /id="bkRestoreInput" type="file" accept="\.json,application\/json"/);
  assert.match(html, /format:'fence-sketcher-library'/);
  assert.match(html, /collectExternalLibrary/);
  assert.match(html, /openBkDialog\('restoreAll', file\.name\)/);
  assert.match(html, /if \(type === 'restoreAll'\) restoreExternalLibrary\(\);/);
  assert.match(html, /FULL_EXTERNAL_MAX/);
  assert.match(html, /bkServerAvailable = false;/);
});

test('full restore validates library entries and legacy single-drawing files', () => {
  const start = html.indexOf('function externalSnapshot(');
  const end = html.indexOf('function setBkStatus', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    Error, Array, Set, FULL_EXTERNAL_MAX_FILES:1000,
    MAX_BACKUP_BODY:1_900_000,
    BK_FILE_RE:/^[a-zA-Z0-9._-]{1,64}$/,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const direct = {v:2, polys:[], builds:[]};
  const envelope = {format:'fence-sketcher', formatVersion:1, snapshot:direct};
  const library = {
    format:'fence-sketcher-library', formatVersion:1,
    currentDrawing:'one', currentSnapshot:direct,
    drawings:[{name:'one', snapshot:direct}, {name:'two', snapshot:direct}],
  };
  assert.deepEqual({...context.externalSnapshot(direct)}, direct);
  assert.deepEqual({...context.externalSnapshot(envelope)}, direct);
  assert.equal(context.externalLibrary(library).drawings.length, 2);
  assert.equal(context.externalLibrary(envelope).drawings[0].name, 'restored-drawing');
  assert.throws(
    () => context.externalSnapshot({format:'fence-sketcher', formatVersion:2, snapshot:direct}),
    /version is not supported/,
  );
  assert.throws(() => context.externalLibrary({
    format:'fence-sketcher-library', formatVersion:1,
    drawings:[{name:'same', snapshot:direct}, {name:'same', snapshot:direct}],
  }), /invalid or duplicate drawing name/);
});
