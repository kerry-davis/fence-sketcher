import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('3D measures the selected fence with the plan\'s own dimension renderer', () => {
  // reusing renderDimension is the point: one dimension style, not two that drift
  assert.match(html, /function drawFenceDims3\(B\)\{/);
  assert.match(html, /renderDimension\(A, Bs, txt, off \* dimSide3\(A, Bs, away\)\);/);
  assert.doesNotMatch(html, /function drawDimension3|dimArrow3/);   // no second implementation
  // only a selected fence measures itself, and never a hidden one
  assert.match(html, /const selectedFence3 = \(\) =>\s*\n?\s*sel && \(sel\.t === 'seg' \|\| sel\.t === 'pt'\) \? state\.polys\[sel\.p\] : null;/);
  assert.match(html, /if \(!pl \|\| pl\.hidden3d \|\| !pl\.pts\.length\) return;/);
  // drawn under the labels so a badge is never buried by a witness line
  assert.match(html, /drawFenceDims3\(B\);[^\n]*\n\s*drawFenceLabels3\(B\);/);
});

test('3D measures every part of the fence, not just its outline', () => {
  // post spacing: the bays the posts actually make, from the same helper the scene builds with
  assert.match(html, /const posts = postsAlong\(a, b, spacing, !!a\.gateAfter\);/);
  assert.match(html, /txt: fmtLen\(segLen\(q, posts\[k\+1\]\), u\) \}\)\) : \[\];/);
  // rail spacing: a chain of the drawn rail edges, so the ground gap, each rail and each
  // gap between them all read off — the cap continues the same chain
  assert.match(html, /for \(const ry of railYs\(mat\)\)\{\s*\n\s*if \(ry \+ mat\.railW\/2 > H \+ 1e-6\) break;\s*\n\s*bounds\.push\(ry - mat\.railW\/2, ry \+ mat\.railW\/2\);/);
  assert.match(html, /if \(hr\.on && !station\.gate\) bounds\.push\(H \+ hr\.t\);/);
  // taken at mid-span of the run facing the camera, not at an end post
  assert.match(html, /const m = \{ x:\(a\.x\+b\.x\)\/2, y:\(a\.y\+b\.y\)\/2 \};/);
  assert.match(html, /station = \{ m, z:c\[2\], gate \};/);
  assert.match(html, /const at = y => \[station\.m\.x, y, station\.m\.y\];/);
  assert.match(html, /txt: fmtSmall\(bounds\[k\+1\]-y, u\) \}\] : \[\]\) : \[\];/);
  assert.match(html, /bounds\[k\+1\] - y > 1e-6/);   // never a zero-length rung
  // paling width and gap, matching build3's half-gap start
  assert.match(html, /const s = mat\.gap\/2;/);
  assert.match(html, /txt:fmtSmall\(mat\.paling, u\)/);
  assert.match(html, /txt:fmtSmall\(mat\.gap, u\)/);
  // the whole run and height stand clear of however far the chain reached
  assert.match(html, /dim3\(B, \[a\.x,0,a\.y\], \[b\.x,0,b\.y\], fmtLen\(L, u\), reach \+ CHAIN_OFF\*1\.6, overTop\);/);
  assert.match(html, /dim3\(B, at\(0\), at\(H\), fmtLen\(H, u\), reach \+ CHAIN_OFF\*1\.6, keepOff\);/);
});

test('a gate is measured as the leaf that was built, not as a fence panel', () => {
  // one definition of the leaf's vertical build, used to push it and to dimension it
  assert.match(html, /function gateLeafBuild\(H, mat\)\{/);
  assert.match(html, /const built = gateLeafBuild\(H, mat\), bottom = built\.bottom, leafH = built\.leafH;/);
  assert.match(html, /for \(const ry of built\.rails\)\s*\n\s*pushBox\(F,mid\.x,ry,mid\.y,leaf\.len\/2,mat\.railW\/2/);
  assert.doesNotMatch(html, /bottom\+leafH\*0\.28,bottom\+leafH\*0\.72/);   // no second copy
  // the chain: ground clearance, then the leaf's own rails
  assert.match(html, /if \(station\.gate\)\{\s*\n\s*const leaf = gateLeafBuild\(H, mat\);\s*\n\s*bounds\.push\(leaf\.bottom\);/);
  // a panel is preferred as the station; a gate-only run has nothing else
  assert.match(html, /if \(!station \|\| \(station\.gate && !gate\) \|\| \(station\.gate === gate && c\[2\] < station\.z\)\)/);
});

test('a tight chain staggers into columns instead of dropping its small values', () => {
  // 150 mm rail gaps against a 45 mm label: one row would overlap, so the chain widens
  assert.match(html, /const cols = Math\.max\(1, Math\.min\(3, Math\.ceil\(widest \/ tightest\)\)\);/);
  assert.match(html, /CHAIN_OFF \* \(1 \+ \(k % cols\)\*COL_STEP\) \* dimSide3\(d\.A, d\.Bs, away\)\)\);/);
  // a chain step only needs room for its arrows; a lone dimension must fit its own value
  assert.match(html, /if \(span >= MIN_CHAIN_PX\) drawn\.push/);
  assert.match(html, /Math\.hypot\(Bs\.x-A\.x, Bs\.y-A\.y\) < Math\.max\(MIN_DIM_PX, ctx\.measureText\(txt\)\.width \+ 10\)\) return;/);
  // and the chain reports its reach so nothing lands on top of it
  assert.match(html, /return CHAIN_OFF \* \(1 \+ \(cols-1\)\*COL_STEP\);/);
});

test('the 3D sizes toggle is on by default, persisted, and on the canvas', () => {
  assert.match(html, /const DIMS3_KEY = 'fenceFable\.3dDims';\s*\nlet showFenceDims3 = true;/);
  assert.match(html, /showFenceDims3 = localStorage\.getItem\(DIMS3_KEY\) !== 'off'/);
  assert.match(html, /localStorage\.setItem\(DIMS3_KEY, showFenceDims3 \? 'on' : 'off'\)/);
  // a chip beside Fence labels — visible on a phone, not folded into a menu
  assert.match(html, /<label class="chk" id="dim3ctl"/);
  assert.match(html, /<input type="checkbox" id="c3dDims" checked>/);
  assert.match(html, /body\.d3 #dim3ctl\{display:inline-flex\}/);
  const menu = html.slice(html.indexOf('<div id="bkMenuPanel"'), html.indexOf('</details>'));
  assert.doesNotMatch(menu, /c3dDims/);
  // the phone rule keeps both chips reachable at the top right
  assert.match(html, /#view3ctl\{top:8px;right:8px;max-width:60%\}/);
});
