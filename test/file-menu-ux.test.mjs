import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('opening a saved drawing closes the files menu after success', () => {
  assert.match(
    html,
    /setBkCurrent\(name\);\s+closeBkDialog\(\);\s+\$\('bkSec'\)\.open = false;\s+setBkStatus\(`Opened/,
  );
});

test('every successful save confirms itself in a dialog', () => {
  assert.match(html, /setBkStatus\(create \? `Created.*\n\s*openBkDialog\(create \? 'created' : 'saved', name\);/);
  for (const type of ['saved', 'created'])
    assert.match(html, new RegExp(`^\\s*${type}:`, 'm'));
  // acknowledgement dialogs offer one way out, not a misleading Cancel
  assert.match(html, /const acknowledge = type === 'saved' \|\| type === 'created';\s*\n\s*\$\('bkDialogCancel'\)\.style\.display = acknowledge \? 'none' : '';/);
  assert.match(html, /if \(type === 'saved' \|\| type === 'created'\) closeBkDialog\(\);/);
});

test('the menu holds no unbounded list — drawings and shares live in the picker', () => {
  for (const gone of ['bkList', 'bkLoad', 'bkSharesList', 'bkSharesEmpty'])
    assert.doesNotMatch(html, new RegExp(`id="${gone}"`));
  assert.match(html, /<button id="bkOpen">/);
  assert.match(html, /id="bkOpenCount"/);
  assert.match(html, /<dialog id="pickDialog"/);
  assert.match(html, /id="pickSearch"/);
  assert.match(html, /\.pickList\{[^}]*max-height:min\(52vh,340px\);overflow-y:auto/);
});

test('a failed refresh only speaks to the list that is showing', () => {
  assert.match(html, /const setPickMessage = \(text, mode=''\) => \{\s*\n\s*if \(!mode \|\| mode === pickMode\)/);
  assert.match(html, /setPickMessage\(error\.message, 'shares'\)/);
  assert.match(html, /setPickMessage\(e\.message, 'drawings'\)/);
});

test('the picker acts on names, so filtering cannot mis-target a row', () => {
  assert.doesNotMatch(html, /data-share-index|dataset\.shareIndex/);
  assert.match(html, /sharedItems\.find\(share => share\.name === name\)/);
  for (const action of ['open', 'rename', 'delete'])
    assert.match(html, new RegExp(`data-pick="${action}" data-name=`));
});
