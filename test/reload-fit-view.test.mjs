import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('reload fits restored drawing content after the canvas is sized', () => {
  const start = html.indexOf('function hasDrawingContent(){');
  const end = html.indexOf('/* =====================================================================\n   Snapping', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    Math,
    ZOOM_MIN:1.5,
    ZOOM_MAX:500,
    cw:1000,
    ch:800,
    state:{
      polys:[{pts:[{x:10,y:0},{x:20,y:30}]}],
      builds:[{x:-5,y:5,w:2,h:4}],
    },
    view:{x:999,y:999,s:1.5},
    updates:0,
    updateAll(){ context.updates++; },
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  assert.equal(context.hasDrawingContent(), true);
  context.fitView();
  const fitted = vm.runInContext('view', context);
  assert.ok(fitted.s > 20, 'restored geometry is zoomed to fill the viewport');
  assert.ok(Math.abs((7.5-fitted.x)*fitted.s - 500) < 1e-6, 'drawing is centred horizontally');
  assert.ok(Math.abs((15-fitted.y)*fitted.s - 400) < 1e-6, 'drawing is centred vertically');
  assert.equal(context.updates, 1);
});

test('editor init fits non-empty reloads and keeps the blank default', () => {
  const start = html.indexOf('async function init(){');
  const end = html.indexOf('\ninit();', start);
  assert.ok(start >= 0 && end > start);
  const init = html.slice(start, end);
  assert.match(init, /load\(\);\s*\n\s*syncControls\(\);\s*\n\s*resize\(\);[\s\S]*?if \(hasDrawingContent\(\)\) fitView\(\);/);
  assert.match(init, /else \{ view = \{ x:-2, y:-2, s:24 \}; updateAll\(\); \}/);

  const helperStart = html.indexOf('function hasDrawingContent(){');
  const helperEnd = html.indexOf('\nfunction fitView(){', helperStart);
  const context = { Array, state:{polys:[{pts:[]}], builds:[]} };
  vm.createContext(context);
  vm.runInContext(html.slice(helperStart, helperEnd), context);
  assert.equal(context.hasDrawingContent(), false);
});
