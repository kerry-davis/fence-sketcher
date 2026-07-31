import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fence-fable.html', import.meta.url), 'utf8');

test('the inline app script parses before the browser loads it', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length);
  scripts.forEach((match, i) => {
    assert.doesNotThrow(
      () => new vm.Script(match[1], {filename:`fence-fable-inline-${i+1}.js`}),
      `inline script ${i+1}`,
    );
  });
});
