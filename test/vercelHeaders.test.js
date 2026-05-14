import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function getGlobalHeaders() {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  return Object.fromEntries(
    config.headers
      .find(entry => entry.source === '/(.*)')
      .headers
      .map(header => [header.key, header.value])
  );
}

test('Vercel security headers include a compatible CSP', () => {
  const headers = getGlobalHeaders();
  const csp = headers['Content-Security-Policy'];

  assert.ok(csp, 'Content-Security-Policy header is missing');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src[^;]*https:\/\/accounts\.google\.com/);
  assert.match(csp, /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
  assert.match(csp, /img-src[^;]*https:\/\/lh3\.googleusercontent\.com/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
});
