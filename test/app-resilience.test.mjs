import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('autosave reports progress, persists changes, and flushes a pending edit on pagehide', () => {
  const start = html.indexOf('function statePayload(){');
  const end = html.indexOf('async function loadSharedDrawing()', start);
  assert.ok(start >= 0 && end > start);

  const listeners = {};
  const saveNote = {textContent:'', dataset:{}};
  const writes = [];
  let pending = null, timerId = 0, failWrites = false;
  const context = {
    JSON, Date,
    LS_KEY:'fenceFable.v2',
    readOnly:false,
    state:{unit:'m', polys:[], builds:[], mat:{}, snapGrid:true, snapBld:true},
    view:{x:-2, y:-2, s:24},
    localStorage:{
      getItem:() => null,
      setItem(key, value){
        if (failWrites) throw new Error('quota');
        writes.push([key, value]);
      },
    },
    $:id => {
      assert.equal(id, 'saveNote');
      return saveNote;
    },
    setTimeout(fn){ pending = fn; return ++timerId; },
    clearTimeout(){ pending = null; },
    window:{addEventListener(type, fn){ listeners[type] = fn; }},
    document:{
      visibilityState:'visible',
      addEventListener(type, fn){ listeners[type] = fn; },
    },
    inferHouses(){},
    migrateGateSides(){},
  };
  vm.createContext(context);
  vm.runInContext(
    html.slice(start, end) +
      ';autosaveInitializing=false;this.autosaveApi={saveSoon,saveNow};',
    context,
  );

  context.autosaveApi.saveSoon();
  assert.equal(saveNote.textContent, 'Saving changes…');
  const firstSave = pending;
  assert.equal(typeof firstSave, 'function');
  firstSave();
  assert.equal(writes.length, 1);
  assert.equal(saveNote.dataset.kind, 'success');
  assert.match(saveNote.textContent, /^Saved in this browser at /);

  context.state.unit = 'ft';
  context.autosaveApi.saveSoon();
  listeners.pagehide();
  assert.equal(writes.length, 2, 'pagehide synchronously flushes the pending state');
  assert.equal(JSON.parse(writes.at(-1)[1]).unit, 'ft');

  context.state.unit = 'm';
  failWrites = true;
  assert.equal(context.autosaveApi.saveNow(), false);
  assert.equal(saveNote.dataset.kind, 'error');
  assert.match(saveNote.textContent, /Autosave failed/);
});

test('clipboard helper falls back and still rejects when no copy method succeeds', async () => {
  const start = html.indexOf('async function copyText(');
  const end = html.indexOf('/* =====================================================================', start);
  assert.ok(start >= 0 && end > start);

  let fallbackWorks = true, removed = false, selected = false;
  const context = {
    Error,
    navigator:{clipboard:{writeText:async () => { throw new Error('denied'); }}},
    document:{
      body:{appendChild(){}},
      createElement:() => ({
        value:'', setAttribute(){},
        select(){ selected = true; },
        remove(){ removed = true; },
      }),
      execCommand:command => command === 'copy' && fallbackWorks,
    },
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  await context.copyText('materials', 'copy failed');
  assert.equal(selected, true);
  assert.equal(removed, true);

  fallbackWorks = false;
  await assert.rejects(context.copyText('materials', 'copy failed'), /copy failed/);
});

test('dimension guidance distinguishes a selected segment from a selected point', () => {
  const start = html.indexOf('function hintText(');
  const end = html.indexOf('function updateHint()', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    modeSheet:false, mode3d:false, readOnly:false, showFenceLabels3:true,
    onPhone:() => false,
    dimTool:{a:{k:'seg'}, pend:null},
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  assert.match(context.hintText(true), /Place it for this fence’s length/);
  context.dimTool = {a:{k:'pt'}, pend:null};
  assert.match(context.hintText(true), /click the post, building corner or wall/);
});

test('interactive controls expose state semantics and reduced-motion support', () => {
  assert.match(html, /id="unitTog" role="group" aria-label="Display units"/);
  assert.match(html, /id="styleTog" role="group" aria-label="Fence style"/);
  assert.match(html, /id="b3d"[^>]*aria-pressed="false"/);
  assert.match(html, /id="bSheet"[^>]*aria-pressed="false"/);
  assert.match(html, /id="bTheme"[^>]*aria-label="Dark mode"[^>]*aria-pressed="false"/);
  assert.match(html, /id="cv" aria-label="Interactive fence drawing" aria-describedby="hint"/);
  assert.match(html, /setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /try \{ storedTheme = localStorage\.getItem\(THEME_KEY\)/);
});
