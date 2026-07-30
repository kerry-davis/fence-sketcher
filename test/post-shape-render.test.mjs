import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('round post settings render and split the materials count by shape', () => {
  const helperStart = html.indexOf('const ownPostShape =');
  const helperEnd = html.indexOf('const escHTML', helperStart);
  const geometryStart = html.indexOf('function postsAlong(');
  const geometryEnd = html.indexOf('/* ---- camera & projection', geometryStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.ok(geometryStart >= 0 && geometryEnd > geometryStart);

  const context = {
    Math, Map,
    POST_SIDE:.1, PALING_T:.02, RAIL_T:.045,
    GATE_GAP:.04, GATE_STILE:.09, GATE_BOTTOM:.08,
    WOOD:{post:[1], rail:[2], paling:[3]},
    houseGroups:() => [],
    fenceName:(pl,i) => `Fence ${i+1}`,
    segLen:(a,b) => Math.hypot(b.x-a.x,b.y-a.y),
    segsOf:pl => {
      const count = pl.closed ? pl.pts.length : pl.pts.length-1;
      return Array.from({length:count}, (_,i) => [i,pl.pts[i],pl.pts[(i+1)%pl.pts.length]]);
    },
    endsOf:mat => mat.ends ?? 'auto',
    endCount:mat => (mat.ends ?? 'auto') === 'auto' ? 2
      : mat.ends === 'start' ? 1 : +mat.ends,
    hrOf:() => ({on:false}),
    norm3:v => {
      const length = Math.hypot(...v) || 1;
      return v.map(value => value/length);
    },
    cross3:(a,b) => [
      a[1]*b[2]-a[2]*b[1],
      a[2]*b[0]-a[0]*b[2],
      a[0]*b[1]-a[1]*b[0],
    ],
    sub3:(a,b) => a.map((value,i) => value-b[i]),
    dot3:(a,b) => a.reduce((sum,value,i) => sum+value*b[i], 0),
  };
  vm.createContext(context);
  vm.runInContext(html.slice(helperStart, helperEnd), context);
  vm.runInContext(html.slice(geometryStart, geometryEnd), context);

  const mat = {
    style:'rail', spacing:2, height:1.2, rails:1,
    railW:.1, railGap:.2, botOff:.1, ends:2,
  };
  const faces = round => {
    context.state = {
      builds:[], mat,
      polys:[
        {closed:false, pts:[{x:0,y:0}, {x:1,y:0}]},
        {closed:false, pts:[
          {x:1.00005,y:0, ...(round ? {postShape:'round'} : {})},
          {x:1,y:1},
        ]},
      ],
    };
    return context.build3().length;
  };

  assert.equal(faces(true) - faces(false), 12);
  const squareFaces = faces(false);
  context.state.polys[1].mat = {...mat, postShape:'round'};
  assert.equal(context.build3().length - squareFaces, 12);
  context.state.polys.forEach(poly => poly.hidden3d = true);
  assert.equal(context.build3().length, 0);

  const materialStart = html.indexOf('function sharedEnds(');
  const materialEnd = html.indexOf('// Delete point i', materialStart);
  vm.runInContext(html.slice(materialStart, materialEnd), context);
  let materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0}, {x:1,y:0}]},
  ], {...mat, postShape:'round'});
  assert.equal(materials.posts, 2);
  assert.equal(materials.squarePosts, 0);
  assert.equal(materials.roundPosts, 2);

  materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0,postShape:'square'}, {x:1,y:0}]},
  ], {...mat, postShape:'round'});
  assert.equal(materials.squarePosts, 1);
  assert.equal(materials.roundPosts, 1);

  materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0,postShape:'square'}, {x:1,y:0}]},
  ], {...mat, ends:'start', postShape:'round'});
  assert.equal(materials.squarePosts, 1);
  assert.equal(materials.roundPosts, 0);

  materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0,postShape:'square'}, {x:1,y:0}]},
  ], {...mat, ends:1, postShape:'round'});
  assert.equal(materials.squarePosts, 0);
  assert.equal(materials.roundPosts, 1);

  materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0}, {x:1,y:0}]},
    {closed:false, pts:[{x:1,y:0}, {x:2,y:0}],
     mat:{...mat, ends:'auto', postShape:'round'}},
  ], {...mat, ends:'auto', postShape:'square'});
  assert.equal(materials.posts, 3);
  assert.equal(materials.squarePosts, 2);
  assert.equal(materials.roundPosts, 1);

  materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0}, {x:1,y:0}]},
    {closed:false, pts:[{x:1,y:0,postShape:'round'}, {x:2,y:0}],
     mat:{...mat, ends:'auto', postShape:'round'}},
  ], {...mat, ends:'auto', postShape:'square'});
  assert.equal(materials.posts, 3);
  assert.equal(materials.squarePosts, 1);
  assert.equal(materials.roundPosts, 2);

  materials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0}, {x:1,y:0}]},
    {closed:false, excludeMaterials:true, pts:[{x:1,y:0}, {x:2,y:0}],
     mat:{...mat, postShape:'round'}},
  ], {...mat, postShape:'square'});
  assert.equal(materials.posts, 2);
  assert.equal(materials.squarePosts, 2);
  assert.equal(materials.roundPosts, 0);

  const visibleMaterials = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0}, {x:1,y:0}]},
  ], {...mat, postShape:'square'});
  const hiddenMaterials = context.calcMaterials([
    {closed:false, hidden3d:true, pts:[{x:0,y:0}, {x:1,y:0}]},
  ], {...mat, postShape:'square'});
  assert.deepEqual(
    {posts:hiddenMaterials.posts, square:hiddenMaterials.squarePosts, round:hiddenMaterials.roundPosts},
    {posts:visibleMaterials.posts, square:visibleMaterials.squarePosts, round:visibleMaterials.roundPosts},
  );

  for (const polys of [
    [{closed:true, pts:[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]}],
    [{closed:false, pts:[{x:0,y:0,gateAfter:true},{x:1,y:0},{x:4,y:0}]}],
    [{closed:false, pts:[{x:0,y:0},{x:4,y:0}]}],
  ]){
    materials = context.calcMaterials(polys, {...mat, ends:'auto', postShape:'square'});
    assert.equal(materials.squarePosts + materials.roundPosts, materials.posts);
  }
});
