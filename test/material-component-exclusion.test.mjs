import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('materials panel exposes separate BOM controls for rails and palings', () => {
  assert.match(html, /id="bomRails" checked> Include rails in BOM/);
  assert.match(html, /id="bomPalings" checked> Include palings in BOM/);
  assert.match(html, /excludeRails:!!pl\.excludeRails/);
  assert.match(html, /excludePalings:!!pl\.excludePalings/);
  assert.match(html, /const fenceRails = pl\.excludeRails \? 0 : pPanels \* mat\.rails/);
  assert.match(html, /const fencePalings = !pl\.excludePalings &&/);
  assert.match(html, /function gateMaterialQuantities\(L, mat, pl\)/);
});

test('component BOM exclusions keep posts while removing only the selected materials', () => {
  const start = html.indexOf('function sharedEnds(');
  const end = html.indexOf('// Delete point i', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    Math, Map,
    POST_SIDE:0.1, GATE_GAP:0.04, GATE_STILE:0.09, GATE_BOTTOM:0.08,
    fenceName: (pl, i) => `Fence ${i+1}`,
    segLen: (a, b) => Math.hypot(b.x-a.x, b.y-a.y),
    segsOf: pl => {
      const count = pl.closed ? pl.pts.length : pl.pts.length - 1;
      return Array.from({length:count}, (_, i) => [i, pl.pts[i], pl.pts[(i+1) % pl.pts.length]]);
    },
    endsOf: mat => mat.ends ?? 'auto',
    endCount: mat => mat.ends === 'auto' ? 2 : +mat.ends,
    postsAlong: (a, b, spacing, gate) => {
      const length = Math.hypot(b.x-a.x, b.y-a.y);
      const count = gate ? 1 : Math.max(1, Math.ceil(length/spacing - 1e-9));
      return Array.from({length:count+1}, (_, i) => ({
        x:a.x+(b.x-a.x)*i/count,
        y:a.y+(b.y-a.y)*i/count,
      }));
    },
    postShapeAt: () => 'square',
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const mat = {style:'paling', spacing:2, rails:2, paling:.1, gap:.005, ends:2};
  const run = {closed:false, pts:[{x:0,y:0}, {x:5,y:0}]};
  const included = context.calcMaterials([run], mat);
  assert.equal(included.posts, 4);
  assert.equal(included.rails, 6);
  assert.equal(included.palings, 48);

  const excluded = context.calcMaterials([
    {...run, excludeRails:true, excludePalings:true},
  ], mat);
  assert.equal(excluded.posts, included.posts);
  assert.equal(excluded.rails, 0);
  assert.equal(excluded.palings, 0);
  assert.equal(excluded.per[0].excludeRails, true);
  assert.equal(excluded.per[0].excludePalings, true);

  const railsOnly = context.calcMaterials([{...run, excludeRails:true}], mat);
  assert.equal(railsOnly.rails, 0);
  assert.equal(railsOnly.palings, included.palings);
  const palingsOnly = context.calcMaterials([{...run, excludePalings:true}], mat);
  assert.equal(palingsOnly.rails, included.rails);
  assert.equal(palingsOnly.palings, 0);
});

test('gate leaf rails and palings are counted and obey BOM exclusions', () => {
  const start = html.indexOf('function sharedEnds(');
  const end = html.indexOf('// Delete point i', start);
  const context = {
    Math, Map,
    POST_SIDE:0.1, GATE_GAP:0.04, GATE_STILE:0.09, GATE_BOTTOM:0.08,
    fenceName: (pl, i) => `Fence ${i+1}`,
    segLen: (a, b) => Math.hypot(b.x-a.x, b.y-a.y),
    segsOf: pl => {
      const count = pl.closed ? pl.pts.length : pl.pts.length - 1;
      return Array.from({length:count}, (_, i) => [i, pl.pts[i], pl.pts[(i+1) % pl.pts.length]]);
    },
    endsOf: mat => mat.ends ?? 'auto',
    endCount: mat => mat.ends === 'auto' ? 2 : +mat.ends,
    postsAlong: (a, b, spacing, gate) => {
      const length = Math.hypot(b.x-a.x, b.y-a.y);
      const count = gate ? 1 : Math.max(1, Math.ceil(length/spacing - 1e-9));
      return Array.from({length:count+1}, (_, i) => ({
        x:a.x+(b.x-a.x)*i/count,
        y:a.y+(b.y-a.y)*i/count,
      }));
    },
    postShapeAt: () => 'square',
  };
  assert.ok(start >= 0 && end > start);
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const mat = {style:'paling', spacing:2, rails:2, paling:.1, gap:.005, ends:2};
  const gate = {closed:false, pts:[{x:0,y:0,gateAfter:true}, {x:2,y:0}]};
  const included = context.calcMaterials([gate], mat);
  assert.equal(included.fenceLen, 0);
  assert.equal(included.panels, 0);
  assert.equal(included.posts, 2);
  assert.equal(included.gateRails, 2);
  assert.equal(included.gatePalings, 17);
  assert.equal(included.rails, 2);
  assert.equal(included.palings, 17);

  const excluded = context.calcMaterials([
    {...gate, excludeRails:true, excludePalings:true},
  ], mat);
  assert.equal(excluded.posts, included.posts);
  assert.equal(excluded.rails, 0);
  assert.equal(excluded.palings, 0);
  assert.equal(excluded.per[0].gateRails, 0);
  assert.equal(excluded.per[0].gatePalings, 0);

  const railGate = context.calcMaterials([
    {closed:false, pts:[{x:0,y:0,gateAfter:true}, {x:2,y:0}]},
  ], {...mat, style:'rail', height:1.2, rails:3, railW:.1, railGap:.35, botOff:.15});
  assert.equal(railGate.rails, 3);
  assert.equal(railGate.palings, 0);
});
