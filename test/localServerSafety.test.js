import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('local server does not keep legacy unscoped private-data fallbacks', () => {
  const source = fs.readFileSync('src/webServer.js', 'utf8');

  assert.doesNotMatch(source, /StudySession\.find\(\)\.sort/);
  assert.doesNotMatch(source, /JobRecord\.find\(\)\.sort/);
  assert.doesNotMatch(source, /url\.includes\('ai\/interview'\)/);
});
