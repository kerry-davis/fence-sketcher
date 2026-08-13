import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('rail position exposes face-mounted and between-post choices', () => {
  for (const [value,label] of [
    ['left','Left of line'],['right','Right of line'],
    ['inside-left','Between posts — left'],['inside-middle','Between posts — centre'],
    ['inside-right','Between posts — right'],
  ]) {
    assert.match(html, new RegExp(`<option value="${value}">${label}`));
  }
  assert.match(html, /M\.railSide = RAIL_POSITIONS\.has\(e\.target\.value\) \? e\.target\.value : 'left'/);
  assert.match(html, /\$\('iRailSide'\)\.value = railPositionOf\(M\)/);
  assert.match(html, /if \(between\) pushRailPrism\(F,rail\.polygon,ry,mat\.railW,WOOD\.rail\)/);
  assert.match(html, /else pushBox\(F, mid\.x, ry, mid\.y, rail\.len\/2/);
  assert.match(html, /railFootprints\.push\(\{points:rail\.polygon\}\)/);
  assert.match(html, /railFootprints\.push\(\{points:\[move\(bay\.a,off-half\),move\(bay\.b,off-half\),/);

  const start = html.indexOf('const RAIL_POSITIONS');
  const end = html.indexOf('// Gate hardware', start);
  const context = {Math, postTOf:m=>m.postT, postSizeOf:m=>m.postSize,
    postShapeOf:m=>m.postShape||'square',railTOf:m=>m.railT};
  vm.createContext(context);
  vm.runInContext(html.slice(start,end) +
    ';this.railFns={railPositionOf,railSideLabel,railLateralOffset};',context);
  const {railPositionOf,railSideLabel,railLateralOffset}=context.railFns;
  assert.equal(railPositionOf({railSide:'inside-middle'}),'inside-middle');
  assert.equal(railPositionOf({railSide:'old-value'}),'left');
  assert.equal(railSideLabel({railSide:'inside-right'}),'Between posts — right');
  assert.equal(+railLateralOffset({railSide:'inside-left',postT:.2,railT:.08}).toFixed(4),.06);
  assert.equal(railLateralOffset({railSide:'inside-middle',postT:.2,railT:.08}),0);
  assert.equal(+railLateralOffset({railSide:'inside-right',postT:.2,railT:.08}).toFixed(4),-.06);
});

test('face-mounted left and right retain their original offsets', () => {
  const start = html.indexOf('function segmentSideMid(');
  const end = html.indexOf('// Extend an outer rail bay', start);
  const context = {Math,segLen:(a,b)=>Math.hypot(b.x-a.x,b.y-a.y)};
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);
  assert.deepEqual({...context.segmentSideMid({x:0,y:0},{x:10,y:0},.1,'left')},{x:5,y:.1});
  assert.deepEqual({...context.segmentSideMid({x:0,y:0},{x:10,y:0},.1,'right')},{x:5,y:-.1});
});

test('between-post geometry cuts against actual square and round post faces', () => {
  const normStart=html.indexOf('const norm2 =');
  const normEnd=html.indexOf('function elevationParts(',normStart);
  const geoStart=html.indexOf('function postAngleAt(');
  const geoEnd=html.indexOf('// Gate leaf endpoints',geoStart);
  const segLen=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  const context={Math,FENCE_JOIN_TOL:.01,segLen,
    segsOf:pl=>pl.pts.slice(0,-1).map((a,i)=>[i,a,pl.pts[i+1]]),
    postSizeOf:m=>m.postSize,postTOf:m=>m.postT,railTOf:m=>m.railT,
    postShapeAt:(polys,q,m)=>m.postShape||'square',
    railLateralOffset:m=>m.railSide==='inside-left'?(m.postT-m.railT)/2:
      m.railSide==='inside-right'?-(m.postT-m.railT)/2:0,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(normStart,normEnd),context);
  vm.runInContext(html.slice(geoStart,geoEnd),context);
  const V={x:3,y:0}, square={railSide:'inside-middle',postSize:.3,postT:.2,railT:.08};
  const rightAngle=[{pts:[{x:0,y:0},V,{x:3,y:3}],closed:false}];
  const incoming=context.betweenRailGeometry(rightAngle,square,rightAngle[0].pts[0],V);
  const outgoing=context.betweenRailGeometry(rightAngle,square,V,rightAngle[0].pts[2]);
  assert.equal(+incoming.cutLength.toFixed(4),2.7);
  assert.equal(+outgoing.cutLength.toFixed(4),2.75);
  assert.equal(+incoming.endMitre.toFixed(4),0);
  assert.equal(+outgoing.startMitre.toFixed(4),0);

  const radians=50*Math.PI/180, C={x:V.x+3*Math.cos(radians),y:V.y+3*Math.sin(radians)};
  const angled=[{pts:[{x:0,y:0},V,C],closed:false}];
  const mitred=context.betweenRailGeometry(angled,square,V,C);
  assert.equal(+mitred.startMitre.toFixed(1),40);
  assert.equal(+mitred.endMitre.toFixed(4),0);
  context.setPostOrientationAt(angled,V,'bisect');
  const thinSquare={...square,railT:.04};
  const bisectedIn=context.betweenRailGeometry(angled,thinSquare,angled[0].pts[0],V);
  const bisectedOut=context.betweenRailGeometry(angled,thinSquare,V,C);
  assert.equal(+bisectedIn.endMitre.toFixed(1),25);
  assert.equal(+bisectedOut.startMitre.toFixed(1),25);
  delete V.postOrient;

  const setbackStart=html.indexOf('function sheetCornerSetout(');
  const setbackEnd=html.indexOf('function sheetCornerNote(',setbackStart);
  vm.runInContext(html.slice(setbackStart,setbackEnd),context);
  // Audit the 131.2° production corner using its saved point order, actual 100 mm post and
  // 40 mm rail. The incoming end is a square/flush butt. The usable outgoing set-out is
  // 31.21 mm along the physical post face from its lower corner to the rail's long point.
  const P={x:11.758139927680501,y:4.371801197587507};
  const K={x:16.500000015697236,y:9.789804787995502};
  const Q={x:18.30000000049914,y:9.790038696418652};
  const productionMat={railSide:'inside-right',postSize:.1,postT:.1,railT:.04};
  const production=[{pts:[Q,K,P],closed:false}];
  const productionIn=context.betweenRailGeometry(production,productionMat,Q,K);
  const productionOut=context.betweenRailGeometry(production,productionMat,K,P);
  assert.equal(context.sheetCornerSetout(productionIn,'end'),null);
  const auditedSetout=context.sheetCornerSetout(productionOut,'start');
  assert.ok(Math.abs(auditedSetout.distance-.031206)<.000002,
            `audited set-out ${auditedSetout.distance}`);
  assert.ok(auditedSetout.corner.y>productionOut.start[0].faceEnds[1].y);

  const round={...square,postShape:'round'};
  const roundRail=context.betweenRailGeometry(angled,round,V,C);
  assert.equal(+roundRail.startMitre.toFixed(4),0);
  assert.equal(+roundRail.endMitre.toFixed(4),0);
});

test('gates preserve an independent side when rail position changes', () => {
  assert.match(html, /const side = typeof gateSideOf === 'function' \? gateSideOf\(a,mat\) : 'left'/);
  assert.match(html, /migrateGateSides\(state\.polys,state\.mat\)/);
  assert.match(html, /pt\.gateSideAfter = legacyGateSide\(pl0\.mat \|\| state\.mat\)/);
  assert.match(html, /if \(src\.s === 'left'\) q\.gateSideAfter = 'right'/);
  assert.match(html, /else if \(src\.s === 'right'\) q\.gateSideAfter = 'left'/);
});

test('between-post corner sheets keep fence rails beside gate breaks', () => {
  const start=html.indexOf('const CORNER_MAX_DEG');
  const end=html.indexOf('function elevationParts(',start);
  const segLen=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  const postsAlong=(a,b,spacing)=>{
    const L=segLen(a,b),n=Math.max(1,Math.ceil(L/spacing-1e-9)),out=[];
    for(let k=0;k<=n;k++){const d=Math.min(L,spacing*k),t=L?d/L:0;
      out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    return out;
  };
  const context={Math,state:{mat:{}},segLen,postsAlong,
    railBetweenPosts:m=>m.railSide.startsWith('inside-'),railPositionOf:m=>m.railSide,
    railSideOf:()=> 'left',railTOf:()=>.08,postTOf:()=>.2,postSizeOf:()=>.3,
    postShapeAt:()=> 'square',postAngleAt:()=>0};
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const mat={railSide:'inside-middle',spacing:2.4};
  const oneGate=[{pts:[{x:0,y:0,gateAfter:true},{x:2,y:0},{x:2,y:3}],closed:false,mat}];
  const details=context.fenceCorners(oneGate,0);
  assert.equal(details.length,1);
  assert.equal(details[0].pIn,null);
  assert.deepEqual({...details[0].pOut},{x:2,y:2.4});
  oneGate[0].pts[1].gateAfter=true;
  assert.equal(context.fenceCorners(oneGate,0).length,0);
  assert.match(html,/if \(c\.between\) paintBetweenCornerDetail\(c, cx, cy, pg\.k, u, k\)/);
  assert.match(html,/const incoming=c\.pIn \? betweenRailGeometry\(c\.polys,c\.mat,c\.pIn,c\.v,\{startPost:c\.pInPost\}\) : null/);
  assert.match(html,/if \(saw>=0\.05\) lines\.push\(`mitre \$\{\+saw\.toFixed\(1\)\}°`\);/);
  assert.match(html,/const setout=sheetCornerSetout\(g,atCorner\);/);
  assert.match(html,/lines\.push\(`long point \$\{fmtSmall\(setout\.distance,u\)\} from bottom post corner`\);/);
  assert.match(html,/sheetCornerNote\(at,lines,/);
});
