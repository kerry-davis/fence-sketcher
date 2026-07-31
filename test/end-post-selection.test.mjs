import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('one end uses physical plan labels instead of drawing-order labels', () => {
  const start = html.indexOf('function physicalEndLabels(');
  const end = html.indexOf('// How many of this run', start);
  assert.ok(start >= 0 && end > start);

  const context = {
    endsOf:mat => mat.ends ?? 'auto',
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start,end),context);

  assert.deepEqual(
    {...context.physicalEndLabels({closed:false,pts:[{x:1,y:2},{x:5,y:2}]})},
    {start:'Left end',end:'Right end'},
  );
  assert.deepEqual(
    {...context.physicalEndLabels({closed:false,pts:[{x:1,y:5},{x:1,y:2}]})},
    {start:'Top end',end:'Bottom end'},
  );
  assert.deepEqual(
    {...context.physicalEndLabels({closed:false,pts:[{x:1,y:1},{x:5,y:5}]})},
    {start:'Bottom-left end',end:'Top-right end'},
  );
  assert.deepEqual(
    {...context.physicalEndLabels({closed:false,pts:[{x:1,y:2},{x:1,y:5}]})},
    {start:'Bottom end',end:'Top end'},
  );

  const inherited = {ends:1};
  const pl = {pts:[{x:0,y:0},{x:1,y:0}]};
  context.flipPhysicalOneEnd(pl, inherited);
  assert.equal(pl.oneEnd, 'start');

  const explicit = {ends:'start'};
  const pl2 = {pts:[{x:0,y:0},{x:1,y:0}]};
  context.flipPhysicalOneEnd(pl2, explicit);
  assert.equal(pl2.oneEnd, 'end');
  assert.match(html, /<option value="one">One end<\/option>/);
  assert.match(html, /id="oneEndWrap" style="display:none"/);
  assert.match(html, /<span>Post at<\/span>/);
});
