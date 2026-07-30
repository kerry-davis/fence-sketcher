import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('shared views hide and guard the floating delete control', () => {
  assert.match(html, /id="fdel" class="editorOnly"/);
  assert.match(html, /function deleteSelected\(\)\{\s+if \(readOnly\) return;/);
});

test('shared drawing geometry and materials are frozen after loading', () => {
  assert.match(html, /applyState\(value\.snapshot\);\s+freezeTree\(state\.polys\);\s+freezeTree\(state\.builds\);\s+freezeTree\(state\.mat\);/);
});

test('hidden fences stay identifiable in plan while being omitted from 3D', () => {
  assert.match(html, /id="fenceVisible" checked> Show this fence in 3D/);
  assert.match(html, /ctx\.setLineDash\(pl\.hidden3d \? \[2,5\]/);
  assert.match(html, /const visiblePolys = state\.polys\.filter\(pl => !pl\.hidden3d\)/);
});

test('share management exposes explicit link removal confirmation', () => {
  assert.match(html, /id="shareStop"[^>]*>Remove public link<\/button>/);
  assert.match(html, /id="shareStopPanel" hidden/);
  assert.match(html, /id="shareStopConfirm">Remove link<\/button>/);
  assert.doesNotMatch(html, /dataset\.armed|shareRevokeTimer/);
});

test('files menu lists and manages every active shared drawing', () => {
  assert.match(html, /id="bkShares" class="bkShares" hidden/);
  assert.match(html, /id="bkSharesTitle">Shared drawings<\/span>/);
  for (const action of ['open', 'copy', 'manage'])
    assert.match(html, new RegExp(`data-share-action="${action}"`));
  assert.match(html, /bkRequest\('shares', \{cache:'no-store'\}/);
  assert.match(html, /async function openShareDialog\(source=bkCurrent\)/);
  assert.match(html, /shareSource !== bkCurrent/);
});
