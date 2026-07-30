import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('a round endpoint renders as one cylindrical post at a shared junction', () => {
  const helperStart = html.indexOf('const postShapeOf =');
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
    segLen:(a,b) => Math.hypot(b.x-a.x,b.y-a.y),
    segsOf:pl => pl.pts.slice(0,-1).map((a,i) => [i,a,pl.pts[i+1]]),
    endsOf:mat => mat.ends ?? 'auto',
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
});
