import test from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit, resetRateLimitBuckets } from '../src/api/rateLimit.js';

function reqFor(ip) {
  return { headers: { 'x-forwarded-for': ip } };
}

test('rate limiter allows normal public API traffic within the window', () => {
  resetRateLimitBuckets();
  const result = checkRateLimit({
    req: reqFor('203.0.113.10'),
    path: 'health',
    method: 'GET',
    now: 1000
  });

  assert.equal(result.allowed, true);
  assert.equal(result.limit, 90);
  assert.equal(result.remaining, 89);
});

test('rate limiter blocks bursts per client, route, and method', () => {
  resetRateLimitBuckets();
  let result;
  for (let index = 0; index < 31; index += 1) {
    result = checkRateLimit({
      req: reqFor('203.0.113.20'),
      path: 'auth/google',
      method: 'POST',
      now: 2000
    });
  }

  assert.equal(result.allowed, false);
  assert.equal(result.limit, 30);
  assert.equal(result.remaining, 0);
});

test('rate limiter resets after the policy window', () => {
  resetRateLimitBuckets();
  for (let index = 0; index < 30; index += 1) {
    checkRateLimit({
      req: reqFor('203.0.113.30'),
      path: 'auth/google',
      method: 'POST',
      now: 3000
    });
  }

  const nextWindow = checkRateLimit({
    req: reqFor('203.0.113.30'),
    path: 'auth/google',
    method: 'POST',
    now: 65_000
  });

  assert.equal(nextWindow.allowed, true);
  assert.equal(nextWindow.remaining, 29);
});
