import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('code practice lab includes user-created single-file practice support', () => {
  const source = fs.readFileSync('code-practice.js', 'utf8');
  [
    'create-single-file',
    'delete-custom-challenge',
    'html-single',
    'js-single',
    'apex-single',
    'apex-trigger-single',
    'custom-single-files',
    'sfjr:${getPracticeUserId()}:code-practice'
  ].forEach(fragment => {
    assert.ok(source.includes(fragment), `missing ${fragment}`);
  });
});
