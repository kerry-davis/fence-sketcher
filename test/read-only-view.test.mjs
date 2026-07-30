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

test('share management exposes explicit link removal confirmation', () => {
  assert.match(html, /id="shareStop"[^>]*>Remove public link<\/button>/);
  assert.match(html, /id="shareStopPanel" hidden/);
  assert.match(html, /id="shareStopConfirm">Remove link<\/button>/);
  assert.doesNotMatch(html, /dataset\.armed|shareRevokeTimer/);
});
