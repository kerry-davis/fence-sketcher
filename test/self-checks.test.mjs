import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

// The page carries ~120 assertions in its own selfTest() block, which until now only ever
// ran in a browser — a broken one sat unnoticed for a week. Run it here: stub the three
// globals the script touches before selfTest(), then let it hit the DOM section and stop.
// Whatever selfTest() reported has already been logged by then.
test('the page self-checks pass', () => {
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  const logged = [];
  const record = (...args) => logged.push(args.join(' '));
  const context = {
    console: { log:record, error:record, warn:record },
    location: { pathname:'/', href:'http://localhost/', search:'' },
    localStorage: { getItem:() => null, setItem(){}, removeItem(){} },
    matchMedia: () => ({ matches:false, addEventListener(){} }),
  };
  context.window = context;
  vm.createContext(context);
  try {
    vm.runInContext(script, context);
  } catch (error) {
    // expected: the script reaches document.getElementById once the pure section is done
    assert.match(error.message, /document is not defined/,
                 `self-checks stopped early: ${error.message}`);
  }
  const failures = logged.filter(line => line.includes('SELFTEST FAIL'));
  assert.deepEqual(failures, [], 'self-check failures');
  assert.ok(logged.some(line => line.includes('self-checks passed')),
            `selfTest() never reported: ${logged.join(' | ')}`);
});
