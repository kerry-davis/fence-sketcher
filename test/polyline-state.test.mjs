import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('splitting a fence preserves its per-fence settings', () => {
  const start = html.indexOf('function deleteSegment(');
  const end = html.indexOf('// Set segment i', start);
  assert.ok(start >= 0 && end > start);

  const context = {};
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);

  const source = {
    pts:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}],
    closed:false,
    mat:{style:'rail',postShape:'round',ends:1,touched:{style:true}},
    name:'North run',
    excludeMaterials:true,
    excludeRails:true,
    excludePalings:true,
    hidden3d:true,
    oneEnd:'end',
  };
  const polys = [source];
  context.deleteSegment(polys, 0, 1);

  assert.equal(polys.length, 2);
  for (const part of polys){
    assert.deepEqual(JSON.parse(JSON.stringify(part.mat)), JSON.parse(JSON.stringify(source.mat)));
    assert.equal(part.name, 'North run');
    assert.equal(part.excludeMaterials, true);
    assert.equal(part.excludeRails, true);
    assert.equal(part.excludePalings, true);
    assert.equal(part.hidden3d, true);
    assert.equal(part.oneEnd, 'end');
  }
  assert.notEqual(polys[0].mat, polys[1].mat);
});
