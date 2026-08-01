import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('totals panel offers selected-fence and all-fence scopes without the old breakdown', () => {
  assert.match(html, /id="showAllTotals"> Show all fence totals/);
  assert.doesNotMatch(html, /id="perFence"/);
  assert.doesNotMatch(html, /Gates and buildings are excluded from materials\./);
  assert.ok(html.indexOf('id="tPosts"') < html.indexOf('id="tLen"'));
  assert.match(html, /if \(tag\) showAllTotals = false;/);
  assert.match(html, /if \(hit && \(hit\.t === 'pt' \|\| hit\.t === 'seg'\)\) showAllTotals = false;/);
});

test('selected totals use one fence entry and the toggle restores the aggregate', () => {
  const start = html.indexOf('function scopeTotals(');
  const end = html.indexOf('// Delete point i', start);
  assert.ok(start >= 0 && end > start);

  const context = {};
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const all = {
    fenceLen: 30,
    posts: 20,
    per: [
      {i:0, len:10, posts:8, gateLengths:[]},
      {i:1, len:20, posts:12, gateLengths:[2.5]},
    ],
  };
  const selected = context.scopeTotals(all, 1, false);
  assert.equal(selected.fenceLen, 20);
  assert.equal(selected.posts, 12);
  assert.deepEqual([...selected.gates], [2.5]);
  assert.strictEqual(context.scopeTotals(all, 1, true), all);
  assert.strictEqual(context.scopeTotals(all, -1, false), all);
});

