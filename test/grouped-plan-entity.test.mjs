import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('grouped buildings have one outline with continuous external edge lengths', () => {
  const start=html.indexOf('function houseGroups(');
  const end=html.indexOf('function scaleBuildings(',start);
  assert.ok(start >= 0 && end > start);

  const context={
    Map,Math,
    bldH:b => b.z || 3,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);

  const builds=[
    {x:0,y:0,w:4,h:4,g:1},
    {x:4,y:0,w:4,h:4,g:1},
  ];
  const group=context.houseGroups(builds)[0];
  const outline=context.planGroupOutline(builds,group);
  assert.equal(outline.length,4);
  assert.equal(outline.some(([a,b]) => a.x === 4 && b.x === 4),false);
  assert.deepEqual(Array.from(outline,([a,b]) => Math.hypot(b.x-a.x,b.y-a.y)).sort((a,b) => a-b),
                   [4,4,8,8]);
  assert.deepEqual(
    (({x,y,w,h}) => ({x,y,w,h}))(context.houseBox(builds,group)),
    {x:0,y:0,w:8,h:4},
  );

  assert.equal(context.ungroupBuildings(builds,group),true);
  assert.equal(context.houseGroups(builds).length,2);
  assert.equal(context.planGroupOutline(builds,[0]).length,4);
  assert.equal(context.planGroupOutline(builds,[1]).length,4);

  const stepped=[
    {x:0,y:0,w:4,h:4,g:2},
    {x:4,y:2,w:2,h:2,g:2},
  ];
  const steppedOutline=context.planGroupOutline(stepped,[0,1]);
  assert.deepEqual(
    Array.from(steppedOutline,([a,b]) => Math.hypot(b.x-a.x,b.y-a.y)).sort((a,b) => a-b),
    [2,2,2,4,4,6],
  );

  const groups=[[0],[1],[2,3]];
  assert.deepEqual(
    Array.from(context.planGroupRenderOrder(groups,new Set([1])),g => Array.from(g)),
    [[0],[2,3],[1]],
  );
  assert.deepEqual(
    Array.from(context.planGroupRenderOrder(groups,new Set([2,3])),g => Array.from(g)),
    [[0],[1],[2,3]],
  );
});
