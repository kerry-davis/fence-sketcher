import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('rail side is explicit and reverses the 3D face offset', () => {
  assert.match(html, /id="iRailSide"/);
  assert.match(html, /railSide: 'left'/);
  assert.match(html, /M\.railSide = e\.target\.value === 'right' \? 'right' : 'left'/);
  assert.match(html, /const railSide = typeof railSideOf === 'function' \? railSideOf\(mat\) : 'left';/);
  assert.match(html, /segmentSideMid\(rail\.a, rail\.b, POST_SIDE\/2 \+ RAIL_T\/2, railSide\)/);

  const start = html.indexOf('function segmentSideMid(');
  const end = html.indexOf('// Extend an outer rail bay', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    Math,
    segLen:(a,b) => Math.hypot(b.x-a.x,b.y-a.y),
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const left = context.segmentSideMid({x:0,y:0}, {x:10,y:0}, .1, 'left');
  const right = context.segmentSideMid({x:0,y:0}, {x:10,y:0}, .1, 'right');
  assert.deepEqual({...left}, {x:5,y:.1});
  assert.deepEqual({...right}, {x:5,y:-.1});
});
