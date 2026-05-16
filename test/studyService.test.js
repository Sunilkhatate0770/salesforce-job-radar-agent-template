import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStudyStats,
  buildStudySummaryHistory,
  getDailySummary,
  mergeCompletedTasks,
  mergeStudyHistory,
  normalizeStudyTaskIndex,
  upsertRetentionTopic
} from '../src/services/studyService.js';

test('study service upserts retention topics without losing existing entries', () => {
  const { topics, retentionTopic } = upsertRetentionTopic(
    [{ topicId: 'apex', topic: 'Apex', confidence: 2 }],
    'apex',
    { confidence: 5, interval: 7, easeFactor: 2.6, nextReview: '2026-05-20T00:00:00.000Z' },
    id => `Topic ${id}`
  );

  assert.equal(topics.length, 1);
  assert.equal(retentionTopic.topic, 'Topic apex');
  assert.equal(retentionTopic.confidence, 5);
  assert.equal(retentionTopic.interval, 7);
  assert.ok(retentionTopic.nextReview instanceof Date);
});

test('study service merges history newest first and calculates stats', () => {
  const merged = mergeStudyHistory(
    [{ topic: 'lwc', duration: 120, startTime: '2026-05-14T10:00:00.000Z' }],
    [{ topic: 'apex', duration: 240, startTime: '2026-05-15T10:00:00.000Z' }]
  );

  assert.equal(merged[0].topic, 'apex');
  assert.deepEqual(buildStudyStats(merged), {
    totalSeconds: 360,
    sessionsCount: 2,
    breakdown: {
      apex: 240,
      lwc: 120
    }
  });
});

test('study service merges completed task ids from both stores', () => {
  assert.deepEqual(
    mergeCompletedTasks({
      tursoProfile: { completedTasks: ['1', 2, 'bad'] },
      mongoTasks: [{ index: 2 }, { index: 3 }]
    }),
    [1, 2, 3]
  );
});

test('study service validates task index input', () => {
  assert.equal(normalizeStudyTaskIndex({ index: '4' }), 4);
  assert.equal(normalizeStudyTaskIndex({ taskId: 7 }), 7);
  assert.equal(normalizeStudyTaskIndex({ index: 'nope' }), null);
});

test('study service builds daily summary from sessions and jobs', () => {
  const history = buildStudySummaryHistory(
    [
      {
        topic: 'agentforce',
        topicName: 'Agentforce',
        duration: 300,
        startTime: '2026-05-15T09:00:00.000Z'
      }
    ],
    [
      {
        title: 'Salesforce Developer',
        company: 'Acme',
        match_score: 88,
        createdAt: '2026-05-15T11:00:00.000Z'
      }
    ],
    { now: '2026-05-15T12:00:00.000Z' }
  );

  const daily = getDailySummary(history, '2026-05-15');
  assert.equal(daily.study.totalSeconds, 300);
  assert.equal(daily.study.sessionsCount, 1);
  assert.deepEqual(daily.study.topicList, [{ id: 'agentforce', name: 'Agentforce', totalSeconds: 300 }]);
  assert.equal(daily.jobs.newCount, 1);
  assert.deepEqual(daily.jobs.topMatches, [{ title: 'Salesforce Developer', company: 'Acme', score: 88 }]);
});
