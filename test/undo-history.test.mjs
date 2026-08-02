import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('undo and redo restore materials and units as well as geometry', () => {
  const start = html.indexOf('function historySnapshot(){');
  const end = html.indexOf('// Polyline currently being drawn', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    JSON,
    UNDO_MAX: 100,
    readOnly: false,
    state: {
      unit: 'm',
      polys: [{pts:[{x:0,y:0},{x:2,y:0}], closed:false}],
      builds: [],
      mat: {height:1.2, rails:2},
    },
    undoStack: [],
    redoStack: [],
    sel: null,
    bsel: {clear() {}},
    syncControls() {},
    updateAll() {},
    // commitEdit settles the drawing's constraints; this slice only exercises history
    reapplyConstraints() {},
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  assert.equal(context.commitEdit(() => context.state.mat.height = 1.8), true);
  assert.equal(context.commitEdit(() => context.state.mat.rails = 3), true);
  assert.equal(context.commitEdit(() => context.state.unit = 'ft'), true);
  assert.equal(context.undoStack.length, 3);

  context.undo();
  assert.equal(context.state.unit, 'm');
  assert.equal(context.state.mat.height, 1.8);
  assert.equal(context.state.mat.rails, 3);

  context.undo();
  assert.equal(context.state.mat.height, 1.8);
  assert.equal(context.state.mat.rails, 2);

  context.undo();
  assert.equal(context.state.mat.height, 1.2);

  context.redo();
  assert.equal(context.state.mat.height, 1.8);

  assert.equal(context.commitEdit(() => context.state.polys[0].pts[0].postShape = 'round'), true);
  assert.equal(context.state.polys[0].pts[0].postShape, 'round');
  context.undo();
  assert.equal(context.state.polys[0].pts[0].postShape, undefined);
});

test('material controls record individual history entries', () => {
  const start = html.indexOf("$('iSpacing').addEventListener");
  const end = html.indexOf('// copy summary', start);
  const controls = html.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok((controls.match(/commitEdit\(/g) || []).length >= 7);
  assert.match(html, /\$\('iLock'\)\.addEventListener\('change',[\s\S]*?pushUndo\(\);/);
});
