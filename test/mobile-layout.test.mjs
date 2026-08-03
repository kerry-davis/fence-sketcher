import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');
const PHONE_MQ = '(max-width:600px),(max-height:560px) and (max-width:1000px)';

test('the phone breakpoint is one definition, not two that drift apart', () => {
  assert.ok(html.includes(`@media ${PHONE_MQ}{`), 'CSS uses the shared breakpoint');
  assert.ok(html.includes(`const PHONE_MQ = '${PHONE_MQ}'`), 'JS uses the shared breakpoint');
});

test('a phone gives the drawing the screen and the panels a sheet', () => {
  assert.match(html, /aside\{position:fixed;left:0;right:0;bottom:0/);
  assert.match(html, /transform:translateY\(calc\(100% - var\(--peek\)\)\)/);
  assert.match(html, /body\.sheet aside\{transform:translateY\(0\)\}/);
  assert.match(html, /#wrap\{height:auto;flex:1/);
  // the sheet must never hide the drawing's own furniture behind it
  assert.match(html, /main\{padding:0 0 var\(--peek\)/);
});

test('the sheet can be dismissed without editing the drawing underneath', () => {
  assert.match(html, /if \(!sheetOpen\(\) \|\| e\.target\.closest\('#panels'\)\) return;\s*\n\s*setSheet\(false\); e\.preventDefault\(\); e\.stopPropagation\(\);/);
  assert.match(html, /if \(sheetOpen\(\)\)\{ setSheet\(false\); return; \}/);
});

test('canvas guidance shrinks to phone length rather than being truncated', () => {
  assert.match(html, /const phone = onPhone\(\);/);
  assert.match(html, /phone \? 'Tap to add posts · double-tap to finish'/);
  assert.match(html, /if \(onPhone\(\)\) hintTimer = setTimeout\(\(\) => el\.classList\.add\('fade'\), HINT_FADE_MS\)/);
  // a redraw must not keep restarting the fade timer
  assert.match(html, /if \(el\.textContent === text\) return;/);
  assert.match(html, /matchMedia\(PHONE_MQ\)\.addEventListener\('change'/);
});

test('one delete affordance, and 3D is never buried in the More menu', () => {
  assert.doesNotMatch(html, /bDelSel/);                 // the canvas ✕ is the delete
  assert.match(html, /fdel\.addEventListener\('click', deleteSelected\)/);
  // #b3d must sit outside .grp.sec, which the phone toolbar collapses
  const bar = html.slice(html.indexOf('<div id="bar">'), html.indexOf('<main>'));
  const group = bar.slice(bar.lastIndexOf('<div', bar.indexOf('id="b3d"')), bar.indexOf('id="b3d"'));
  assert.doesNotMatch(group, /class="grp sec/);
});

test('3D controls cannot grow into each other on a phone', () => {
  // orbit is a fixed-height row off the top, zoom a column off the bottom: a short
  // landscape canvas cannot squeeze them together
  assert.match(html, /#orbitctl\{left:auto;right:8px;top:48px;bottom:auto;transform:none;flex-direction:row/);
  assert.match(html, /#zoomctl\{right:8px;bottom:8px\}/);
});

test('3D is inspection-only — no path deletes from it', () => {
  assert.match(html, /function deleteSelected\(\)\{\s*\n\s*if \(readOnly\) return;[\s\S]{0,220}?\n\s*if \(mode3d\) return;/);
});

test('the peek line says what is behind it', () => {
  assert.match(html, /updateSheetSummary\(t, sc\);/);
  assert.match(html, /sc\.pl\s*\n?\s*\? fenceName\(sc\.pl, sc\.idx\) \+ ' · tap for its settings'/);
});
