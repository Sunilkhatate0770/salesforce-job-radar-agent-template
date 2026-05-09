import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('responsive verification tool is available and covers key breakpoints', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['responsive:verify'], 'node src/tools/verifyResponsiveUi.js');

  const script = fs.readFileSync('src/tools/verifyResponsiveUi.js', 'utf8');
  ['mobile-390', 'mobile-430', 'tablet-768', 'tablet-1024', 'desktop-1365', 'desktop-1440'].forEach(name => {
    assert.match(script, new RegExp(name));
  });
  assert.match(script, /mobileBoardStageSelect/);
  assert.match(script, /horizontal overflow detected/);
});
