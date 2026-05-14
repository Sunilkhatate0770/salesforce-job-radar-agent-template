import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  buildDashboardSummary,
  buildJobSourceHealth,
  buildReleaseStudyActions,
  createMockInterviewSession,
  getJobFreshness,
  sortJobsNewestFirst
} from '../src/services/dashboardSummary.js';

function loadBrowserCareerIntelligence() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/data/careerIntelligence.js', 'utf8'), context, { filename: 'src/data/careerIntelligence.js' });
  return context.window.SFJR_CAREER_INTELLIGENCE;
}

test('career intelligence sorts jobs newest first and labels freshness', () => {
  const jobs = [
    { id: 'old', createdAt: '2026-04-20T10:00:00.000Z', apply_link: 'https://example.com/old', score: 90 },
    { id: 'new', createdAt: '2026-05-14T02:00:00.000Z', apply_link: 'https://example.com/new', score: 70 },
    { id: 'updated', createdAt: '2026-05-10T02:00:00.000Z', updatedAt: '2026-05-13T02:00:00.000Z', apply_link: 'https://example.com/updated', score: 80 }
  ];
  const sorted = sortJobsNewestFirst(jobs);
  assert.equal(sorted[0].id, 'new');
  assert.equal(getJobFreshness(sorted[0], new Date('2026-05-14T08:00:00.000Z')).label, 'New today');
  assert.equal(getJobFreshness(jobs[0], new Date('2026-05-14T08:00:00.000Z')).label, 'Stale');
});

test('browser career intelligence supports source health and user dashboard actions', () => {
  const ci = loadBrowserCareerIntelligence();
  const jobs = [
    { id: 'a', status: 'todo', company: 'Acme', role: 'Salesforce Dev', createdAt: '2026-05-14T01:00:00.000Z', apply_link: 'https://example.com/a', score: 88, missing_skills: ['Data Cloud'] },
    { id: 'b', status: 'applied', company: 'Beta', role: 'LWC Dev', updatedAt: '2026-05-13T01:00:00.000Z', apply_link: 'https://example.com/b', score: 76 }
  ];
  const activityLog = [
    { text: 'Synced 3 new jobs into the board and refreshed 177 existing cards.', type: 'success', timestamp: '2026-05-14T02:00:00.000Z' }
  ];
  const health = ci.buildJobSourceHealth(jobs, activityLog, new Date('2026-05-14T08:00:00.000Z'));
  assert.equal(health.jobsAdded, 3);
  assert.equal(health.jobsRefreshed, 177);
  assert.equal(health.status, 'healthy');

  const command = ci.buildTodayCommandCenter({
    profile: { targetRole: 'FDE', missingSkills: ['Agentforce'] },
    jobs,
    bookmarks: [{ q: 'Explain queueable Apex', topic: 'async' }],
    releases: { items: [{ category: 'Agentforce', title: 'Agent action testing', interviewAngle: 'Testing strategy', topicId: 'fde_ag_concept' }] },
    now: new Date('2026-05-14T08:00:00.000Z')
  });
  assert.equal(command.targetRole, 'FDE');
  assert.equal(command.metrics.highFitJobs, 1);
  assert.equal(command.nextSevenDays.length, 7);
});

test('release study actions and mock interview sessions are structured', () => {
  const actions = buildReleaseStudyActions({
    items: [
      { category: 'Agentforce', title: 'Agent Builder updates' },
      { category: 'Data Cloud', title: 'Identity resolution updates' },
      { category: 'Security', title: 'User mode guardrails' }
    ]
  });
  assert.deepEqual(actions.map(action => action.category), ['Admin', 'Developer', 'Agentforce', 'Data Cloud', 'Security', 'Flow']);
  assert.equal(actions.find(action => action.category === 'Agentforce').count, 1);

  const session = createMockInterviewSession({
    role: 'Salesforce Developer',
    company: 'Salesforce',
    topic: 'Apex',
    questions: [{ id: 'q1', question: 'Explain bulkification' }],
    answers: [{ questionId: 'q1', answerText: 'I bulkify by collecting IDs, querying once, and doing one DML outside loops.' }]
  }, 'user_a');
  assert.equal(session.userId, 'user_a');
  assert.equal(session.score, 100);
});

test('dashboard summary remains user-scoped and does not trust client user ids', () => {
  const summary = buildDashboardSummary({
    profile: { userId: 'user_a', targetRole: 'Salesforce FDE', missingSkills: ['LWC performance'] },
    jobs: [
      { userId: 'user_a', status: 'todo', company: 'A', score: 90, createdAt: '2026-05-14T01:00:00.000Z', apply_link: 'https://example.com/a' },
      { userId: 'system', status: 'applied', company: 'B', score: 70, createdAt: '2026-05-13T01:00:00.000Z', apply_link: 'https://example.com/b' }
    ],
    studySessions: [{ userId: 'user_a', date: '2026-05-14', duration: 1800 }],
    now: new Date('2026-05-14T08:00:00.000Z')
  });
  assert.equal(summary.userId, 'user_a');
  assert.equal(summary.todayCommandCenter.jobRadarActions.highFit, 1);
  assert.equal(summary.todayCommandCenter.todayStudySeconds, 1800);
});
