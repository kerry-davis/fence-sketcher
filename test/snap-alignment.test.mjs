import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('a dragged post aligns with another post on the same fence before angle locking', () => {
  const start = html.indexOf('function snapAngle(');
  const end = html.indexOf('// Snap one or more moving X/Y axes', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    Math,
    ANGLE_TOL:14,
    HIT:{corner:12, edge:10},
    view:{s:24},
    state:{
      snapBld:true,
      snapGrid:false,
      builds:[],
      polys:[{closed:false, pts:[
        {x:5,y:2},
        {x:9,y:10},
        {x:5.5,y:10},
      ]}],
    },
    guides:null,
    gridStep:() => 1,
    drawTarget:() => null,
    segsOf:pl => pl.pts.slice(0,-1).map((point,i) => [i,point,pl.pts[i+1]]),
    dist2seg:(px,py,ax,ay,bx,by) => {
      const dx=bx-ax, dy=by-ay, length=dx*dx+dy*dy;
      const t=length ? Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/length)) : 0;
      return {t,d:Math.hypot(px-(ax+dx*t),py-(ay+dy*t))};
    },
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);

  const result = context.snapFence(
    {x:5.08,y:10.04},
    {p:0,i:2},
    context.state.polys[0].pts[1],
    null,
  );
  assert.equal(result.x,5);
  assert.equal(result.y,10);
  assert.equal(result.ax,context.state.polys[0].pts[0]);
  assert.equal(result.ay,context.state.polys[0].pts[1]);
});
