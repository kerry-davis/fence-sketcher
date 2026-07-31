import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('totals panel offers selected-fence and all-fence scopes without the old breakdown', () => {
  assert.match(html, /id="showAllTotals"> Show all fence totals/);
  assert.doesNotMatch(html, /id="perFence"/);
  assert.doesNotMatch(html, /Gates and buildings are excluded from materials\./);
  assert.ok(html.indexOf('id="tPosts"') < html.indexOf('id="tLen"'));
  assert.match(html, /if \(tag\) showAllTotals = false;/);
  assert.match(html, /if \(hit && \(hit\.t === 'pt' \|\| hit\.t === 'seg'\)\) showAllTotals = false;/);
});

test('selected totals use one fence entry and the toggle restores the aggregate', () => {
  const start = html.indexOf('function scopeTotals(');
  const end = html.indexOf('// Delete point i', start);
  assert.ok(start >= 0 && end > start);

  const context = {};
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const all = {
    fenceLen: 30,
    posts: 20,
    per: [
      {i:0, len:10, posts:8, gateLengths:[]},
      {i:1, len:20, posts:12, gateLengths:[2.5]},
    ],
  };
  const selected = context.scopeTotals(all, 1, false);
  assert.equal(selected.fenceLen, 20);
  assert.equal(selected.posts, 12);
  assert.deepEqual([...selected.gates], [2.5]);
  assert.strictEqual(context.scopeTotals(all, 1, true), all);
  assert.strictEqual(context.scopeTotals(all, -1, false), all);
});

test('copy summary reports gate leaf materials and follows the totals scope', () => {
  const helperStart = html.indexOf('function copyGateMaterials(');
  const helperEnd = html.indexOf('// copy summary', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const context = {};
  vm.createContext(context);
  vm.runInContext(html.slice(helperStart, helperEnd), context);

  assert.equal(
    context.copyGateMaterials({
      gates:1, gateRails:2, gatePalings:17,
      mat:{style:'paling'}, excludeRails:false, excludePalings:false,
    }),
    'Gate rails 2 · Gate palings 17',
  );
  assert.equal(
    context.copyGateMaterials({
      gates:1, gateRails:0, gatePalings:0,
      mat:{style:'paling'}, excludeRails:true, excludePalings:true,
    }),
    'Gate rails excluded · Gate palings excluded',
  );

  const copyStart = html.indexOf('// copy summary');
  const copy = html.slice(copyStart, html.indexOf('function fallbackCopy', copyStart));
  assert.match(copy, /const t = scopeTotals\(m, sc\.idx, showAllTotals\);/);
  assert.match(copy, /const entries = showAllTotals \|\| !sc\.pl \? m\.per/);
  assert.match(copy, /if \(sc\.pl && !showAllTotals\) L\.push\('Fence: ' \+ fenceName/);
  assert.match(copy, /Gate leaf materials: Rails ' \+ t\.gateRails \+ ' · Palings ' \+ t\.gatePalings/);
});
