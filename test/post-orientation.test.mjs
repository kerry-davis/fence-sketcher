import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

function orientationContext() {
  const start = html.indexOf('function postAngleAt(');
  const end = html.indexOf('function railPostExit(', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    Math, FENCE_JOIN_TOL:1e-4,
    segLen:(a,b)=>Math.hypot(b.x-a.x,b.y-a.y),
    segsOf:pl => {
      const count=pl.closed ? pl.pts.length : pl.pts.length-1;
      return Array.from({length:count},(_,i)=>[i,pl.pts[i],pl.pts[(i+1)%pl.pts.length]]);
    },
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);
  return context;
}

test('a selected rectangular post exposes automatic, leg, bisector and custom orientations', () => {
  for (const [value,label] of [
    ['auto','Automatic'],['previous','Previous fence leg'],['next','Next fence leg'],
    ['bisect','Bisect corner'],['custom','Custom angle'],
  ]) assert.match(html,new RegExp('<option value="' + value + '">' + label + '</option>'));
  assert.match(html,/\$\('postOrientWrap'\)\.style\.display = selectedPoint && selectedPostShape !== 'round'/);
  assert.match(html,/setPostOrientationAt\(state\.polys,point,mode,current\)/);
  assert.match(html,/setPostOrientationAt\(state\.polys,point,'custom',degrees\*Math\.PI\/180\)/);
});

test('post orientation resolves previous, next, bisector and custom angles', () => {
  const c=orientationContext(), V={x:3,y:0};
  const polys=[{closed:false,pts:[{x:0,y:0},V,{x:3,y:4}]}];
  const angle=mode => {
    c.setPostOrientationAt(polys,V,mode,30*Math.PI/180);
    return c.postAngleAt(polys,V,-1);
  };
  assert.ok(Math.abs(angle('previous'))<1e-9);
  assert.ok(Math.abs(angle('next')-Math.PI/2)<1e-9);
  assert.ok(Math.abs(angle('bisect')-Math.PI/4)<1e-9);
  assert.ok(Math.abs(angle('custom')-Math.PI/6)<1e-9);
  c.setPostOrientationAt(polys,V,'auto');
  assert.ok(Math.abs(c.postAngleAt(polys,V,-1))<1e-9);
  assert.equal(V.postOrient,undefined);
  assert.equal(V.postAngle,undefined);
});

test('one explicit setting governs a physical post shared by separate fence runs', () => {
  const c=orientationContext();
  const V1={x:2,y:0},V2={x:2.00005,y:0};
  const polys=[
    {closed:false,pts:[{x:0,y:0},V1]},
    {closed:false,pts:[V2,{x:2,y:3}]},
  ];
  c.setPostOrientationAt(polys,V1,'next');
  assert.ok(Math.abs(c.postAngleAt(polys,V2,0)-Math.PI/2)<1e-4);
  c.setPostOrientationAt(polys,V2,'custom',Math.PI/3);
  assert.equal(V1.postOrient,undefined);
  assert.equal(V2.postOrient,'custom');
  assert.ok(Math.abs(c.postAngleAt(polys,V1,0)-Math.PI/3)<1e-9);
});

test('reversing a run preserves the physical leg selected for post orientation', () => {
  const start=html.indexOf('function reversePoly(');
  const end=html.indexOf('function translatePolyline(',start);
  const context={};
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);
  const pl={closed:false,pts:[
    {x:0,y:0},{x:2,y:0,postOrient:'previous'},{x:2,y:3,postOrient:'custom',postAngle:.7},
  ]};
  context.reversePoly(pl);
  assert.equal(pl.pts[1].postOrient,'next');
  assert.equal(pl.pts[0].postOrient,'custom');
  assert.equal(pl.pts[0].postAngle,.7);
});

test('all construction renderers consume the resolved physical post angle', () => {
  assert.match(html,/betweenRailGeometry\(state\.polys, mat, segmentPosts\[k\], segmentPosts\[k\+1\]/);
  assert.match(html,/postAngleAt\(state\.polys,q,fallbackAngle\), WOOD\.post/);
  assert.match(html,/addPost\(q, postShapeAt\(polys, q, mat\), postAngleAt\(polys,q,angle\)\)/);
  assert.match(html,/postAngle:typeof postAngleAt === 'function'\s*\n\s*\? postAngleAt\(polys,V,/);
  assert.match(html,/const angle = postAngleAt\(polys,centre,fallbackAngle\);/);
  assert.match(html,/postAt\(c\.v,\{x:Math\.cos\(c\.postAngle\),y:Math\.sin\(c\.postAngle\)\}\)/);
});

test('sheet view retains and can directly select a painted corner post', () => {
  assert.match(html,/sheetTarget=included\.includes\(selectedFence\) \? selectedFence : included\[0\]/);
  assert.match(html,/recordSheetPostHit\(pg\.i,p\.pointIndex,S,hitRadius\)/);
  assert.equal(html.match(/recordSheetPostHit\(c\.polyIndex,c\.pointIndex,at\(c\.v\),/g).length,2);
  assert.match(html,/function markSelectedSheetPost\(p,i,point,radius\)\{/);
  assert.equal(html.match(/markSelectedSheetPost\(c\.polyIndex,c\.pointIndex,at\(c\.v\),cornerHitRadius\)/g).length,2);
  assert.match(html,/sel=drag\.hit; bsel\.clear\(\); showAllTotals=false; updateAll\(\);/);
  assert.match(html,/Tap a post for its construction settings/);

  const start=html.indexOf('function recordSheetPostHit(');
  const end=html.indexOf('function sheetPlanPost(',start);
  const context={Math};
  vm.createContext(context);
  vm.runInContext('let collectSheetPostHits=true,sheetPostHits=[];' +
    html.slice(start,end) +
    ';recordSheetPostHit(3,2,{x:120,y:80},6);' +
    'this.near=pickSheetPost(127,80);this.far=pickSheetPost(140,80);',context);
  assert.deepEqual({...context.near},{t:'pt',p:3,i:2});
  assert.equal(context.far,null);
});
