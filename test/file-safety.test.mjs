import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');
function section(start, end){
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing section: ${start}`);
  return html.slice(from, to);
}
function model(){
  const c = {
    console:{log(){}, warn(){}, error(){}},
    location:{pathname:'/', href:'http://localhost/', search:''},
    localStorage:{getItem:() => null, setItem(){}, removeItem(){}},
    matchMedia:() => ({matches:false, addEventListener(){}}),
    syncControls(){}, updateAll(){}, fitView(){},
    setDimTool(){}, setSheetView(){}, set3d(){},
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(section('<script>', '(function selfTest(){').slice(8) +
    section('function historySnapshot(){', '// Polyline currently being drawn') +
    section('function statePayload(){', 'let saveTimer ='), c);
  c.payload = () => JSON.parse(vm.runInContext('JSON.stringify(statePayload())', c));
  return c;
}
const drawing = () => ({v:2, unit:'m', polys:[{
  pts:[{x:0,y:0,gateAfter:true},{x:5,y:0}], done:true,
}], builds:[], mat:{style:'rail', railSide:'right'}});

test('a malformed drawing cannot partially replace live state or its view', () => {
  const c = model();
  c.applyState(drawing());
  const before = c.payload();
  for (const bad of [null, {}, {...drawing(), polys:[null]},
    {...drawing(), polys:[{pts:[{x:Infinity,y:0}]}]},
    {...drawing(), builds:[{x:1,y:2,w:'broken',h:3}]},
    {...drawing(), mat:{spacing:NaN}}, {...drawing(), view:{x:0,y:0,s:0}},
    {...drawing(), polys:[{pts:[{x:0,y:0,dim:{len:1,axis:'z',v:0}}]}]},
  ]){
    assert.throws(() => c.applyState(bad), /Invalid drawing/);
    assert.deepEqual(c.payload(), before);
  }
});

test('loading older drawings uses their own defaults and migrates a copy', () => {
  const c = model(), original = drawing();
  c.applyState(original);
  assert.equal(c.payload().polys[0].pts[0].gateSideAfter, 'right');
  assert.equal(original.polys[0].pts[0].gateSideAfter, undefined, 'source file is not mutated');
  c.applyState({...drawing(), mat:{handrail:true, postDepth:1, height:4, touched:{height:true}}});
  c.applyState({v:1, unit:'ft', polys:[{pts:[], mat:{height:2}}], builds:[], mat:{height:3}});
  const value = c.payload();
  assert.equal(value.mat.handrail, false);
  assert.equal(value.mat.postDepth, 0, 'old height remains above ground');
  assert.equal(value.mat.height, 3);
  assert.deepEqual(value.mat.touched, {});
  assert.equal(value.mat.spacing, 8 * .3048);
  assert.equal(value.polys[0].mat.postDepth, 0);
  assert.equal(value.polys[0].mat.height, 2);
});

test('an imported drawing clears the server target and remains undoable', () => {
  const c = model();
  c.applyState(drawing());
  const before = c.payload();
  c.pendingDrawingImport = {name:'garden.json', snapshot:{v:2, polys:[], builds:[]}};
  c.bkBusy = false;
  c.setBkCurrent = name => { c.current = name; };
  c.closeBkDialog = () => { c.closed = true; };
  c.setBkStatus = (message, kind) => { c.status = {message, kind}; };
  c.$ = () => assert.fail('No error expected');
  vm.runInContext(section('function importDrawing(){', 'function externalSnapshot('), c);
  c.importDrawing();
  assert.equal(c.current, '');
  assert.equal(c.closed, true);
  assert.equal(c.status.kind, 'success');
  assert.deepEqual(c.payload().polys, []);
  c.undo();
  assert.deepEqual(c.payload().polys, before.polys);
  assert.deepEqual(c.payload().mat, before.mat);
});

test('opening a drawing clears the old sheet, camera and dimension tool before replacement', () => {
  const c = model(), calls = [];
  c.applyState(drawing());
  for (const name of ['setDimTool','setSheetView','set3d'])
    c[name] = value => { calls.push([name, value]); };
  c.fitView = () => { calls.push(['fit', c.payload().polys.length]); };
  c.replaceDrawing({v:2, polys:[], builds:[]});
  assert.deepEqual(calls, [['setDimTool',false],['setSheetView',false],['set3d',false],['fit',0]]);
  assert.equal(vm.runInContext('undoStack.length', c), 1);
});

test('opening a malformed server backup leaves both canvas and undo history intact', async () => {
  const c = model(), error = {};
  c.applyState(drawing());
  const before = c.payload();
  c.bkRequest = async () => ({v:2, polys:[null], builds:[]});
  c.bkPath = name => name;
  c.setBkBusy = value => { c.busy = value; };
  c.setBkDialogBusy = () => {};
  c.$ = () => error;
  vm.runInContext(section('async function openBackup(', 'async function renameBackup('), c);
  await c.openBackup('broken');
  assert.match(error.textContent, /Invalid drawing/);
  assert.deepEqual(c.payload(), before);
  assert.equal(vm.runInContext('undoStack.length', c), 0);
  assert.equal(c.busy, false);
});

test('reading a local file reports errors, releases busy state, and confirms valid empty drawings', async () => {
  const c = model();
  Object.assign(c, {bkBusy:false, FULL_EXTERNAL_MAX:1000,
    setBkBusy(value){ c.bkBusy = value; }, setBkDialogBusy(){},
    setBkStatus(message, kind){ c.status = {message, kind}; },
    openBkDialog(type, name){ c.dialog = {type, name}; },
  });
  vm.runInContext('let pendingDrawingImport = null;' +
    section('async function chooseDrawingFile(', 'function importDrawing(') +
    section('function externalSnapshot(', 'function externalLibrary('), c);
  const before = c.payload();
  await c.chooseDrawingFile({name:'bad.json', size:10, text:async () => '{'});
  assert.equal(c.status.kind, 'error');
  assert.match(c.status.message, /not valid JSON/);
  assert.equal(c.bkBusy, false);
  assert.deepEqual(c.payload(), before);
  await c.chooseDrawingFile({size:1001, text:() => assert.fail('Oversized file must not be read')});
  assert.match(c.status.message, /larger than/);
  await c.chooseDrawingFile({name:'empty.json', size:50, text:async () =>
    JSON.stringify({format:'fence-sketcher', formatVersion:1, snapshot:{v:2, polys:[], builds:[]}})});
  assert.equal(c.dialog.type, 'importDrawing');
  assert.equal(c.bkBusy, false);
  assert.deepEqual(c.payload(), before, 'choosing the file alone does not replace the canvas');
});

test('file requests time out during headers or body reads and clear their timers', async () => {
  for (const stallBody of [false, true]){
    let expire, cleared = false;
    let ready;
    const reading = new Promise(resolve => { ready = resolve; });
    const c = {AbortController,
      setTimeout(fn, ms){ expire = fn; assert.equal(ms, 15000); return 1; },
      clearTimeout(){ cleared = true; },
      fetch:async (_path, {signal}) => {
        const stalled = () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true});
          ready();
        });
        return stallBody ? {json:stalled} : stalled();
      },
    };
    vm.createContext(c);
    vm.runInContext(section('async function requestJson(', 'async function bkRequest('), c);
    const pending = c.requestJson('backups');
    await reading;
    expire();
    await assert.rejects(pending, /took too long/);
    assert.equal(cleared, true);
  }
});

test('file requests reject unreadable responses and succeed on retry', async () => {
  let broken = true, cleared = 0;
  const c = {AbortController, setTimeout:() => 1, clearTimeout:() => cleared++,
    fetch:async () => ({ok:true, json:async () => {
      if (broken) throw new Error('HTML instead of JSON');
      return [];
    }}),
  };
  vm.createContext(c);
  vm.runInContext(section('async function requestJson(', 'async function bkRequest('), c);
  await assert.rejects(c.requestJson('backups'), /unreadable response/);
  broken = false;
  assert.deepEqual((await c.requestJson('backups')).value, []);
  assert.equal(cleared, 2);
});

test('collapsing mobile settings removes hidden controls from focus and restores it to the grip', () => {
  let phone = true, focused = false;
  const grip = {focus(){ focused = true; }, setAttribute(_key, value){ this.expanded = value; }};
  const settings = {};
  const panels = {children:[grip, settings], contains:() => true};
  const c = {onPhone:() => phone, $:id => id === 'panels' ? panels : grip,
    document:{activeElement:settings, body:{classList:{toggle(){}}}},
  };
  vm.createContext(c);
  vm.runInContext(section('function setSheet(', 'const sheetOpen ='), c);
  c.setSheet(false);
  assert.equal(settings.inert, true);
  assert.equal(focused, true);
  assert.equal(grip.inert, undefined, 'grip remains keyboard-accessible');
  c.setSheet(true);
  assert.equal(settings.inert, false);
  assert.equal(grip.expanded, 'true');
  phone = false;
  c.setSheet(false);
  assert.equal(settings.inert, false, 'desktop settings remain accessible');
});

test('Escape cannot dismiss in-flight file or share operations', () => {
  const handlers = {}, c = {bkBusy:true, shareBusy:true, closed:false,
    $:id => ({addEventListener(type, handler){ handlers[id + ':' + type] = handler; }}),
    closeBkDialog(){ c.closed = true; },
  };
  vm.createContext(c);
  vm.runInContext(section("$('bkDialog').addEventListener('cancel'", "$('bkSec').addEventListener('toggle'"), c);
  for (const id of ['bkDialog','shareDialog','pickDialog']){
    let prevented = false;
    handlers[id + ':cancel']({preventDefault(){ prevented = true; }});
    assert.equal(prevented, true);
  }
  assert.equal(c.closed, false);
  c.bkBusy = false;
  handlers['bkDialog:cancel']({preventDefault(){}});
  assert.equal(c.closed, true);
});
