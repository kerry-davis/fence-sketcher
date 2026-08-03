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

test('the peek line says what is behind it', () => {
  assert.match(html, /updateSheetSummary\(t, sc\);/);
  assert.match(html, /sc\.pl\s*\n?\s*\? fenceName\(sc\.pl, sc\.idx\) \+ ' · tap for its settings'/);
});