test('copy summary renders a consolidated store-ready BOM', () => {
  const helperStart = html.indexOf('function copyGateSizes(');
  const helperEnd = html.indexOf('// copy summary', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const context = {
    DEF: {m:{height:1.8, postDepth:.6, paling:.1, railW:.15}},
    DEF_RAILS: 2,
    POST_SIDE: .1,
    PALING_T: .02,
    RAIL_T: .045,
    postSizeOf: mat => (mat && mat.postSize != null ? Number(mat.postSize) : .1),
    palingTOf: mat => (mat && mat.palingT != null ? Number(mat.palingT) : .02),
    railTOf: mat => (mat && mat.railT != null ? Number(mat.railT) : .045),
    timberSize: (w, t) => `${Math.round(w*1000)}mm x ${Math.round(t*1000)}mm`,
    fmtLen: (value, unit) => `${value} ${unit}`,
    fmtSmall: value => `${Math.round(value * 1000)} mm`,
    fmtBomLength: value => `${Math.round(value * 1000)} mm`,
    fenceHeightOf: mat => Math.max(.2, (mat.height ?? 1.8) - (mat.postDepth ?? 0)),
    postDepthOf: mat => Math.max(0, mat.postDepth ?? 0),
    postLengthOf: mat => Math.max(.2, mat.height ?? 1.8),
    railLengthOf: mat => Math.max(.2, mat.railLength ?? 2.4),
    handrailLengthOf: mat => Math.max(.2, mat.hrLength ?? 2.4),
    hrOf: mat => ({on:!!mat.handrail, w:mat.hrW ?? .1, t:mat.hrT ?? .045}),
    state: {mat:{style:'paling', height:1.8, postDepth:.6, spacing:2.4, rails:2,
      paling:.1, gap:.005, hrLength:2.4, hrW:.1, hrT:.045}},
    Map, Math,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(helperStart, helperEnd), context);

  const mat = {
    style:'paling', height:1.8, postDepth:.6, rails:2, paling:.1, gap:.005,
    handrail:true, hrW:.1, hrT:.045, hrLength:5,
  };
  const rows = context.copyBomRows([
    {name:'Fence 1', squarePosts:4, roundPosts:0, rails:6, gateRails:0,
    railCuts:[{length:2, centres:2}, {length:2, centres:2}, {length:2, centres:2}],
     palings:48, gatePalings:0, handrail:5, handrailCuts:[{length:5, span:5}], mat},
    {name:'Gate 1', squarePosts:2, roundPosts:0, rails:2, gateRails:2,
     palings:17, gatePalings:17, gateLengths:[2], handrail:0, mat},
  ], 'm');
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => [row.item, row.qty, row.unit]))), [
    ['POSTS', 6, 'count'],
    ['RAILS', 6, 'count'],
    ['GATE RAILS', 2, 'count'],
    ['PALINGS', 48, 'count'],
    ['GATE PALINGS', 17, 'count'],
    ['HANDRAIL', 1, 'count'],
  ]);
  const table = context.copyBomTable(rows, 'm');
  assert.match(table, /^QTY\s+ITEM\s+FENCE\(S\)\s+DESCRIPTION\n/);
  assert.ok(table.indexOf('POSTS') < table.indexOf('RAILS'));
  assert.ok(table.indexOf('RAILS') < table.indexOf('PALINGS'));
  assert.match(table, /6\s+POSTS\s+Fence 1, Gate 1\s+100mm x 100mm square fence posts/);
  assert.match(table, /POSTS\s+Fence 1, Gate 1/);
  assert.match(table, /1800 mm total length \(1200 mm above ground \+ 600 mm in ground\)/);
  assert.match(table, /6\s+RAILS\s+Fence 1\s+45 mm thick backing rails; 2400 mm stock length/);
  assert.match(table, /2\s+GATE RAILS/);
  assert.match(table, /1\s+HANDRAIL\s+Fence 1\s+100mm x 45mm top rail; 5000 mm stock length; 5000 mm total required cut length; post-bay cuts: 1 × 5000 mm \(fits post centre-to-centre\)/);
  assert.equal(context.copyGateSizes([1.5,1.5], 'm'), '2 gate leaves (2 × 1500 mm)');
  const cutPlan = context.copyBomCutPlan(rows, 'm').join('\n');
  assert.match(cutPlan, /RAILS — Fence 1: 6 × 2000 mm post centre-to-centre \(400 mm overlap\)/);
  assert.doesNotMatch(cutPlan, /HANDRAIL/);

  const railRows = context.copyBomRows([{
    rails:4, railCuts:[
      {length:2.05, centres:2},
      {length:2, centres:2},
    ],
    mat:{style:'rail', rails:2, railW:.1, height:1.8, postDepth:.6},
  }, {
    rails:4, railCuts:[
      {length:2.05, centres:2},
      {length:2, centres:2},
    ],
    mat:{style:'rail', rails:2, railW:.1000001, height:1.8, postDepth:.6},
  }], 'm');
  assert.deepEqual(JSON.parse(JSON.stringify(railRows.map(row => [row.item, row.qty, row.description]))), [
    ['RAILS', 8, '100mm x 45mm post-and-rail members; 2400 mm stock length'],
  ]);
  const railCutPlan = context.copyBomCutPlan(railRows, 'm').join('\n');
  assert.match(railCutPlan, /4 × 2000 mm post centre-to-centre \+ 50 mm total end-post extension \(400 mm overlap\)/);
  assert.match(railCutPlan, /4 × 2000 mm post centre-to-centre \(400 mm overlap\)/);

  const railStatusRows = context.copyBomRows([
    {name:'Fit', rails:1, railCuts:[{length:2.4, centres:2.4}],
     mat:{style:'rail', rails:1, railLength:2.4, railW:.1, height:1.8, postDepth:.6}},
    {name:'Overlap', rails:1, railCuts:[{length:1.5, centres:1.5}],
     mat:{style:'rail', rails:1, railLength:2.4, railW:.1, height:1.8, postDepth:.6}},
    {name:'Shortage', rails:1, railCuts:[{length:3, centres:3}],
     mat:{style:'rail', rails:1, railLength:2.4, railW:.1, height:1.8, postDepth:.6}},
  ], 'm');
  assert.deepEqual(JSON.parse(JSON.stringify(railStatusRows.map(row => [row.item, row.qty, row.description]))), [
    ['RAILS', 3, '100mm x 45mm post-and-rail members; 2400 mm stock length'],
  ]);
  const statusPlan = context.copyBomCutPlan(railStatusRows, 'm').join('\n');
  assert.match(statusPlan, /1 × 3000 mm post centre-to-centre \(ISSUE: 600 mm too short\)/);
  assert.match(statusPlan, /1 × 2400 mm post centre-to-centre \(fits post centre-to-centre\)/);
  assert.match(statusPlan, /1 × 1500 mm post centre-to-centre \(900 mm overlap\)/);

  const handrailRows = context.copyBomRows([{
    handrail:10.86,
    handrailCuts:[
      {length:1.55, span:1.5},
      {length:1.5, span:1.5},
      {length:1.5, span:1.5},
      {length:1.5, span:1.5},
      {length:1.5, span:1.5},
      {length:1.5, span:1.5},
      {length:1.5, span:1.5},
      {length:.31, span:.26},
    ],
    mat:{style:'paling', handrail:true, hrW:.2, hrT:.045, hrLength:2.4, height:1.8, postDepth:.6},
  }], 'm');
  assert.deepEqual(JSON.parse(JSON.stringify(handrailRows.map(row => [row.item, row.qty, row.description]))), [
    ['HANDRAIL', 8, '200mm x 45mm top rail; 2400 mm stock length; 10860 mm total required cut length; post-bay cuts: 1 × 1550 mm (1500 mm fence segment + 50 mm total end-post extension; 900 mm overlap), 6 × 1500 mm (900 mm overlap), 1 × 310 mm (260 mm fence segment + 50 mm total end-post extension; 2140 mm overlap)'],
  ]);

  const postRows = context.copyBomRows([
    {squarePosts:10, mat:{style:'paling', height:1.8, postDepth:.6}},
    {squarePosts:9, mat:{style:'paling', height:1.8, postDepth:0}},
  ], 'm');
  assert.deepEqual(JSON.parse(JSON.stringify(postRows.map(row => [row.item, row.qty, row.description]))), [
    ['POSTS', 19, '100mm x 100mm square fence posts; 1800 mm total length (installations: 10 × 1200 mm above ground + 600 mm in ground; 9 × 1800 mm above ground + 0 mm in ground)'],
  ]);

  context.state.mat.hrLength = 3.6;
  const sharedRows = context.copyBomRows([{
    name:'Shared settings fence', squarePosts:1, handrail:3.6,
    handrailCuts:[{length:3.6, span:3.6}],
  }], 'm');
  assert.match(sharedRows.find(row => row.item === 'HANDRAIL').description,
    /3600 mm stock length/);

  assert.deepEqual([...context.copyBomNotes([{
    name:'Back gate', excluded:false, excludeRails:true, excludePalings:true,
    mat:{style:'paling'},
  }])], [
    'Back gate: rails not included in BOM',
    'Back gate: palings not included in BOM',
  ]);

  const copyStart = html.indexOf('// copy summary');
  const copy = html.slice(copyStart, html.indexOf('function fallbackCopy', copyStart));
  assert.match(copy, /const t = scopeTotals\(m, sc\.idx, showAllTotals\);/);
  assert.match(copy, /const entries = showAllTotals \|\| !sc\.pl \? m\.per/);
  assert.match(copy, /FENCE BILL OF MATERIALS/);
  assert.match(copy, /PURCHASE SUMMARY \(TOTALS\)/);
  assert.match(copy, /copyBomTable\(rows,u\)/);
  assert.match(copy, /copyBomCutPlan\(rows,u\)/);
  assert.doesNotMatch(copy, /Gate leaf materials:/);
  assert.match(html, /id="label3ctl"/);
  assert.match(html, /id="c3dLabels"/);
  assert.match(html, /const tag = showFenceLabels3 \? fenceLabelLayout\(pl, p\) : null;/);
  assert.match(html, /if \(showFenceLabels3\) for \(let p = state\.polys\.length-1/);
  assert.match(html, /id="iRailLength"/);
  assert.match(html, /id="uRailLength"/);
  assert.match(html, /set\('iRailLength', big\(railLengthOf\(M\)\)\)/);
  assert.match(html, /\$\('iRailLength'\)\.addEventListener\('change'/);
  assert.match(html, /\['spacing','railLength','paling'/);
  assert.match(html, /id="iHRLength"/);
  assert.match(html, /id="uHRLength"/);
  assert.match(html, /set\('iHRLength', big\(handrailLengthOf\(M\)\)\)/);
  assert.match(html, /\$\('iHRLength'\)\.addEventListener\('change'/);
  assert.match(html, /'hrLength'\]\)/);
  assert.match(html, /id="iPostDepth"/);
  assert.match(html, />Hole depth<\/span>/);
  assert.match(html, /id="iAboveGroundHeight"/);
  assert.match(html, /\['iPostDepth','postDepth'\]/);
});
