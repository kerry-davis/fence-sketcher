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

test('desktop wheel scrolls through sheet pages while modified wheel still zooms', () => {
  const start = html.indexOf("cv.addEventListener('wheel'");
  const end = html.indexOf('// keyboard:', start);
  const wheel = html.slice(start, end);
  assert.match(wheel, /if \(modeSheet && !e\.ctrlKey && !e\.metaKey\)\{/);
  assert.match(wheel, /view\.x \+= e\.deltaX\*unit\/view\.s;/);
  assert.match(wheel, /view\.y \+= e\.deltaY\*unit\/view\.s;/);
  assert.match(wheel, /paint\(\); return;/);
  assert.match(wheel, /zoomAt\(e\.offsetX, e\.offsetY, Math\.exp\(-e\.deltaY \* 0\.0012\)\);/);
  assert.match(html, /wheel to scroll pages · Ctrl\+wheel or pinch to zoom/);
});

test('three pages per fence, with plan and elevation at one fitted scale', () => {
  assert.match(html, /const SCALES = \[5,10,20,25,50,100,200,500,1000,2000\];/);
  assert.match(html, /function sheetPlanElevationScale\(ev, plan, room\)\{/);
  assert.match(html, /const maxK = Math\.min\(room\.w\/ev\.len, room\.h\*0\.78\/ev\.height,/);
  assert.match(html, /room\.w\/b\.width, room\.h\*0\.82\/b\.height\);/);
  assert.match(html, /const den = Math\.max\(5, Math\.ceil\(1000\/maxK\)\);/);
  assert.match(html, /const paired = sheetPlanElevationScale\(ev, plan, room\);/);
  assert.match(html, /const planPage = \{ kind:'plan', i, plan, ev, den:paired\.den, k:paired\.k,/);
  assert.match(html, /place\(\{ kind:'elevation', i, ev, den:paired\.den, k:paired\.k,/);
  // a page is laid out page-relative, then dropped onto its own sheet
  assert.match(html, /page\.top = pages\.length\*\(SHEET\.h \+ SHEET\.gap\*2\);\s*\n\s*page\.base \+= page\.top;/);
  // sheet inclusion is independent of the 3D visibility switch
  assert.match(html, /!state\.polys\[i\]\.hiddenSheet && state\.polys\[i\]\.pts\.length > 1/);
  assert.doesNotMatch(html.slice(html.indexOf('function sheetFences(){'),
                                 html.indexOf('/\* Annotations belong', html.indexOf('function sheetFences(){'))),
                      /hidden3d/);
  // every page states what it is and what scale it is at
  assert.match(html, /\$\{pg\.kind\} 1:\$\{pg\.den\} at A4/);
  // and a fence gets a section page beside its elevation
  assert.match(html, /place\(\{ kind:'section', i, ev, bounds, bay, win, den:sden, k:sk,/);
  assert.match(html, /SCALES\.find\(d => fits\(d\) && tightest\*\(1000\/d\) >= SECTION_MIN_MM\)\s*\n?\s*\?\? SCALES\.find\(fits\)/);
  const start = html.indexOf('function sheetLayout(){');
  const end = html.indexOf('/* A section is taken through a full bay', start);
  const layout = html.slice(start, end);
  assert.ok(layout.indexOf("kind:'plan'") < layout.indexOf("kind:'elevation'"));
  assert.ok(layout.indexOf("kind:'elevation'") < layout.indexOf("kind:'section'"));
});

test('paired plan and elevation scales fit together', () => {
  const start = html.indexOf('function sheetPlanElevationScale(');
  const end = html.indexOf('/* One plan/elevation pair per item', start);
  assert.ok(start >= 0 && end > start);
  const context = { Math };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  const room = { w:261, h:174 };
  const elevation = { len:10.5, height:1.8 };
  // The pair uses the page closely instead of discarding space at the next coarse preset.
  const horizontal = context.sheetPlanElevationScale(elevation,
    {bounds:{width:10.6,height:0.1}}, room);
  assert.equal(horizontal.den, 41);
  assert.equal(horizontal.k, 1000/41);
  // Turning that same run vertically makes height the limiting constraint, without rotation.
  const vertical = context.sheetPlanElevationScale(elevation,
    {bounds:{width:0.1,height:10.6}}, room);
  assert.equal(vertical.den, 75);
});

test('elevation post centres use the exact paper X coordinates from plan', () => {
  assert.match(html, /function sheetPlanPointAtStation\(plan, station\)\{/);
  assert.match(html, /const stationX = station => \{/);
  assert.match(html, /const physical = ev\.flipped \? ev\.len-station : station/);
  assert.match(html, /x:stationX\(0\), stationX,/);
  assert.match(html, /const xAt = bl\.stationX \|\| \(station => x\+mm\(station\)\)/);
  assert.match(html, /const at = \(px, py\) => \[xAt\(px\), base - mm\(py\)\]/);
});

test('each item gets an isolated, dimensioned plan page', () => {
  assert.match(html, /function sheetPlanGeometry\(polys, idx\)\{/);
  assert.match(html, /const plan = sheetPlanGeometry\(state\.polys, i\), pb = plan\.bounds;/);
  assert.match(html, /const planPage = \{ kind:'plan', i, plan, ev, den:paired\.den, k:paired\.k,/);
  assert.match(html, /else if \(pg\.kind === 'plan'\) paintPlan\(pg, u, k\);/);
  assert.match(html, /for \(const seg of plan\.segments\)\{/);
  assert.match(html, /const dimItems = seg\.bays\.length > 1\s*\n\s*\? seg\.bays\.map\(bay =>/);
  assert.match(html, /txt:\(seg\.gate \? 'Gate ' : ''\) \+ fmtLen\(bay\.len, u\) \}\)\)\s*\n\s*: \[\];/);
  assert.match(html, /const reach = dimItems\.length \? dimChain\(toScreen, dimItems, avoid, scale\) : CHAIN_OFF\*scale;/);
  assert.match(html, /reach \+ CHAIN_OFF\*scale\*1\.6/);
  assert.match(html, /dimAt\(toScreen, paperPoint\(seg\.a\), paperPoint\(seg\.b\)/);
  assert.match(html, /for \(const angle of plan\.angles\) sheetPlanAngle\(pg, angle, at, scale\);/);
  // State and canvas coordinates are both Y-down. Increasing state Y must therefore move
  // down the isolated paper plan, preserving the run's chirality rather than mirroring it.
  assert.match(html, /const top = base - mm\(b\.height\);\s*\/\/ The interactive plan's S2W uses canvas Y-down/);
  assert.match(html, /const at = q => P2S\(x \+ mm\(q\.x-b\.loX\), top \+ mm\(q\.y-b\.loY\)\);/);
  assert.match(html, /const paperPoint = q => \[x \+ mm\(q\.x-b\.loX\), top \+ mm\(q\.y-b\.loY\)\];/);
  assert.doesNotMatch(html, /const at = q => P2S\(x \+ mm\(q\.x-b\.loX\), base - mm\(q\.y-b\.loY\)\);/);
  // The item painter only consumes the plan data; buildings and neighbouring runs are never
  // traversed while a plan page is painted.
  const start = html.indexOf('function paintPlan('), end = html.indexOf('function paintSheet(){', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(html.slice(start, end), /state\.builds|state\.polys\.forEach/);
});

test('the item plan keeps XY bends, stations, gate flags and angles', () => {
  const start = html.indexOf('function sheetPlanGeometry(');
  const end = html.indexOf('/* One plan/elevation pair per item', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    Math, FENCE_JOIN_TOL:1e-4,
    state:{mat:{}},
  };
  const helpers = `
    const segLen=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
    const segsOf=pl=>{const n=pl.closed?pl.pts.length:pl.pts.length-1;
      return Array.from({length:n},(_,i)=>[i,pl.pts[i],pl.pts[(i+1)%pl.pts.length]]);};
    const postsAlong=(a,b,sp,gate)=>{const L=segLen(a,b),n=gate?1:Math.max(1,Math.ceil(L/sp-1e-9)),o=[];
      for(let k=0;k<=n;k++){const d=gate?L*k:Math.min(L,sp*k),t=L?d/L:0;
        o.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}return o;};
    const materialPostEndFlags=()=>({start:true,end:true});
    const postShapeAt=()=> 'square';
    const postSizeOf=m=>m.postSize??0.1;
    const cornerAngleAt=(pl,k)=>{const V=pl.pts[k],A=pl.pts[k-1],B=pl.pts[k+1];
      const a1=Math.atan2(A.y-V.y,A.x-V.x),a2=Math.atan2(B.y-V.y,B.x-V.x);
      let d=a2-a1;while(d<=-Math.PI)d+=2*Math.PI;while(d>Math.PI)d-=2*Math.PI;
      return {signed:d,degrees:Math.abs(d)*180/Math.PI};};
  `;
  vm.createContext(context);
  vm.runInContext(helpers + html.slice(start, end), context);
  const mat = {spacing:2.4, postSize:0.1};
  const plan = context.sheetPlanGeometry([
    {pts:[{x:0,y:0},{x:3,y:0},{x:3,y:4}],closed:false,mat}
  ], 0);
  assert.deepEqual(Array.from(plan.segments).map(s => +s.len.toFixed(4)), [3,4]);
  assert.deepEqual(Array.from(plan.posts).map(p => [+p.x.toFixed(4),+p.y.toFixed(4)]),
                   [[0,0],[2.4,0],[3,0],[3,2.4],[3,4]]);
  assert.deepEqual(Array.from(plan.segments).map(seg => Array.from(seg.bays).map(b => +b.len.toFixed(4))),
                   [[2.4,0.6],[2.4,1.6]]);
  assert.equal(plan.angles.length, 1);
  assert.equal(+plan.angles[0].degrees.toFixed(4), 90);
  const tenFive = context.sheetPlanGeometry([
    {pts:[{x:0,y:0},{x:10.5,y:0}],closed:false,mat:{...mat, spacing:1.5}}
  ], 0);
  assert.equal(tenFive.segments[0].bays.length, 7);
  assert.deepEqual(Array.from(tenFive.segments[0].bays).map(b => +b.len.toFixed(4)),
                   [1.5,1.5,1.5,1.5,1.5,1.5,1.5]);

  const gate = context.sheetPlanGeometry([
    {pts:[{x:0,y:0,gateAfter:true},{x:1.8,y:0}],closed:false,mat}
  ], 0);
  assert.equal(gate.segments[0].gate, true);
  assert.equal(gate.segments[0].bays.length, 1);
  assert.equal(gate.posts.length, 2);
  // The painter's one-bay rule leaves this whole gate to the segment overall dimension, so it
  // cannot emit a duplicate bay-chain label.
  assert.match(html, /A single bay is already the segment overall/);
});

test('all sheet views use one fixed page header independent of dimensions', () => {
  const start = html.indexOf('function sheetHeaderPosition(');
  const end = html.indexOf('/* A fence\'s plan on the sheet', start);
  assert.ok(start >= 0 && end > start);
  const context = { SHEET:{margin:10} };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  const first = context.sheetHeaderPosition({top:0, x:14, base:140, plan:{bounds:{width:1,height:1}}});
  const second = context.sheetHeaderPosition({top:420, x:900, base:-20, plan:{bounds:{width:99,height:77}}});
  assert.deepEqual({x:first.x,y:first.y}, {x:18,y:18});
  assert.equal(second.x, first.x);
  assert.equal(second.y-first.y, 420);
  assert.match(html, /function paintSheetHeader\(pg\)\{/);
  assert.match(html, /ctx\.fillText\(`\$\{kind\} — \$\{fenceName\(state\.polys\[pg\.i\], pg\.i\)\}  1:\$\{pg\.den\}`/);
  assert.match(html, /else paintElevation\(pg, u, k\);\s*\n\s*paintSheetHeader\(pg\);/);
  assert.doesNotMatch(html, /function sheetPlanHeader|function sheetNotIncluded/);
  const planPaint = html.slice(html.indexOf('function paintPlan('), html.indexOf('function paintSheet(){'));
  const elevationPaint = html.slice(html.indexOf('function paintElevation('), html.indexOf('function paintSection('));
  const sectionPaint = html.slice(html.indexOf('function paintSection('), html.indexOf('/* ---- orientation cube'));
  assert.doesNotMatch(planPaint, /Plan —|notIncluded|sheetHeader/);
  assert.doesNotMatch(elevationPaint, /Elevation —|notIncluded|sheetHeader/);
  assert.doesNotMatch(sectionPaint, /Section —|notIncluded|sheetHeader/);
});

test('the sheet draws dimensions with the same renderer as the plan and 3D', () => {
  // dimAt/dimChain take a projector, so one implementation serves the scene and the paper
  assert.match(html, /function dimAt\(to, p, q, txt, off, avoid, k = 1, force = false\)\{/);
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
  assert.match(html, /ctx\.fillText\('CORNER FOLD', b\.x, b\.y-1\.5\*view\.s\);/);
  // posts at 0, 2.4, 3 (the fold), 5.4, 7 — the junction counted once
  // Array.from: the vm realm's arrays are structurally equal but not reference-equal
  assert.deepEqual(Array.from(bent.stations), [0, 2.4, 3, 5.4, 7]);
  assert.equal(bent.parts.filter(p => p.k === 'post').length, 5);
  // rails span bays, never the whole run
  const rails = bent.parts.filter(p => p.k === 'rail');
  assert.ok(rails.length > 0 && rails.every(r => r.w <= 2.4 + 1e-9));
  assert.equal(+bent.fenceHeight.toFixed(6), 1.2);

  const capped = context.elevationParts(
    [{ pts:[{x:0,y:0},{x:4,y:0}], closed:false, mat:{...mat, handrail:true} }], 0);
  const cap = capped.parts.find(p => p.k === 'cap');
  assert.ok(cap, 'enabled handrail should be part of the drawing');
  assert.equal(+cap.x.toFixed(4), -0.05);
  assert.equal(+cap.w.toFixed(4), 4.1);
  assert.equal(+cap.h.toFixed(4), 0.045);

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

test('the drawing reads the BOM exclusions', () => {
  const start = html.indexOf('function elevationParts(');
  const end = html.indexOf('// Midpoint offset to a chosen side', start);
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
  const rail = { style:'rail', spacing:2.4, rails:2, railW:0.15, railGap:0.15, botOff:0.15,
                 height:1.8, postDepth:0.6, paling:0.1, gap:0.005 };
  const paling = { ...rail, style:'paling' };
  const run = (extra, mat) => context.elevationParts(
    [{ pts:[{x:0,y:0},{x:5,y:0}], closed:false, mat, ...extra }], 0);

  // rails a take-off does not buy are still built, so they are drawn — as reference
  const noRails = run({ excludeRails:true }, rail);
  assert.ok(noRails.parts.filter(p => p.k === 'rail').every(p => p.off));
  assert.ok(noRails.parts.filter(p => p.k === 'post').every(p => !p.off));
  assert.deepEqual(Array.from(noRails.notIncluded), ['rails not included in BOM']);

  const noBoards = run({ excludePalings:true }, paling);
  assert.ok(noBoards.parts.filter(p => p.k === 'board').every(p => p.off));
  assert.deepEqual(Array.from(noBoards.notIncluded), ['palings not included in BOM']);

  // a rail fence has no palings to leave out, matching the take-off's own note
  assert.deepEqual(Array.from(run({ excludePalings:true }, rail).notIncluded), []);

  // the whole fence out: every part reference, one note
  const none = run({ excludeMaterials:true }, rail);
  assert.ok(none.parts.every(p => p.k === 'corner' || p.off));
  assert.deepEqual(Array.from(none.notIncluded), ['fence not included in BOM']);

  // a gate leaf's body follows whichever exclusion clads it
  const gate = extra => context.elevationParts(
    [{ pts:[{x:0,y:0,gateAfter:true},{x:1.5,y:0}], closed:false, mat:paling, ...extra }], 0)
    .parts.find(p => p.k === 'gate');
  assert.equal(gate({ excludePalings:true }).off, true);
  assert.equal(gate({ excludeRails:true }).off, false);
  assert.equal(gate({ excludeRails:true }).railsOff, true);

  // and the shared page header says it, in the take-off's words, for every view kind
  assert.match(html, /if \(pg\.ev && pg\.ev\.notIncluded\.length\)\{/);
  assert.match(html, /ctx\.fillText\('Dashed: ' \+ pg\.ev\.notIncluded\.join\(' · '\), note\.x, note\.y\);/);
  assert.match(html, /ctx\.fillStyle = off \? '#ffffff' : fill;/);
  assert.match(html, /if \(off\) ctx\.setLineDash\(\[3,2\]\);/);
});

test('enabled handrail is visible in plan, elevation and section', () => {
  assert.match(html, /function sheetPlanHandrail\(seg, at, plan\)\{/);
  assert.match(html, /no construction centreline can show through the solid handrail/);
  assert.match(html, /function sheetPlanHandrailDimension\(plan, u, paperPoint, toScreen, scale\)\{/);
  assert.match(html, /sheetPlanHandrailDimension\(plan, u, paperPoint, toScreen, scale\);/);
  assert.match(html, /fmtSmall\(hr\.w, u\)/);
  assert.match(html, /paperPoint\(inside\), scale, true\);/);
  assert.match(html, /function sheetPlanPostUnderHandrail\(p, plan\)\{/);
  assert.match(html, /if \(off \|\| covered\) ctx\.setLineDash\(\[3,2\]\);/);
  assert.match(html, /if \(!covered\) ctx\.fill\(\);/);
  assert.match(html, /if \(seg\.gate \|\| !hrOf\(plan\.mat\)\.on\)\{/);
  assert.match(html, /A handrail is the visible top surface/);
  assert.match(html, /if \(seg\.gate \|\| !hrOf\(plan\.mat\)\.on/);
  assert.match(html, /for \(const p of ev\.parts\.filter\(part => part\.k === 'cap'\)\)/);
  assert.match(html, /The handrail sits on the post tops/);
  assert.match(html, /As in elevation, the cap is on top of the posts/);
  assert.match(html, /force: y >= ev\.fenceHeight-1e-6/);
  assert.match(html, /The handrail thickness is a required construction dimension/);
  assert.match(html, /handrail thickness, then the total ground-to-top height/);
  assert.match(html, /q:at\(ev\.len,ev\.height\), txt:fmtSmall\(hr\.t,u\), force:true/);
  assert.match(html, /at\(ev\.len,ev\.height\), fmtLen\(ev\.height,u\)/);
});

test('the sheet carries the whole section, from the same definition 3D uses', () => {
  // one verticalChainBounds(), called by the 3D chain and by the elevation
  assert.equal(html.match(/function verticalChainBounds\(/g).length, 1);
  assert.match(html, /const bounds = verticalChainBounds\(ev\.mat, ev\.fenceHeight, bay\.gate\);/);
  assert.match(html, /const bounds = verticalChainBounds\(mat, H, station\.gate\);/);
  // a gate-only run is sectioned as a leaf
  assert.match(html, /gateOnly: segsOf\(pl\)\.every\(\(\[, a\]\) => !!a\.gateAfter\)/);
  // board width and gap come off the boards the elevation actually drew
  assert.match(html, /const boards = ev\.parts\.filter\(p => p\.k === 'board'\)\.sort\(\(a2,b2\) => a2\.x-b2\.x\)\.slice\(0,2\);/);
  // the run's own height stands outside whatever the section chain reached
  assert.match(html, /dimAt\(toScreen, at\(win\.hi, 0\), at\(win\.hi, ev\.fenceHeight\)[\s\S]{0,80}?up \+ CHAIN_OFF\*k\*1\.6, inside, k\);/);
});

test('a section is taken through a whole bay, post to post', () => {
  // the representative bay is the widest: a short remainder bay says nothing about the build
  assert.match(html, /function widestBay\(ev\)\{/);
  assert.match(html, /for \(const bay of ev\.bays\)\s*\n\s*if \(bay\.b - bay\.a > span\)\{ span = bay\.b - bay\.a; best = bay; \}/);
  // the window takes in both posts, and the scale has to fit it as well as the height
  assert.match(html, /const win = \{ lo: bay\.a - postW\*0\.75, hi: bay\.b \+ postW\*0\.75 \};/);
  assert.match(html, /tall\*\(1000\/d\) <= room\.h\*0\.84 && wide\*\(1000\/d\) <= room\.w\*0\.78/);
  // it is the elevation cropped to that window, not a second drawing of a post
  assert.match(html, /const clip = p => \(\{ lo: Math\.max\(p\.x, win\.lo\), hi: Math\.min\(p\.x \+ p\.w, win\.hi\) \}\);/);
  // and the span itself is dimensioned under it
  assert.match(html, /dimAt\(toScreen, at\(bay\.a, 0\), at\(bay\.b, 0\), fmtLen\(bay\.b - bay\.a, u\)/);
});

test('a gate bay is sectioned as a gate, even in a run that is mostly fence', () => {
  const start = html.indexOf('function elevationParts(');
  const end = html.indexOf('// Midpoint offset to a chosen side', start);
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
  vm.runInContext(helpers + html.slice(start, end) +
                  html.slice(html.indexOf('function widestBay(ev){'),
                             html.indexOf('function sheetRect(')), context);
  const mat = { style:'rail', spacing:2.4, rails:2, railW:0.15, railGap:0.15, botOff:0.15,
                height:1.8, postDepth:0.6, paling:0.1, gap:0.005 };
  // 2.4 m of fence then a 3.2 m gate: the opening is the widest bay in the run
  const mixed = context.elevationParts(
    [{ pts:[{x:0,y:0},{x:2.4,y:0,gateAfter:true},{x:5.6,y:0}], closed:false, mat }], 0);
  assert.equal(mixed.gateOnly, false);                    // the run is not a gate run
  const bay = context.widestBay(mixed);
  assert.deepEqual({ a:bay.a, b:bay.b, gate:bay.gate }, { a:2.4, b:5.6, gate:true });
  // ...and the leaf really is in that bay, so the section must dimension a leaf
  assert.ok(mixed.parts.some(p => p.k === 'gate' && p.x >= 2.4 && p.x + p.w <= 5.6));

  // a narrow gate leaves an ordinary bay widest, and that one is not a gate
  const narrow = context.elevationParts(
    [{ pts:[{x:0,y:0},{x:2.4,y:0,gateAfter:true},{x:3.4,y:0}], closed:false, mat }], 0);
  assert.equal(context.widestBay(narrow).gate, false);

  // mirroring carries the flag and the span with it
  const flipped = context.elevationParts(
    [{ pts:[{x:5.6,y:0},{x:3.2,y:0,gateAfter:true},{x:0,y:0}], closed:false, mat }], 0);
  assert.equal(flipped.flipped, true);
  const fbay = context.widestBay(flipped);
  assert.deepEqual({ a:+fbay.a.toFixed(4), b:+fbay.b.toFixed(4), gate:fbay.gate },
                   { a:0, b:3.2, gate:true });
});

test('paper gets paper\'s ink, not the screen theme\'s', () => {
  // the halo used to come from the canvas palette, which is near-black in dark mode — so a
  // dark-theme export drew a black outline round every value on a white page
  assert.match(html, /const PAPER_DIM  = \{ ink:'#111827', halo:'#ffffff', haloW:2\.1, mask:true,/);
  assert.match(html, /const SCREEN_DIM = \{ ink:null, halo:null, haloW:5, font:'system-ui' \};/);
  assert.match(html, /const dimInk  = \(\) => dimStyle\.ink  \|\| ACCENT;/);
  assert.match(html, /const dimHalo = \(\) => dimStyle\.halo \|\| C\.halo;/);
  // the sheet paints inside that style, and puts it back afterwards
  assert.match(html, /function paintSheetPage\(pg, u, k\)\{ withPaperDims\(\(\) => paintSheetPageInk\(pg, u, k\)\); \}/);
  assert.match(html, /try \{ return fn\(\); \} finally \{ dimStyle = was; \}/);
  // a cleared box behind the value, not a stroked halo: stroking swells the glyphs
  assert.match(html, /if \(dimStyle\.mask\)\{/);
  assert.match(html, /ctx\.fillRect\(-wide\/2 - 1\.6\*k, lift - 6\.2\*k, wide \+ 3\.2\*k, 12\.4\*k\);/);
  // one drawing face, used to measure as well as to draw, or the fit tests lie
  assert.match(html, /const dimFont = k => `\$\{\(12\*k\)\.toFixed\(2\)\}px \$\{dimStyle\.font\}`;/);
  assert.equal((html.match(/ctx\.font = dimFont\(k\);/g) || []).length, 3);
  assert.doesNotMatch(html, /px system-ui`; ctx\.textAlign/);
  // sized for A4 rather than for a screen
  assert.match(html, /const ANNOT_MM = 3\.1;/);
});
