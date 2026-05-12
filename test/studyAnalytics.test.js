import assert from 'node:assert/strict';
import test from 'node:test';

import '../src/data/studyAnalytics.js';

const analytics = globalThis.SFJR_STUDY_ANALYTICS;

const topicConfig = {
  apex: { name: 'Apex Fundamentals', group: 'Core', recommended: 60 },
  fde: { name: 'FDE Discovery', group: 'FDE Prep', recommended: 45 },
  lwc: { name: 'LWC Core', group: 'Technical', recommended: 30 }
};

test('study analytics calculates current-user totals and live session time', () => {
  const data = {
    topics: {
      apex: { totalSeconds: 1800, sessions: 2 },
      lwc: { totalSeconds: 3600, sessions: 1 }
    },
    sessions: [
      { date: '2026-05-12', duration: 900 },
      { date: '2026-05-11', duration: 1200 }
    ]
  };

  const totals = analytics.calculateStudyTotals(
    data,
    topicConfig,
    { topicId: 'apex', seconds: 300 },
    '2026-05-12'
  );

  assert.equal(totals.totalSeconds, 5700);
  assert.equal(totals.todaySeconds, 1200);
  assert.equal(totals.totalSessionCount, 3);
  assert.equal(totals.topicsStudied, 2);
});

test('study analytics builds interview-focused suggestions without touching DOM', () => {
  const suggestions = analytics.buildSuggestionModels(
    { topics: { apex: { totalSeconds: 600, sessions: 1 } }, sessions: [] },
    topicConfig
  );

  assert.ok(suggestions.some((item) => item.text.includes('FDE topics')));
  assert.ok(suggestions.some((item) => item.priority === 'HIGH'));
  assert.ok(suggestions.every((item) => typeof item.icon === 'string'));
});

test('study analytics aggregates history topic analytics for charts', () => {
  const result = analytics.buildHistoryTopicAnalytics(
    ['2026-05-12', '2026-05-11'],
    {
      '2026-05-12': {
        study: {
          topicBreakdown: {
            'Apex Fundamentals': { totalSeconds: 1200 },
            'LWC Core': { totalSeconds: 600 }
          },
          sessionsCount: 2
        }
      },
      '2026-05-11': {
        study: { totalSeconds: 900, topTopic: 'Apex Fundamentals', sessionsCount: 1 }
      }
    },
    topicConfig
  );

  assert.equal(result.topicStats['Apex Fundamentals'], 2100);
  assert.equal(result.sortedTopics[0], 'Apex Fundamentals');
  assert.equal(result.cards[0].target, 3600);
  assert.equal(result.totalTime, 2700);
});
