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
