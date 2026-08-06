import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('the drawing sheet is its own view, and does not collide with the phone sheet', () => {
  // setSheet() already toggles the phone bottom sheet; a second one silently won and the
  // drawing sheet never opened. Two names, one each.
  assert.equal(html.match(/function setSheet\(/g).length, 1);
  assert.equal(html.match(/function setSheetView\(/g).length, 1);
  assert.match(html, /\$\('bSheet'\)\.addEventListener\('click', \(\) => setSheetView\(!modeSheet\)\);/);
  // the three views are exclusive
  assert.match(html, /function setSheetView\(on\)\{\s*\n\s*if \(on === modeSheet\) return;\s*\n\s*if \(on && mode3d\) set3d\(false\);/);
  assert.match(html, /if \(on && modeSheet\) setSheetView\(false\);\s*\n\s*mode3d = on;/);
  // paper, not a drawing surface: a press moves the sheet instead of editing the fence
  assert.match(html, /if \(modeSheet\)\{ drag = \{ t:'pan' \}; return; \}/);
  // and the plan's own view is parked, not clobbered
  assert.match(html, /if \(on\)\{ planView = \{\.\.\.view\}; fitSheet\(\); \}\s*\n\s*else if \(planView\)\{ view = planView; planView = null; \}/);
});

test('one page per fence, each at the largest standard scale that fits it', () => {
  assert.match(html, /const SCALES = \[5,10,20,25,50,100,200,500,1000,2000\];/);
  assert.match(html, /if \(ev\.len\*k <= room\.w && ev\.height\*k <= room\.h\*0\.62\)\{ den = d; break; \}/);
  // a page is laid out page-relative, then dropped onto its own sheet
  assert.match(html, /page\.top = pages\.length\*\(SHEET\.h \+ SHEET\.gap\*2\);\s*\n\s*page\.base \+= page\.top;/);
  // a hidden fence is off the sheet, as it is out of the 3D scene
  assert.match(html, /!state\.polys\[i\]\.hidden3d && state\.polys\[i\]\.pts\.length > 1/);
  // every page states what it is and what scale it is at
  assert.match(html, /\$\{pg\.kind\} 1:\$\{pg\.den\} at A4/);
  // and a fence gets a section page beside its elevation
  assert.match(html, /place\(\{ kind:'section', i, ev, bounds, den:sden, k:1000\/sden,/);
  assert.match(html, /SCALES\.find\(d => fits\(d\) && tightest\*\(1000\/d\) >= SECTION_MIN_MM\)\s*\n?\s*\?\? SCALES\.find\(fits\)/);
});

test('the sheet draws dimensions with the same renderer as the plan and 3D', () => {
  // dimAt/dimChain take a projector, so one implementation serves the scene and the paper
  assert.match(html, /function dimAt\(to, p, q, txt, off, avoid, k = 1\)\{/);
  assert.match(html, /function dimChain\(to, items, avoid, k = 1\)\{/);
  assert.match(html, /const toScreen = p => P2S\(p\[0\], p\[1\]\);/);
  assert.match(html, /const reach = ev\.stations\.length > 2 \? dimChain\(toScreen, bays, at\(0, ev\.height\/2\), k\)/);
  assert.doesNotMatch(html, /function renderSheetDimension|sheetArrow/);   // no third style
});

test('the developed elevation agrees with the model it is drawn from', () => {
  const start = html.indexOf('function elevationParts(');
  const end = html.indexOf('// Midpoint offset to a chosen side', start);
  assert.ok(start >= 0 && end > start);
  // it reads the same helpers the plan, the 3D scene and the materials use
  for (const shared of ['fenceHeightOf(mat)', 'hrOf(mat)', 'materialPostEndFlags(polys, idx, mat)',
                        'postsAlong(a, b, spacing, false)', 'railYs(mat)', 'gateLeafBuild(H, mat)',
                        'gateLeafLength(L, mat)', 'postSizeOf(mat)'])
    assert.ok(html.slice(start, end).includes(shared), `elevation should use ${shared}`);

  const context = { Math, Set, state:{ mat:{} } };
  const helpers = `
    const GATE_GAP=0.04, GATE_STILE=0.09, GATE_BOTTOM=0.08, POST_SIDE=0.1;
    const segLen=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
    const segsOf=pl=>{const n=pl.closed?pl.pts.length:pl.pts.length-1;
      return Array.from({length:n},(_,i)=>[i,pl.pts[i],pl.pts[(i+1)%pl.pts.length]]);};
    const postSizeOf=m=>m.postSize??0.1, postTOf=m=>m.postT??0.1;
    const fenceHeightOf=m=>m.height-(m.postDepth||0);
    const hrOf=m=>({on:!!m.handrail,w:0.1,t:0.045});
    const railYs=m=>{const d=m.railW+m.railGap,ys=[];for(let k=0;k<(m.rails|0);k++)
      ys.push((m.botOff||0)+k*d+m.railW/2);return ys;};
    const postsAlong=(a,b,sp,gate)=>{const L=segLen(a,b),n=gate?1:Math.max(1,Math.ceil(L/sp-1e-9)),o=[];
      for(let k=0;k<=n;k++){const d=gate?L*k:Math.min(L,sp*k),t=L?d/L:0;
        o.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}return o;};
    const materialPostEndFlags=()=>({start:true,end:true});
    const gateLeafInset=m=>postSizeOf(m)/2+GATE_GAP+GATE_STILE/2;
    const gateLeafLength=(L,m)=>Math.max(0,L-2*gateLeafInset(m));
    const gateLeafBuild=(H,m)=>{const bottom=Math.min(GATE_BOTTOM,H*0.15),leafH=Math.max(0.2,H-bottom);
      return {bottom,leafH,railW:0.15,rails:[bottom+leafH*0.28,bottom+leafH*0.72]};};
  `;
  vm.createContext(context);
  vm.runInContext(helpers + html.slice(start, end), context);

  const mat = { style:'rail', spacing:2.4, rails:2, railW:0.15, railGap:0.15, botOff:0.15,
                height:1.8, postDepth:0.6, paling:0.1, gap:0.005 };
  // an L of 3 m + 4 m develops to 7 m of fence with one fold, not two separate drawings
  const bent = context.elevationParts(
    [{ pts:[{x:0,y:0},{x:3,y:0},{x:3,y:4}], closed:false, mat }], 0);
  assert.equal(+bent.len.toFixed(6), 7);
  assert.equal(bent.parts.filter(p => p.k === 'corner').length, 1);
  assert.equal(bent.parts.filter(p => p.k === 'corner')[0].x, 3);
  // posts at 0, 2.4, 3 (the fold), 5.4, 7 — the junction counted once
  // Array.from: the vm realm's arrays are structurally equal but not reference-equal
  assert.deepEqual(Array.from(bent.stations), [0, 2.4, 3, 5.4, 7]);
  assert.equal(bent.parts.filter(p => p.k === 'post').length, 5);
  // rails span bays, never the whole run
  const rails = bent.parts.filter(p => p.k === 'rail');
  assert.ok(rails.length > 0 && rails.every(r => r.w <= 2.4 + 1e-9));
  assert.equal(+bent.fenceHeight.toFixed(6), 1.2);

  // A run whose first point is its right-hand end would draw mirrored against the plan.
  // 5 m at 2.4 spacing has its short 0.2 m bay beside the last point, so drawing left to
  // right in plan terms puts that bay first.
  const rightToLeft = context.elevationParts(
    [{ pts:[{x:5,y:0},{x:0,y:0}], closed:false, mat:{...mat, spacing:2.4} }], 0);
  assert.equal(rightToLeft.flipped, true);
  assert.deepEqual(Array.from(rightToLeft.stations).map(v => +v.toFixed(4)), [0, 0.2, 2.6, 5]);
  const leftToRight = context.elevationParts(
    [{ pts:[{x:0,y:0},{x:5,y:0}], closed:false, mat:{...mat, spacing:2.4} }], 0);
  assert.equal(leftToRight.flipped, false);
  assert.deepEqual(Array.from(leftToRight.stations).map(v => +v.toFixed(4)), [0, 2.4, 4.8, 5]);
  // a run going up the plan reads from its top end
  const northward = context.elevationParts(
    [{ pts:[{x:0,y:5},{x:0,y:0}], closed:false, mat }], 0);
  assert.equal(northward.flipped, true);
});

test('the sheet carries the whole section, from the same definition 3D uses', () => {
  // one verticalChainBounds(), called by the 3D chain and by the elevation
  assert.equal(html.match(/function verticalChainBounds\(/g).length, 1);
  assert.match(html, /const bounds = verticalChainBounds\(ev\.mat, ev\.fenceHeight, ev\.gateOnly\);/);
  assert.match(html, /const bounds = verticalChainBounds\(mat, H, station\.gate\);/);
  // a gate-only run is sectioned as a leaf
  assert.match(html, /gateOnly: segsOf\(pl\)\.every\(\(\[, a\]\) => !!a\.gateAfter\)/);
  // board width and gap come off the boards the elevation actually drew
  assert.match(html, /const boards = ev\.parts\.filter\(p => p\.k === 'board'\)\.sort\(\(a2,b2\) => a2\.x-b2\.x\)\.slice\(0,2\);/);
  // the run's own height stands outside whatever the section chain reached
  assert.match(html, /dimAt\(toScreen, at\(reach\/2, 0\), at\(reach\/2, ev\.fenceHeight\)[\s\S]{0,80}?up \+ CHAIN_OFF\*k\*1\.6, inside, k\);/);
});
