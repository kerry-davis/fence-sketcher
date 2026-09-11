import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');
const start = html.indexOf('function fenceSettingsSnapshot(');
const end = html.indexOf('function selectedSettingsSegment(', start);
assert.ok(start >= 0 && end > start);

function helpers(){
  const context = {
    JSON,
    oneEndOf:(mat, pl) => (mat.ends === 1 || mat.ends === 'start')
      ? (pl.oneEnd === 'start' ? 'start' : 'end') : null,
    gateSideOf:(segment, mat) => segment.gateSideAfter ||
      (mat.style === 'rail' && mat.railSide === 'right' ? 'right' : 'left'),
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return context;
}

test('copying settings clones the effective configuration without changing fence identity', () => {
  const context = helpers();
  const sourceMat = {
    style:'rail', spacing:1.8, rails:3, railSide:'right', ends:1,
    handrail:true, touched:{spacing:true},
  };
  const source = {
    name:'Front gate', oneEnd:'start', excludeMaterials:true, excludeRails:true,
    hidden3d:true, hiddenSheet:true, pts:[{x:0,y:0,gateAfter:true},{x:1,y:0}],
  };
  const copied = context.fenceSettingsSnapshot(source, sourceMat, source.pts[0]);
  const target = {
    name:'Side gate', excludePalings:true, oneEnd:'end',
    pts:[{x:10,y:2,gateAfter:true,gateSideAfter:'left',postShape:'round'},
         {x:12,y:2,postOrient:'custom',postAngle:.4}],
  };
  context.pasteFenceSettingsSnapshot(target, copied, target.pts[0]);

  assert.deepEqual(target.mat, sourceMat);
  assert.notEqual(target.mat, sourceMat);
  assert.equal(target.name, 'Side gate');
  assert.deepEqual(target.pts.map(({x,y}) => ({x,y})), [{x:10,y:2},{x:12,y:2}]);
  assert.equal(target.pts[0].postShape, 'round');
  assert.equal(target.pts[1].postOrient, 'custom');
  assert.equal(target.pts[1].postAngle, .4);
  assert.equal(target.excludeMaterials, true);
  assert.equal(target.excludeRails, true);
  assert.equal(target.excludePalings, undefined);
  assert.equal(target.hidden3d, true);
  assert.equal(target.hiddenSheet, true);
  assert.equal(target.oneEnd, 'start');
  assert.equal(target.pts[0].gateSideAfter, 'right');

  copied.mat.spacing = 9;
  assert.equal(target.mat.spacing, 1.8, 'each paste owns an independent settings object');
});

test('ordinary fence settings do not overwrite a target gate attachment side', () => {
  const context = helpers();
  const source = {pts:[{x:0,y:0},{x:4,y:0}]};
  const copied = context.fenceSettingsSnapshot(source, {style:'paling', ends:'auto'}, source.pts[0]);
  const target = {pts:[{x:0,y:1,gateAfter:true,gateSideAfter:'right'},{x:1,y:1}]};
  context.pasteFenceSettingsSnapshot(target, copied, target.pts[0]);
  assert.equal(target.pts[0].gateSideAfter, 'right');
});

test('pasting settings is one undoable edit', () => {
  const context = helpers();
  Object.assign(context, {
    UNDO_MAX:100, readOnly:false,
    state:{unit:'m', polys:[
      {pts:[{x:0,y:0},{x:1,y:0}], mat:{style:'rail',spacing:1.2}},
      {pts:[{x:0,y:1},{x:1,y:1}], mat:{style:'paling',spacing:2.4}},
    ], builds:[], mat:{}},
    undoStack:[], redoStack:[], sel:null, bsel:{clear(){}},
    reapplyConstraints(){}, junctionGroups:() => [], syncControls(){}, updateAll(){},
  });
  const historyStart = html.indexOf('function historySnapshot(){');
  const historyEnd = html.indexOf('// Polyline currently being drawn', historyStart);
  vm.runInContext(html.slice(historyStart, historyEnd), context);
  const source = context.state.polys[0], target = context.state.polys[1];
  const copied = context.fenceSettingsSnapshot(source, source.mat, source.pts[0]);
  context.commitEdit(() => context.pasteFenceSettingsSnapshot(target, copied, target.pts[0]));
  assert.equal(context.undoStack.length, 1);
  assert.equal(target.mat.style, 'rail');
  context.undo();
  assert.equal(context.state.polys[1].mat.style, 'paling');
  assert.equal(context.state.polys[1].mat.spacing, 2.4);
});

test('the fence panel presents an accessible copy-then-paste workflow', () => {
  const panels = html.slice(html.indexOf('<aside id="panels">'), html.indexOf('</aside>'));
  assert.ok(panels.indexOf('id="settingsClone"') < panels.indexOf('<h2>Totals</h2>'),
            'copy controls stay visible above the totals card');
  assert.match(html, /<h2>Copy fence settings<\/h2>/);
  assert.match(html, /id="copyFenceSettings">Copy settings<\/button>/);
  assert.match(html, /id="pasteFenceSettings" class="primary" disabled>Paste settings<\/button>/);
  assert.match(html, /id="settingsCloneStatus" role="status" aria-live="polite"/);
  assert.match(html, /paste\.disabled = !copiedFenceSettings \|\| sameSource/);
  assert.match(html, /Copy settings from \$\{name\}/);
  assert.match(html, /Paste settings from \$\{copiedFenceSettings\.sourceName\} into \$\{name\}/);
  assert.match(html, /commitEdit\(\(\) => pasteFenceSettingsSnapshot/);
});
