import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { privateRouteProbes, publicRouteProbes } from '../src/tools/verifyApiHealth.js';

test('API health verification script is registered', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['api:verify'], 'node src/tools/verifyApiHealth.js');
});

test('API health verification covers public and private route expectations', () => {
  assert.deepEqual(
    publicRouteProbes.map(probe => `${probe.method} ${probe.path}`),
    ['GET /api/health', 'GET /api/code-practice/challenges']
  );

  const privateRoutes = privateRouteProbes.map(probe => `${probe.method} ${probe.path}`);
  [
    'GET /api/jobs',
    'GET /api/jobs/analytics',
    'GET /api/jobs/list',
    'GET /api/profile/data',
    'GET /api/study/history',
    'GET /api/study/stats',
    'GET /api/study/tasks',
    'POST /api/jobs/scan',
    'POST /api/profile/save',
    'PATCH /api/jobs/api-health-probe/status'
  ].forEach(route => assert.ok(privateRoutes.includes(route), `Missing probe for ${route}`));
});
