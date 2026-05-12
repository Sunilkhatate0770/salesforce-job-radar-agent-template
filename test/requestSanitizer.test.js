import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonBody, sanitizeApiBody } from '../src/api/requestSanitizer.js';

test('request sanitizer removes prototype pollution keys', () => {
  const sanitized = parseJsonBody('{"safe":"ok","__proto__":{"polluted":true},"nested":{"constructor":{"bad":true},"value":"kept"}}');

  assert.deepEqual(Object.keys(sanitized), ['safe', 'nested']);
  assert.equal(sanitized.safe, 'ok');
  assert.equal(sanitized.nested.value, 'kept');
  assert.equal(Object.hasOwn(sanitized.nested, 'constructor'), false);
  assert.equal({}.polluted, undefined);
});

test('request sanitizer preserves code-shaped text while removing control characters', () => {
  const source = "function demo() {\n  return 'ok';\u0000\n}";
  const sanitized = sanitizeApiBody({ files: [{ name: 'script.js', content: source }] });

  assert.equal(sanitized.files[0].content.includes('\n  return'), true);
  assert.equal(sanitized.files[0].content.includes('\u0000'), false);
});

test('request sanitizer caps extreme arrays and strings', () => {
  const sanitized = sanitizeApiBody({
    items: Array.from({ length: 1_100 }, (_, index) => index),
    text: 'x'.repeat(250_000)
  });

  assert.equal(sanitized.items.length, 1_000);
  assert.equal(sanitized.text.length, 200_000);
});
