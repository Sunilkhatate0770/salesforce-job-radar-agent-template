import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyJobStatusOverrides,
  buildJobAnalyticsPayload,
  buildJobListPayload,
  buildJobRadarPayload,
  buildJobStatusUpdate,
  encodeStatusKey
} from '../src/services/jobRadarService.js';

test('job radar service normalizes status update payloads', () => {
  const ignored = buildJobStatusUpdate({
    routeId: 'job-1',
    payload: { status: 'ignored' },
    now: new Date('2026-05-16T00:00:00.000Z')
  });

  assert.equal(ignored.ok, true);
  assert.equal(ignored.status, 'rejected');
  assert.equal(ignored.updatedAt, '2026-05-16T00:00:00.000Z');
  assert.equal(ignored.appliedAt, '');
  assert.equal(ignored.statusKey, encodeStatusKey('job-1'));
  assert.deepEqual(ignored.statusPayload, {
    status: 'rejected',
    updatedAt: '2026-05-16T00:00:00.000Z',
    appliedAt: '',
    rawKey: 'job-1',
    jobId: 'job-1'
  });

  const applied = buildJobStatusUpdate({
    routeId: 'route-id',
    payload: { job_hash: 'hash-1', status: 'applied', updatedAt: '2026-05-16T01:00:00.000Z' }
  });
  assert.equal(applied.appliedAt, '2026-05-16T01:00:00.000Z');
  assert.equal(applied.statusPayload.rawKey, 'hash-1');

  const missing = buildJobStatusUpdate({ routeId: '   ', payload: {} });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'Missing job identifier');
});

test('job radar service applies status overrides from encoded and raw keys', () => {
  const jobs = [
    { job_hash: 'hash-1', id: 'job-1', status: 'new' },
    { id: 'raw-id', status: 'new' }
  ];
  const overrides = {
    [encodeStatusKey('hash-1')]: {
      status: 'applied',
      updatedAt: '2026-05-16T01:00:00.000Z',
      appliedAt: '2026-05-16T01:00:00.000Z'
    },
    'raw-id': {
      status: 'follow_up',
      updatedAt: '2026-05-16T02:00:00.000Z'
    }
  };

  const result = applyJobStatusOverrides(jobs, overrides);

  assert.equal(result[0].status, 'applied');
  assert.equal(result[0].board_status, 'applied');
  assert.equal(result[0].appliedAt, '2026-05-16T01:00:00.000Z');
  assert.equal(result[1].status, 'todo');
  assert.equal(result[1].statusUpdatedAt, '2026-05-16T02:00:00.000Z');
});

test('job radar service builds unified dashboard payloads with source counts', () => {
  const payload = buildJobRadarPayload({
    mongoJobs: [
      {
        _id: 'mongo-1',
        job_hash: 'mongo-hash',
        title: 'Salesforce Developer',
        company: 'Acme',
        matched_skills: ['Apex'],
        missing_skills: ['Data Cloud']
      }
    ],
    tursoJobs: [
      { id: 'turso-1', title: 'LWC Engineer', company: 'Beta', matched_skills: 'LWC' }
    ],
    trackerJobs: [
      { id: 'tracker-1', title: 'Integration Consultant', company: 'Gamma', source: 'Application Tracker' }
    ],
    alertJobs: [
      { id: 'alert-1', title: 'Platform Admin', company: 'Delta', source: 'Supabase Alerts' }
    ],
    statusOverrides: {
      [encodeStatusKey('mongo-hash')]: {
        status: 'applied',
        updatedAt: '2026-05-16T03:00:00.000Z'
      }
    },
    env: {
      MONGODB_URI: 'mongodb://example',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-key',
      TURSO_URL: 'libsql://example',
      TURSO_AUTH_TOKEN: 'token',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_TOKEN: 'token'
    },
    mongoConnected: true,
    mongoCount: 15,
    includeTurso: true
  });

  assert.equal(payload.count, 4);
  assert.deepEqual(payload.sourceCounts, {
    supabaseAlerts: 1,
    applicationTracker: 1,
    turso: 1,
    mongo: 1
  });
  assert.equal(payload.records.find(job => job.job_hash === 'mongo-hash').status, 'applied');
  assert.equal(payload.dbStatus, true);
  assert.equal(payload.storageCapacity, '99% Free');
});

test('job radar service builds analytics with stable aliases', () => {
  const analytics = buildJobAnalyticsPayload([
    {
      skills: 'Apex,LWC',
      matched_skills: ['Apex'],
      missing_skills: 'Data Cloud;Agentforce',
      company: 'Acme'
    },
    {
      matched_skills: 'Apex\nIntegration',
      missing_skills: ['Data Cloud'],
      company: 'Beta'
    }
  ]);

  assert.equal(analytics.totalJobs, 2);
  assert.deepEqual(analytics.topMatched.slice(0, 2), [
    { _id: 'Apex', count: 2 },
    { _id: 'Integration', count: 1 }
  ]);
  assert.deepEqual(analytics.topMissing[0], { _id: 'Data Cloud', count: 2 });
  assert.deepEqual(analytics.matched_skills, analytics.topMatched);
  assert.deepEqual(analytics.matchedSkills, analytics.topMatched);
  assert.deepEqual(analytics.top_companies, analytics.topCompanies);
});

test('job radar service builds filtered list payloads', () => {
  const payload = buildJobListPayload({
    trackerJobs: [
      { id: 'tracker-1', title: 'Salesforce Architect', company: 'Acme', status: 'new' }
    ],
    statusOverrides: {
      'tracker-1': {
        status: 'offer',
        updatedAt: '2026-05-16T04:00:00.000Z'
      }
    },
    includeTurso: false
  });

  assert.equal(payload.success, true);
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].status, 'offer');
});
