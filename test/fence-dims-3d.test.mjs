import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('3D measures the selected fence with the plan\'s own dimension renderer', () => {
  // reusing renderDimension is the point: one dimension style, not two that drift
  assert.match(html, /function drawFenceDims3\(B\)\{/);
  assert.match(html, /renderDimension\(A, Bs, fmtLen\(segLen\(a,b\), u\),/);
  assert.match(html, /renderDimension\(foot, head, fmtLen\(H, u\)/);
  assert.doesNotMatch(html, /function drawDimension3|dimArrow3/);   // no second implementation
  // only a selected fence measures itself, and never a hidden one
  assert.match(html, /const selectedFence3 = \(\) =>\s*\n?\s*sel && \(sel\.t === 'seg' \|\| sel\.t === 'pt'\) \? state\.polys\[sel\.p\] : null;/);
  assert.match(html, /if \(!pl \|\| pl\.hidden3d \|\| !pl\.pts\.length\) return;/);
  // drawn under the labels so a badge is never buried by a witness line
  assert.match(html, /drawFenceDims3\(B\);[^\n]*\n\s*drawFenceLabels3\(B\);/);
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
